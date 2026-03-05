'use strict';

const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const https = require('https');

const STORAGE_DIR = path.join(__dirname, '../../../storage/artworks');
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

/**
 * Map width/height to a DALL-E 3 supported size string.
 * DALL-E 3 only supports: 1024x1024, 1792x1024, 1024x1792
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function _mapSize(width, height) {
  if (width > height) return '1792x1024';
  if (height > width) return '1024x1792';
  return '1024x1024';
}

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
 * Generate an image using DALL-E 3.
 * @param {string} prompt
 * @param {Object} options - { width, height, outputId, quality }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function generate(prompt, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const quality = options.quality || 'standard';
  const sizeStr = _mapSize(width, height);

  // Parse actual dimensions from the mapped size string
  const [mappedWidth, mappedHeight] = sizeStr.split('x').map(Number);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let response;
  try {
    response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: sizeStr,
      quality: quality,
    });
  } catch (err) {
    throw new Error(`DALL-E 3 generation failed: ${err.message}`);
  }

  const imageUrl = response.data[0].url;

  const id = options.outputId || `dalle3_${Date.now()}`;
  const file_path = path.join(STORAGE_DIR, `${id}.png`);

  // Ensure storage directory exists
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Download image to local file
  await _downloadImage(imageUrl, file_path);

  return { id, file_path, engine: 'dalle3', width: mappedWidth, height: mappedHeight, prompt, url: imageUrl };
}

module.exports = { generate };
