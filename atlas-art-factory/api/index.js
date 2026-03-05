'use strict';

const express = require('express');
const cors = require('cors');
const { query } = require('../core/database');
const { createLogger } = require('../core/logger');

const logger = createLogger('api');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'atlas-art-factory', timestamp: new Date().toISOString() });
  });

  app.get('/api/silos', async (req, res) => {
    try {
      const r = await query('SELECT * FROM silos ORDER BY priority DESC');
      res.json(r.rows);
    } catch (err) {
      logger.error('GET /api/silos failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/artists', async (req, res) => {
    try {
      const r = await query('SELECT * FROM ai_artists ORDER BY performance_score DESC NULLS LAST');
      res.json(r.rows);
    } catch (err) {
      logger.error('GET /api/artists failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [artworks, listings, revenue, opportunities] = await Promise.all([
        query("SELECT COUNT(*) AS n FROM artworks WHERE created_at::date = $1", [today]),
        query("SELECT COUNT(*) AS n FROM listings"),
        query("SELECT COALESCE(SUM(net_revenue),0) AS total FROM sales WHERE sale_date::date = $1", [today]),
        query("SELECT COUNT(*) AS n FROM market_opportunities WHERE status = 'active'"),
      ]);
      res.json({
        artworks_today: parseInt(artworks.rows[0].n),
        listings_total: parseInt(listings.rows[0].n),
        revenue_today: parseFloat(revenue.rows[0].total),
        opportunities: parseInt(opportunities.rows[0].n),
        target: 200,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('GET /api/stats failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/artworks', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const r = await query('SELECT * FROM artworks ORDER BY created_at DESC LIMIT $1', [limit]);
      res.json(r.rows);
    } catch (err) {
      logger.error('GET /api/artworks failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/opportunities', async (req, res) => {
    try {
      const r = await query("SELECT * FROM market_opportunities WHERE status='active' ORDER BY opportunity_rank ASC LIMIT 20");
      res.json(r.rows);
    } catch (err) {
      logger.error('GET /api/opportunities failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

function startServer() {
  const { PORT } = require('../core/config');
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`Atlas Art Factory API running on port ${PORT}`);
  });
  return app;
}

module.exports = { createApp, startServer };
