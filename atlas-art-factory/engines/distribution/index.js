'use strict';

const path = require('path');
const fs = require('fs');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { generateTitle, generateDescription, optimizeTags } = require('./seo-optimizer');
const { calculatePrice } = require('./pricing-engine');
const { createLimiter } = require('./rate-limiter');
const EtsyUploader = require('./uploaders/etsy');

const logger = createLogger('distribution');

const ENABLED_PLATFORMS = ['etsy'];
const STORAGE_ROOT = path.resolve(__dirname, '../../storage');

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

/**
 * Resolve room mockup image paths for an artwork UUID.
 * Looks for files matching storage/mockups/{uuid}_*.png
 */
function resolveMockupPaths(uuid) {
  const mockupsDir = path.join(STORAGE_ROOT, 'mockups');
  if (!fs.existsSync(mockupsDir)) return [];

  return fs.readdirSync(mockupsDir)
    .filter(f => f.startsWith(`${uuid}_`) && f.endsWith('.png'))
    .map(f => path.join(mockupsDir, f))
    .sort()
    .slice(0, 5);
}

/**
 * Resolve ZIP package path for an artwork UUID.
 * Looks for storage/packages/{uuid}.zip
 */
function resolveZipPath(uuid) {
  const zipPath = path.join(STORAGE_ROOT, 'packages', `${uuid}.zip`);
  return fs.existsSync(zipPath) ? zipPath : null;
}

async function publishToPlatform(platform, listing, artwork) {
  const limiter = createLimiter(platform);

  if (!(await limiter.canProceed())) {
    logger.warn(`Skipping ${platform} — daily quota reached`);
    return null;
  }

  await limiter.waitForSlot();

  // Create draft record in DB
  const { rows } = await query(
    `INSERT INTO listings (artwork_id, platform, title, description, tags, price, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft')
     RETURNING id`,
    [artwork.id, platform, listing.title, listing.description, listing.tags, listing.price]
  );
  const listingDbId = rows[0].id;

  await limiter.recordAction();

  // Resolve file paths from artwork UUID
  const mockupPaths = resolveMockupPaths(artwork.uuid);
  const zipPath = resolveZipPath(artwork.uuid);

  if (mockupPaths.length === 0) {
    logger.warn('No mockup images found for artwork', { uuid: artwork.uuid });
  }
  if (!zipPath) {
    logger.warn('No ZIP package found for artwork', { uuid: artwork.uuid });
  }

  // Upload to platform
  let uploadResult = null;
  try {
    const uploader = _getUploader(platform);
    uploadResult = await uploader.upload({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      tags: listing.tags,
      mockupPaths,
      zipPath,
    });
  } catch (err) {
    logger.error(`Upload failed for ${platform}`, { error: err.message, listingDbId });
    await query(
      `UPDATE listings SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [listingDbId]
    );
    throw err;
  }

  // Update DB with platform result
  await query(
    `UPDATE listings
     SET platform_listing_id = $1,
         listing_url = $2,
         status = 'published',
         published_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [uploadResult.platformListingId, uploadResult.listingUrl, listingDbId]
  );

  logger.info(`Published on ${platform}`, {
    listingDbId,
    platformListingId: uploadResult.platformListingId,
    listingUrl: uploadResult.listingUrl,
  });

  return { listingId: listingDbId, platform, listingUrl: uploadResult.listingUrl };
}

function _getUploader(platform) {
  if (platform === 'etsy') return new EtsyUploader();
  throw new Error(`Unknown platform: ${platform}`);
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

module.exports = { prepareListing, runDistribution, resolveMockupPaths, resolveZipPath };
