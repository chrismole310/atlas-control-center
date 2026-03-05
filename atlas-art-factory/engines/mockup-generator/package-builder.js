'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { createLogger } = require('../../core/logger');

const logger = createLogger('package-builder');

async function buildPackage({ files, outputPath, metadata }) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info(`Building package with ${files.length} files`, { outputPath });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const size = archive.pointer();
      logger.info('Package built', { size, fileCount: files.length });
      resolve({ zipPath: outputPath, fileCount: files.length, size });
    });

    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    if (metadata) {
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    }

    archive.finalize();
  });
}

module.exports = { buildPackage };
