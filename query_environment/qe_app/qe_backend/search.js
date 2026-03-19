require('dotenv').config();
const mysql = require('mysql2/promise');
const { getCurrentWeather, getHourlyForecastWeather, classifyWeather } = require('./weather');
const {
    computeLocationIndoorScore,
    outdoorIndicatorText,
    buildWeatherWarning
} = require('./weatherSuitability');
const { getOpenHoursForResult, getOpenStatusForResultAtTime } = require('./placesOpenNow');

const SCORE_WEIGHTS = {
    cosine: 0.65,
    distance: 0.20,
    category: 0.15,
    personalization: 0
};

const LOG_SCORES = process.env.LOG_SCORES !== 'false';
const LOG_KEYWORDS_MAX = Number.isFinite(Number(process.env.LOG_KEYWORDS_MAX))
    ? Number(process.env.LOG_KEYWORDS_MAX)
    : 80;

// Hard cap to prevent extremely large prepared statements (which can trigger
// MySQL "Malformed communication packet" / max_allowed_packet issues) when a
// query contains many tokens.
const MAX_PLAIN_TOKENS = Number.isFinite(Number(process.env.MAX_PLAIN_TOKENS))
    ? Number(process.env.MAX_PLAIN_TOKENS)
    : 14;

const MIN_PLAIN_TOKEN_LEN = Number.isFinite(Number(process.env.MIN_PLAIN_TOKEN_LEN))
    ? Number(process.env.MIN_PLAIN_TOKEN_LEN)
    : 3;

const MAX_PLAIN_TOKEN_LEN = Number.isFinite(Number(process.env.MAX_PLAIN_TOKEN_LEN))
    ? Number(process.env.MAX_PLAIN_TOKEN_LEN)
    : 40;

const PERSONAL_WEIGHTS = {
    history_multiplier: 3,
    favorite_keyword_multiplier: 1.5,
    favorite_category_bonus: 20,
    distance_penalty_per_meter: 1 / 500
};

function computePersonalScore(result, personalization) {
    if (!personalization) {
        return {
            score: 0,
            breakdown: {
                history_boost: 0,
                favorite_keyword_boost: 0,
                favorite_category_boost: 0,
                distance_penalty: 0,
                note: 'No personalization payload provided.'
            }
        };
    }

    const history = personalization.history || {};
    const favoriteKeywordCounts = personalization.favorite_keyword_counts || {};
    const favoriteCategories = Array.isArray(personalization.favorite_categories)
        ? personalization.favorite_categories
        : [];

    const name = String(result.name || '').toLowerCase();
    const keywordTerms = Array.isArray(result.keyword_terms) ? result.keyword_terms : [];
    const keywordSet = new Set(keywordTerms.map(t => String(t).toLowerCase()));
    const categories = Array.isArray(result.categories) ? result.categories : [];
    const categorySet = new Set(categories.map(c => String(c).toLowerCase()));

    let historyBoost = 0;
    for (const [key, rawCount] of Object.entries(history)) {
        const query = String(key || '').toLowerCase();
        const count = Number(rawCount || 0);
        if (!query || !Number.isFinite(count) || count <= 0) continue;
        if (name.includes(query)) {
            historyBoost += count * PERSONAL_WEIGHTS.history_multiplier;
        }
    }

    let favoriteKeywordBoost = 0;
    for (const term of keywordSet) {
        const count = Number(favoriteKeywordCounts[term] || 0);
        if (!Number.isFinite(count) || count <= 0) continue;
        favoriteKeywordBoost += count * PERSONAL_WEIGHTS.favorite_keyword_multiplier;
    }

    let favoriteCategoryBoost = 0;
    if (favoriteCategories.length > 0 && categorySet.size > 0) {
        const matches = favoriteCategories.some(c => categorySet.has(String(c).toLowerCase()));
        if (matches) favoriteCategoryBoost += PERSONAL_WEIGHTS.favorite_category_bonus;
    }

    const distanceMeters = Number(result.distance_meters || 0);
    const distancePenalty = Number.isFinite(distanceMeters) && distanceMeters > 0
        ? distanceMeters * PERSONAL_WEIGHTS.distance_penalty_per_meter
        : 0;

    const score = historyBoost + favoriteKeywordBoost + favoriteCategoryBoost - distancePenalty;

    return {
        score,
        breakdown: {
            history_boost: historyBoost,
            favorite_keyword_boost: favoriteKeywordBoost,
            favorite_category_boost: favoriteCategoryBoost,
            distance_penalty: distancePenalty,
            note: 'personalScore is used for final server-side re-ranking.'
        }
    };
}

// Words to exclude from query expansion and scoring. These carry no
// meaningful semantic signal and would inflate match counts if included.
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'of', 'to', 'in', 'on', 'at', 'for'
]);

// When true, logs each location's TF-IDF vector to stdout for debugging.
// Enable by setting the environment variable DEBUG_VECTORS=true.
const DEBUG_VECTORS = process.env.DEBUG_VECTORS === 'true';
const DEBUG_VECTOR_WEIGHTS = process.env.DEBUG_VECTOR_WEIGHTS === 'true';

