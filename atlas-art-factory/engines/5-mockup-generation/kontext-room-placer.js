'use strict';

/**
 * kontext-room-placer.js
 *
 * Uses FLUX.1 Kontext Dev (Replicate) to generate a photorealistic room scene
 * that incorporates the artwork as a framed painting on the wall.
 *
 * Instead of compositing artwork onto a room photo, we pass the artwork itself
 * as the reference image and prompt Kontext to "place" it in a room scene.
 * The result is a natural, lighting-consistent mockup.
 */

require('dotenv').config();
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createLogger } = require('../../core/logger');

const logger = createLogger('kontext-room-placer');

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const MODEL = 'black-forest-labs/flux-kontext-dev';

// Room-specific prompts — tells Kontext to place the artwork in that room
const ROOM_PROMPTS = {
  'living-room': [
    'This is a digital painting. Place it as a large framed artwork hanging prominently on a white wall',
    'in a photorealistic modern Scandinavian living room. The painting is displayed in a thin white frame',
    'centered on the wall. The room has light wood floors, a neutral beige sofa, and soft natural light',
    'coming from large windows. Professional interior photography, 16:9 wide angle.',
  ].join(' '),

  bedroom: [
    'This is a digital painting. Place it as a large framed artwork hanging centered above the bed headboard',
    'in a photorealistic modern bedroom. Thin black frame on a white wall. Soft warm lighting,',
    'white linen bedding, bedside tables with small lamps. Professional interior photography, 16:9.',
  ].join(' '),

  office: [
    'This is a digital painting. Place it as a large framed artwork hanging on the white wall',
    'behind a minimal wood desk in a photorealistic modern home office. Thin dark frame.',
    'Natural daylight, laptop on desk, clean decor. Professional interior photography, 16:9.',
  ].join(' '),

  nursery: [
    'This is a digital painting. Place it as a framed artwork hanging on the wall in a photorealistic',
    'modern nursery. Thin pastel pink frame on a white wall. Soft gentle lighting, white crib nearby,',
    'pastel colors, cozy and calm. Professional interior photography, 16:9.',
  ].join(' '),

  bathroom: [
    'This is a digital painting. Place it as a framed artwork on the wall beside a vanity mirror',
    'in a photorealistic modern spa-style bathroom. Thin brushed gold frame on white tile wall.',
    'Soft natural light, white marble surfaces, luxury minimal style. Professional interior photography, 16:9.',
  ].join(' '),
};

/**
 * Download a URL to a local file path.
 */
function downloadFile(url, dest) {
  const urlStr = url instanceof URL ? url.href : String(url);
  const protocol = urlStr.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    protocol.get(urlStr, res => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

const RETRY_DELAY_MS = 12000;  // Free tier: burst=1, ~10s reset window
const MAX_RETRIES = 3;

/**
 * Generate a room scene mockup using FLUX Kontext Dev.
 * Retries automatically on 429 rate-limit errors with a 12s backoff.
 *
 * @param {string} artworkPath - Absolute path to the artwork PNG
 * @param {string} templateId  - Room template id (e.g. 'living-room')
 * @param {string} outputPath  - Where to save the output PNG
 * @returns {Promise<string>}  outputPath on success
 */
async function generateKontextMockup(artworkPath, templateId, outputPath) {
  const prompt = ROOM_PROMPTS[templateId];
  if (!prompt) throw new Error(`No Kontext prompt defined for template: ${templateId}`);

  if (!fs.existsSync(artworkPath)) {
    throw new Error(`Artwork file not found: ${artworkPath}`);
  }

  // Read artwork once — reuse across retries
  const artworkBuffer = fs.readFileSync(artworkPath);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`Generating Kontext mockup: ${templateId} (attempt ${attempt})`, { artworkPath });
    try {
      const artworkBlob = new Blob([artworkBuffer], { type: 'image/png' });

      const output = await replicate.run(MODEL, {
        input: {
          input_image: artworkBlob,
          prompt,
          aspect_ratio: '16:9',
          output_format: 'png',
          output_quality: 100,
          num_inference_steps: 28,
          guidance: 3.5,
          go_fast: false,  // Better quality for product mockups
        },
      });

      const rawUrl = Array.isArray(output) ? output[0] : output;
      const imageUrl = rawUrl instanceof URL ? rawUrl.href : String(rawUrl);

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      await downloadFile(imageUrl, outputPath);

      logger.info(`Kontext mockup saved: ${templateId}`, { outputPath });
      return outputPath;

    } catch (err) {
      const is429 = err.message && err.message.includes('429');
      if (is429 && attempt < MAX_RETRIES) {
        logger.warn(`Rate limited on ${templateId}, waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw err;
      }
    }
  }
}

module.exports = { generateKontextMockup, ROOM_PROMPTS };
