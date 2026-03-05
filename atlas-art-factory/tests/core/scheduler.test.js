'use strict';

// Must mock node-cron before requiring scheduler
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    destroy: jest.fn(),
  })),
}));

// Mock orchestrator to avoid real queue/db calls
jest.mock('../../core/orchestrator', () => ({
  dispatchScraping: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  dispatchMarketIntelligence: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  dispatchImageGeneration: jest.fn().mockResolvedValue({ target: 200, dispatched: 200, siloCount: 3 }),
  dispatchMockupGeneration: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  dispatchAnalytics: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
}));

const cron = require('node-cron');
const { startScheduler, stopScheduler } = require('../../core/scheduler');

beforeEach(() => {
  jest.clearAllMocks();
  cron.schedule.mockReturnValue({ destroy: jest.fn() });
});

test('startScheduler registers 5 cron jobs', () => {
  const jobs = startScheduler();
  expect(cron.schedule).toHaveBeenCalledTimes(5);
  expect(jobs).toHaveLength(5);
});

test('startScheduler uses America/New_York timezone', () => {
  startScheduler();
  const calls = cron.schedule.mock.calls;
  calls.forEach(call => {
    expect(call[2]).toMatchObject({ timezone: 'America/New_York' });
  });
});

test('stopScheduler destroys all jobs and clears the list', () => {
  const mockDestroy = jest.fn();
  cron.schedule.mockReturnValue({ destroy: mockDestroy });
  startScheduler();
  stopScheduler();
  expect(mockDestroy).toHaveBeenCalledTimes(5);
});
