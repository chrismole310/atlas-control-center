'use strict';

jest.mock('../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

jest.mock('../engines/2-market-intelligence/trend-alerts', () => ({
  detectTrendAlerts: jest.fn().mockResolvedValue([]),
}));

const { query } = require('../core/database');
const request = require('supertest');

let app;
beforeAll(() => {
  app = require('../api/index').app;
});
beforeEach(() => query.mockReset());

test('GET /api/analytics/daily returns recent analytics', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { date: '2026-03-05', artworks_created: 200, total_sales: 12, gross_revenue: 155.88 },
      { date: '2026-03-04', artworks_created: 180, total_sales: 8, gross_revenue: 103.92 },
    ],
  });

  const res = await request(app).get('/api/analytics/daily');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('analytics');
  expect(res.body.analytics.length).toBeGreaterThan(0);
});

test('GET /api/analytics/top-artworks returns top performers', async () => {
  query.mockResolvedValueOnce({
    rows: [{ artwork_id: 1, title: 'Fox Print', total_revenue: 64.95, total_sales: 5 }],
  });

  const res = await request(app).get('/api/analytics/top-artworks');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('artworks');
});

test('GET /api/trends returns demand scores', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'nursery art', demand_score: 92, trend_direction: 'rising' },
    ],
  });

  const res = await request(app).get('/api/trends');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('trends');
});

test('GET /api/production/status returns queue status', async () => {
  query.mockResolvedValueOnce({ rows: [{ count: '150' }] });
  query.mockResolvedValueOnce({ rows: [{ count: '45' }] });
  query.mockResolvedValueOnce({ rows: [{ count: '30' }] });

  const res = await request(app).get('/api/production/status');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('artworks_today');
  expect(res.body).toHaveProperty('listings_today');
});
