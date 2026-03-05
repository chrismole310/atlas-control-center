'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-store');

async function insertTrends(trends) {
  if (!trends.length) return 0;

  const columns = [
    'platform', 'listing_url', 'title', 'description', 'price',
    'sales_count', 'review_count', 'rating', 'favorites', 'views',
    'keywords', 'tags', 'category', 'style', 'subject',
    'color_palette', 'image_urls',
  ];

  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const t of trends) {
    const row = [
      t.platform, t.listing_url || null, t.title || null, t.description || null,
      t.price ?? null, t.sales_count ?? null, t.review_count ?? null, t.rating ?? null,
      t.favorites ?? null, t.views ?? null, t.keywords || [], t.tags || [],
      t.category || null, t.style || null, t.subject || null,
      JSON.stringify(t.color_palette || {}), t.image_urls || [],
    ];
    const ph = columns.map(() => `$${idx++}`);
    placeholders.push(`(${ph.join(', ')})`);
    values.push(...row);
  }

  const sql = `INSERT INTO scraped_trends (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
  const result = await query(sql, values);
  logger.info(`Inserted ${result.rowCount} trends`);
  return result.rowCount;
}

async function getRecentTrends(platform, limit = 100) {
  const result = await query(
    'SELECT * FROM scraped_trends WHERE platform = $1 ORDER BY scraped_at DESC LIMIT $2',
    [platform, limit]
  );
  return result.rows;
}

module.exports = { insertTrends, getRecentTrends };
