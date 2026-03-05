'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { generateTitle, generateDescription, optimizeTags } = require('./seo-optimizer');
const { calculatePrice } = require('./pricing-engine');
const { createLimiter } = require('./rate-limiter');

const logger = createLogger('distribution');

const ENABLED_PLATFORMS = ['etsy'];

async function prepareListing({ artwork, silo }) {
  logger.info('Preparing listing', { artworkId: artwork.id });

  const [title, description, tags, price] = await Promise.all([
    generateTitle({ artwork, silo }),
    generateDescription({ artwork, silo }),
    optimizeTags({ siloId: silo.id, artwork }),
    calculatePrice({ siloId: silo.id, qualityScore: artwork.quality_score, artworkId: artwork.id }),
  ]);

  return { title, description, tags, price };
}

async function publishToPlatform(platform, listing, artwork) {
  const limiter = createLimiter(platform);

  if (!(await limiter.canProceed())) {
    logger.warn(`Skipping ${platform} — daily quota reached`);
    return null;
  }

  await limiter.waitForSlot();

  const { rows } = await query(
    `INSERT INTO listings (artwork_id, platform, title, description, tags, price, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft')
     RETURNING id`,
    [artwork.id, platform, listing.title, listing.description, listing.tags, listing.price]
  );

  await limiter.recordAction();

  logger.info(`Listing created on ${platform}`, { listingId: rows[0].id, artworkId: artwork.id });
  return { listingId: rows[0].id, platform };
}

async function runDistribution() {
  logger.info('Starting distribution run');

  const { rows: artworks } = await query(
    `SELECT a.id, a.uuid, a.master_image_url, a.prompt, a.quality_score,
            s.id AS silo_id, s.name AS silo_name
     FROM artworks a
     JOIN silos s ON s.id = a.silo_id
     LEFT JOIN listings l ON l.artwork_id = a.id
     WHERE a.status = 'approved' AND a.master_image_url IS NOT NULL AND l.id IS NULL
     ORDER BY a.quality_score DESC
     LIMIT 50`
  );

  let artworksListed = 0;
  let listingsCreated = 0;

  for (const artwork of artworks) {
    try {
      const silo = { id: artwork.silo_id, name: artwork.silo_name };
      const listing = await prepareListing({ artwork, silo });

      for (const platform of ENABLED_PLATFORMS) {
        const result = await publishToPlatform(platform, listing, artwork);
        if (result) listingsCreated++;
      }

      artworksListed++;
    } catch (err) {
      logger.error(`Distribution failed for artwork ${artwork.id}`, { error: err.message });
    }
  }

  const summary = { artworks_listed: artworksListed, listings_created: listingsCreated };
  logger.info('Distribution run complete', summary);
  return summary;
}

module.exports = { prepareListing, runDistribution };
