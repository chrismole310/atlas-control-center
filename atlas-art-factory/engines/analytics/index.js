'use strict';

const { createLogger } = require('../../core/logger');
const { pullEtsyStats } = require('./etsy-puller');
const { pullGumroadStats } = require('./gumroad-puller');
const { aggregateDailyStats, updatePerformanceMetrics } = require('./stats-aggregator');
const { adjustSiloPriorities } = require('./adaptive-learner');
const { generateDailyReport } = require('./daily-report');

const logger = createLogger('analytics');

async function runAnalytics() {
  logger.info('Starting analytics run');

  const etsy = await pullEtsyStats();
  const gumroad = await pullGumroadStats();
  await updatePerformanceMetrics();
  const dailyStats = await aggregateDailyStats();
  const adaptiveLearning = await adjustSiloPriorities();
  const report = await generateDailyReport();

  const summary = {
    etsy,
    gumroad,
    daily_stats: dailyStats,
    adaptive_learning: adaptiveLearning,
    report,
  };

  logger.info('Analytics run complete', summary);
  return summary;
}

module.exports = { runAnalytics };
