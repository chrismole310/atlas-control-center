'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { rankOpportunities } = require('../../../engines/market-intel/niche-ranker');

beforeEach(() => query.mockReset());

test('rankOpportunities reads top demand_scores and inserts market_opportunities', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'nursery art', demand_score: 50000, competition_count: 80, avg_price: 14.99, trend_direction: 'rising', saturation_level: 16 },
      { keyword: 'abstract print', demand_score: 30000, competition_count: 150, avg_price: 18.50, trend_direction: 'stable', saturation_level: 30 },
    ],
  });
  query.mockResolvedValueOnce({ rowCount: 5 });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await rankOpportunities();
  expect(result.opportunities_ranked).toBe(2);
  expect(query).toHaveBeenCalledTimes(4);
});

test('rankOpportunities assigns competition_level based on count', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'low-comp', demand_score: 10000, competition_count: 30, avg_price: 10, trend_direction: 'rising', saturation_level: 6 },
    ],
  });
  query.mockResolvedValue({ rowCount: 1 });

  await rankOpportunities();
  const insertCall = query.mock.calls[2];
  expect(insertCall[1]).toContain('low');
});
