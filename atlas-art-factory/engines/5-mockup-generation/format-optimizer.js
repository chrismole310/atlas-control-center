'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../core/logger');
const logger = createLogger('format-optimizer');

const PRINT_SIZES = [
  { name: '8x10',   width: 2400,  height: 3000  },
  { name: '11x14',  width: 3300,  height: 4200  },
  { name: '16x20',  width: 4800,  height: 6000  },
  { name: '24x36',  width: 7200,  height: 10800 },
  { name: 'square', width: 3000,  height: 3000  },
  { name: 'a4',     width: 2480,  height: 3508  },
];

/**
 * Export artwork in a single print size.
 * @param {string} artworkPath
 * @param {string} sizeName - one of the PRINT_SIZES names
 * @param {Object} options - { outputDir, artworkId }
 * @returns {Promise<{name, file_path, width, height}>}
 */
async function exportSize(artworkPath, sizeName, options = {}) {
  const size = PRINT_SIZES.find((s) => s.name === sizeName);
  if (!size) throw new Error(`Unknown print size: ${sizeName}`);

  const artworkId = options.artworkId || 'artwork';
  const outputDir =
    options.outputDir ||
    path.join(__dirname, `../../storage/packages/${artworkId}/sizes`);

  fs.mkdirSync(outputDir, { recursive: true });

  const filename = `${artworkId}_${sizeName}.png`;
  const outputPath = path.join(outputDir, filename);

  try {
    await sharp(artworkPath)
      .resize(size.width, size.height, { fit: 'cover', position: 'center' })
      .png()
      .toFile(outputPath);

    return {
      name: sizeName,
      file_path: outputPath,
      width: size.width,
      height: size.height,
    };
  } catch (err) {
    throw new Error(`Format export failed for ${sizeName}: ${err.message}`);
  }
}

/**
 * Export artwork in all 6 standard print sizes.
 * @param {string} artworkPath - source PNG path
 * @param {Object} options - { outputDir, artworkId }
 * @returns {Promise<Array<{name, file_path, width, height}>>}
 */
async function exportAllSizes(artworkPath, options = {}) {
  const results = [];

  for (const size of PRINT_SIZES) {
    try {
      const result = await exportSize(artworkPath, size.name, options);
      results.push(result);
    } catch (err) {
      logger.error(`Format export failed for size ${size.name}`, { error: err.message });
    }
  }

  return results;
}

module.exports = { exportAllSizes, exportSize, PRINT_SIZES };
