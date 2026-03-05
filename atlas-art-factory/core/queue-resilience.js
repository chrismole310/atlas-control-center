'use strict';

const { createLogger } = require('./logger');

const logger = createLogger('queue-resilience');

function getRetryOptions({ attempts = 3, delay = 5000 } = {}) {
  return {
    attempts,
    backoff: {
      type: 'exponential',
      delay,
    },
    removeOnComplete: 100,
    removeOnFail: false,
  };
}

function getDeadLetterConfig(queueName) {
  return {
    deadLetterQueue: `${queueName}:dlq`,
    maxRetries: 3,
  };
}

function wrapWithRetry(processorFn, taskName) {
  return async (job) => {
    try {
      logger.info(`Starting ${taskName}`, { jobId: job.id || 'unknown', attempt: job.attemptsMade || 0 });
      const result = await processorFn(job);
      logger.info(`Completed ${taskName}`, { jobId: job.id || 'unknown' });
      return result;
    } catch (err) {
      logger.error(`Failed ${taskName}`, {
        jobId: job.id || 'unknown',
        attempt: job.attemptsMade || 0,
        error: err.message,
      });
      throw err;
    }
  };
}

module.exports = { getRetryOptions, getDeadLetterConfig, wrapWithRetry };
