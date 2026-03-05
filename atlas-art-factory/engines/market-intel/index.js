'use strict';

const { createLogger } = require('../../core/logger');
const { calculateDemandScores } = require('./demand-calculator');
const { rankOpportunities } = require('./niche-ranker');
const { updateSiloPriorities } = require('./silo-prioritizer');
const { detectTrendAlerts } = require('./trend-alerts');

const logger = createLogger('market-intel');

async function runMarketIntelligence() {
  logger.info('Starting market intelligence run');

  const scores = await calculateDemandScores();
  const opportunities = await rankOpportunities();
  const priorities = await updateSiloPriorities();
  const alerts = await detectTrendAlerts();

  const summary = {
    keywords_scored: scores.keywords_scored,
    opportunities_ranked: opportunities.opportunities_ranked,
    silos_updated: priorities.silos_updated,
    trend_alerts: alerts.length,
  };

  logger.info('Market intelligence complete', summary);
  return summary;
}

module.exports = { runMarketIntelligence };
