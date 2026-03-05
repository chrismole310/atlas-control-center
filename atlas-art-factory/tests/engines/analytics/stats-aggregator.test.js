'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { aggregateDailyStats, updatePerformanceMetrics } = require('../../../engines/analytics/stats-aggregator');

beforeEach(() => query.mockReset());

test('aggregateDailyStats upserts analytics_daily row', async () => {
  query.mockResolvedValueOnce({ rows: [{ count: '15' }] });
  query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
  query.mockResolvedValueOnce({ rows: [{ total_sales: '5', gross: '64.95', net: '55.21' }] });
  query.mockResolvedValueOnce({ rows: [{ views: '500', clicks: '50', favorites: '30' }] });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await aggregateDailyStats();
  expect(result).toHaveProperty('date');
  expect(result).toHaveProperty('artworks_created');
  expect(result).toHaveProperty('total_sales');
});

test('updatePerformanceMetrics recalculates conversion rates', async () => {
  query.mockResolvedValueOnce({
    rows: [{ artwork_id: 1, platform: 'etsy', views: 100, sales: 5 }],
  });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await updatePerformanceMetrics();
  expect(result).toHaveProperty('metrics_updated');
});
