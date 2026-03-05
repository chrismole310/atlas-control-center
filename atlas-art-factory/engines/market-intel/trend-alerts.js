'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-alerts');

async function detectTrendAlerts(options = {}) {
  const minScore = options.minScore || 10000;
  const maxSaturation = options.maxSaturation || 30;

  const { rows } = await query(
    `SELECT keyword, demand_score, trend_direction, saturation_level
     FROM demand_scores
     WHERE trend_direction = 'rising'
       AND demand_score > $1
       AND saturation_level < $2
     ORDER BY demand_score DESC
     LIMIT 20`,
    [minScore, maxSaturation]
  );

  const alerts = rows.map(row => ({
    keyword: row.keyword,
    demand_score: parseFloat(row.demand_score),
    saturation: parseFloat(row.saturation_level),
    priority: parseFloat(row.demand_score) > 30000 ? 'high' : 'medium',
    action: 'immediate_production',
  }));

  if (alerts.length > 0) {
    logger.info(`${alerts.length} trend alerts detected`, {
      keywords: alerts.map(a => a.keyword),
    });
  }

  return alerts;
}

module.exports = { detectTrendAlerts };
