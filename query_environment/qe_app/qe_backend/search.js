require('dotenv').config();
const mysql = require('mysql2/promise');
const { getCurrentWeather, classifyWeather } = require('./weather');
const {
    computeLocationIndoorScore,
    outdoorIndicatorText,
    buildWeatherWarning
} = require('./weatherSuitability');

const SCORE_WEIGHTS = {
    cosine: 0.6,
    category: 0.15,
    distance: 0.25
};

const LOG_SCORES = process.env.LOG_SCORES !== 'false';
const LOG_KEYWORDS_MAX = Number.isFinite(Number(process.env.LOG_KEYWORDS_MAX))
    ? Number(process.env.LOG_KEYWORDS_MAX)
    : 80;

// Words to exclude from query expansion and scoring. These carry no
// meaningful semantic signal and would inflate match counts if included.
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'of', 'to', 'in', 'on', 'at', 'for'
]);

// When true, logs each location's TF-IDF vector to stdout for debugging.
// Enable by setting the environment variable DEBUG_VECTORS=true.
const DEBUG_VECTORS = process.env.DEBUG_VECTORS === 'true';

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

        if (!STOPWORDS.has(token)) {
            plainTokens.add(token);
            exactTerms.add(token);
        }

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
        const clauses = [];
        const params = [];
        plainTokens.forEach(token => {
            clauses.push('(term = ? OR term LIKE ? OR term LIKE ? OR term LIKE ? OR term LIKE ? OR term LIKE ?)');
            params.push(
                token,
                `${token}:%`,
                `%:${token}`,
                `%:${token}|%`,
                `%|${token}|%`,
                `%|${token}`
            );
        });

        const [rows] = await connection.execute(
            `SELECT id, term
             FROM keywords
             WHERE ${clauses.join(' OR ')}`,
            params
        );
        rows.forEach(r => termMap.set(r.id, r));
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
    selectedCategory) {

    // Borrow a connection from the pool. It is returned via release() in the
    // finally block regardless of whether the search succeeds or throws.
    const connection = await pool.getConnection();
  // TODO: fix here
// async function searchLocations(rawQuery, userLat, userLng, maxRadius, currentTime,
//     selectedCategory) {
/*     const connection = await mysql.createConnection({
        host: 'localhost',
        user: process.env.DB_USER,
        database: 'axolartl'
    }); */

    try {
        // Step 1: Convert the raw query string into normalised keyword tokens.
        const tokens = tokenizeQuery(rawQuery);
        if (tokens.length === 0) return [];

        // Step 2: Expand tokens into exact and plain term sets, then resolve
        // them to keyword row objects from the database.
        const { exactTerms, plainTokens } = buildExpandedTerms(tokens);
        const keywordRows = await fetchMatchingKeywords(connection, exactTerms, plainTokens);
        if (keywordRows.length === 0) return [];

        const keywordIds = keywordRows.map(r => r.id);

        const [[{ totalLocations }]] = await connection.execute(
            `SELECT COUNT(*) AS totalLocations FROM locations`
        );

        // Get DF per keyword
        const dfPlaceholders = keywordIds.map(() => '?').join(',');

        const [dfRows] = await connection.execute(
            `SELECT keyword_id, COUNT(location_id) AS df
             FROM location_keywords
             WHERE keyword_id IN (${dfPlaceholders})
             GROUP BY keyword_id`,
            keywordIds
        );

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

        queryNorm = Math.sqrt(queryNorm);

        // Candidate locations
        const [candidateRows] = await connection.execute(
            `SELECT DISTINCT location_id
            FROM location_keywords
            WHERE keyword_id IN (${dfPlaceholders})`,
            keywordIds
        );

        // Optionally resolve the selected category name to its numeric ID.
        let categoryId = null;

        if (selectedCategory) {
            const [catRows] = await connection.execute(
                `SELECT id FROM categories WHERE LOWER(name) = LOWER(?)`,
                [selectedCategory]
            );

            if (catRows.length > 0) {
                categoryId = catRows[0].id;
            }
        }

        const candidateIds = candidateRows.map(r => r.location_id);
        if (candidateIds.length === 0) return [];

        let currentWeather = null;
        let weatherClass = 'great_outdoor';

        try {
            currentWeather = await getCurrentWeather(userLat, userLng);
            console.log(currentWeather);
            weatherClass = classifyWeather(currentWeather);
            console.log(weatherClass);
        } catch (error) {
            // Fallback keeps ranking functional if weather API fails.
            console.warn(error.message);
        }

        let categoryMatches = new Set();
        let categoryCountByLocationId = {};

        if (categoryId) {
            const locPlaceholders = candidateIds.map(() => '?').join(',');

            const [catRows] = await connection.execute(
                `SELECT location_id
                FROM location_categories
                WHERE category_id = ?
                AND location_id IN (${locPlaceholders})`,
                [categoryId, ...candidateIds]
            );

            categoryMatches = new Set(catRows.map(r => r.location_id));

            // Penalize locations that match the selected category but are tagged
            // with many categories overall (broad/ambiguous). Intuition: a
            // location that is "history" and nothing else is a stronger match
            // than one that is history+view+urban+water+...
            const [countRows] = await connection.execute(
                `SELECT location_id, COUNT(*) AS category_count
                 FROM location_categories
                 WHERE location_id IN (${locPlaceholders})
                 GROUP BY location_id`,
                candidateIds
            );

            countRows.forEach(row => {
                categoryCountByLocationId[row.location_id] = Number(row.category_count) || 0;
            });
        }

        // Get location-keyword pairs
        const locPlaceholders = candidateIds.map(() => '?').join(',');

        const [locationKeywordRows] = await connection.execute(
            `SELECT location_id, keyword_id
             FROM location_keywords
             WHERE location_id IN (${locPlaceholders})
             AND keyword_id IN (${dfPlaceholders})`,
            [...candidateIds, ...keywordIds]
        );

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

            // Binary bonus: 1 if the location belongs to the selected category,
            // 0 otherwise. Penalize locations with many categories so that
            // "narrow" locations rank higher than "broad" ones.
            const categoryScore = categoryMatches.has(locId)
                ? 1 / Math.max(1, categoryCountByLocationId[locId] || 1)
                : 0;

            // Weighted final score combining all three signals.
            const finalScore =
                SCORE_WEIGHTS.cosine * cosine +
                SCORE_WEIGHTS.category * categoryScore +
                SCORE_WEIGHTS.distance * distanceScore;

            const indoorScore = computeLocationIndoorScore(locationKeywordTerms[locId]);
            const warning = buildWeatherWarning(weatherClass, indoorScore);

            results.push({
                ...location,
                keyword_terms: locationKeywordTerms[locId] || [],
                categories: locationCategories[locId] || [],
                cosine_score: cosine,
                category_score: categoryScore,
                weather_class: weatherClass,
                weather: currentWeather,
                indoor_score: indoorScore,
                outdoor_indicator: outdoorIndicatorText(indoorScore),
                weather_warning: warning,
                distance_meters: distance,
                distance_score: distanceScore,
                score_weights: SCORE_WEIGHTS,
                score_components: {
                    cosine,
                    category: categoryScore,
                    distance: distanceScore
                },
                score_contributions: {
                    cosine: SCORE_WEIGHTS.cosine * cosine,
                    category: SCORE_WEIGHTS.category * categoryScore,
                    distance: SCORE_WEIGHTS.distance * distanceScore
                },
                final_score: finalScore
            });
        }

        // Return results ranked from most to least relevant.
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

        if (LOG_SCORES) {
            const weightsPct = {
                cosine_pct: Math.round(SCORE_WEIGHTS.cosine * 100),
                category_pct: Math.round(SCORE_WEIGHTS.category * 100),
                distance_pct: Math.round(SCORE_WEIGHTS.distance * 100)
            };
            console.log('=== SCORE WEIGHTS ===', weightsPct);

            results.slice(0, 10).forEach((r, idx) => {
                console.log(`[${idx + 1}] ${r.name}`, {
                    overall_score: r.final_score,
                    cosine_score: r.cosine_score,
                    distance_meters: r.distance_meters,
                    distance_score: r.distance_score,
                    category_score: r.category_score,
                    categories: r.categories,
                    keyword_terms_count: Array.isArray(r.keyword_terms) ? r.keyword_terms.length : 0,
                    keyword_terms: Array.isArray(r.keyword_terms)
                        ? r.keyword_terms.slice(0, LOG_KEYWORDS_MAX)
                        : [],
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
