'use strict';

const request = require('supertest');

// Mock the database module
jest.mock('../core/database', () => {
  const mockQuery = jest.fn();
  return {
    getPool: jest.fn(),
    query: mockQuery,
    closePool: jest.fn(),
  };
});

const { query } = require('../core/database');
const { createApp } = require('../api/index');

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => { query.mockReset(); });

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
  expect(res.body.service).toBe('atlas-art-factory');
});

test('GET /api/silos returns array', async () => {
  const fakeSilos = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1, name: `silo-${i}`, category: 'test', priority: 50,
  }));
  query.mockResolvedValueOnce({ rows: fakeSilos });

  const res = await request(app).get('/api/silos');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(50);
});

test('GET /api/stats returns production stats', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ n: '5' }] })    // artworks
    .mockResolvedValueOnce({ rows: [{ n: '120' }] })   // listings
    .mockResolvedValueOnce({ rows: [{ total: '42.50' }] }) // revenue
    .mockResolvedValueOnce({ rows: [{ n: '8' }] });    // opportunities

  const res = await request(app).get('/api/stats');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('artworks_today');
  expect(res.body).toHaveProperty('listings_total');
  expect(res.body).toHaveProperty('revenue_today');
  expect(res.body.artworks_today).toBe(5);
  expect(res.body.listings_total).toBe(120);
  expect(res.body.revenue_today).toBe(42.50);
});

test('GET /api/artworks returns array with default limit', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'test' }] });
  const res = await request(app).get('/api/artworks');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  // Verify the query was called with limit 50
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('LIMIT'),
    [50]
  );
});

test('GET /api/silos returns 500 on DB error', async () => {
  query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/api/silos');
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('connection refused');
});
