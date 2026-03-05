'use strict';

const { query } = require('../../core/database');
const { generateAllMockups } = require('./art-placer');
const { exportAllSizes } = require('./format-optimizer');
const { buildPackage } = require('./package-builder');
const { createLogger } = require('../../core/logger');

const logger = createLogger('mockup-pipeline');

/**
 * Process all mockups for a single artwork.
 * 1. Generate 5 room scene mockups (art-placer.js)
 * 2. Export 6 print sizes (format-optimizer.js)
 * 3. Build ZIP package (package-builder.js)
 * 4. Update artwork status in DB to 'mockup_ready'
 * 5. Return summary
 *
 * @param {Object} artwork - { id, master_image_path, title } (from artworks table)
 * @param {Object} options - { outputPrefix }
 * @returns {Promise<{artwork_id, mockups, formats, packagePath, file_count, size_bytes}>}
 */
async function processArtworkMockups(artwork, options = {}) {
  const outputPrefix = options.outputPrefix || String(artwork.id);

  logger.info('Processing mockups for artwork', { artworkId: artwork.id, title: artwork.title });

  // 1. Generate 5 room scene mockups
  const mockupResults = await generateAllMockups(artwork.master_image_path, {
    outputPrefix: outputPrefix,
  });

  // 2. Export 6 print sizes
  const formatResults = await exportAllSizes(artwork.master_image_path, {
    artworkId: artwork.id,
  });

  // 3. Build ZIP package
  const packageResult = await buildPackage(
    { id: artwork.id, title: artwork.title },
    formatResults,
    mockupResults
  );

  // 4. Update artwork status in DB
  try {
    await query(
      "UPDATE artworks SET status = 'mockup_ready', updated_at = NOW() WHERE id = $1",
      [artwork.id]
    );
  } catch (dbErr) {
    logger.error('Failed to update artwork status after successful mockup generation', {
      artworkId: artwork.id,
      error: dbErr.message,
    });
    throw dbErr;
  }

  logger.info('Mockup processing complete', { artworkId: artwork.id, ...packageResult });

  // 5. Return summary
  return {
    artwork_id: artwork.id,
    mockups: mockupResults,
    formats: formatResults,
    packagePath: packageResult.zip_path,
    file_count: packageResult.file_count,
    size_bytes: packageResult.size_bytes,
  };
}

/**
 * Run batch mockup processing for all artworks with status = 'generated'.
 * @param {Object} options - { limit=50, batchSize } (batchSize takes precedence over limit)
 * @returns {Promise<{processed, errors, elapsed}>}
 */
async function runMockupBatch(options = {}) {
  const limit = options.batchSize != null ? options.batchSize : (options.limit != null ? options.limit : 50);
  const startTime = Date.now();

  logger.info('Starting mockup batch', { limit });

  let result;
  try {
    result = await query(
      "SELECT id, master_image_path, title FROM artworks WHERE status = 'generated' LIMIT $1",
      [limit]
    );
  } catch (dbErr) {
    logger.error('Failed to fetch artworks for mockup batch', { error: dbErr.message });
    throw dbErr;
  }

  const artworks = result.rows;
  let processed = 0;
  const errors = [];

  for (const artwork of artworks) {
    try {
      await processArtworkMockups(artwork);
      processed++;
    } catch (err) {
      logger.error('Mockup processing failed for artwork', {
        artworkId: artwork.id,
        error: err.message,
      });
      errors.push({ artworkId: artwork.id, error: err.message });
    }
  }

  const elapsed = Date.now() - startTime;

  logger.info('Mockup batch complete', { processed, errors: errors.length, elapsed });

  return { processed, errors, elapsed };
}

module.exports = { processArtworkMockups, runMockupBatch };
