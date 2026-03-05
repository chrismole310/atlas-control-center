'use strict';

const axios = require('axios');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('etsy-puller');

async function pullEtsyStats() {
  logger.info('Pulling Etsy analytics');

  const { rows: listings } = await query(
    `SELECT id, platform_listing_id, artwork_id
     FROM listings WHERE platform = 'etsy' AND status = 'active'`
  );

  let updated = 0;
  for (const listing of listings) {
    try {
      const { data } = await axios.get(
        `https://openapi.etsy.com/v3/application/listings/${listing.platform_listing_id}`,
        {
          headers: {
            'x-api-key': process.env.ETSY_API_KEY,
            Authorization: `Bearer ${process.env.ETSY_ACCESS_TOKEN}`,
          },
        }
      );

      const stats = data.results ? data.results[0] : data;
      await query(
        `INSERT INTO performance_metrics (artwork_id, platform, views, favorites)
         VALUES ($1, 'etsy', $2, $3)
         ON CONFLICT (artwork_id, platform)
         DO UPDATE SET views = $2, favorites = $3, last_updated = NOW()`,
        [listing.artwork_id, stats.views || 0, stats.num_favorers || 0]
      );
      updated++;
    } catch (err) {
      logger.error(`Failed to pull stats for listing ${listing.platform_listing_id}`, { error: err.message });
    }
  }

  logger.info('Etsy analytics complete', { listings_updated: updated });
  return { listings_updated: updated };
}

module.exports = { pullEtsyStats };
