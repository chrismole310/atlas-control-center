'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module
// for environment variables to take effect in non-test entry points.

const { getQueue, QUEUE_NAMES } = require('./queue');
const { query } = require('./database');
const { createLogger } = require('./logger');

const { runTrendScraper } = require('../engines/trend-scraper/index');
const { runMarketIntelligence } = require('../engines/2-market-intelligence/index');
const { runDailyBatch } = require('../engines/4-ai-artist/index');
const { runMockupBatch } = require('../engines/5-mockup-generation/index');
const { runDistribution } = require('../engines/distribution/index');
const { runAnalytics } = require('../engines/analytics/index');
const { startMockupWorker } = require('./workers/mockup-worker');

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

  const intelQueue = getQueue(QUEUE_NAMES.MARKET_INTELLIGENCE);
  intelQueue.process(async (job) => {
    logger.info('Processing market intelligence job', { jobId: job.id });
    const result = await runMarketIntelligence();
    logger.info('Market intelligence job complete', result);
    return result;
  });

  const imageQueue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
  imageQueue.process(async (job) => {
    logger.info('Processing image generation job', { jobId: job.id });
    const dailyTarget = (job.data && job.data.count) || 200;
    const result = await runDailyBatch({ dailyTarget });
    logger.info('Image generation job complete', result);
    return result;
  });

  startMockupWorker();

  const distributionQueue = getQueue(QUEUE_NAMES.DISTRIBUTION);
  distributionQueue.process(async (job) => {
    logger.info('Processing distribution job', { jobId: job.id });
    const result = await runDistribution();
    logger.info('Distribution job complete', result);
    return result;
  });

  const analyticsQueue = getQueue(QUEUE_NAMES.ANALYTICS);
  analyticsQueue.process(async (job) => {
    logger.info('Processing analytics job', { jobId: job.id });
    const result = await runAnalytics();
    logger.info('Analytics job complete', result);
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
  let silos;
  try {
    const result = await query(
      "SELECT id, name, priority FROM silos WHERE status = 'active' ORDER BY priority DESC"
    );
    silos = result.rows;
  } catch (dbErr) {
    logger.error('Failed to fetch active silos for image generation dispatch', { error: dbErr.message });
    throw dbErr;
  }

  const totalPriority = silos.reduce((sum, s) => sum + (s.priority || 1), 0);
  const queue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
  let dispatched = 0;

  for (const silo of silos) {
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
    logger.info('Dispatched image generation for silo', { siloName: silo.name, jobId: job.id, count: allocation });
  }

  logger.info('Total image generation jobs dispatched', { target: dailyTarget, dispatched });
  return { target: dailyTarget, dispatched, siloCount: silos.length };
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
 * Dispatch the mockup generation job.
 */
async function dispatchMockupGeneration() {
  const queue = getQueue(QUEUE_NAMES.MOCKUP_GENERATION);
  const job = await queue.add({ task: 'generate-mockups', triggeredAt: new Date().toISOString() });
  logger.info('Dispatched mockup generation job', { jobId: job.id });
  return job;
}

/**
 * Dispatch the distribution job.
 */
async function dispatchDistribution() {
  const queue = getQueue(QUEUE_NAMES.DISTRIBUTION);
  const job = await queue.add({ task: 'distribute-listings', triggeredAt: new Date().toISOString() });
  logger.info('Dispatched distribution job', { jobId: job.id });
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
    await dispatchMockupGeneration();
    await dispatchDistribution();
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
  dispatchMockupGeneration,
  dispatchDistribution,
  runDailyCycle,
};
