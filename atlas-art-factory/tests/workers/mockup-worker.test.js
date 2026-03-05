'use strict';

// Mock the mockup engine before requiring the worker
jest.mock('../../engines/5-mockup-generation/index', () => ({
  runMockupBatch: jest.fn().mockResolvedValue({
    processed: 5,
    errors: [],
    elapsed: 3000,
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
const { startMockupWorker } = require('../../core/workers/mockup-worker');

describe('startMockupWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getQueue.mockReturnValue({
      process: jest.fn(),
      on: jest.fn(),
    });
  });

  test('startMockupWorker processes mockup-generation queue with concurrency 1', () => {
    const queue = startMockupWorker();

    // getQueue was called with MOCKUP_GENERATION queue name
    expect(getQueue).toHaveBeenCalledWith(QUEUE_NAMES.MOCKUP_GENERATION);

    // queue.process was called with concurrency 1
    expect(queue.process).toHaveBeenCalledTimes(1);
    const [concurrency] = queue.process.mock.calls[0];
    expect(concurrency).toBe(1);

    // Second argument is a function (the job handler)
    const [, handler] = queue.process.mock.calls[0];
    expect(typeof handler).toBe('function');
  });

  test('startMockupWorker registers error and stalled handlers', () => {
    const queue = startMockupWorker();

    // queue.on should have been called for error-related events
    expect(queue.on).toHaveBeenCalled();

    const onCalls = queue.on.mock.calls;
    const eventNames = onCalls.map(([event]) => event);
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('stalled');
  });
});
