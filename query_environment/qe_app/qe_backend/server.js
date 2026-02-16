const express = require('express');
const cors = require('cors');
//const searchEvents = require('./search'); // the TF-IDF file

const app = express();

app.use(cors());
app.use(express.json());

/*
app.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    console.log("\nIncoming search:", query);

    const results = await searchEvents(query);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});*/

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
