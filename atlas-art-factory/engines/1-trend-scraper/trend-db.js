'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-db');

/**
 * Save an array of trend records to scraped_trends.
 * Upserts by (platform, listing_url) to avoid duplicates.
 *
 * Record fields (all optional except platform and listing_url):
 *   platform       {string}   e.g. 'etsy', 'pinterest', 'gumroad'
 *   listing_url    {string}   canonical URL for the listing (upsert key)
 *   title          {string}
 *   description    {string}
 *   price          {number}
 *   sales_count    {number}
 *   review_count   {number}
 *   rating         {number}
 *   favorites      {number}
 *   views          {number}
 *   keywords       {string[]}
 *   tags           {string[]}
 *   category       {string}
 *   style          {string}
 *   subject        {string}
 *   color_palette  {object}   stored as JSONB
 *   image_urls     {string[]}
 *
 * @param {Array<object>} records
 * @returns {Promise<number>} Number of rows upserted
 */
async function saveTrends(records) {
  if (!records || records.length === 0) return 0;

  // Filter out records missing required upsert key fields
  const validRecords = records.filter(r => r.platform && r.listing_url);
  if (validRecords.length < records.length) {
    logger.warn(`Dropped ${records.length - validRecords.length} records missing platform or listing_url`);
  }
  if (validRecords.length === 0) return 0;

  let count = 0;
  for (const r of validRecords) {
    await query(`
      INSERT INTO scraped_trends (
        platform, listing_url, title, description, price,
        sales_count, review_count, rating, favorites, views,
        keywords, tags, category, style, subject,
        color_palette, image_urls, scraped_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, NOW()
      )
      ON CONFLICT (platform, listing_url) DO UPDATE SET
        title          = EXCLUDED.title,
        description    = EXCLUDED.description,
        price          = EXCLUDED.price,
        sales_count    = EXCLUDED.sales_count,
        review_count   = EXCLUDED.review_count,
        rating         = EXCLUDED.rating,
        favorites      = EXCLUDED.favorites,
        views          = EXCLUDED.views,
        keywords       = EXCLUDED.keywords,
        tags           = EXCLUDED.tags,
        category       = EXCLUDED.category,
        style          = EXCLUDED.style,
        subject        = EXCLUDED.subject,
        color_palette  = EXCLUDED.color_palette,
        image_urls     = EXCLUDED.image_urls,
        scraped_at     = NOW()
    `, [
      r.platform,
      r.listing_url || null,
      r.title        || null,
      r.description  || null,
      r.price        ?? null,
      r.sales_count  ?? null,
      r.review_count ?? null,
      r.rating       ?? null,
      r.favorites    ?? null,
      r.views        ?? null,
      r.keywords     || [],
      r.tags         || [],
      r.category     || null,
      r.style        || null,
      r.subject      || null,
      r.color_palette ? JSON.stringify(r.color_palette) : null,
      r.image_urls   || [],
    ]);
    count++;
  }

  logger.info(`Saved ${count} trend records`, { platform: records[0]?.platform });
  return count;
}

/**
 * Get all trends for a specific platform, most-recently scraped first.
 *
 * @param {string} platform - e.g. 'etsy', 'pinterest', 'gumroad'
 * @param {number} limit    - max rows to return (default 100)
 * @returns {Promise<Array<object>>} Trend rows
 */
async function getTrendsByPlatform(platform, limit = 100) {
  const result = await query(
    'SELECT * FROM scraped_trends WHERE platform = $1 ORDER BY scraped_at DESC LIMIT $2',
    [platform, limit]
  );
  return result.rows;
}

/**
 * Get top trending records across all platforms, ordered by most-recently scraped.
 *
 * @param {number} limit - max rows to return (default 50)
 * @returns {Promise<Array<object>>} Trend rows
 */
async function getTopTrends(limit = 50) {
  const result = await query(
    'SELECT * FROM scraped_trends ORDER BY scraped_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Delete trends older than N days.
 *
 * @param {number} days - retention window (default 30)
 * @returns {Promise<number>} Number of rows deleted
 */
async function purgeTrends(days = 30) {
  const result = await query(
    `DELETE FROM scraped_trends WHERE scraped_at < NOW() - ($1 || ' days')::INTERVAL`,
    [days]
  );
  return result.rowCount;
}

module.exports = { saveTrends, getTrendsByPlatform, getTopTrends, purgeTrends };
