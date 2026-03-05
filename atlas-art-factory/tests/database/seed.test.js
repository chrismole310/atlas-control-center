'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query, closePool } = require('../../core/database');

describe('Database seed', () => {
  afterAll(async () => {
    await closePool();
  });

  test('silos table has 50 rows after seed', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM silos');
    expect(parseInt(result.rows[0].cnt)).toBe(50);
  });

  test('ai_artists table has 50 rows after seed', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM ai_artists');
    expect(parseInt(result.rows[0].cnt)).toBe(50);
  });

  test('first silo has correct fields', async () => {
    const result = await query('SELECT * FROM silos ORDER BY id LIMIT 1');
    const silo = result.rows[0];
    expect(silo.name).toBeTruthy();
    expect(silo.category).toBeTruthy();
    expect(silo.priority).toBeGreaterThan(0);
  });

  test('each artist is linked to a silo', async () => {
    const result = await query(`
      SELECT COUNT(*) AS cnt FROM ai_artists a
      LEFT JOIN silos s ON a.silo_id = s.id
      WHERE s.id IS NULL
    `);
    expect(parseInt(result.rows[0].cnt)).toBe(0);
  });

  test('seed is idempotent (running twice gives same counts)', async () => {
    // Re-run seed via child process to verify ON CONFLICT upserts keep counts stable
    const { execSync } = require('child_process');
    execSync('node database/seed.js', {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env },
    });
    const siloCount   = await query('SELECT COUNT(*) AS cnt FROM silos');
    const artistCount = await query('SELECT COUNT(*) AS cnt FROM ai_artists');
    expect(parseInt(siloCount.rows[0].cnt)).toBe(50);
    expect(parseInt(artistCount.rows[0].cnt)).toBe(50);
  });

  test('silo_keywords has no duplicate (silo_id, keyword) pairs', async () => {
    const result = await query(`
      SELECT silo_id, keyword, COUNT(*) AS cnt
      FROM silo_keywords
      GROUP BY silo_id, keyword
      HAVING COUNT(*) > 1
    `);
    expect(result.rows.length).toBe(0);
  });
});
