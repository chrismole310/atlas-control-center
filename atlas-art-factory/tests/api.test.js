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
const { app } = require('../api/index');

beforeEach(() => { query.mockReset(); });

test('GET /health returns ok when DB is connected', async () => {
  query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
  expect(res.body.db).toBe('connected');
});

test('GET /health returns 503 when DB is down', async () => {
  query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/health');
  expect(res.status).toBe(503);
  expect(res.body.status).toBe('error');
});

test('GET /api/silos returns wrapped silos array', async () => {
  const fakeSilos = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1, name: `silo-${i}`, category: 'test', priority: 50,
  }));
  query.mockResolvedValueOnce({ rows: fakeSilos });

  const res = await request(app).get('/api/silos');
  expect(res.status).toBe(200);
  expect(res.body.silos).toHaveLength(50);
  expect(res.body.count).toBe(50);
});

test('GET /api/artists returns wrapped artists with silo_name', async () => {
  const fakeArtists = [{ id: 1, name: 'TestArtist', silo_name: 'abstract-modern' }];
  query.mockResolvedValueOnce({ rows: fakeArtists });

  const res = await request(app).get('/api/artists');
  expect(res.status).toBe(200);
  expect(res.body.artists).toHaveLength(1);
  expect(res.body.artists[0].silo_name).toBe('abstract-modern');
});

test('GET /api/stats returns counts', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ cnt: '50' }] })   // silos
    .mockResolvedValueOnce({ rows: [{ cnt: '50' }] })   // artists
    .mockResolvedValueOnce({ rows: [{ cnt: '0' }] })    // artworks
    .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });   // listings

  const res = await request(app).get('/api/stats');
  expect(res.status).toBe(200);
  expect(res.body.silos).toBe(50);
  expect(res.body.artists).toBe(50);
  expect(res.body.artworks).toBe(0);
  expect(res.body.listings).toBe(0);
  expect(res.body).toHaveProperty('ts');
});

test('GET /api/silos returns 500 on DB error', async () => {
  query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/api/silos');
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Internal server error');
});

test('GET /api/silos/:id returns single silo', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'abstract-modern' }] });
  const res = await request(app).get('/api/silos/1');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('abstract-modern');
});

test('GET /api/silos/:id returns 404 for missing silo', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  const res = await request(app).get('/api/silos/999');
  expect(res.status).toBe(404);
});
