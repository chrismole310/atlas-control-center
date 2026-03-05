'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query, closePool } = require('../../core/database');

describe('DNA seed', () => {
  afterAll(async () => {
    await closePool();
  });

  test('artist_inspirations has 25 rows', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM artist_inspirations');
    expect(parseInt(result.rows[0].cnt)).toBe(25);
  });

  test('style_clusters has 7 rows', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM style_clusters');
    expect(parseInt(result.rows[0].cnt)).toBe(7);
  });

  test('ai_artist_dna has rows (at least 1 per artist)', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM ai_artist_dna');
    expect(parseInt(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  test('all ai_artist_dna entries reference valid artists', async () => {
    const result = await query(`
      SELECT COUNT(*) AS cnt FROM ai_artist_dna d
      LEFT JOIN ai_artists a ON d.ai_artist_id = a.id
      WHERE a.id IS NULL
    `);
    expect(parseInt(result.rows[0].cnt)).toBe(0);
  });

  test('all ai_artist_dna entries reference valid inspirations', async () => {
    const result = await query(`
      SELECT COUNT(*) AS cnt FROM ai_artist_dna d
      LEFT JOIN artist_inspirations i ON d.inspiration_source_id = i.id
      WHERE i.id IS NULL
    `);
    expect(parseInt(result.rows[0].cnt)).toBe(0);
  });

  test('seed is idempotent', async () => {
    const { execSync } = require('child_process');
    execSync('node database/seed-dna.js', {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env },
    });
    const inspCount = await query('SELECT COUNT(*) AS cnt FROM artist_inspirations');
    const clusterCount = await query('SELECT COUNT(*) AS cnt FROM style_clusters');
    expect(parseInt(inspCount.rows[0].cnt)).toBe(25);
    expect(parseInt(clusterCount.rows[0].cnt)).toBe(7);
  });
});
