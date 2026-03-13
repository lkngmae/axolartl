require('dotenv').config();
const express = require('express');
const cors = require('cors');
const searchLocations = require('./search'); // the TF-IDF file

const app = express();

app.use(cors());
app.use(express.json());

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
    query,
    userLat,
    userLng,
    maxRadius,
    currentTime,
    selectedCategory
  );

  res.json(results);
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
