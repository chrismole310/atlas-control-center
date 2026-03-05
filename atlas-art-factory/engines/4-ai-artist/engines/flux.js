'use strict';

const Replicate = require('replicate');
const path = require('path');
const fs = require('fs');
const https = require('https');

const STORAGE_DIR = path.join(__dirname, '../../../storage/artworks');
const FLUX_SCHNELL_MODEL = 'black-forest-labs/FLUX.1-schnell';
const FLUX_DEV_MODEL = 'black-forest-labs/FLUX.1-dev';
const DEFAULT_WIDTH = 2400;
const DEFAULT_HEIGHT = 3000;

/**
 * Download an image from a URL to a local file path.
 * @param {string} url
 * @param {string} dest
 * @returns {Promise<void>}
 */
async function _downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
      response.pipe(file);
      response.on('end', () => {
        file.on('finish', resolve);
        file.on('error', reject);
      });
      response.on('error', reject);
    });
    request.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Internal helper: run a FLUX model via Replicate, download the output image.
 * @param {string} model  - Replicate model identifier (owner/name)
 * @param {string} prompt
 * @param {Object} options - { width, height, outputId }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function _generate(model, prompt, options) {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  let output;
  try {
    output = await replicate.run(model, { input: { prompt, width, height, num_outputs: 1 } });
  } catch (err) {
    throw new Error(`FLUX generation failed for model "${model}": ${err.message}`);
  }

  // output is an array of URLs; use the first one
  const imageUrl = Array.isArray(output) ? output[0] : output;

  const id = options.outputId || `flux_${Date.now()}`;
  const file_path = path.join(STORAGE_DIR, `${id}.png`);

  // Ensure storage directory exists
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Download image to local file
  await _downloadImage(imageUrl, file_path);

  const engine = model.split('/')[1] || model;

  return { id, file_path, engine, width, height, prompt, url: imageUrl };
}

/**
 * Generate image using FLUX.1 schnell (fast, free via Replicate).
 * @param {string} prompt
 * @param {Object} options - { width, height, outputId }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function generateFluxSchnell(prompt, options = {}) {
  return _generate(FLUX_SCHNELL_MODEL, prompt, options);
}

/**
 * Generate image using FLUX.1 dev (quality, free via Replicate).
 * @param {string} prompt
 * @param {Object} options - { width, height, outputId }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function generateFluxDev(prompt, options = {}) {
  return _generate(FLUX_DEV_MODEL, prompt, options);
}

module.exports = { generateFluxSchnell, generateFluxDev };
