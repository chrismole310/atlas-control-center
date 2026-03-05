'use strict';

// Mock dependencies before requiring the worker
jest.mock('../../engines/4-ai-artist/index', () => ({
  runDailyBatch: jest.fn().mockResolvedValue({
    generated: 10,
    rejected: 2,
    errors: 0,
    elapsed: 5000,
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
const { startImageWorker } = require('../../core/workers/image-worker');

describe('startImageWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getQueue.mockReturnValue({
      process: jest.fn(),
      on: jest.fn(),
    });
  });

  test('startImageWorker processes image-generation queue with concurrency 1', () => {
    const queue = startImageWorker();

    // getQueue was called with IMAGE_GENERATION queue name
    expect(getQueue).toHaveBeenCalledWith(QUEUE_NAMES.IMAGE_GENERATION);

    // queue.process was called with concurrency 1
    expect(queue.process).toHaveBeenCalledTimes(1);
    const [concurrency] = queue.process.mock.calls[0];
    expect(concurrency).toBe(1);

    // Second argument is a function (the job handler)
    const [, handler] = queue.process.mock.calls[0];
    expect(typeof handler).toBe('function');
  });

  test('startImageWorker handles job failures', () => {
    const queue = startImageWorker();

    // queue.on should have been called for error-related events
    expect(queue.on).toHaveBeenCalled();

    const onCalls = queue.on.mock.calls;
    const eventNames = onCalls.map(([event]) => event);
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('stalled');
  });
});
