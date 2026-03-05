'use strict';

const Bull = require('bull');

const queues = new Map();

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const QUEUE_NAMES = {
  ARTWORK_GENERATION: 'artwork-generation',
  MOCKUP_GENERATION: 'mockup-generation',
  DISTRIBUTION: 'distribution',
  ANALYTICS: 'analytics',
  SCRAPING: 'scraping',
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
