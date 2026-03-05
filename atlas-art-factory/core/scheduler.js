'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const cron = require('node-cron');
const {
  dispatchScraping,
  dispatchMarketIntelligence,
  dispatchImageGeneration,
  dispatchMockupGeneration,
  dispatchAnalytics,
} = require('./orchestrator');
const { createLogger } = require('./logger');

const logger = createLogger('scheduler');

const jobs = [];

/**
 * Start all scheduled cron jobs.
 * Daily schedule:
 *   06:00 → Scrape all platforms
 *   08:00 → Market intelligence (demand scores)
 *   09:30 → Image generation pipeline
 *   12:00 → Mockup generation (after image gen completes)
 *   22:00 → Analytics collection
 */
function startScheduler() {
  logger.info('Starting scheduler');

  // 06:00 — Scrape all platforms
  jobs.push(cron.schedule('0 6 * * *', async () => {
    logger.info('Cron: starting scraping run');
    await dispatchScraping().catch(err => logger.error('Scraping cron failed', { error: err.message }));
  }, { timezone: 'America/New_York' }));

  // 08:00 — Market intelligence
  jobs.push(cron.schedule('0 8 * * *', async () => {
    logger.info('Cron: starting market intelligence run');
    await dispatchMarketIntelligence().catch(err => logger.error('Intelligence cron failed', { error: err.message }));
  }, { timezone: 'America/New_York' }));

  // 09:30 — Image generation
  jobs.push(cron.schedule('30 9 * * *', async () => {
    logger.info('Cron: starting image generation run');
    await dispatchImageGeneration().catch(err => logger.error('Generation cron failed', { error: err.message }));
  }, { timezone: 'America/New_York' }));

  // 12:00 — Mockup generation (after image gen completes)
  jobs.push(cron.schedule('0 12 * * *', async () => {
    logger.info('Cron: starting mockup generation run');
    await dispatchMockupGeneration().catch(err => logger.error('Mockup cron failed', { error: err.message }));
  }, { timezone: 'America/New_York' }));

  // 22:00 — Analytics
  jobs.push(cron.schedule('0 22 * * *', async () => {
    logger.info('Cron: starting analytics run');
    await dispatchAnalytics().catch(err => logger.error('Analytics cron failed', { error: err.message }));
  }, { timezone: 'America/New_York' }));

  logger.info(`Scheduler started with ${jobs.length} cron jobs`);
  return jobs;
}

function stopScheduler() {
  jobs.forEach(job => job.destroy());
  jobs.length = 0;
  logger.info('Scheduler stopped');
}

module.exports = { startScheduler, stopScheduler };
