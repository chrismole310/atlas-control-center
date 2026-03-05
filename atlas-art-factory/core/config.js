'use strict';

require('dotenv').config();
const path = require('path');
const fs   = require('fs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const STORAGE_DIR = path.join(__dirname, '..', 'storage');

// Ensure storage subdirectories exist
['artworks', 'mockups', 'packages'].forEach(dir => {
  const p = path.join(STORAGE_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const load = (filename) => {
  const filePath = path.join(CONFIG_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load config file '${filename}': ${err.message}`);
  }
};

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  _cache = {
    silos:         load('silos.json'),
    artists:       load('artists.json'),
    engines:       load('ai-engines.json'),
    platforms:     load('platforms.json'),
    inspirations:  load('artist-inspirations.json'),
    styleClusters: load('style-clusters.json'),
  };
  return _cache;
}

function clearCache() {
  _cache = null;
}

function getSilo(idOrName) {
  const { silos } = loadConfig();
  const arr = Array.isArray(silos) ? silos : (silos.silos || []);
  if (typeof idOrName === 'number') {
    return arr.find(s => s.id === idOrName) || null;
  }
  return arr.find(s => s.id === idOrName || s.name === idOrName) || null;
}

function getArtist(siloName) {
  const { artists } = loadConfig();
  const arr = Array.isArray(artists) ? artists : (artists.artists || []);
  return arr.find(a => a.silo === siloName) || null;
}

function getEngine(engineId) {
  const { engines } = loadConfig();
  const map = engines.engines || engines;
  return map[engineId] || null;
}

function getPlatform(platformId) {
  const { platforms } = loadConfig();
  const map = platforms.platforms || platforms;
  return map[platformId] || null;
}

module.exports = {
  loadConfig,
  clearCache,
  getSilo,
  getArtist,
  getEngine,
  getPlatform,
  STORAGE_DIR,
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DAILY_TARGET: 200,
  MIN_QUALITY_SCORE: 80,
};
