'use strict';

/**
 * art-placer.js
 *
 * Generates room scene mockups by passing the artwork to FLUX.1 Kontext Dev,
 * which naturally integrates the painting into a photorealistic room scene.
 *
 * Falls back to Sharp compositing if Replicate is not configured.
 */

const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../core/logger');
const logger = createLogger('art-placer');

const MOCKUPS_DIR = path.join(__dirname, '../../storage/mockups');

/**
 * Generate a single room scene mockup for the given artwork + template.
 * Uses FLUX Kontext Dev (AI-native) when REPLICATE_API_TOKEN is set,
 * otherwise falls back to Sharp compositing.
 *
 * @param {string} artworkPath - path to the artwork PNG
 * @param {string} templateId - room template id (e.g. 'living-room')
 * @param {Object} options - { outputId }
 * @returns {Promise<{file_path, template_id, width, height}>}
 */
async function placeArtInRoom(artworkPath, templateId, options = {}) {
  const outputId = options.outputId || `mockup_${templateId}_${Date.now()}`;
  const outputPath = path.join(MOCKUPS_DIR, `${outputId}.png`);

  // Cloudflare Workers AI has no Kontext model — use Sharp compositing (fast, free)
  // Replicate or HuggingFace tokens enable AI-native Kontext room scenes
  const useKontext = !process.env.CLOUDFLARE_AI_TOKEN &&
    (process.env.REPLICATE_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN);

  if (useKontext) {
    return _kontextMockup(artworkPath, templateId, outputPath);
  }
  return _compositeMockup(artworkPath, templateId, outputPath);
}

/**
 * AI-native: FLUX Kontext Dev generates the room scene with artwork integrated.
 */
async function _kontextMockup(artworkPath, templateId, outputPath) {
  const { generateKontextMockup } = require('./kontext-room-placer');
  try {
    await generateKontextMockup(artworkPath, templateId, outputPath);
    // Kontext outputs 16:9 — report 1360×768 to match existing contract
    return {
      file_path: outputPath,
      template_id: templateId,
      width: 1360,
      height: 768,
    };
  } catch (err) {
    logger.error(`Kontext mockup failed for ${templateId}, falling back to composite`, { error: err.message });
    return _compositeMockup(artworkPath, templateId, outputPath);
  }
}

/**
 * Fallback: Sharp composites artwork onto the pre-generated room background photo.
 */
async function _compositeMockup(artworkPath, templateId, outputPath) {
  const sharp = require('sharp');
  const { getRoomBackgroundPath, getTemplate } = require('./room-templates');

  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const az = template.artZone;

  try {
    const backgroundPath = getRoomBackgroundPath(templateId);

    const artworkResized = await sharp(artworkPath)
      .resize(az.width, az.height, { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    const artMeta = await sharp(artworkResized).metadata();
    const artX = az.x + Math.floor((az.width - artMeta.width) / 2);
    const artY = az.y + Math.floor((az.height - artMeta.height) / 2);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    await sharp(backgroundPath)
      .composite([{ input: artworkResized, top: artY, left: artX }])
      .png()
      .toFile(outputPath);

    return {
      file_path: outputPath,
      template_id: templateId,
      width: template.canvasWidth,
      height: template.canvasHeight,
    };
  } catch (err) {
    logger.error(`Composite mockup failed for template ${templateId}`, { error: err.message });
    throw new Error(`Failed to place art in ${templateId}: ${err.message}`);
  }
}

/**
 * Generate all 5 room scene mockups for an artwork.
 * @param {string} artworkPath
 * @param {Object} options - { outputPrefix }
 * @returns {Promise<Array>} array of mockup result objects
 */
async function generateAllMockups(artworkPath, options = {}) {
  const { getTemplates } = require('./room-templates');
  const templates = getTemplates();
  const prefix = options.outputPrefix || `mockup_${Date.now()}`;

  // Free-tier Replicate: burst=1, ~10s window — space requests out
  const INTER_ROOM_DELAY_MS = process.env.REPLICATE_API_TOKEN ? 11000 : 0;

  const results = [];
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    if (i > 0 && INTER_ROOM_DELAY_MS) {
      logger.info(`Waiting ${INTER_ROOM_DELAY_MS / 1000}s between rooms (rate limit)...`);
      await new Promise(r => setTimeout(r, INTER_ROOM_DELAY_MS));
    }
    try {
      const result = await placeArtInRoom(artworkPath, template.id, {
        outputId: `${prefix}_${template.id}`,
      });
      results.push(result);
    } catch (err) {
      logger.error(`Mockup failed for template ${template.id}`, { error: err.message });
    }
  }
  return results;
}

module.exports = { placeArtInRoom, generateAllMockups };
