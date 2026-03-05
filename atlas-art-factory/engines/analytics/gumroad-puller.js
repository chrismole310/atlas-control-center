'use strict';

const axios = require('axios');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('gumroad-puller');

async function pullGumroadStats() {
  logger.info('Pulling Gumroad analytics');

  const { rows: listings } = await query(
    `SELECT id, platform_listing_id, artwork_id
     FROM listings WHERE platform = 'gumroad' AND status = 'active'`
  );

  let updated = 0;
  for (const listing of listings) {
    try {
      const { data } = await axios.get(
        `https://api.gumroad.com/v2/products/${listing.platform_listing_id}`,
        { params: { access_token: process.env.GUMROAD_ACCESS_TOKEN } }
      );

      const product = data.product;
      await query(
        `INSERT INTO performance_metrics (artwork_id, platform, views, sales, revenue)
         VALUES ($1, 'gumroad', $2, $3, $4)
         ON CONFLICT (artwork_id, platform)
         DO UPDATE SET views = $2, sales = $3, revenue = $4, last_updated = NOW()`,
        [listing.artwork_id, product.views_count || 0, product.sales_count || 0,
         (product.sales_usd_cents || 0) / 100]
      );
      updated++;
    } catch (err) {
      logger.error(`Failed to pull stats for product ${listing.platform_listing_id}`, { error: err.message });
    }
  }

  logger.info('Gumroad analytics complete', { products_updated: updated });
  return { products_updated: updated };
}

module.exports = { pullGumroadStats };
