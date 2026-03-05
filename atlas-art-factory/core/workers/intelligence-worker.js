'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { getQueue, QUEUE_NAMES } = require('../queue');
const { runMarketIntelligence } = require('../../engines/2-market-intelligence/index');
const { createLogger } = require('../logger');

const logger = createLogger('intelligence-worker');

/**
 * Start the market intelligence queue worker.
 * Processes jobs from the 'market-intelligence' Bull queue.
 */
function startIntelligenceWorker() {
  const queue = getQueue(QUEUE_NAMES.MARKET_INTELLIGENCE);

  queue.on('stalled', (jobId) => {
    logger.warn('Intelligence job stalled — will be retried', { jobId });
  });

  queue.process(1, async (job) => {
    logger.info('Processing market intelligence job', { jobId: job.id, data: job.data });

    job.progress(10);
    const result = await runMarketIntelligence();
    job.progress(90);

    logger.info('Market intelligence job complete', { jobId: job.id, result });
    job.progress(100);

    return result;
  });

  queue.on('failed', (job, err) => {
    logger.error('Intelligence job failed', { jobId: job.id, error: err.message });
  });

  queue.on('completed', (job, result) => {
    logger.info('Intelligence job completed', { jobId: job.id, result });
  });

  logger.info('Intelligence worker started — listening on market-intelligence queue');
  return queue;
}

module.exports = { startIntelligenceWorker };

// Start worker when run directly
if (require.main === module) {
  startIntelligenceWorker();
  logger.info('Intelligence worker running. Press Ctrl+C to stop.');
}
