'use strict';

const axios = require('axios');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('replicate-monitor');

const REPLICATE_API = 'https://api.replicate.com/v1/models';
const MIN_RUNS = 5000;

async function scanReplicate() {
  logger.info('Scanning Replicate for new image generation models');

  const { data } = await axios.get(REPLICATE_API, {
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    params: { visibility: 'public' },
  });

  const models = data.results || [];
  const imageModels = models.filter(m =>
    (m.description || '').toLowerCase().includes('image') ||
    (m.name || '').toLowerCase().includes('flux') ||
    (m.name || '').toLowerCase().includes('sdxl') ||
    (m.name || '').toLowerCase().includes('stable')
  );

  const qualified = imageModels.filter(m => (m.run_count || 0) >= MIN_RUNS);

  const { rows: existing } = await query(
    `SELECT model_id FROM discovered_models WHERE source = 'replicate'`
  );
  const knownIds = new Set(existing.map(r => r.model_id));

  let newCount = 0;
  for (const model of qualified) {
    const modelId = `${model.url || model.name}`;
    if (knownIds.has(modelId)) continue;

    await query(
      `INSERT INTO discovered_models (model_id, source, name, description, status)
       VALUES ($1, 'replicate', $2, $3, 'discovered')
       ON CONFLICT (model_id) DO NOTHING`,
      [modelId, model.name, model.description || '']
    );
    newCount++;
  }

  logger.info('Replicate scan complete', { models_found: qualified.length, new_models: newCount });
  return { models_found: qualified.length, new_models: newCount };
}

module.exports = { scanReplicate };
