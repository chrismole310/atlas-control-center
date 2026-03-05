'use strict';

// Mock dependencies before requiring the worker
jest.mock('../../engines/2-market-intelligence/index', () => ({
  runMarketIntelligence: jest.fn().mockResolvedValue({
    opportunities: [],
    siloUpdates: [],
    alerts: [],
    errors: [],
  }),
}));

jest.mock('../../core/queue', () => {
  const mockQueue = {
    process: jest.fn(),
    on: jest.fn(),
  };
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

const { getQueue, QUEUE_NAMES } = require('../../core/queue');
const { startIntelligenceWorker } = require('../../core/workers/intelligence-worker');

describe('startIntelligenceWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock queue after clearAllMocks
    getQueue.mockReturnValue({
      process: jest.fn(),
      on: jest.fn(),
    });
  });

  test('startIntelligenceWorker processes market-intelligence queue', () => {
    const queue = startIntelligenceWorker();

    // getQueue was called with MARKET_INTELLIGENCE queue name
    expect(getQueue).toHaveBeenCalledWith(QUEUE_NAMES.MARKET_INTELLIGENCE);

    // queue.process was called with concurrency 1
    expect(queue.process).toHaveBeenCalledTimes(1);
    const [concurrency] = queue.process.mock.calls[0];
    expect(concurrency).toBe(1);

    // Second argument is a function (the job handler)
    const [, handler] = queue.process.mock.calls[0];
    expect(typeof handler).toBe('function');
  });

  test('startIntelligenceWorker handles job errors', () => {
    const queue = startIntelligenceWorker();

    // queue.on should have been called for error-related events
    expect(queue.on).toHaveBeenCalled();

    // Verify 'failed' event handler is registered
    const onCalls = queue.on.mock.calls;
    const eventNames = onCalls.map(([event]) => event);
    expect(eventNames).toContain('failed');
  });
});
