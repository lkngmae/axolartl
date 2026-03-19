require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const searchLocations = require('./search');
const { getCurrentWeather, getHourlyForecastWeather, classifyWeather } = require('./weather');

const app = express();

app.use(cors());
app.use(express.json());

// Create the pool once when the server starts. All search requests will
// borrow connections from this shared pool rather than opening new ones.
const pool = mysql.createPool({
    host: 'localhost',
    // user: 'root',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
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
	    selectedCategory,
	    selectedCategories,
	    preferredTimeLabel,
	    weather: weatherOverride,
	    weather_class: weatherClassOverride
	  } = req.body;

  const results = await searchLocations(
    pool, // used so that the server can recycle connections
    query,
    userLat,
    userLng,
    maxRadius,
	    currentTime,
	    selectedCategory,
	    selectedCategories,
	    null,
	    preferredTimeLabel,
	    weatherOverride,
	    weatherClassOverride
	  );

  // Keep weather data accessible even if the user scrolls, and even if no
  // results match. The frontend expects an object with { weather, weather_class, results }.
  const weather = results?.[0]?.weather ?? null;
  const weatherClass = results?.[0]?.weather_class ?? 'great_outdoor';
  const scoreWeights = results?.[0]?.score_weights ?? { cosine: 0.65, distance: 0.2, category: 0.15, personalization: 0 };
  res.json({
    weather,
    weather_class: weatherClass,
    score_weights: scoreWeights,
    rank_mode: 'default',
    results
  });
});

app.post('/weather', async (req, res) => {
  const { userLat, userLng, currentTime, preferredTimeLabel } = req.body || {};
  try {
    const lat = Number(userLat);
    const lng = Number(userLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Invalid userLat/userLng.' });
    }

    const weather = preferredTimeLabel
      ? await getHourlyForecastWeather(lat, lng, currentTime)
      : await getCurrentWeather(lat, lng);
    const weatherClass = classifyWeather(weather);

    return res.json({ weather, weather_class: weatherClass });
  } catch (err) {
    console.warn('[WEATHER] /weather failed:', err?.message || err);
    return res.status(500).json({ error: 'Weather lookup failed.' });
  }
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
