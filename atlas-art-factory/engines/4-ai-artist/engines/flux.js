'use strict';

const Replicate = require('replicate');
const path = require('path');
const fs = require('fs');
const https = require('https');

const STORAGE_DIR = path.join(__dirname, '../../../storage/artworks');
const FLUX_SCHNELL_MODEL = 'black-forest-labs/flux-schnell';
const FLUX_DEV_MODEL = 'black-forest-labs/flux-dev';
const DEFAULT_ASPECT_RATIO = '2:3';   // portrait — standard for print art
const DEFAULT_MEGAPIXELS = '1';        // ~1MP output, fast + cheap

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

  // FLUX schnell/dev use aspect_ratio + megapixels, not width/height
  const aspectRatio = options.aspectRatio || DEFAULT_ASPECT_RATIO;
  const megapixels = options.megapixels || DEFAULT_MEGAPIXELS;

  let output;
  try {
    output = await replicate.run(model, {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        megapixels: megapixels,
        num_outputs: 1,
        output_format: 'png',
        output_quality: 100,
      },
    });
  } catch (err) {
    throw new Error(`FLUX generation failed for model "${model}": ${err.message}`);
  }

  // Replicate SDK returns URL objects; extract the href string
  const rawOutput = Array.isArray(output) ? output[0] : output;
  const imageUrl = rawOutput instanceof URL ? rawOutput.href : String(rawOutput);

  const id = options.outputId || `flux_${Date.now()}`;
  const file_path = path.join(STORAGE_DIR, `${id}.png`);

  // Ensure storage directory exists
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Download image to local file
  await _downloadImage(imageUrl, file_path);

  const engine = model.split('/')[1] || model;

  return { id, file_path, engine, aspectRatio, prompt, url: imageUrl };
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
