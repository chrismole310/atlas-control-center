'use strict';

const { createLogger } = require('../../core/logger');
const routingRules = require('../../config/ai-engines.json').routing_rules;

const logger = createLogger('router');

const ENGINE = {
  FLUX_SCHNELL: 'flux-schnell',
  FLUX_DEV: 'flux-dev',
  DALLE3: 'dalle3',
  IDEOGRAM: 'ideogram',
  SDXL: 'sdxl',
};

// Map engine names to their generator functions.
// sdxl is not yet implemented; set to null and handle below.
const GENERATORS = {
  'flux-schnell': require('./engines/flux').generateFluxSchnell,
  'flux-dev':     require('./engines/flux').generateFluxDev,
  'dalle3':       require('./engines/dalle3').generate,
  'ideogram':     require('./engines/ideogram').generate,
  [ENGINE.SDXL]:  null,
};

/**
 * Select the best engine for a generation job.
 *
 * Priority order:
 *   1. hasTypography → routing_rules.typography ('ideogram')
 *   2. isPremium     → routing_rules.premium    ('dalle3')
 *   3. isBatch       → routing_rules.batch      ('flux-schnell')
 *   4. isQuality     → routing_rules.quality    ('flux-dev')
 *   5. fallback      → routing_rules.fallback   ('sdxl')
 *
 * @param {Object} job - { prompt, artist, silo, flags: { hasTypography, isPremium, isBatch, isQuality } }
 * @returns {string} engine name: 'flux-schnell'|'flux-dev'|'dalle3'|'ideogram'|'sdxl'
 */
function selectEngine(job) {
  const flags = (job && job.flags) || {};

  if (flags.hasTypography) return routingRules.typography;
  if (flags.isPremium)     return routingRules.premium;
  if (flags.isBatch)       return routingRules.batch;
  if (flags.isQuality)     return routingRules.quality;
  return routingRules.fallback;
}

/**
 * Route job to the correct generator and call it.
 *
 * If the selected engine is 'sdxl' (not yet implemented), falls back to
 * 'flux-schnell' with a logger warning.
 *
 * @param {Object} job - same as selectEngine input, plus { options: {width, height, outputId} }
 * @returns {Promise<{id, file_path, engine, width, height, prompt, url}>}
 */
async function routeAndGenerate(job) {
  let engine = selectEngine(job);

  // SDXL is not yet implemented — fall back to flux-schnell
  if (engine === ENGINE.SDXL || GENERATORS[engine] === null) {
    logger.warn('Engine not yet implemented, falling back to flux-schnell', { engine, fallback: 'flux-schnell' });
    engine = 'flux-schnell';
  }

  const generator = GENERATORS[engine];
  if (!generator) {
    throw new Error(`[router] No generator found for engine "${engine}"`);
  }

  const prompt = (job && job.prompt) || '';
  const options = (job && job.options) || {};

  try {
    return await generator(prompt, options);
  } catch (err) {
    throw new Error(`Router: generator "${engine}" failed — ${err.message}`);
  }
}

module.exports = { selectEngine, routeAndGenerate, ENGINE };
