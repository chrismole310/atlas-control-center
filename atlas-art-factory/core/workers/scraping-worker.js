'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { getQueue, closeQueues, QUEUE_NAMES } = require('../queue');
const { runFullScrape } = require('../../engines/1-trend-scraper/index');
const { createLogger } = require('../logger');

const logger = createLogger('scraping-worker');

/**
 * Start the scraping queue worker.
 * Processes jobs from the 'trend-scraping' Bull queue.
 */
function startScrapingWorker() {
  const queue = getQueue(QUEUE_NAMES.TREND_SCRAPING);

  queue.on('stalled', (jobId) => {
    logger.warn('Scraping job stalled — will be retried', { jobId });
  });

  // NOTE: Bull default lockDuration is 30s. Full scrapes with Playwright can take 2-5 min.
  // If jobs stall in production, increase lockDuration in getQueue() config for this queue.
  queue.process(1, async (job) => {
    logger.info('Processing scraping job', { jobId: job.id, data: job.data });

    const result = await runFullScrape({
      maxKeywords: job.data.maxKeywords || 3,
      skipPlaywright: job.data.skipPlaywright || false,
      skipColorAnalysis: job.data.skipColorAnalysis || false,
    });

    logger.info('Scraping job complete', { jobId: job.id, result });
    return result;
  });

  queue.on('failed', (job, err) => {
    logger.error('Scraping job failed', { jobId: job.id, error: err.message });
  });

  queue.on('completed', (job, result) => {
    logger.info('Scraping job completed', { jobId: job.id, result });
  });

  logger.info('Scraping worker started — listening on trend-scraping queue');
  return queue;
}

module.exports = { startScrapingWorker };

// Start worker when run directly
if (require.main === module) {
  startScrapingWorker();
  logger.info('Scraping worker running. Press Ctrl+C to stop.');
}
