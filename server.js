const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'listings.json');
const VOTES_FILE = path.join(__dirname, 'data', 'votes.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadListings() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function loadVotes() {
  try {
    return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveVotes(votes) {
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
}

app.get('/api/listings', (req, res) => {
  res.json(loadListings());
});

app.get('/api/votes', (req, res) => {
  res.json(loadVotes());
});

app.post('/api/votes', (req, res) => {
  const { listing_id, voter, vote } = req.body || {};
  if (!listing_id || !voter || !['up', 'down', null].includes(vote)) {
    return res.status(400).json({ error: 'expected { listing_id, voter, vote: "up"|"down"|null }' });
  }
  const votes = loadVotes();
  if (!votes[listing_id]) votes[listing_id] = {};
  if (vote === null) {
    delete votes[listing_id][voter];
  } else {
    votes[listing_id][voter] = vote;
  }
  saveVotes(votes);
  res.json(votes);
});

app.listen(PORT, () => {
  console.log(`LA trip rentals listening on :${PORT}`);
});
