'use strict';

const { createLogger } = require('../../core/logger');

const logger = createLogger('variation-generator');

/**
 * Generate 3 variations of an artwork prompt.
 * Variations are deterministic — based on index, not random.
 *
 * @param {string} basePrompt - the original generation prompt
 * @param {Object} artist - artist config object
 * @returns {string[]} array of 3 variation prompts
 */
function generateVariationPrompts(basePrompt, artist) {
  const prompt = basePrompt || '';

  // Variation 1: Color shift — prepend a tone modifier
  const variation1 = 'in warm golden tones, ' + prompt;

  // Variation 2: Composition tweak — append a framing modifier
  const variation2 = prompt + ', close-up detail view';

  // Variation 3: Style variant — append a style interpretation modifier
  const variation3 = prompt + ', more abstract interpretation';

  return [variation1, variation2, variation3];
}

/**
 * Generate variations for an artwork using the router.
 *
 * @param {Object} baseArtwork - { id, prompt, artist, file_path }
 * @param {Object} options - { routeAndGenerate fn, maxVariations=3 }
 * @returns {Promise<Array>} array of generated variation result objects
 */
async function generateVariations(baseArtwork, options = {}) {
  const { routeAndGenerate, maxVariations = 3 } = options;

  if (typeof routeAndGenerate !== 'function') {
    throw new Error('generateVariations: options.routeAndGenerate must be a function');
  }

  const artist = baseArtwork.artist || {};
  const variationPrompts = generateVariationPrompts(baseArtwork.prompt, artist);
  const promptsToUse = variationPrompts.slice(0, maxVariations);

  const results = [];

  for (let i = 0; i < promptsToUse.length; i++) {
    const variationPrompt = promptsToUse[i];
    logger.info('Generating variation', {
      baseArtworkId: baseArtwork.id,
      variationIndex: i + 1,
      promptLength: variationPrompt.length,
    });

    try {
      const result = await routeAndGenerate({
        prompt: variationPrompt,
        artist,
        flags: { isBatch: true },
        options: { outputId: `${baseArtwork.id}-v${i + 1}` },
      });

      results.push({
        variationIndex: i + 1,
        prompt: variationPrompt,
        baseArtworkId: baseArtwork.id,
        ...result,
      });
    } catch (err) {
      logger.error('Variation generation failed', {
        baseArtworkId: baseArtwork.id,
        variationIndex: i + 1,
        error: err.message,
      });
      results.push({
        variationIndex: i + 1,
        prompt: variationPrompt,
        baseArtworkId: baseArtwork.id,
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = { generateVariationPrompts, generateVariations };
