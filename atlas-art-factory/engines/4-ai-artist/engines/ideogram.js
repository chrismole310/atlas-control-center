'use strict';

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const https = require('https');

const STORAGE_DIR = path.join(__dirname, '../../../storage/artworks');
const IDEOGRAM_API_URL = 'https://api.ideogram.ai/generate';
const DEFAULT_ASPECT_RATIO = 'ASPECT_2_3';

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
 * Generate an image using Ideogram v2.
 * @param {string} prompt
 * @param {Object} options - { width, height, outputId, aspectRatio }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function generate(prompt, options = {}) {
  const aspectRatio = options.aspectRatio || DEFAULT_ASPECT_RATIO;

  let response;
  try {
    response = await axios.post(
      IDEOGRAM_API_URL,
      {
        image_request: {
          prompt,
          aspect_ratio: aspectRatio,
          model: 'V_2',
          magic_prompt_option: 'AUTO',
        },
      },
      {
        headers: {
          'Api-Key': process.env.IDEOGRAM_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    const message = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Ideogram generation failed: ${message}`);
  }

  const imageUrl = response.data.data[0].url;

  // Ideogram aspect ratio determines dimensions; use defaults matching the aspect ratio
  const width = options.width || 1024;
  const height = options.height || 1536;

  const id = options.outputId || `ideogram_${Date.now()}`;
  const file_path = path.join(STORAGE_DIR, `${id}.png`);

  // Ensure storage directory exists
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Download image to local file
  await _downloadImage(imageUrl, file_path);

  return { id, file_path, engine: 'ideogram', width, height, prompt, url: imageUrl };
}

module.exports = { generate };
