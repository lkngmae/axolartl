require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const searchLocations = require('./search');

const app = express();

app.use(cors());
app.use(express.json());

// Create the pool once when the server starts. All search requests will
// borrow connections from this shared pool rather than opening new ones.
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'axolartl',
    waitForConnections: true,  // queue requests when all connections are busy
    connectionLimit: 10,       // maximum number of open connections
    queueLimit: 0              // no limit on queued requests (0 = unlimited)
});

app.post('/search', async (req, res) => {
  const {
    query,
    userLat,
    userLng,
    maxRadius,
    currentTime,
    selectedCategory
  } = req.body;

  const results = await searchLocations(
    pool, // used so that the server can recycle connections
    query,
    userLat,
    userLng,
    maxRadius,
    currentTime,
    selectedCategory
  );

  // Keep weather data accessible even if the user scrolls, and even if no
  // results match. The frontend expects an object with { weather, weather_class, results }.
  const weather = results?.[0]?.weather ?? null;
  const weatherClass = results?.[0]?.weather_class ?? 'great_outdoor';
  const scoreWeights = results?.[0]?.score_weights ?? { cosine: 0.6, category: 0.15, distance: 0.25 };
  res.json({
    weather,
    weather_class: weatherClass,
    score_weights: scoreWeights,
    results
  });
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
