'use strict';

const sharp = require('sharp');
const axios = require('axios');
const { createLogger } = require('../../core/logger');
const { getSceneConfig } = require('./scene-templates');

const logger = createLogger('art-placer');

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 245, g: 240, b: 232 };
}

async function placeArtOnScene({ artworkUrl, scene, frameWidth, frameHeight }) {
  const config = getSceneConfig(scene);
  if (!config) throw new Error(`Unknown scene: ${scene}`);

  logger.info(`Placing art on ${scene} scene`);

  // Download artwork
  const { data: artBuffer } = await axios.get(artworkUrl, { responseType: 'arraybuffer' });

  const fw = frameWidth || config.frameArea.width;
  const fh = frameHeight || config.frameArea.height;

  // Resize artwork to fit frame area
  const resizedArt = await sharp(artBuffer)
    .resize(fw, fh, { fit: 'contain' })
    .toBuffer();

  // Create wall background
  const { r, g, b } = hexToRgb(config.wallColor);
  const wall = await sharp({
    create: {
      width: config.canvasWidth,
      height: config.canvasHeight,
      channels: 3,
      background: { r, g, b },
    },
  }).png().toBuffer();

  // Build frame border if configured
  const border = config.frameStyle.border || 0;
  const framedArt = border > 0
    ? await sharp(resizedArt)
        .extend({
          top: border, bottom: border, left: border, right: border,
          background: hexToRgb(config.frameStyle.borderColor || '#000000'),
        })
        .toBuffer()
    : resizedArt;

  // Composite framed artwork onto wall
  const compositeX = config.frameArea.x - border;
  const compositeY = config.frameArea.y - border;

  const result = await sharp(wall)
    .composite([{ input: framedArt, left: compositeX, top: compositeY }])
    .png()
    .toBuffer();

  logger.info(`Mockup created for ${scene}`, { size: result.length });

  return { buffer: result, scene, width: config.canvasWidth, height: config.canvasHeight };
}

module.exports = { placeArtOnScene };
