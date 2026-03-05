require('dotenv').config();
const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, filename), 'utf8'));
}

const silos      = loadJson('silos.json');
const artists    = loadJson('artists.json');
const aiEngines  = loadJson('ai-engines.json');
const platforms  = loadJson('platforms.json');
const artistInspirations = loadJson('artist-inspirations.json');
const styleClusters      = loadJson('style-clusters.json');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
['artworks', 'mockups', 'packages'].forEach(dir => {
  const p = path.join(STORAGE_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

module.exports = {
  silos,
  artists,
  aiEngines,
  platforms,
  artistInspirations,
  styleClusters,
  STORAGE_DIR,
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DAILY_TARGET: 200,
  MIN_QUALITY_SCORE: 80,
};
