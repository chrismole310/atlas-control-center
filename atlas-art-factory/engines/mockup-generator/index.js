'use strict';

const fs = require('fs');
const path = require('path');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { placeArtOnScene } = require('./art-placer');
const { getSceneTemplates } = require('./scene-templates');
const { exportAllSizes } = require('./format-optimizer');
const { buildPackage } = require('./package-builder');

const logger = createLogger('mockup-generator');

const OUTPUT_BASE = path.join(__dirname, '../../output');

async function generateMockups({ artworkId, artworkUrl, artworkUuid }) {
  logger.info(`Generating mockups for artwork ${artworkId}`);

  const scenes = getSceneTemplates();
  const mockupsCreated = [];
  const outputDir = path.join(OUTPUT_BASE, 'mockups', artworkUuid);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate mockup for each room scene
  for (const scene of scenes) {
    try {
      const result = await placeArtOnScene({ artworkUrl, scene: scene.name });

      const mockupFilename = `${artworkUuid}-${scene.name}.png`;
      const mockupPath = path.join(outputDir, mockupFilename);

      // Insert mockup record
      await query(
        `INSERT INTO mockups (artwork_id, scene_type, mockup_url, mockup_path)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [artworkId, scene.name, mockupPath, mockupPath]
      );

      mockupsCreated.push({ scene: scene.name, path: mockupPath });
    } catch (err) {
      logger.error(`Mockup failed for scene ${scene.name}`, { error: err.message, artworkId });
    }
  }

  // Export all print sizes
  const formatsDir = path.join(OUTPUT_BASE, 'formats', artworkUuid);
  if (!fs.existsSync(formatsDir)) {
    fs.mkdirSync(formatsDir, { recursive: true });
  }

  let exportedFormats = [];
  if (mockupsCreated.length > 0) {
    const mockupResult = await placeArtOnScene({ artworkUrl, scene: scenes[0].name });
    exportedFormats = await exportAllSizes({
      imageBuffer: mockupResult.buffer,
      outputDir: formatsDir,
      baseFilename: artworkUuid,
    });
  }

  // Build ZIP package
  const allFiles = [
    ...mockupsCreated.map(m => ({ name: path.basename(m.path), path: m.path })),
    ...exportedFormats.map(f => ({ name: path.basename(f.path), path: f.path })),
  ];

  let packageResult = null;
  if (allFiles.length > 0) {
    const packageDir = path.join(OUTPUT_BASE, 'packages');
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir, { recursive: true });
    }

    packageResult = await buildPackage({
      files: allFiles,
      outputPath: path.join(packageDir, `${artworkUuid}.zip`),
      metadata: { artworkId, uuid: artworkUuid, scenes: mockupsCreated.length, formats: exportedFormats.length },
    });

    // Insert package record
    await query(
      `INSERT INTO product_packages (artwork_id, package_type, formats, download_url, file_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [artworkId, 'full', JSON.stringify(exportedFormats.map(f => f.name)),
       packageResult.zipPath, packageResult.zipPath]
    );
  }

  const summary = {
    mockups_created: mockupsCreated.length,
    formats_exported: exportedFormats.length,
    package_path: packageResult?.zipPath || null,
  };

  logger.info('Mockup generation complete', summary);
  return summary;
}

async function runMockupGeneration() {
  logger.info('Starting mockup generation run');

  // Get approved artworks that don't have mockups yet
  const { rows: artworks } = await query(
    `SELECT a.id, a.uuid, a.master_image_url
     FROM artworks a
     LEFT JOIN mockups m ON m.artwork_id = a.id
     WHERE a.status = 'approved' AND a.master_image_url IS NOT NULL AND m.id IS NULL
     ORDER BY a.created_at DESC
     LIMIT 50`
  );

  let totalMockups = 0;
  let artworksProcessed = 0;

  for (const artwork of artworks) {
    try {
      const result = await generateMockups({
        artworkId: artwork.id,
        artworkUrl: artwork.master_image_url,
        artworkUuid: artwork.uuid,
      });
      totalMockups += result.mockups_created;
      artworksProcessed++;
    } catch (err) {
      logger.error(`Mockup generation failed for artwork ${artwork.id}`, { error: err.message });
    }
  }

  const summary = { artworks_processed: artworksProcessed, total_mockups: totalMockups };
  logger.info('Mockup generation run complete', summary);
  return summary;
}

module.exports = { generateMockups, runMockupGeneration };
