require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const pool = new Pool({
    host:     process.env.POSTGRES_HOST || 'localhost',
    port:     parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'atlas_art_factory',
    user:     process.env.POSTGRES_USER || 'atlas',
    password: process.env.POSTGRES_PASSWORD || 'atlas_secret',
  });

  const client = await pool.connect();
  try {
    // Run the main schema (CREATE TABLE IF NOT EXISTS, indexes, inserts).
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Main schema applied');

    // Run ALTER TABLE statements separately — idempotent via ADD COLUMN IF NOT EXISTS.
    // These columns support Artist DNA on the artworks table.
    const alterStatements = [
      'ALTER TABLE artworks ADD COLUMN IF NOT EXISTS inspiration_dna_id INTEGER REFERENCES artist_inspirations(id)',
      'ALTER TABLE artworks ADD COLUMN IF NOT EXISTS style_cluster_id INTEGER REFERENCES style_clusters(id)',
    ];
    for (const stmt of alterStatements) {
      await client.query(stmt).catch(err => {
        if (!err.message.includes('already exists')) throw err;
      });
    }

    console.log('✅ Schema migrated successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
