'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { calculatePrice, getPricingTier } = require('../../../engines/distribution/pricing-engine');

beforeEach(() => query.mockReset());

test('calculatePrice returns price based on competitor median and modifiers', async () => {
  query.mockResolvedValueOnce({
    rows: [{ avg_price: 12.50, median_price: 11.99, min_price: 5.00, max_price: 25.00 }],
  });
  query.mockResolvedValueOnce({
    rows: [{ demand_score: 85 }],
  });

  const price = await calculatePrice({
    siloId: 1,
    qualityScore: 90,
    artworkId: 1,
  });

  expect(typeof price).toBe('number');
  expect(price).toBeGreaterThan(0);
  expect(price).toBeLessThan(100);
});

test('calculatePrice uses floor price when no competitor data', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  query.mockResolvedValueOnce({ rows: [] });

  const price = await calculatePrice({
    siloId: 1,
    qualityScore: 75,
    artworkId: 1,
  });

  expect(price).toBeGreaterThanOrEqual(3.99);
});

test('getPricingTier returns correct tier', () => {
  expect(getPricingTier(95)).toBe('premium');
  expect(getPricingTier(80)).toBe('standard');
  expect(getPricingTier(60)).toBe('value');
});
