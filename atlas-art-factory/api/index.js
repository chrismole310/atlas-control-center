'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { query, closePool } = require('../core/database');
const { createLogger } = require('../core/logger');
const { detectTrendAlerts } = require('../engines/2-market-intelligence/trend-alerts');

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

// ─── Intelligence ─────────────────────────────────────────────────────────────

app.get('/api/intelligence', async (req, res) => {
  try {
    const [opportunitiesResult, demandResult, alerts] = await Promise.all([
      query(
        'SELECT * FROM market_opportunities ORDER BY opportunity_rank ASC LIMIT 20'
      ),
      query(
        'SELECT keyword, demand_score FROM demand_scores ORDER BY demand_score DESC LIMIT 10'
      ),
      detectTrendAlerts(),
    ]);

    res.json({
      opportunities: opportunitiesResult.rows,
      alerts,
      topDemandScores: demandResult.rows,
    });
  } catch (err) {
    logger.error('GET /api/intelligence failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

app.get('/api/analytics/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await query(
      'SELECT * FROM analytics_daily ORDER BY date DESC LIMIT $1', [days]
    );
    res.json({ analytics: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/analytics/daily failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/analytics/top-artworks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { rows } = await query(
      `SELECT pm.artwork_id, a.title, a.master_image_url,
              SUM(pm.revenue) AS total_revenue, SUM(pm.sales) AS total_sales,
              AVG(pm.conversion_rate) AS avg_conversion
       FROM performance_metrics pm
       JOIN artworks a ON a.id = pm.artwork_id
       GROUP BY pm.artwork_id, a.title, a.master_image_url
       ORDER BY total_revenue DESC
       LIMIT $1`, [limit]
    );
    res.json({ artworks: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/analytics/top-artworks failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Trends ───────────────────────────────────────────────────────────────────

app.get('/api/trends', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { rows } = await query(
      `SELECT keyword, demand_score, trend_direction, search_volume, competition_count, saturation_level
       FROM demand_scores
       ORDER BY demand_score DESC
       LIMIT $1`, [limit]
    );
    res.json({ trends: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/trends failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Production ───────────────────────────────────────────────────────────────

app.get('/api/production/status', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows: [artworks] } = await query(
      'SELECT COUNT(*) AS count FROM artworks WHERE created_at::date = $1', [today]
    );
    const { rows: [listings] } = await query(
      'SELECT COUNT(*) AS count FROM listings WHERE published_at::date = $1', [today]
    );
    const { rows: [pending] } = await query(
      `SELECT COUNT(*) AS count FROM artworks WHERE status = 'approved' AND id NOT IN (SELECT artwork_id FROM listings)`
    );
    res.json({
      artworks_today: parseInt(artworks?.count || '0', 10),
      listings_today: parseInt(listings?.count || '0', 10),
      pending_distribution: parseInt(pending?.count || '0', 10),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('GET /api/production/status failed', { error: err.message });
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
