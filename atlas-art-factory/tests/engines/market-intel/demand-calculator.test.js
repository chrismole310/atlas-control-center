'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { calculateDemandScores, computeScore } = require('../../../engines/market-intel/demand-calculator');

beforeEach(() => query.mockReset());

test('computeScore applies formula correctly', () => {
  const score = computeScore({
    search_volume: 1000,
    sales_velocity: 50,
    social_engagement: 500,
    competition_count: 100,
  });
  expect(score).toBe(250000);
});

test('computeScore handles zero competition (caps at 1)', () => {
  const score = computeScore({
    search_volume: 100,
    sales_velocity: 10,
    social_engagement: 50,
    competition_count: 0,
  });
  expect(score).toBe(50000);
});

test('calculateDemandScores aggregates trends and upserts scores', async () => {
  query
    .mockResolvedValueOnce({
      rows: [
        { keyword: 'nursery art', total_sales: 500, total_favorites: 2000, avg_price: 14.99, listing_count: 80 },
        { keyword: 'abstract print', total_sales: 300, total_favorites: 1200, avg_price: 18.50, listing_count: 150 },
      ],
    })
    .mockResolvedValue({ rowCount: 1 });

  const result = await calculateDemandScores();
  expect(result.keywords_scored).toBe(2);
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[1][0]).toContain('ON CONFLICT');
});
