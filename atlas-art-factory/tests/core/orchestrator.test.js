'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Mock the mockup engine to avoid pulling in sharp/archiver/etc.
jest.mock('../../engines/5-mockup-generation/index', () => ({
  runMockupBatch: jest.fn().mockResolvedValue({ processed: 5, errors: [], elapsed: 1000 }),
  processArtworkMockups: jest.fn().mockResolvedValue({ artwork_id: 1 }),
}));

// Mock Bull queues to avoid real Redis calls in unit tests
jest.mock('../../core/queue', () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: 'mock-job-id' });
  const mockQueue = { add: mockAdd, name: 'mock-queue' };
  return {
    getQueue: jest.fn().mockReturnValue(mockQueue),
    QUEUE_NAMES: {
      TREND_SCRAPING: 'trend-scraping',
      MARKET_INTELLIGENCE: 'market-intelligence',
      IMAGE_GENERATION: 'image-generation',
      MOCKUP_GENERATION: 'mockup-generation',
      DISTRIBUTION: 'distribution',
      ANALYTICS: 'analytics',
      MODEL_DISCOVERY: 'model-discovery',
    },
  };
});

// Mock database to avoid real PG calls in unit tests
jest.mock('../../core/database', () => ({
  query: jest.fn().mockResolvedValue({
    rows: [
      { id: 1, name: 'nursery-animals', priority: 80 },
      { id: 2, name: 'botanical-prints', priority: 70 },
      { id: 3, name: 'abstract-art', priority: 60 },
    ],
  }),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

const { getQueue } = require('../../core/queue');
const {
  dispatchScraping,
  dispatchMarketIntelligence,
  dispatchImageGeneration,
  dispatchAnalytics,
  runDailyCycle,
} = require('../../core/orchestrator');

describe('Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mockAdd to return a new resolved value each time
    getQueue.mockReturnValue({ add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }), name: 'mock-queue' });
  });

  test('dispatchScraping adds a job to the trend-scraping queue', async () => {
    const job = await dispatchScraping();
    expect(job.id).toBe('mock-job-id');
    expect(getQueue).toHaveBeenCalledWith('trend-scraping');
  });

  test('dispatchMarketIntelligence adds a job to the market-intelligence queue', async () => {
    const job = await dispatchMarketIntelligence();
    expect(job.id).toBe('mock-job-id');
    expect(getQueue).toHaveBeenCalledWith('market-intelligence');
  });

  test('dispatchImageGeneration dispatches jobs per silo proportionally', async () => {
    const result = await dispatchImageGeneration(200);
    expect(result.siloCount).toBe(3);
    expect(result.target).toBe(200);
    expect(result.dispatched).toBeGreaterThan(0);
    expect(getQueue).toHaveBeenCalledWith('image-generation');
  });

  test('dispatchAnalytics adds a job to the analytics queue', async () => {
    const job = await dispatchAnalytics();
    expect(job.id).toBe('mock-job-id');
    expect(getQueue).toHaveBeenCalledWith('analytics');
  });

  test('runDailyCycle returns success when all dispatches succeed', async () => {
    const result = await runDailyCycle();
    expect(result.success).toBe(true);
  });

  test('runDailyCycle returns failure when a dispatch fails', async () => {
    // Make getQueue throw for scraping call
    getQueue.mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });
    const result = await runDailyCycle();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
