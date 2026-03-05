'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ count: '10' }], rowCount: 1 }),
  closePool: jest.fn(),
}));

const { RateLimiter } = require('../../../engines/distribution/rate-limiter');

test('canProceed returns true when under quota', async () => {
  const limiter = new RateLimiter({ platform: 'etsy', maxPerDay: 50, delayMs: 0 });
  const result = await limiter.canProceed();
  expect(result).toBe(true);
});

test('canProceed returns false when over quota', async () => {
  const { query } = require('../../../core/database');
  query.mockResolvedValueOnce({ rows: [{ count: '50' }] });
  const limiter = new RateLimiter({ platform: 'etsy', maxPerDay: 50, delayMs: 0 });
  const result = await limiter.canProceed();
  expect(result).toBe(false);
});

test('recordAction increments counter', async () => {
  const limiter = new RateLimiter({ platform: 'etsy', maxPerDay: 50, delayMs: 0 });
  await limiter.recordAction();
  expect(limiter.actionCount).toBe(1);
});

test('waitForSlot respects delay', async () => {
  const limiter = new RateLimiter({ platform: 'etsy', maxPerDay: 50, delayMs: 0 });
  const start = Date.now();
  await limiter.waitForSlot();
  expect(Date.now() - start).toBeLessThan(100);
});
