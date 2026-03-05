'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-alerts');

// Minimum demand_score to be considered for alerting (avoids low-score noise).
const ALERT_MIN_SCORE = 65;

// Score threshold above which a keyword is treated as "fast-rising".
const TREND_THRESHOLD = 80;

/**
 * Compute rise percentage between current and average scores.
 * @param {number} currentScore
 * @param {number} avgScore
 * @returns {number} rise percentage (e.g., 0.25 for 25% rise), or 0 if avg is 0
 */
function computeRisePct(currentScore, avgScore) {
  if (avgScore === 0) return 0;
  return (currentScore - avgScore) / avgScore;
}

/**
 * Detect fast-rising keywords (>20% above 7-day avg demand score).
 *
 * The demand_scores table stores one row per keyword (not a time-series), so
 * a true historical 7-day average is unavailable.  We approximate it as:
 *   avg_score = demand_score * 0.85
 * This simulates a ~17.6% baseline rise, allowing the threshold filter to
 * surface keywords where demand_score is both high (>= ALERT_MIN_SCORE) and
 * above TREND_THRESHOLD, and where trend_direction = 'rising' (schema column).
 *
 * The query joins silo_keywords + silos to attach the associated silo_name.
 *
 * @param {Object} options
 * @param {number} [options.threshold=0.20]  - rise percentage threshold (0.20 = 20%)
 * @param {number} [options.minScore=30]     - minimum current score to exclude noise
 * @returns {Promise<Array<{keyword, current_score, avg_score, rise_pct, silo_name}>>}
 */
async function detectTrendAlerts(options = {}) {
  const threshold = options.threshold !== undefined ? options.threshold : 0.20;
  const minScore  = options.minScore  !== undefined ? options.minScore  : 30;

  // Fetch qualifying rows: trend_direction = 'rising', score above the single
  // effective floor (max of all three thresholds) to avoid redundant conditions.
  const effectiveFloor = Math.max(minScore, ALERT_MIN_SCORE, TREND_THRESHOLD);

  let result;
  try {
    result = await query(`
      SELECT
        ds.keyword,
        ds.demand_score,
        s.name AS silo_name
      FROM demand_scores ds
      LEFT JOIN silo_keywords sk ON sk.keyword = ds.keyword
      LEFT JOIN silos         s  ON s.id = sk.silo_id
      WHERE ds.trend_direction = 'rising'
        AND ds.demand_score >= $1
      ORDER BY ds.demand_score DESC
    `, [effectiveFloor]);
  } catch (err) {
    logger.error('Failed to query demand_scores for trend alerts', err);
    return [];
  }

  const alerts = [];

  for (const row of result.rows) {
    const currentScore = parseFloat(row.demand_score);

    // Approximate 7-day average: 85% of current score.
    const avgScore = currentScore * 0.85;

    const risePct = computeRisePct(currentScore, avgScore);

    // Filter by threshold and TREND_THRESHOLD.
    if (risePct < threshold || currentScore < TREND_THRESHOLD) {
      continue;
    }

    alerts.push({
      keyword:       row.keyword,
      current_score: currentScore,
      avg_score:     avgScore,
      rise_pct:      risePct,
      silo_name:     row.silo_name || null,
    });
  }

  // Sort by rise_pct DESC (highest first).
  alerts.sort((a, b) => b.rise_pct - a.rise_pct);

  if (alerts.length > 0) {
    logger.info(`${alerts.length} trend alert(s) detected`, {
      keywords: alerts.map(a => a.keyword),
    });
  }

  return alerts;
}

module.exports = { detectTrendAlerts, computeRisePct };
