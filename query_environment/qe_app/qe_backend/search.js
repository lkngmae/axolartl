const mysql = require('mysql2/promise');

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'of', 'to', 'in', 'on', 'at', 'for'
]);

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
        user: 'root',
        database: 'axolartl'
    });

    console.log(rawQuery); 

    // 1️⃣ Tokenize
    let tokens = rawQuery
        .toLowerCase()
        .split(/\s+/)
        .map(t => t.replace(/[^\w]/g, ''))
        .filter(t => t);

    if (tokens.length === 0) return [];

    // 2️⃣ Get matching keywords
    const placeholders = tokens.map(() => '?').join(',');

    const [keywordRows] = await connection.execute(
        `SELECT id, term
         FROM keywords
         WHERE term IN (${placeholders})`,
        tokens
    );

    console.log(keywordRows);

    if (keywordRows.length === 0) return [];


    const keywordIds = keywordRows.map(r => r.id);

    // Map term → id
    const termToId = {};
    keywordRows.forEach(r => {
        termToId[r.term] = r.id;
    });

    // 3️⃣ Total locations (N)
    const [[{ totalLocations }]] = await connection.execute(
        `SELECT COUNT(*) AS totalLocations FROM locations`
    );

    // 4️⃣ Get DF per keyword
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

    // 5️⃣ Build query vector (TF = 1)
    const queryVector = {};
    let queryNorm = 0;

    for (const id of keywordIds) {
        const df = dfMap[id] || 1;
        const idf = Math.log(totalLocations / df);
        queryVector[id] = idf;
        queryNorm += idf * idf;
    }

    queryNorm = Math.sqrt(queryNorm);

    console.log(queryVector)

    



    // 6️⃣ Candidate locations
    let candidateQuery = `
        SELECT DISTINCT lk.location_id
        FROM location_keywords lk
    `;

    const [candidateRows] = await connection.execute(
        `SELECT DISTINCT location_id
        FROM location_keywords
        WHERE keyword_id IN (${dfPlaceholders})`,
        keywordIds
    );

    let categoryId = null;

    if (selectedCategory) {
        const [catRows] = await connection.execute(
            `SELECT id FROM categories WHERE name = ?`,
            [selectedCategory]
        );

        if (catRows.length > 0) {
            categoryId = catRows[0].id;
        }
    }

    const candidateIds = candidateRows.map(r => r.location_id);
    if (candidateIds.length === 0) return [];

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


    console.log(categoryId)

    // 7️⃣ Get location-keyword pairs
    const locPlaceholders = candidateIds.map(() => '?').join(',');

    const [locationKeywordRows] = await connection.execute(
        `SELECT location_id, keyword_id
         FROM location_keywords
         WHERE location_id IN (${locPlaceholders})
         AND keyword_id IN (${dfPlaceholders})`,
        [...candidateIds, ...keywordIds]
    );

    // Build location vectors
    const locationVectors = {};
    candidateIds.forEach(id => locationVectors[id] = {});

    locationKeywordRows.forEach(row => {
        const { location_id, keyword_id } = row;
        const df = dfMap[keyword_id] || 1;
        const idf = Math.log(totalLocations / df);
        locationVectors[location_id][keyword_id] = idf; // TF=1
    });

    // 8️⃣ Fetch location info
    const [locationRows] = await connection.execute(
        `SELECT * FROM locations
         WHERE id IN (${locPlaceholders})`,
        candidateIds
    );

    const locationMap = {};
    locationRows.forEach(l => {
        locationMap[l.id] = l;
    });

    // 9️⃣ Compute cosine + distance scoring
    const results = [];

    for (const locId of candidateIds) {
        console.log(locId)
        console.log("FOR LOOP")

        const vector = locationVectors[locId];
        console.log(vector)

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

        const cosine = locNorm === 0 ? 0 : dot / (queryNorm * locNorm);

        console.log("HERE1")

        const location = locationMap[locId];
        if (!location) continue;

        console.log("HERE2")

        const distance = haversineDistance(
            userLat,
            userLng,
            location.latitude,
            location.longitude
        );


        console.log("D")
        console.log(distance)
        console.log("MR")
        console.log(maxRadius)
        if (distance > maxRadius) continue;

        console.log("HERE3")

        const distanceScore = 1 - (distance / maxRadius);

        const categoryScore = categoryMatches.has(locId) ? 1 : 0;

        const finalScore =
            0.55 * cosine +
            0.30 * distanceScore +
            0.15 * categoryScore;

        console.log(finalScore)


        results.push({
            ...location,
            cosine_score: cosine,
            category_score: categoryScore,
            distance_meters: distance,
            final_score: finalScore
        });
    }

    results.sort((a, b) => b.final_score - a.final_score);

    await connection.end();
    return results;
}

module.exports = searchLocations;