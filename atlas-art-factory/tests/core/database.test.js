'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getPool, query, closePool } = require('../../core/database');

describe('Database connection', () => {
  afterAll(async () => {
    await closePool();
  });

  test('pool connects successfully', async () => {
    const pool = getPool();
    const client = await pool.connect();
    client.release();
    expect(client).toBeTruthy();
  });

  test('can execute a simple query', async () => {
    const result = await query('SELECT 1 AS value');
    expect(result.rows[0].value).toBe(1);
  });

  test('system_config table exists and has rows', async () => {
    const result = await query('SELECT COUNT(*) AS cnt FROM system_config');
    expect(parseInt(result.rows[0].cnt)).toBeGreaterThan(0);
  });

  test('silos table exists', async () => {
    const result = await query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'silos') AS exists");
    expect(result.rows[0].exists).toBe(true);
  });

  test('getPool returns same singleton', () => {
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
  });
});
