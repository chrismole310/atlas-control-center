'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/analytics/etsy-puller', () => ({
  pullEtsyStats: jest.fn().mockResolvedValue({ listings_updated: 5 }),
}));
jest.mock('../../../engines/analytics/gumroad-puller', () => ({
  pullGumroadStats: jest.fn().mockResolvedValue({ products_updated: 3 }),
}));
jest.mock('../../../engines/analytics/stats-aggregator', () => ({
  aggregateDailyStats: jest.fn().mockResolvedValue({ date: '2026-03-05', total_sales: 12 }),
  updatePerformanceMetrics: jest.fn().mockResolvedValue({ metrics_updated: 8 }),
}));
jest.mock('../../../engines/analytics/adaptive-learner', () => ({
  adjustSiloPriorities: jest.fn().mockResolvedValue({ silos_adjusted: 50 }),
}));
jest.mock('../../../engines/analytics/daily-report', () => ({
  generateDailyReport: jest.fn().mockResolvedValue({
    summary: { gross_revenue: 155.88 },
    top_artworks: [],
  }),
}));

const { runAnalytics } = require('../../../engines/analytics/index');

test('runAnalytics runs all steps and returns summary', async () => {
  const result = await runAnalytics();
  expect(result).toHaveProperty('etsy');
  expect(result).toHaveProperty('gumroad');
  expect(result).toHaveProperty('daily_stats');
  expect(result).toHaveProperty('adaptive_learning');
  expect(result).toHaveProperty('report');
});
