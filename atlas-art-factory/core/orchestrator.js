'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module
// for environment variables to take effect in non-test entry points.

const { getQueue, QUEUE_NAMES } = require('./queue');
const { query } = require('./database');
const { createLogger } = require('./logger');

const { runTrendScraper } = require('../engines/trend-scraper/index');

const logger = createLogger('orchestrator');

// Register queue processors
function registerProcessors() {
  const scrapingQueue = getQueue(QUEUE_NAMES.TREND_SCRAPING);
  scrapingQueue.process(async (job) => {
    logger.info('Processing trend scraping job', { jobId: job.id });
    const result = await runTrendScraper();
    logger.info('Trend scraping job complete', result);
    return result;
  });
}

/**
 * Dispatch the daily scraping job to the trend-scraping queue.
 */
async function dispatchScraping() {
  const queue = getQueue(QUEUE_NAMES.TREND_SCRAPING);
  const job = await queue.add({ task: 'scrape-all-platforms', triggeredAt: new Date().toISOString() });
  logger.info('Dispatched scraping job', { jobId: job.id });
  return job;
}

/**
 * Dispatch the market intelligence job.
 */
async function dispatchMarketIntelligence() {
  const queue = getQueue(QUEUE_NAMES.MARKET_INTELLIGENCE);
  const job = await queue.add({ task: 'compute-demand-scores', triggeredAt: new Date().toISOString() });
  logger.info('Dispatched market intelligence job', { jobId: job.id });
  return job;
}

/**
 * Dispatch image generation jobs for all active silos.
 * @param {number} dailyTarget - Total images to generate today (default 200)
 */
async function dispatchImageGeneration(dailyTarget = 200) {
  // schema.sql: silos uses status VARCHAR(20) DEFAULT 'active' — no is_active column
  const silos = await query(
    "SELECT id, name, priority FROM silos WHERE status = 'active' ORDER BY priority DESC"
  );

  const totalPriority = silos.rows.reduce((sum, s) => sum + (s.priority || 1), 0);
  const queue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
  let dispatched = 0;

  for (const silo of silos.rows) {
    const allocation = Math.round((silo.priority / totalPriority) * dailyTarget);
    if (allocation < 1) continue;

    const job = await queue.add({
      task: 'generate-images',
      siloId: silo.id,
      siloName: silo.name,
      count: allocation,
      triggeredAt: new Date().toISOString(),
    });
    dispatched += allocation;
    logger.info(`Dispatched image generation for silo ${silo.name}`, { jobId: job.id, count: allocation });
  }

  logger.info(`Total image generation jobs dispatched`, { target: dailyTarget, dispatched });
  return { target: dailyTarget, dispatched, siloCount: silos.rows.length };
}

/**
 * Dispatch the analytics collection job.
 */
async function dispatchAnalytics() {
  const queue = getQueue(QUEUE_NAMES.ANALYTICS);
  const job = await queue.add({ task: 'collect-platform-analytics', triggeredAt: new Date().toISOString() });
  logger.info('Dispatched analytics job', { jobId: job.id });
  return job;
}

/**
 * Run a full daily cycle (for manual trigger or testing).
 */
async function runDailyCycle() {
  logger.info('Starting daily cycle');
  try {
    await dispatchScraping();
    await dispatchMarketIntelligence();
    await dispatchImageGeneration();
    await dispatchAnalytics();
    logger.info('Daily cycle complete');
    return { success: true };
  } catch (err) {
    logger.error('Daily cycle failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

module.exports = {
  registerProcessors,
  dispatchScraping,
  dispatchMarketIntelligence,
  dispatchImageGeneration,
  dispatchAnalytics,
  runDailyCycle,
};