// Maps common plain-language terms to their canonical OSM-style key:value tags.
// When a user types "park", the search also considers locations tagged
// "leisure:park", and so on.
const SYNONYM_MAP = {
    park: ['leisure:park'],
    bridge: ['bridge', 'man_made:bridge'],
    beach: ['natural:beach']
};

function normalizeNameForMatch(name) {
    if (!name) return [];
    const normalized = String(name).toLowerCase().trim();
    if (normalized === 'untitled artistic spot') return [];
    return String(name)
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t && !STOPWORDS.has(t));
}

function jaccardSimilarityTokens(aTokens, bTokens) {
    const a = new Set(aTokens);
    const b = new Set(bTokens);
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const t of a) {
        if (b.has(t)) intersection += 1;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function getMapsApiKey() {
    return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
}

function toPlacePhotoUrl(photoReference, apiKey) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=900&photo_reference=${photoReference}&key=${apiKey}`;
}

async function findPlacePhotoByName(lat, lon, locationName) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    const name = String(locationName || '').trim();
    if (!name || name.toLowerCase().includes('untitled')) return null;

    const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
    url.search = new URLSearchParams({
        input: name,
        inputtype: 'textquery',
        fields: 'place_id,name,geometry,photos',
        locationbias: `circle:750@${lat},${lon}`,
        key: apiKey
    });

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status !== 'OK' || !Array.isArray(data.candidates)) return null;

        const queryTokens = normalizeNameForMatch(name);
        let best = null;

        for (const candidate of data.candidates) {
            const photos = candidate.photos;
            if (!photos || photos.length === 0) continue;

            const candName = candidate.name || '';
            const nameSim = jaccardSimilarityTokens(queryTokens, normalizeNameForMatch(candName));

            const candLat = candidate.geometry?.location?.lat;
            const candLon = candidate.geometry?.location?.lng;
            const dist =
                typeof candLat === 'number' && typeof candLon === 'number'
                    ? haversineDistance(lat, lon, candLat, candLon)
                    : 999999;

            const distScore = Math.max(0, 1 - dist / 750);
            const score = 0.7 * nameSim + 0.3 * distScore;

            if (!best || score > best.score) {
                best = {
                    score,
                    nameSim,
                    dist,
                    photoRef: photos[0]?.photo_reference
                };
            }
        }

        if (!best || !best.photoRef) return null;
        if (best.nameSim < 0.25 && best.dist > 200) return null;

        return toPlacePhotoUrl(best.photoRef, apiKey);
    } catch (error) {
        console.error('Google FindPlace API Error: ', error);
        return null;
    }
}

async function nearbySearchPhoto(lat, lon, keyword) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    const kw = String(keyword || '').trim();
    if (!kw) return null;

    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    searchUrl.search = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: 600,
        keyword: kw,
        key: apiKey
    });

    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        if (data.status !== 'OK' || !Array.isArray(data.results)) return null;

        const queryTokens = normalizeNameForMatch(kw);
        let best = null;

        for (const place of data.results) {
            if (!place.photos || place.photos.length === 0) continue;
            const placeName = place.name || '';
            const nameSim = jaccardSimilarityTokens(queryTokens, normalizeNameForMatch(placeName));
            const pLat = place.geometry?.location?.lat;
            const pLon = place.geometry?.location?.lng;
            const dist =
                typeof pLat === 'number' && typeof pLon === 'number'
                    ? haversineDistance(lat, lon, pLat, pLon)
                    : 999999;
            const distScore = Math.max(0, 1 - dist / 600);
            const score = 0.6 * nameSim + 0.4 * distScore;

            if (!best || score > best.score) {
                best = { score, photoRef: place.photos[0]?.photo_reference, dist, nameSim };
            }
        }

        if (!best || !best.photoRef) return null;
        if (best.nameSim < 0.2 && best.dist > 200) return null;

        return toPlacePhotoUrl(best.photoRef, apiKey);
    } catch (error) {
        console.error('Google NearbySearch API Error: ', error);
        return null;
    }
}

async function getStreetViewImage(lat, lon) {
    const apiKey = getMapsApiKey();
    if (!apiKey) return null;

    const metaUrl = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
    metaUrl.search = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: '80',
        key: apiKey
    });

    try {
        const metaResp = await fetch(metaUrl);
        const meta = await metaResp.json();
        if (meta.status !== 'OK') return null;

        const imgUrl = new URL('https://maps.googleapis.com/maps/api/streetview');
        imgUrl.search = new URLSearchParams({
            size: '900x600',
            location: `${lat},${lon}`,
            fov: '90',
            pitch: '0',
            key: apiKey
        });
        return imgUrl.toString();
    } catch (error) {
        console.error('Google StreetView API Error: ', error);
        return null;
    }
}

async function getGooglePlaceImage(lat, lon, locationName, selectedCategory = "") {
    const byName = await findPlacePhotoByName(lat, lon, locationName);
    if (byName) return byName;

    const nearbyByName = await nearbySearchPhoto(lat, lon, locationName);
    if (nearbyByName) return nearbyByName;

    const byCategory = await nearbySearchPhoto(lat, lon, selectedCategory);
    if (byCategory) return byCategory;

    return await getStreetViewImage(lat, lon);
}

/**
 * Splits a raw query string into an array of normalised tokens.
 *
 * Converts the input to lowercase, splits on whitespace, strips characters
 * that are not valid in OSM-style keyword terms (alphanumeric, colon, pipe,
 * forward-slash, period, hyphen), and removes empty strings.
 *
 * @param {string} rawQuery - The user-supplied search string.
 * @returns {string[]} Array of cleaned tokens, or an empty array if the
 *                     input is falsy.
 */
function tokenizeQuery(rawQuery) {
    if (!rawQuery) return [];
    return rawQuery
        .toLowerCase()
        .split(/\s+/)
        // Keep delimiters commonly present in OSM-style keywords.
        .map(t => t.replace(/[^\w:|/.\-]/g, ''))
        .filter(t => t);
}

/**
 * Expands a token array into two term sets used for keyword lookup.
 *
 * - exactTerms: every token that should be matched verbatim in the keywords
 *   table, plus any synonym expansions from SYNONYM_MAP. Tokens that already
 *   contain a colon (i.e. OSM key:value pairs) are added directly without
 *   stopword filtering.
 * - plainTokens: non-stopword tokens that have no colon, used for broader
 *   LIKE-pattern matching against key:value terms in the database.
 *
 * @param {string[]} tokens - Output of tokenizeQuery.
 * @returns {{ exactTerms: string[], plainTokens: string[] }}
 */
function buildExpandedTerms(tokens) {
    const exactTerms = new Set();
    const plainTokens = new Set();

    tokens.forEach(token => {
        // Tokens that already contain a colon are OSM key:value pairs.
        // Add them directly without stopword filtering or synonym expansion.
        if (token.includes(':')) {
            exactTerms.add(token);
            return;
        }

        const parts = String(token).split('_').map(p => p.trim()).filter(Boolean);
        const candidates = parts.length > 1 ? [token, ...parts] : [token];

        candidates.forEach(t => {
            if (!t || STOPWORDS.has(t)) return;
            plainTokens.add(t);
            exactTerms.add(t);
        });

        // Expand any known synonyms for this token.
        const synonyms = SYNONYM_MAP[token] || [];
        synonyms.forEach(s => exactTerms.add(s));
    });

    return {
        exactTerms: [...exactTerms],
        plainTokens: [...plainTokens]
    };
}

/**
 * Queries the keywords table to resolve term strings to keyword row objects.
 *
 * Two query strategies are combined and deduplicated via a Map keyed on id:
 *
 * 1. Exact match (IN clause) for all exactTerms.
 * 2. Broad LIKE-pattern match for plainTokens, covering plain equality,
 *    prefix (token:*), suffix (*:token), and pipe-delimited multi-value
 *    variants (*|token|*, *|token, token|*).
 *
 * @param {mysql.Connection} connection - Active mysql2 connection.
 * @param {string[]} exactTerms - Terms to match with an IN clause.
 * @param {string[]} plainTokens - Bare words to match with LIKE patterns.
 * @returns {Promise<Array<{ id: number, term: string }>>} Deduplicated keyword rows.
 */
async function fetchMatchingKeywords(connection, exactTerms, plainTokens) {
    const termMap = new Map();

    if (exactTerms.length > 0) {
        const placeholders = exactTerms.map(() => '?').join(',');
        const [rows] = await connection.execute(
            `SELECT id, term
             FROM keywords
             WHERE term IN (${placeholders})`,
            exactTerms
        );
        rows.forEach(r => termMap.set(r.id, r));
    }

    // For plain words, also match key:value terms where the key or value
    // equals the token, including pipe-delimited multi-value fields.
    if (plainTokens.length > 0) {
        const limitedTokens = plainTokens
            .map(t => String(t || '').trim().toLowerCase())
            .filter(t => t && t.length >= MIN_PLAIN_TOKEN_LEN && t.length <= MAX_PLAIN_TOKEN_LEN)
            .slice(0, MAX_PLAIN_TOKENS);
        if (plainTokens.length > limitedTokens.length) {
            console.warn(
                `[SEARCH] Query token count (${plainTokens.length}) exceeds MAX_PLAIN_TOKENS (${MAX_PLAIN_TOKENS}); truncating for keyword LIKE matching.`
            );
        }

        const escapeLike = (value) =>
            String(value)
                .replace(/\\/g, '\\\\')
                .replace(/%/g, '\\%')
                .replace(/_/g, '\\_');

        // Run small per-token queries to avoid extremely large packets/queries.
        for (const token of limitedTokens) {
            const esc = escapeLike(token);
            const underscore = '\\_';

            const clause = [
                'term = ?',
                "term LIKE ? ESCAPE '\\\\'",
                "term LIKE ? ESCAPE '\\\\'",
                // value underscore-segment matches (e.g. tourism:picnic_site)
                "term LIKE ? ESCAPE '\\\\'", // %:token\_%
                "term LIKE ? ESCAPE '\\\\'", // %:\_token\_%
                "term LIKE ? ESCAPE '\\\\'", // %:\_token
                // key underscore-segment matches (e.g. picnic_site:*)
                "term LIKE ? ESCAPE '\\\\'", // token\_%:%
                "term LIKE ? ESCAPE '\\\\'", // %\_token\_%:%
                "term LIKE ? ESCAPE '\\\\'", // %\_token:%
                // pipe-delimited values
                "term LIKE ? ESCAPE '\\\\'",
                "term LIKE ? ESCAPE '\\\\'",
                "term LIKE ? ESCAPE '\\\\'"
            ].join(' OR ');

            const params = [
                token,
                `${esc}:%`,
                `%:${esc}`,
                `%:${esc}${underscore}%`,
                `%:${underscore}${esc}${underscore}%`,
                `%:${underscore}${esc}`,
                `${esc}${underscore}%:%`,
                `%${underscore}${esc}${underscore}%:%`,
                `%${underscore}${esc}:%`,
                `%:${esc}|%`,
                `%|${esc}|%`,
                `%|${esc}`
            ];

            const [rows] = await connection.execute(
                `SELECT id, term
                 FROM keywords
                 WHERE (${clause})`,
                params
            );
            rows.forEach(r => termMap.set(r.id, r));
        }
    }

    return [...termMap.values()];
}

/**
 * Converts decimal degrees to radians.
 *
 * @param {number} deg - Angle in degrees.
 * @returns {number} Angle in radians.
 */
function toRadians(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Computes the great-circle distance between two geographic coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point A in decimal degrees.
 * @param {number} lon1 - Longitude of point A in decimal degrees.
 * @param {number} lat2 - Latitude of point B in decimal degrees.
 * @param {number} lon2 - Longitude of point B in decimal degrees.
 * @returns {number} Distance in metres.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's mean radius in metres.
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Searches for locations matching a free-text query, weighted by relevance,
 * proximity, and optional category membership.
 *
 * High-level pipeline:
 *   1. Tokenise and expand the query string into keyword terms.
 *   2. Resolve those terms to keyword IDs in the database.
 *   3. Compute IDF weights across all locations (TF-IDF, TF assumed = 1).
 *   4. Find candidate locations that share at least one keyword with the query.
 *   5. Optionally filter candidates to those belonging to a named category.
 *   6. Score each candidate with a weighted combination of:
 *        - Cosine similarity (TF-IDF vectors)     weight 0.50
 *        - Normalised inverse distance           weight 0.25
 *        - Category score (penalises broad tags)  weight 0.10
 *        - (Weather no longer affects ranking; it is used for UI warnings)
 *   7. Discard candidates outside maxRadius and sort by final score descending.
 *
 * @param {mysql.Pool} pool            - Shared mysql2 connection pool. A connection
 *                                     is borrowed for the duration of the call and
 *                                     released back to the pool when complete.
 * @param {string}  rawQuery         - Free-text query entered by the user.
 * @param {number}  userLat          - User's current latitude in decimal degrees.
 * @param {number}  userLng          - User's current longitude in decimal degrees.
 * @param {number}  maxRadius        - Maximum search radius in metres.
 * @param {*}       currentTime      - Currently unused. Intended for time-based filtering.
 * @param {string|null} selectedCategory - Optional category name to boost matching locations.
 * @returns {Promise<Array>} Scored and sorted location objects, each augmented
 *                           with cosine_score, category_score, distance_meters,
 *                           and final_score properties. Returns an empty array
 *                           if the query produces no keyword matches or no
 *                           candidate locations.
 */
async function searchLocations(pool, rawQuery, userLat, userLng, maxRadius, currentTime,
    selectedCategory, selectedCategories = null, personalization = null, preferredTimeLabel = null, weatherOverride = null, weatherClassOverride = null) {

    // Borrow a connection from the pool. It is returned via release() in the
    // finally block regardless of whether the search succeeds or throws.
    const connection = await pool.getConnection();

    try {
        // Step 1: Convert the raw query string into normalised keyword tokens.
        const tokens = tokenizeQuery(rawQuery);
        if (tokens.length === 0) return [];

        // Step 2: Expand tokens into exact and plain term sets, then resolve
        // them to keyword row objects from the database.
        const { exactTerms, plainTokens } = buildExpandedTerms(tokens);
        const keywordRows = await fetchMatchingKeywords(connection, exactTerms, plainTokens);

        const keywordIds = keywordRows.map(r => r.id);

        const [[{ totalLocations }]] = await connection.execute(
            `SELECT COUNT(*) AS totalLocations FROM locations`
        );

        // Add TF-IDF dimensions for query tokens (and normalized query-name tokens)
        // that appear in location names.
        // This allows a location's human-readable name to influence cosine similarity
        // without requiring a DB keyword row for every possible name token.
        const nameTokenIdByToken = {};
        const nameIdfById = {};
        let nextSyntheticId = -1;

        const nameQueryTokens = normalizeNameForMatch(rawQuery);
        const nameTokenCandidates = new Set([
            ...plainTokens.map(t => String(t || '').toLowerCase().trim()),
            ...nameQueryTokens.map(t => String(t || '').toLowerCase().trim()),
        ]);

        for (const token of nameTokenCandidates) {
            const t = String(token || '').toLowerCase().trim();
            if (!t || STOPWORDS.has(t)) continue;
            try {
                const [[{ df }]] = await connection.execute(
                    `SELECT COUNT(*) AS df
                     FROM locations
                     WHERE name IS NOT NULL AND LOWER(name) LIKE ?`,
                    [`%${t}%`]
                );
                const dfNum = Number(df || 0);
                if (!Number.isFinite(dfNum) || dfNum <= 0) continue;
                const id = String(nextSyntheticId--);
                nameTokenIdByToken[t] = id;
                const idf = Math.log(totalLocations / dfNum);
                nameIdfById[id] = idf;
            } catch {
                // Ignore name token df failures; search remains functional.
            }
        }

        // Get DF per keyword (if any)
        const dfPlaceholders = keywordIds.map(() => '?').join(',');

        const dfRows = keywordIds.length > 0
            ? (await connection.execute(
                `SELECT keyword_id, COUNT(location_id) AS df
                 FROM location_keywords
                 WHERE keyword_id IN (${dfPlaceholders})
                 GROUP BY keyword_id`,
                keywordIds
            ))[0]
            : [];

        // Build a map from keyword_id to its document frequency for quick lookup.
        const dfMap = {};
        dfRows.forEach(r => {
            dfMap[r.keyword_id] = r.df;
        });

        // Build query vector (TF = 1)
        const queryVector = {};
        let queryNorm = 0;

        for (const id of keywordIds) {
            const df = dfMap[id] || 1;
            const idf = Math.log(totalLocations / df);
            queryVector[id] = idf;
            queryNorm += idf * idf;
        }

        for (const [id, idf] of Object.entries(nameIdfById)) {
            queryVector[id] = idf;
            queryNorm += idf * idf;
        }

        queryNorm = Math.sqrt(queryNorm);

        // Candidate locations from keywords (if any).
        const candidateRows = keywordIds.length > 0
            ? (await connection.execute(
                `SELECT DISTINCT location_id
                 FROM location_keywords
                 WHERE keyword_id IN (${dfPlaceholders})`,
                keywordIds
            ))[0]
            : [];

        // Candidate locations from name-token matches.
        const nameCandidateIds = new Set();
        const nameCandidates = Array.from(nameTokenCandidates).filter(t => t);
        for (const token of nameCandidates) {
            const likeToken = `%${token}%`;
            const [rows] = await connection.execute(
                `SELECT id
                 FROM locations
                 WHERE name IS NOT NULL
                   AND LOWER(name) LIKE ?
                   AND LOWER(name) != 'untitled artistic spot'`,
                [likeToken]
            );
            rows.forEach(r => nameCandidateIds.add(r.id));
        }

        const candidateIds = Array.from(new Set([
            ...candidateRows.map(r => r.location_id),
            ...nameCandidateIds
        ]));
        if (candidateIds.length === 0) return [];

        let currentWeather = weatherOverride || null;
        let weatherClass = weatherClassOverride || 'great_outdoor';

        if (!currentWeather || !weatherClassOverride) {
            try {
                if (preferredTimeLabel) {
                    currentWeather = await getHourlyForecastWeather(userLat, userLng, currentTime);
                } else {
                    currentWeather = await getCurrentWeather(userLat, userLng);
                }
                weatherClass = classifyWeather(currentWeather);
            } catch (error) {
                // Fallback keeps ranking functional if weather API fails.
                console.warn(error.message);
            }
        }

        // Get location-keyword pairs
        const locPlaceholders = candidateIds.map(() => '?').join(',');

        const locationKeywordRows = keywordIds.length > 0
            ? (await connection.execute(
                `SELECT location_id, keyword_id
                 FROM location_keywords
                 WHERE location_id IN (${locPlaceholders})
                 AND keyword_id IN (${dfPlaceholders})`,
                [...candidateIds, ...keywordIds]
            ))[0]
            : [];

        const [allLocationKeywordRows] = await connection.execute(
            `SELECT location_id, keyword_id
             FROM location_keywords
             WHERE location_id IN (${locPlaceholders})`,
            candidateIds
        );

        const locationKeywordIds = {};
        candidateIds.forEach(id => {
            locationKeywordIds[id] = [];
        });
        allLocationKeywordRows.forEach(row => {
            locationKeywordIds[row.location_id].push(row.keyword_id);
        });

        // Fetch keyword terms (strings) per location for suitability warnings.
        const [locationKeywordTermRows] = await connection.execute(
            `SELECT lk.location_id, k.term
             FROM location_keywords lk
             JOIN keywords k ON k.id = lk.keyword_id
             WHERE lk.location_id IN (${locPlaceholders})`,
            candidateIds
        );

        const locationKeywordTerms = {};
        candidateIds.forEach(id => {
            locationKeywordTerms[id] = [];
        });
        locationKeywordTermRows.forEach(row => {
            locationKeywordTerms[row.location_id].push(row.term);
        });

        // Fetch category names per location for logging/debugging (and optional UI use).
        const [locationCategoryRows] = await connection.execute(
            `SELECT lc.location_id, c.name
             FROM location_categories lc
             JOIN categories c ON c.id = lc.category_id
             WHERE lc.location_id IN (${locPlaceholders})`,
            candidateIds
        );

        const locationCategories = {};
        candidateIds.forEach(id => {
            locationCategories[id] = [];
        });
        locationCategoryRows.forEach(row => {
            locationCategories[row.location_id].push(row.name);
        });

        const selectedCategoryList = Array.isArray(selectedCategories) && selectedCategories.length > 0
            ? selectedCategories.map(c => String(c || '').toLowerCase()).filter(Boolean)
            : (selectedCategory ? [String(selectedCategory).toLowerCase()] : []);

        // Build location vectors
        const locationVectors = {};
        candidateIds.forEach(id => locationVectors[id] = {});

        // Populate each location's TF-IDF vector. TF = 1 (presence model).
        locationKeywordRows.forEach(row => {
            const { location_id, keyword_id } = row;
            const df = dfMap[keyword_id] || 1;
            const idf = Math.log(totalLocations / df);
            locationVectors[location_id][keyword_id] = idf;
        });

        // Fetch location info
        const [locationRows] = await connection.execute(
            `SELECT * FROM locations
             WHERE id IN (${locPlaceholders})`,
            candidateIds
        );

        // Index location rows by id for O(1) lookup during scoring.
        const locationMap = {};
        locationRows.forEach(l => {
            locationMap[l.id] = l;
        });

        // Name tokens per location (for cosine similarity + keyword display).
        const locationNameTokens = {};
        for (const l of locationRows) {
            locationNameTokens[l.id] = normalizeNameForMatch(l.name);
            const vec = locationVectors[l.id];
            if (vec && locationNameTokens[l.id].length > 0) {
                for (const token of locationNameTokens[l.id]) {
                    const id = nameTokenIdByToken[token];
                    if (!id) continue;
                    const idf = nameIdfById[id];
                    if (typeof idf === 'number') vec[id] = idf;
                }
            }
        }

        // Compute cosine + distance scoring
        const results = [];

        for (const locId of candidateIds) {
            const vector = locationVectors[locId];
            if (DEBUG_VECTORS) {
                // console.log("Location vector:", vector);
            }

            // Compute dot product between the query vector and location vector.
            let dot = 0;
            let locNorm = 0;

            for (const termId in queryVector) {
                const qVal = queryVector[termId];
                const lVal = vector[termId] || 0;
                dot += qVal * lVal;
            }

            // Compute the Euclidean norm of the location vector.
            for (const val of Object.values(vector)) {
                locNorm += val * val;
            }

            locNorm = Math.sqrt(locNorm);

            // Cosine similarity: dot product divided by the product of norms.
            // Returns 0 if either vector has zero magnitude.
            const cosine =
                locNorm === 0 || queryNorm === 0
                    ? 0
                    : dot / (queryNorm * locNorm);

            const location = locationMap[locId];
            if (!location) continue;

            // Compute straight-line distance from the user to this location.
            const distance = haversineDistance(
                userLat,
                userLng,
                location.latitude,
                location.longitude
            );

            // Exclude locations beyond the configured search radius.
            if (distance > maxRadius) continue;

            // Normalise distance to [0, 1] where 1 = at the user's position
            // and 0 = at the edge of maxRadius.
            const distanceScore = 1 - (distance / maxRadius);

            // Category score:
            // - match fraction = (matched selected categories) / (selected categories)
            // - penalty factor = selectedCount / (selectedCount + extraCategories)
            //   where extraCategories are categories on the event that the user did NOT select
            let categoryScore = 0;
            if (selectedCategoryList.length > 0) {
                const eventCats = (locationCategories[locId] || []).map(c => String(c).toLowerCase());
                const eventCatSet = new Set(eventCats);
                const selectedSet = new Set(selectedCategoryList);
                let matchCount = 0;
                selectedSet.forEach(c => {
                    if (eventCatSet.has(c)) matchCount += 1;
                });
                const selectedCount = selectedSet.size;
                const extraCategories = Math.max(0, eventCatSet.size - matchCount);
                const matchFraction = selectedCount > 0 ? (matchCount / selectedCount) : 0;
                const penaltyFactor = selectedCount > 0 ? (selectedCount / (selectedCount + extraCategories)) : 0;
                categoryScore = Math.max(0, matchFraction * penaltyFactor);
            }

            // Weighted final score combining all three signals.
            const baseScore =
                SCORE_WEIGHTS.cosine * cosine +
                SCORE_WEIGHTS.category * categoryScore +
                SCORE_WEIGHTS.distance * distanceScore;

            const indoorScore = computeLocationIndoorScore(locationKeywordTerms[locId]);
            const warning = buildWeatherWarning(weatherClass, indoorScore);
            const outsideWeatherIndicator =
                indoorScore <= 0.33
                    ? (
                        weatherClass === 'rainy'
                            ? { type: 'rainy', label: 'Rainy Outside' }
                            : (weatherClass === 'cold'
                                ? { type: 'cold', label: 'Cold Outside' }
                                : ((weatherClass === 'hot' || weatherClass === 'extreme')
                                    ? { type: 'hot', label: 'Hot Outside' }
                                    : null))
                    )
                    : null;

            const rawKeywordTerms = locationKeywordTerms[locId] || [];
            const nameTerms = locationNameTokens[locId] || [];
            const allTerms = Array.from(new Set([...rawKeywordTerms, ...nameTerms]));

            const matchedTermSet = new Set();
            // Keyword-table terms used in the cosine match.
            for (const row of keywordRows) {
                const termId = String(row.id);
                if (vector && vector[termId]) matchedTermSet.add(row.term);
            }
            // Name-token terms used in the cosine match.
            for (const t of nameTerms) {
                const id = nameTokenIdByToken[t];
                if (id && vector && vector[id]) matchedTermSet.add(t);
            }

            const keywordTermsMarked = allTerms.map(t => (matchedTermSet.has(t) ? `*${t}` : t));
            const matchedTerms = Array.from(matchedTermSet);
            const vectorWeights = {};
            const queryWeights = {};
            const matchedWeights = {};

            if (DEBUG_VECTOR_WEIGHTS) {
                for (const [termId, weight] of Object.entries(queryVector)) {
                    const termLabel =
                        termId.startsWith('-')
                            ? `name:${Object.keys(nameTokenIdByToken).find(t => nameTokenIdByToken[t] === termId) || termId}`
                            : (keywordRows.find(r => String(r.id) === termId)?.term || termId);
                    queryWeights[termLabel] = weight;
                }

                for (const [termId, weight] of Object.entries(vector)) {
                    const termLabel =
                        termId.startsWith('-')
                            ? `name:${Object.keys(nameTokenIdByToken).find(t => nameTokenIdByToken[t] === termId) || termId}`
                            : (keywordRows.find(r => String(r.id) === termId)?.term || termId);
                    vectorWeights[termLabel] = weight;
                }

                matchedTerms.forEach(t => {
                    if (vectorWeights[t] != null) {
                        matchedWeights[t] = vectorWeights[t];
                        return;
                    }
                    const nameKey = `name:${t}`;
                    if (vectorWeights[nameKey] != null) {
                        matchedWeights[nameKey] = vectorWeights[nameKey];
                    }
                });
            }

            results.push({
                ...location,
                keyword_terms: allTerms,
                keyword_terms_marked: keywordTermsMarked,
                matched_terms: matchedTerms,
                vector_weights: DEBUG_VECTOR_WEIGHTS ? vectorWeights : undefined,
                query_weights: DEBUG_VECTOR_WEIGHTS ? queryWeights : undefined,
                matched_weights: DEBUG_VECTOR_WEIGHTS ? matchedWeights : undefined,
                categories: locationCategories[locId] || [],
                cosine_score: cosine,
                category_score: categoryScore,
                weather_class: weatherClass,
                weather: currentWeather,
                indoor_score: indoorScore,
                outdoor_indicator: outdoorIndicatorText(indoorScore),
                weather_warning: warning,
                outside_weather_indicator: outsideWeatherIndicator,
                distance_meters: distance,
                distance_score: distanceScore,
                score_weights: SCORE_WEIGHTS,
                score_components: {
                    cosine,
                    category: categoryScore,
                    distance: distanceScore,
                    personalization: 0
                },
                score_contributions: {
                    cosine: SCORE_WEIGHTS.cosine * cosine,
                    category: SCORE_WEIGHTS.category * categoryScore,
                    distance: SCORE_WEIGHTS.distance * distanceScore,
                    personalization: 0
                },
                base_score: baseScore,
                final_score: baseScore
            });
        }

        // Ranking is purely based on cosine/distance/category. Favorites are
        // surfaced on the client by re-ordering the already-top results.
        results.sort((a, b) => b.final_score - a.final_score);

        const topResults = results.slice(0, 10);
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        for (let loc of topResults) {
            const lastUpdated = loc.image_updated_at ? new Date(loc.image_updated_at).getTime() : 0;
            const isPlaceholder = loc.image_url && loc.image_url.includes('via.placeholder.com');
            const needsUpdate = !loc.image_url || isPlaceholder || (now - lastUpdated > THIRTY_DAYS_MS);
            if (needsUpdate) {
                    const newImageUrl = await getGooglePlaceImage(
                        loc.latitude,
                        loc.longitude,
                        loc.name,
                        selectedCategory || ""
                    );
                    
                    if (newImageUrl) {
                        loc.image_url = newImageUrl;
                        connection.execute(
                            `UPDATE locations SET image_url = ?, image_updated_at = NOW() WHERE id = ?`, 
                            [loc.image_url, loc.id]
                        ).catch(err => console.error("DB Update Error:", err));
                    } else {
                        connection.execute(
                            `UPDATE locations SET image_updated_at = NOW() WHERE id = ?`, 
                            [loc.id]
                        ).catch(err => console.error("DB Update Error:", err));
                        
                        if (!loc.image_url) {
                            loc.image_url = "https://via.placeholder.com/300x200?text=No+Photo+Available";
                        }
                    }
                }
            }

        // Enrich the displayed results with Places open-now status for indoor-ish spots.
        const displayed = results
            .filter(r => r.image_url && !String(r.image_url).includes('via.placeholder.com'))
            .slice(0, 10);

        const timeStr = String(currentTime || '');
        const hour = Number(timeStr.split(':')[0]);
        const minute = Number(timeStr.split(':')[1] || 0);
        const minutesOfDay = (Number.isFinite(hour) ? hour : 12) * 60 + (Number.isFinite(minute) ? minute : 0);

        let placesFailures = 0;
        let placesChecked = 0;
        let placesSkippedOutdoor = 0;
        for (const r of displayed) {
            if ((r.indoor_score ?? 0) < 0.5) {
                // Don't attempt business-hours checks for outdoor locations.
                r.open_now = null;
                r.open_now_source = 'skipped_outdoor';
                placesSkippedOutdoor += 1;
                continue;
            }
            placesChecked += 1;
            let info = null;
            if (preferredTimeLabel) {
                info = await getOpenStatusForResultAtTime(r, currentTime);
                if (info) {
                    r.open_now = info.open;
                    r.open_now_source = info.source;
                }
            } else {
                const hours = await getOpenHoursForResult(r);
                if (hours && typeof hours.openNow === 'boolean') {
                    r.open_now = hours.openNow;
                    r.open_now_source = `${hours.source}_current`;
                } else {
                    info = null;
                }
            }

            if (!preferredTimeLabel && r.open_now_source) {
                // ok
            } else if (preferredTimeLabel && r.open_now_source) {
                // ok
            } else {
                placesFailures += 1;
                console.warn(`[PLACES] Opening-hours unknown for "${r.name}" (id=${r.id}) preferredTime=${preferredTimeLabel ? currentTime : 'none'}; using heuristic.`);
                // Fallback heuristic when Places doesn't return opening hours:
                // - indoor_score >= 1.0: assume typical business hours 9am–6pm
                // - indoor_score >= 0.5: assume 24/7 (parks/museums/etc are mixed; keep permissive)
                if ((r.indoor_score ?? 0.5) >= 1) {
                    const open = 9 * 60;
                    const close = 18 * 60;
                    r.open_now = minutesOfDay >= open && minutesOfDay <= close;
                    r.open_now_source = 'estimated_9_18';
                } else {
                    r.open_now = true;
                    r.open_now_source = 'estimated_24_7';
                }
            }
        }

        console.log(`[PLACES] Hours summary: displayed=${displayed.length} checked=${placesChecked} skipped_outdoor=${placesSkippedOutdoor} heuristic_used=${placesFailures}`);

            if (LOG_SCORES) {
                const weightsPct = {
                    cosine_pct: Math.round(SCORE_WEIGHTS.cosine * 100),
                    category_pct: Math.round(SCORE_WEIGHTS.category * 100),
                    distance_pct: Math.round(SCORE_WEIGHTS.distance * 100),
                    personalization_pct: Math.round(SCORE_WEIGHTS.personalization * 100)
                };
                console.log('=== SCORE WEIGHTS ===', weightsPct);
            console.log('=== RANK MODE ===', 'default');

            results.slice(0, 10).forEach((r, idx) => {
                console.log(`[${idx + 1}] ${r.name}`, {
                    overall_score: r.final_score,
                    base_score: r.base_score,
                    cosine_score: r.cosine_score,
                    distance_meters: r.distance_meters,
                    distance_score: r.distance_score,
                    category_score: r.category_score,
                    categories: r.categories,
                    keyword_terms_count: Array.isArray(r.keyword_terms) ? r.keyword_terms.length : 0,
                    keyword_terms: Array.isArray(r.keyword_terms_marked)
                        ? r.keyword_terms_marked.slice(0, LOG_KEYWORDS_MAX)
                        : [],
                    matched_terms: Array.isArray(r.matched_terms)
                        ? r.matched_terms.slice(0, LOG_KEYWORDS_MAX)
                        : [],
                    query_weights: r.query_weights,
                    vector_weights: r.vector_weights,
                    matched_weights: r.matched_weights,
                    keyword_terms_truncated: Array.isArray(r.keyword_terms)
                        ? r.keyword_terms.length > LOG_KEYWORDS_MAX
                        : false,
                    weights_pct: weightsPct
                });
            });
        }

        return results;
    } finally {
        // Release the connection back to the pool rather than closing it,
        // so it can be reused by subsequent calls.
        connection.release();
    }
}

module.exports = searchLocations;
