'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { createLogger } = require('../../core/logger');
const { scoreDemand, getAllScrapedKeywords } = require('./demand-scorer');
const { rankOpportunities } = require('./opportunity-ranker');
const { updateSiloPriorities } = require('./silo-updater');
const { detectTrendAlerts } = require('./trend-alerts');

const logger = createLogger('market-intelligence');

/**
 * Run the complete market intelligence pipeline:
 * 1. Score demand for all scraped keywords (demand-scorer.js)
 * 2. Rank top 20 opportunities (opportunity-ranker.js)
 * 3. Update silo priorities (silo-updater.js)
 * 4. Detect trend alerts (trend-alerts.js)
 * Returns a summary object.
 *
 * @returns {Promise<{opportunities: Array, siloUpdates: Array, alerts: Array, errors: Array}>}
 */
async function runMarketIntelligence() {
  logger.info('Starting market intelligence pipeline');

  const errors = [];
  let opportunities = [];
  let siloUpdates = [];
  let alerts = [];

  // Stage 1: Score demand for all scraped keywords
  try {
    const keywords = await getAllScrapedKeywords();
    logger.info(`Stage 1: Scoring demand for ${keywords.length} keywords`);
    await scoreDemand(keywords);
    logger.info('Stage 1: Demand scoring complete');
  } catch (err) {
    logger.error('Stage 1 (demand scoring) failed', { error: err.message });
    errors.push({ stage: 'demand-scoring', message: err.message });
  }

  // Stage 2: Rank top 20 opportunities
  try {
    logger.info('Stage 2: Ranking opportunities');
    opportunities = await rankOpportunities();
    logger.info(`Stage 2: Ranked ${opportunities.length} opportunities`);
  } catch (err) {
    logger.error('Stage 2 (opportunity ranking) failed', { error: err.message });
    errors.push({ stage: 'opportunity-ranking', message: err.message });
  }

  // Stage 3: Update silo priorities
  try {
    logger.info('Stage 3: Updating silo priorities');
    siloUpdates = await updateSiloPriorities();
    logger.info(`Stage 3: Updated ${siloUpdates.length} silos`);
  } catch (err) {
    logger.error('Stage 3 (silo priority update) failed', { error: err.message });
    errors.push({ stage: 'silo-update', message: err.message });
  }

  // Stage 4: Detect trend alerts
  try {
    logger.info('Stage 4: Detecting trend alerts');
    alerts = await detectTrendAlerts();
    logger.info(`Stage 4: Detected ${alerts.length} trend alerts`);
  } catch (err) {
    logger.error('Stage 4 (trend alerts) failed', { error: err.message });
    errors.push({ stage: 'trend-alerts', message: err.message });
  }

  const summary = { opportunities, siloUpdates, alerts, errors };
  logger.info('Market intelligence pipeline complete', {
    opportunities: opportunities.length,
    siloUpdates: siloUpdates.length,
    alerts: alerts.length,
    errors: errors.length,
  });

  return summary;
}

module.exports = { runMarketIntelligence };
