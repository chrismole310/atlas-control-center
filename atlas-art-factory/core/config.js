'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module
// for environment variables to take effect in non-test entry points.

const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(__dirname, '../config');

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;

  const load = (filename) => {
    const filePath = path.join(CONFIG_DIR, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  };

  _cache = {
    silos: load('silos.json'),               // top-level array; each entry has integer id + name string
    artists: load('artists.json'),           // top-level array; each entry has silo field (string = silo name)
    engines: load('ai-engines.json'),        // { engines: { <id>: {...} } } — object keyed by engine id
    platforms: load('platforms.json'),       // { platforms: { <id>: {...} } } — object keyed by platform id
    inspirations: load('artist-inspirations.json'), // top-level array
    styleClusters: load('style-clusters.json'),     // top-level array
  };

  return _cache;
}

// getSilo accepts either an integer id or a string name slug.
function getSilo(siloId) {
  const { silos } = loadConfig();
  return silos.find(s => s.id === siloId || s.name === siloId) || null;
}

// getArtist finds an artist by the silo name slug (the `silo` field on each artist entry).
function getArtist(siloName) {
  const { artists } = loadConfig();
  return artists.find(a => a.silo === siloName) || null;
}

// getEngine looks up an engine by its string key inside engines.engines object.
function getEngine(engineId) {
  const { engines } = loadConfig();
  if (!engines || !engines.engines) return null;
  const found = engines.engines[engineId];
  return found !== undefined ? found : null;
}

// getPlatform looks up a platform by its string key inside platforms.platforms object.
function getPlatform(platformId) {
  const { platforms } = loadConfig();
  if (!platforms || !platforms.platforms) return null;
  const found = platforms.platforms[platformId];
  return found !== undefined ? found : null;
}

function clearCache() {
  _cache = null;
}

module.exports = { loadConfig, getSilo, getArtist, getEngine, getPlatform, clearCache };
