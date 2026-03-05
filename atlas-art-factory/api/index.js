'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { query, closePool } = require('../core/database');
const { createLogger } = require('../core/logger');

const logger = createLogger('api');
const app = express();

app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// ─── Silos ────────────────────────────────────────────────────────────────────

app.get('/api/silos', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM silos ORDER BY priority DESC, name'
    );
    res.json({ silos: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error('GET /api/silos failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/silos/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM silos WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('GET /api/silos/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Artists ──────────────────────────────────────────────────────────────────

app.get('/api/artists', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, s.name AS silo_name
       FROM ai_artists a
       LEFT JOIN silos s ON a.silo_id = s.id
       ORDER BY a.name`
    );
    res.json({ artists: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error('GET /api/artists failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/artists/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, s.name AS silo_name
       FROM ai_artists a
       LEFT JOIN silos s ON a.silo_id = s.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('GET /api/artists/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const [siloCount, artistCount, artworkCount, listingCount] = await Promise.all([
      query('SELECT COUNT(*) AS cnt FROM silos'),
      query('SELECT COUNT(*) AS cnt FROM ai_artists'),
      query('SELECT COUNT(*) AS cnt FROM artworks'),
      query('SELECT COUNT(*) AS cnt FROM listings'),
    ]);

    res.json({
      silos: parseInt(siloCount.rows[0].cnt),
      artists: parseInt(artistCount.rows[0].cnt),
      artworks: parseInt(artworkCount.rows[0].cnt),
      listings: parseInt(listingCount.rows[0].cnt),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('GET /api/stats failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Server ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001');

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      logger.info(`Art Factory API listening on port ${PORT}`);
      resolve(server);
    });
  });
}

module.exports = { app, startServer, closePool };

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  });
}
