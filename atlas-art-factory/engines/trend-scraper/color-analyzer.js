'use strict';

const Vibrant = require('node-vibrant');
const { createLogger } = require('../../core/logger');

const logger = createLogger('color-analyzer');

async function analyzeImageColors(imageUrl) {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();

    const swatches = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted', 'LightMuted'];
    const colors = swatches
      .map(name => palette[name])
      .filter(Boolean)
      .sort((a, b) => b.population - a.population);

    return {
      dominant: colors.length > 0 ? colors[0].hex : null,
      palette: colors.map(c => c.hex),
    };
  } catch (err) {
    logger.warn(`Color analysis failed for ${imageUrl}`, { error: err.message });
    return { dominant: null, palette: [] };
  }
}

module.exports = { analyzeImageColors };
