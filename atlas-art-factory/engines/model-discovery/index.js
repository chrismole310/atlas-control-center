'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { scanHuggingFace } = require('./huggingface-monitor');
const { scanReplicate } = require('./replicate-monitor');
const { benchmarkModel } = require('./benchmarker');
const { registerPassingModels } = require('./auto-registrar');

const logger = createLogger('model-discovery');

async function runModelDiscovery() {
  logger.info('Starting model discovery run');

  // Scan registries
  const huggingface = await scanHuggingFace();
  const replicate = await scanReplicate();

  // Benchmark newly discovered models
  const { rows: newModels } = await query(
    `SELECT model_id, source FROM discovered_models WHERE status = 'discovered' LIMIT 10`
  );

  let benchmarked = 0;
  for (const model of newModels) {
    try {
      await benchmarkModel({ modelId: model.model_id, source: model.source });
      benchmarked++;
    } catch (err) {
      logger.error(`Benchmark failed for ${model.model_id}`, { error: err.message });
    }
  }

  // Register passing models
  const registration = await registerPassingModels();

  const summary = { huggingface, replicate, benchmarked, registration };
  logger.info('Model discovery run complete', summary);
  return summary;
}

module.exports = { runModelDiscovery };
