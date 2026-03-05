'use strict';

const cron = require('node-cron');
const { createLogger } = require('./logger');

const logger = createLogger('scheduler');
const jobs = [];

function schedule(name, cronExpr, fn) {
  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Starting job: ${name}`);
    try {
      await fn();
      logger.info(`Completed job: ${name}`);
    } catch (err) {
      logger.error(`Job failed: ${name}`, { error: err.message });
    }
  }, { scheduled: false });

  jobs.push({ name, task, cronExpr });
  return task;
}

function startAll() {
  jobs.forEach(({ name, task }) => {
    task.start();
    logger.info(`Scheduled: ${name}`);
  });
}

function stopAll() {
  jobs.forEach(({ task }) => task.stop());
}

function getJobs() {
  return jobs.map(({ name, cronExpr }) => ({ name, cronExpr }));
}

module.exports = { schedule, startAll, stopAll, getJobs };
