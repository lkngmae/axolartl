const mysql = require('mysql2/promise');

const STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','of','to','in','on','at','for'
]);

async function searchEvents(rawQuery) {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'cs125_test'
  });

  console.log("\n===== RAW QUERY =====");
  console.log(rawQuery);

  // 1️⃣ Tokenize + lowercase
  let tokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^\w]/g, ''));

  // 2️⃣ Remove stopwords
  tokens = tokens.filter(t => t && !STOPWORDS.has(t));

  console.log("\nTokens after stopword removal:", tokens);

  if (tokens.length === 0) {
    console.log("No valid tokens.");
    return [];
  }

  // 3️⃣ Normalize using query_expansion
  const [normRows] = await connection.execute(
    `SELECT input_term, normalized_term
     FROM query_expansion
     WHERE input_term IN (?)`,
    [tokens]
  );

  const normalizedMap = {};
  normRows.forEach(r => {
    normalizedMap[r.input_term] = r.normalized_term;
  });

  const normalizedTokens = tokens.map(t =>
    normalizedMap[t] ? normalizedMap[t] : t
  );

  console.log("\nNormalized Tokens:", normalizedTokens);

  // 4️⃣ Get total number of events (N)
  const [[{ totalEvents }]] = await connection.execute(
    `SELECT COUNT(*) as totalEvents FROM events`
  );

  console.log("\nTotal Events (N):", totalEvents);

  // 5️⃣ Get document frequency (df) per term
  const [dfRows] = await connection.execute(
    `SELECT keyword, COUNT(DISTINCT event_id) as df
     FROM inverted_index
     WHERE keyword IN (?)
     GROUP BY keyword`,
    [normalizedTokens]
  );

  const dfMap = {};
  dfRows.forEach(r => {
    dfMap[r.keyword] = r.df;
  });

  console.log("\nDocument Frequencies:", dfMap);

  // 6️⃣ Compute query TF-IDF
  const queryVector = {};
  normalizedTokens.forEach(term => {
    const tf = 1; // simple binary tf for query
    const df = dfMap[term] || 1;
    const idf = Math.log(totalEvents / df);
    queryVector[term] = tf * idf;
  });

  console.log("\nQuery Vector (TF-IDF):", queryVector);

  // 7️⃣ Get candidate events from inverted_index
  const [candidateRows] = await connection.execute(
    `SELECT DISTINCT event_id
     FROM inverted_index
     WHERE keyword IN (?)`,
    [normalizedTokens]
  );

  const candidateEventIds = candidateRows.map(r => r.event_id);

  console.log("\nCandidate Events:", candidateEventIds);

  if (candidateEventIds.length === 0) {
    console.log("No matching events.");
    return [];
  }

  // 8️⃣ Get event keyword data
  const [eventKeywordRows] = await connection.execute(
    `SELECT event_id, keyword, term_frequency
     FROM event_keywords
     WHERE event_id IN (?)`,
    [candidateEventIds]
  );

  // Build event vectors
  const eventVectors = {};
  candidateEventIds.forEach(id => {
    eventVectors[id] = {};
  });

  eventKeywordRows.forEach(row => {
    const { event_id, keyword, term_frequency } = row;

    if (!normalizedTokens.includes(keyword)) return;

    const df = dfMap[keyword] || 1;
    const idf = Math.log(totalEvents / df);

    eventVectors[event_id][keyword] = term_frequency * idf;
  });

  console.log("\nEvent Vectors:", eventVectors);

  // 9️⃣ Compute cosine similarity
  const scores = [];

  for (const eventId of candidateEventIds) {
    const eventVector = eventVectors[eventId];

    let dotProduct = 0;
    let eventNorm = 0;
    let queryNorm = 0;

    for (const term of Object.keys(queryVector)) {
      const qVal = queryVector[term];
      const eVal = eventVector[term] || 0;

      dotProduct += qVal * eVal;
      queryNorm += qVal * qVal;
    }

    for (const val of Object.values(eventVector)) {
      eventNorm += val * val;
    }

    queryNorm = Math.sqrt(queryNorm);
    eventNorm = Math.sqrt(eventNorm);

    const cosine = eventNorm === 0 ? 0 : dotProduct / (queryNorm * eventNorm);

    scores.push({
      event_id: eventId,
      score: cosine
    });
  }

  console.log("\nCosine Scores:", scores);

  // 🔟 Sort descending
  scores.sort((a, b) => b.score - a.score);

  // 1️⃣1️⃣ Fetch event info
  const [eventRows] = await connection.execute(
    `SELECT *
     FROM events
     WHERE event_id IN (?)`,
    [scores.map(s => s.event_id)]
  );

  const eventMap = {};
  eventRows.forEach(e => {
    eventMap[e.event_id] = e;
  });

  const finalResults = scores.map(s => ({
    ...eventMap[s.event_id],
    similarity_score: s.score
  }));

  console.log("\n===== FINAL SORTED RESULTS =====");
  console.log(finalResults);

  await connection.end();

  return finalResults;
}

module.exports = searchEvents;
