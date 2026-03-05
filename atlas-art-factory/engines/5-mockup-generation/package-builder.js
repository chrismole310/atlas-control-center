'use strict';

const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../core/logger');
const logger = createLogger('package-builder');

const PACKAGES_DIR = path.join(__dirname, '../../storage/packages');

/**
 * Build a ZIP package containing all format exports and room mockups for one artwork.
 * @param {Object} artwork - { id, title }
 * @param {Array} formatFiles - [{name, file_path}, ...] from exportAllSizes
 * @param {Array} mockupFiles - [{template_id, file_path}, ...] from generateAllMockups
 * @param {Object} options - { outputDir }
 * @returns {Promise<{zip_path, file_count, size_bytes}>}
 */
async function buildPackage(artwork, formatFiles, mockupFiles, options = {}) {
  const outputDir = options.outputDir || PACKAGES_DIR;
  fs.mkdirSync(outputDir, { recursive: true });

  const zipPath = path.join(outputDir, `${artwork.id}.zip`);

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    archive.pipe(output);

    let fileCount = 0;

    // Add format files under "print-formats/" folder in zip
    for (const fmt of formatFiles) {
      if (fmt.file_path && fs.existsSync(fmt.file_path)) {
        archive.file(fmt.file_path, { name: `print-formats/${fmt.name}.png` });
        fileCount++;
      }
    }

    // Add mockup files under "mockups/" folder in zip
    for (const mockup of mockupFiles) {
      if (mockup.file_path && fs.existsSync(mockup.file_path)) {
        archive.file(mockup.file_path, { name: `mockups/${mockup.template_id}.png` });
        fileCount++;
      }
    }

    output.on('close', () => {
      resolve({
        zip_path: zipPath,
        file_count: fileCount,
        size_bytes: archive.pointer(),
      });
    });

    archive.on('error', (err) => {
      logger.error(`Package build failed for artwork ${artwork.id}`, { error: err.message });
      reject(new Error(`Package build failed for artwork ${artwork.id}: ${err.message}`));
    });

    archive.finalize();
  });
}

module.exports = { buildPackage };
