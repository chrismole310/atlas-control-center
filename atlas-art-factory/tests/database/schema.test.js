'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query, closePool } = require('../../core/database');

describe('DNA schema', () => {
  afterAll(async () => {
    await closePool();
  });

  test('artist_inspirations table exists', async () => {
    const result = await query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'artist_inspirations') AS exists");
    expect(result.rows[0].exists).toBe(true);
  });

  test('style_clusters table exists', async () => {
    const result = await query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'style_clusters') AS exists");
    expect(result.rows[0].exists).toBe(true);
  });

  test('ai_artist_dna table exists', async () => {
    const result = await query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ai_artist_dna') AS exists");
    expect(result.rows[0].exists).toBe(true);
  });

  test('artworks table has inspiration_dna_id column', async () => {
    const result = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'artworks' AND column_name = 'inspiration_dna_id'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('artworks table has style_cluster_id column', async () => {
    const result = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'artworks' AND column_name = 'style_cluster_id'
    `);
    expect(result.rows.length).toBe(1);
  });
});
