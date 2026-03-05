'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const Vibrant = require('node-vibrant');
const axios = require('axios');
const { createLogger } = require('../../core/logger');

const logger = createLogger('image-analyzer');

/**
 * Extract dominant color palette from an image URL using node-vibrant.
 *
 * @param {string} imageUrl - Public image URL
 * @returns {object|null} Color palette object, or null on failure
 *   Shape: { swatches: [...], dominant: string, tone: 'warm'|'cool'|'neutral', brightness: 'light'|'dark'|'mid' }
 */
async function extractColorPalette(imageUrl) {
  if (!imageUrl) return null;

  try {
    // Download image as buffer first to avoid Vibrant's URL fetching issues
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const buffer = Buffer.from(response.data);
    const palette = await Vibrant.from(buffer).getPalette();

    const swatches = Object.entries(palette)
      .filter(([, swatch]) => swatch !== null)
      .map(([name, swatch]) => ({
        name,
        hex: swatch.hex,
        population: swatch.population,
        rgb: swatch.rgb,
      }));

    if (swatches.length === 0) return null;

    // Find dominant swatch (highest population)
    const dominant = swatches.reduce((a, b) => (a.population > b.population ? a : b));

    // Classify tone: warm (r > b) vs cool (b > r) vs neutral
    const [r, g, b] = dominant.rgb;
    let tone = 'neutral';
    if (r - b > 30) tone = 'warm';
    else if (b - r > 30) tone = 'cool';

    // Classify brightness: average luminance of dominant color
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let brightness = 'mid';
    if (luminance > 0.65) brightness = 'light';
    else if (luminance < 0.35) brightness = 'dark';

    return {
      swatches: swatches.slice(0, 5),
      dominant: dominant.hex,
      tone,
      brightness,
    };

  } catch (err) {
    logger.warn(`Color extraction failed for ${imageUrl}`, { error: err.message });
    return null;
  }
}

/**
 * Analyze an array of scraped trend records, enriching each with color_palette.
 * Processes image_urls[0] for each record that has images.
 *
 * @param {Array<object>} records - Trend records (from saveTrends format)
 * @returns {Array<object>} Records with color_palette populated where possible
 */
async function enrichWithColors(records) {
  const enriched = [];

  for (const record of records) {
    const imageUrl = record.image_urls?.[0];
    if (imageUrl) {
      const palette = await extractColorPalette(imageUrl);
      enriched.push({ ...record, color_palette: palette });
    } else {
      enriched.push(record);
    }
  }

  return enriched;
}

module.exports = { extractColorPalette, enrichWithColors };
