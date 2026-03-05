'use strict';
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../core/logger');
const logger = createLogger('art-placer');

const MOCKUPS_DIR = path.join(__dirname, '../../storage/mockups');

/**
 * Composite artwork image into a room scene and save the mockup.
 * @param {string} artworkPath - path to the artwork PNG
 * @param {string} templateId - room template id
 * @param {Object} options - { outputId, shadowOpacity=0.3 }
 * @returns {Promise<{file_path, template_id, width, height}>}
 */
async function placeArtInRoom(artworkPath, templateId, options = {}) {
  const { getRoomBackgroundPath, getTemplate } = require('./room-templates');

  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const az = template.artZone;

  try {
    // 1. Load room background photo from disk
    const backgroundPath = getRoomBackgroundPath(templateId);

    // 2. Resize artwork to fit the art zone (maintaining aspect ratio)
    const artworkResized = await sharp(artworkPath)
      .resize(az.width, az.height, { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    // 3. Get actual dimensions after resize
    const artMeta = await sharp(artworkResized).metadata();
    const artW = artMeta.width;
    const artH = artMeta.height;

    // 4. Center the artwork within the art zone
    const artX = az.x + Math.floor((az.width - artW) / 2);
    const artY = az.y + Math.floor((az.height - artH) / 2);

    // 5. Composite: real room photo + artwork overlay
    const outputId = options.outputId || `mockup_${templateId}_${Date.now()}`;
    const outputPath = path.join(MOCKUPS_DIR, `${outputId}.png`);

    fs.mkdirSync(MOCKUPS_DIR, { recursive: true });

    await sharp(backgroundPath)
      .composite([
        { input: artworkResized, top: artY, left: artX }
      ])
      .png()
      .toFile(outputPath);

    return {
      file_path: outputPath,
      template_id: templateId,
      width: template.canvasWidth,
      height: template.canvasHeight,
    };
  } catch (err) {
    logger.error(`Mockup failed for template ${templateId}`, { error: err.message });
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

  const results = [];
  for (const template of templates) {
    try {
      const result = await placeArtInRoom(artworkPath, template.id, {
        outputId: `${prefix}_${template.id}`,
      });
      results.push(result);
    } catch (err) {
      // Log failure but continue with other templates
      logger.error(`Mockup failed for template ${template.id}`, { error: err.message });
    }
  }
  return results;
}

module.exports = { placeArtInRoom, generateAllMockups };
