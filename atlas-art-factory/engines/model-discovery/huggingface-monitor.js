'use strict';

const axios = require('axios');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('hf-monitor');

const HF_API = 'https://huggingface.co/api/models';
const MIN_DOWNLOADS = 1000;

async function scanHuggingFace() {
  logger.info('Scanning HuggingFace for new text-to-image models');

  const { data: models } = await axios.get(HF_API, {
    params: { pipeline_tag: 'text-to-image', sort: 'downloads', direction: -1, limit: 50 },
  });

  const qualified = models.filter(m => (m.downloads || 0) >= MIN_DOWNLOADS);

  const { rows: existing } = await query(
    `SELECT model_id FROM discovered_models WHERE source = 'huggingface'`
  );
  const knownIds = new Set(existing.map(r => r.model_id));

  let newCount = 0;
  for (const model of qualified) {
    const modelId = model.modelId || model.id;
    if (knownIds.has(modelId)) continue;

    await query(
      `INSERT INTO discovered_models (model_id, source, name, description, status)
       VALUES ($1, 'huggingface', $2, $3, 'discovered')
       ON CONFLICT (model_id) DO NOTHING`,
      [modelId, modelId.split('/').pop(), model.description || '']
    );
    newCount++;
  }

  logger.info('HuggingFace scan complete', { models_found: qualified.length, new_models: newCount });
  return { models_found: qualified.length, new_models: newCount };
}

module.exports = { scanHuggingFace };
