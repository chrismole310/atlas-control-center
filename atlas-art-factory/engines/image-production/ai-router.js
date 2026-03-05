'use strict';

const { loadConfig } = require('../../core/config');
const { createLogger } = require('../../core/logger');
const ReplicateAdapter = require('./adapters/replicate');
const DalleAdapter = require('./adapters/openai-dalle');
const IdeogramAdapter = require('./adapters/ideogram');

const logger = createLogger('ai-router');

function selectEngine(job) {
  const { engines: engConfig } = loadConfig();
  const rules = engConfig.routing_rules || {};

  // Check for typography tags
  const tags = job.tags || [];
  if (tags.some(t => ['typography', 'quotes', 'text', 'lettering'].includes(t))) {
    return rules.typography || 'ideogram';
  }

  // Check quality preference
  if (job.quality === 'premium') return rules.premium || 'dalle3';
  if (job.quality === 'excellent') return rules.quality || 'flux-dev';

  // Check explicit engine preference from artist
  if (job.preferredEngine) {
    const allEngines = engConfig.engines || {};
    if (allEngines[job.preferredEngine]?.enabled) return job.preferredEngine;
  }

  // Default: batch mode
  return rules.batch || 'flux-schnell';
}

function getAdapter(engineName) {
  const { engines: engConfig } = loadConfig();
  const allEngines = engConfig.engines || {};
  const config = allEngines[engineName];

  if (!config) {
    logger.warn(`Unknown engine: ${engineName}, falling back to sdxl`);
    return new ReplicateAdapter();
  }

  switch (config.via) {
    case 'openai':
      return new DalleAdapter();
    case 'ideogram':
      return new IdeogramAdapter();
    case 'replicate':
    default:
      return new ReplicateAdapter();
  }
}

module.exports = { selectEngine, getAdapter };
