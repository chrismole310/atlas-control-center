'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { getQueue, QUEUE_NAMES } = require('../queue');
const { runMockupBatch } = require('../../engines/5-mockup-generation/index');
const { createLogger } = require('../logger');

const logger = createLogger('mockup-worker');

/**
 * Start the mockup generation queue worker.
 * Processes jobs from the 'mockup-generation' Bull queue.
 * concurrency=1 to process one batch at a time.
 */
function startMockupWorker() {
  const queue = getQueue(QUEUE_NAMES.MOCKUP_GENERATION);

  queue.on('stalled', (jobId) => {
    logger.warn('Mockup generation job stalled — will be retried', { jobId });
  });

  queue.process(1, async (job) => {
    logger.info('Processing mockup generation job', { jobId: job.id, data: job.data });

    job.progress(10);

    const limit = (job.data && job.data.limit) || 50;
    const result = await runMockupBatch({ limit });

    job.progress(90);

    logger.info('Mockup generation job complete', { jobId: job.id, result });
    job.progress(100);

    return result;
  });

  queue.on('failed', (job, err) => {
    logger.error('Mockup generation job failed', { jobId: job.id, error: err.message });
  });

  queue.on('completed', (job, result) => {
    logger.info('Mockup generation job completed', { jobId: job.id, result });
  });

  logger.info('Mockup worker started — listening on mockup-generation queue');
  return queue;
}

module.exports = { startMockupWorker };

// Start worker when run directly
if (require.main === module) {
  startMockupWorker();
  logger.info('Mockup worker running. Press Ctrl+C to stop.');
}
