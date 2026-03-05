'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const request = require('supertest');
const { app, closePool } = require('../../api/index');

describe('Art Factory API', () => {
  afterAll(async () => {
    await closePool();
  });

  describe('GET /health', () => {
    test('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });
  });

  describe('GET /api/silos', () => {
    test('returns 200 with silos array', async () => {
      const res = await request(app).get('/api/silos');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.silos)).toBe(true);
      expect(res.body.count).toBe(50);
    });

    test('silos are ordered by priority descending', async () => {
      const res = await request(app).get('/api/silos');
      const priorities = res.body.silos.map(s => s.priority);
      expect(priorities[0]).toBeGreaterThanOrEqual(priorities[1]);
    });
  });

  describe('GET /api/silos/:id', () => {
    test('returns 200 for valid id', async () => {
      const silosRes = await request(app).get('/api/silos');
      const firstId = silosRes.body.silos[0].id;
      const res = await request(app).get(`/api/silos/${firstId}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBeTruthy();
    });

    test('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/silos/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/artists', () => {
    test('returns 200 with artists array', async () => {
      const res = await request(app).get('/api/artists');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.artists)).toBe(true);
      expect(res.body.count).toBe(50);
    });

    test('artists include silo_name', async () => {
      const res = await request(app).get('/api/artists');
      const artist = res.body.artists[0];
      expect(artist.silo_name).toBeTruthy();
    });
  });

  describe('GET /api/artists/:id', () => {
    test('returns 200 for valid id', async () => {
      const artistsRes = await request(app).get('/api/artists');
      const firstId = artistsRes.body.artists[0].id;
      const res = await request(app).get(`/api/artists/${firstId}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBeTruthy();
    });

    test('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/artists/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/stats', () => {
    test('returns 200 with all counts', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.status).toBe(200);
      expect(res.body.silos).toBe(50);
      expect(res.body.artists).toBe(50);
      expect(typeof res.body.artworks).toBe('number');
      expect(typeof res.body.listings).toBe('number');
    });
  });
});
