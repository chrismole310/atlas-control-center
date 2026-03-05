'use strict';

const sharp = require('sharp');
const path = require('path');
const { createLogger } = require('../../core/logger');

const logger = createLogger('format-optimizer');

const PRINT_SIZES = [
  { name: '8x10',  width: 2400, height: 3000, dpi: 300 },
  { name: '11x14', width: 3300, height: 4200, dpi: 300 },
  { name: '16x20', width: 4800, height: 6000, dpi: 300 },
  { name: '24x36', width: 7200, height: 10800, dpi: 300 },
  { name: 'square', width: 3000, height: 3000, dpi: 300 },
  { name: 'A4',    width: 2480, height: 3508, dpi: 300 },
];

async function exportAllSizes({ imageBuffer, outputDir, baseFilename }) {
  logger.info(`Exporting ${PRINT_SIZES.length} sizes for ${baseFilename}`);

  const results = [];
  for (const size of PRINT_SIZES) {
    const filename = `${baseFilename}-${size.name}.png`;
    const outputPath = path.join(outputDir, filename);

    await sharp(imageBuffer)
      .resize(size.width, size.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ quality: 95 })
      .toFile(outputPath);

    results.push({
      name: size.name,
      path: outputPath,
      width: size.width,
      height: size.height,
      dpi: size.dpi,
    });
  }

  logger.info(`Exported ${results.length} sizes`, { baseFilename });
  return results;
}

module.exports = { PRINT_SIZES, exportAllSizes };
