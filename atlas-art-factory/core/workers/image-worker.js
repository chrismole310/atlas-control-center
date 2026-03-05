'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { getQueue, QUEUE_NAMES } = require('../queue');
const { runDailyBatch } = require('../../engines/4-ai-artist/index');
const { createLogger } = require('../logger');

const logger = createLogger('image-worker');

/**
 * Start the image generation queue worker.
 * Processes jobs from the 'image-generation' Bull queue.
 * concurrency=1 to avoid API rate limits.
 */
function startImageWorker() {
  const queue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);

  queue.on('stalled', (jobId) => {
    logger.warn('Image generation job stalled — will be retried', { jobId });
  });

  queue.process(1, async (job) => {
    logger.info('Processing image generation job', { jobId: job.id, data: job.data });

    job.progress(10);

    const dailyTarget = (job.data && job.data.count) || 200;
    const result = await runDailyBatch({ dailyTarget });

    job.progress(90);

    logger.info('Image generation job complete', { jobId: job.id, result });
    job.progress(100);

    return result;
  });

  queue.on('failed', (job, err) => {
    logger.error('Image generation job failed', { jobId: job.id, error: err.message });
  });

  queue.on('completed', (job, result) => {
    logger.info('Image generation job completed', { jobId: job.id, result });
  });

  logger.info('Image worker started — listening on image-generation queue');
  return queue;
}

module.exports = { startImageWorker };

// Start worker when run directly
if (require.main === module) {
  startImageWorker();
  logger.info('Image worker running. Press Ctrl+C to stop.');
}
