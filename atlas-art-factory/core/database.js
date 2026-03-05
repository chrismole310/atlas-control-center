'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module
// for environment variables to take effect in non-test entry points.

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'atlas_art_factory',
      user: process.env.POSTGRES_USER || 'atlas',
      password: process.env.POSTGRES_PASSWORD || 'atlas_secret',
      max: 20, // supports up to 20 concurrent connections; scale down if running multiple processes
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, closePool };
