'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module
// for environment variables to take effect in non-test entry points.

const Bull = require('bull');

const queues = new Map();

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const QUEUE_NAMES = {
  TREND_SCRAPING: 'trend-scraping',
  MARKET_INTELLIGENCE: 'market-intelligence',
  IMAGE_GENERATION: 'image-generation',
  MOCKUP_GENERATION: 'mockup-generation',
  DISTRIBUTION: 'distribution',
  ANALYTICS: 'analytics',
  MODEL_DISCOVERY: 'model-discovery',
};

function getQueue(name) {
  if (!queues.has(name)) {
    const q = new Bull(name, { redis: REDIS_CONFIG });
    queues.set(name, q);
  }
  return queues.get(name);
}

async function closeQueues() {
  const closes = [...queues.values()].map(q => q.close());
  await Promise.all(closes);
  queues.clear();
}

module.exports = { getQueue, closeQueues, QUEUE_NAMES };
