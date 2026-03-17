require('dotenv').config();
const mysql = require('mysql2/promise');
const { getCurrentWeather, classifyWeather } = require('./weather');
const { computeLocationWeatherScore } = require('./weatherScoring');

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'of', 'to', 'in', 'on', 'at', 'for'
]);
const DEBUG_VECTORS = process.env.DEBUG_VECTORS === 'true';
const SYNONYM_MAP = {
    park: ['leisure:park'],
    bridge: ['bridge', 'man_made:bridge'],
    beach: ['natural:beach']
};

async function getGooglePlaceImage(lat, lon, keyword = "") {
    const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    searchUrl.search = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: 1000,
        keyword: keyword, // TODO: adding multiple keywords in a list?
        key: process.env.GOOGLE_PLACES_API_KEY
    });

    try{
        console.log('Sending Google Places request...')
        const response = await fetch(searchUrl);
        const data = await response.json();
        console.log(`Google Places Responded with status:${data.status}`)
        // If a location is found and the location has photos.
        if (data.results && data.results.length > 0) {
            console.log(`Found ${data.results.length} places nearby. Scanning for photos...`);
            for (let i = 0; i < data.results.length; i++) {
                const place = data.results[i];
                if(place.photos && place.photos.length > 0) {
                    console.log(`Found photo at "${place.name}" (Result #${i + 1})`);
                    const photoReference = place.photos[0].photo_reference;
                    const photoURL = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
                    return photoURL;
                }
            }
        }
    } catch (error) {
        console.error ("Google Places API Error: ", error);    
    }

    return null;
}

function tokenizeQuery(rawQuery) {
    if (!rawQuery) return [];
    return rawQuery
        .toLowerCase()
        .split(/\s+/)
        // Keep delimiters commonly present in OSM-style keywords.
        .map(t => t.replace(/[^\w:|/.\-]/g, ''))
        .filter(t => t);
}

function buildExpandedTerms(tokens) {
    const exactTerms = new Set();
    const plainTokens = new Set();

    tokens.forEach(token => {
        if (token.includes(':')) {
            exactTerms.add(token);
            return;
        }

        if (!STOPWORDS.has(token)) {
            plainTokens.add(token);
            exactTerms.add(token);
        }

        const synonyms = SYNONYM_MAP[token] || [];
        synonyms.forEach(s => exactTerms.add(s));
    });

    return {
        exactTerms: [...exactTerms],
        plainTokens: [...plainTokens]
    };
}

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

    // For plain words, also match key:value terms where key or value equals the token.
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

function toRadians(deg) {
    return deg * (Math.PI / 180);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
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

async function searchLocations(rawQuery, userLat, userLng, maxRadius, currentTime,
    selectedCategory) {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: process.env.DB_USER,
        database: 'axolartl'
    });

    try {
        const tokens = tokenizeQuery(rawQuery);
        if (tokens.length === 0) return [];

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

        // Build location vectors
        const locationVectors = {};
        candidateIds.forEach(id => locationVectors[id] = {});

        locationKeywordRows.forEach(row => {
            const { location_id, keyword_id } = row;
            const df = dfMap[keyword_id] || 1;
            const idf = Math.log(totalLocations / df);
            locationVectors[location_id][keyword_id] = idf; // TF=1
        });

        // Fetch location info
        const [locationRows] = await connection.execute(
            `SELECT * FROM locations
             WHERE id IN (${locPlaceholders})`,
            candidateIds
        );

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

            let dot = 0;
            let locNorm = 0;

            for (const termId in queryVector) {
                const qVal = queryVector[termId];
                const lVal = vector[termId] || 0;
                dot += qVal * lVal;
            }

            for (const val of Object.values(vector)) {
                locNorm += val * val;
            }

            locNorm = Math.sqrt(locNorm);

            const cosine =
                locNorm === 0 || queryNorm === 0
                    ? 0
                    : dot / (queryNorm * locNorm);

            const location = locationMap[locId];
            if (!location) continue;

            const distance = haversineDistance(
                userLat,
                userLng,
                location.latitude,
                location.longitude
            );

            if (distance > maxRadius) continue;

            const distanceScore = 1 - (distance / maxRadius);

            const categoryScore = categoryMatches.has(locId) ? 1 : 0;
            const weatherScore = computeLocationWeatherScore(
                locationKeywordIds[locId],
                weatherClass
            );

            const finalScore =
                0.5 * cosine +
                0.1 * categoryScore +
                0.25 * distanceScore +
                0.15 * weatherScore;

            results.push({
                ...location,
                cosine_score: cosine,
                category_score: categoryScore,
                weather_score: weatherScore,
                weather_class: weatherClass,
                weather: currentWeather,
                distance_meters: distance,
                final_score: finalScore
            });
        }

        results.sort((a, b) => b.final_score - a.final_score);
        const topResults = results.slice(0, 10);
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        for (let loc of topResults) {
            const lastUpdated = loc.image_updated_at ? new Date(loc.image_updated_at).getTime() : 0;
            const isPlaceholder = loc.image_url && loc.image_url.includes('via.placeholder.com');
            const needsUpdate = !loc.image_url || isPlaceholder || (now - lastUpdated > THIRTY_DAYS_MS);
            if (needsUpdate) {
                    const newImageUrl = await getGooglePlaceImage(loc.latitude, loc.longitude, selectedCategory || "");
                    
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
                            loc.image_url = "https://via.placeholder.com/300x200?text=No+Google+Street+View";
                        }
                    }
                }
            }
        return results;
    } finally {
        await connection.end();
    }
}

module.exports = searchLocations;
