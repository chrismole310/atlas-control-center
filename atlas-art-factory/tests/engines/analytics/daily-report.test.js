'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { generateDailyReport } = require('../../../engines/analytics/daily-report');

beforeEach(() => query.mockReset());

test('generateDailyReport returns formatted report', async () => {
  query.mockResolvedValueOnce({
    rows: [{
      date: '2026-03-05', artworks_created: 200, listings_published: 50,
      total_views: 5000, total_sales: 12, gross_revenue: 155.88,
      net_revenue: 132.50, ai_costs: 8.00, profit: 124.50, conversion_rate: 0.0024,
    }],
  });
  query.mockResolvedValueOnce({
    rows: [{ artwork_id: 1, title: 'Fox Print', revenue: 25.99, sales: 2 }],
  });

  const report = await generateDailyReport();
  expect(report).toHaveProperty('summary');
  expect(report).toHaveProperty('top_artworks');
  expect(report.summary).toHaveProperty('gross_revenue');
});
