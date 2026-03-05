'use strict';

// Must mock node-cron before requiring scheduler
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

const { schedule, startAll, stopAll, getJobs } = require('../../core/scheduler');

beforeEach(() => {
  // Clear the internal jobs array by requiring fresh module
});

test('schedule registers a job', () => {
  schedule('test-job', '0 * * * *', async () => {});
  const jobs = getJobs();
  const found = jobs.find(j => j.name === 'test-job');
  expect(found).toBeTruthy();
  expect(found.cronExpr).toBe('0 * * * *');
});

test('startAll starts all scheduled tasks', () => {
  const cron = require('node-cron');
  const mockStart = jest.fn();
  cron.schedule.mockReturnValueOnce({ start: mockStart, stop: jest.fn() });

  schedule('start-test', '0 6 * * *', async () => {});
  startAll();
  expect(mockStart).toHaveBeenCalled();
});

test('stopAll stops all scheduled tasks', () => {
  const cron = require('node-cron');
  const mockStop = jest.fn();
  cron.schedule.mockReturnValueOnce({ start: jest.fn(), stop: mockStop });

  schedule('stop-test', '0 6 * * *', async () => {});
  stopAll();
  expect(mockStop).toHaveBeenCalled();
});
