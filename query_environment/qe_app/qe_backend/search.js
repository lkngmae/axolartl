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
 *        - Cosine similarity (TF-IDF vectors)     weight 0.55
 *        - Normalised inverse distance             weight 0.30
 *        - Category membership bonus              weight 0.15
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

        // Step 3: Fetch the total number of locations (N) for IDF calculation.
        const [[{ totalLocations }]] = await connection.execute(
            `SELECT COUNT(*) AS totalLocations FROM locations`
        );

        // Step 4: Fetch the document frequency (df) for each matched keyword,
        // i.e. the number of locations that have been tagged with that keyword.
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

        // Step 5: Build the query's TF-IDF vector. TF is assumed to be 1 for
        // every matched keyword (presence/absence model). IDF = log(N / df).
        const queryVector = {};
        let queryNorm = 0;

        for (const id of keywordIds) {
            const df = dfMap[id] || 1;
            const idf = Math.log(totalLocations / df);
            queryVector[id] = idf;
            queryNorm += idf * idf;
        }

        queryNorm = Math.sqrt(queryNorm);

        // Step 6: Retrieve the distinct set of candidate location IDs that
        // are tagged with at least one of the query keywords.
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

        // Build a set of candidate location IDs that belong to the selected
        // category so they can receive a category score bonus during ranking.
        let categoryMatches = new Set();

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
        }

        // Step 7: Fetch the keyword associations for every candidate location
        // so we can build per-location TF-IDF vectors for cosine scoring.
        const locPlaceholders = candidateIds.map(() => '?').join(',');

        const [locationKeywordRows] = await connection.execute(
            `SELECT location_id, keyword_id
             FROM location_keywords
             WHERE location_id IN (${locPlaceholders})
             AND keyword_id IN (${dfPlaceholders})`,
            [...candidateIds, ...keywordIds]
        );

        // Initialise an empty vector for each candidate location.
        const locationVectors = {};
        candidateIds.forEach(id => locationVectors[id] = {});

        // Populate each location's TF-IDF vector. TF = 1 (presence model).
        locationKeywordRows.forEach(row => {
            const { location_id, keyword_id } = row;
            const df = dfMap[keyword_id] || 1;
            const idf = Math.log(totalLocations / df);
            locationVectors[location_id][keyword_id] = idf;
        });

        // Fetch the full location records (coordinates, name, etc.) for all
        // candidates so we can compute distances and build the result objects.
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

        // Step 8: Score each candidate and collect results.
        const results = [];

        for (const locId of candidateIds) {
            const vector = locationVectors[locId];
            if (DEBUG_VECTORS) {
                console.log("Location vector:", vector);
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
            // 0 otherwise.
            const categoryScore = categoryMatches.has(locId) ? 1 : 0;

            // Weighted final score combining all three signals.
            const finalScore =
                0.55 * cosine +
                0.30 * distanceScore +
                0.15 * categoryScore;

            results.push({
                ...location,
                cosine_score: cosine,
                category_score: categoryScore,
                distance_meters: distance,
                final_score: finalScore
            });
        }

        // Return results ranked from most to least relevant.
        results.sort((a, b) => b.final_score - a.final_score);
        return results;
    } finally {
        // Release the connection back to the pool rather than closing it,
        // so it can be reused by subsequent calls.
        connection.release();
    }
}

module.exports = searchLocations;