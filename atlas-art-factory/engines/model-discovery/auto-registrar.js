'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('auto-registrar');

const MIN_OVERALL_SCORE = 60;
const MAX_SPEED_MS = 15000;

async function registerPassingModels() {
  logger.info('Checking benchmarked models for registration');

  const { rows: models } = await query(
    `SELECT id, model_id, source, overall_score, avg_speed_ms, cost_per_image
     FROM discovered_models
     WHERE status = 'benchmarked'
     ORDER BY overall_score DESC`
  );

  let registered = 0;
  let rejected = 0;

  for (const model of models) {
    const passes = model.overall_score >= MIN_OVERALL_SCORE && model.avg_speed_ms <= MAX_SPEED_MS;

    if (passes) {
      await query(
        `UPDATE discovered_models SET status = 'registered' WHERE id = $1`,
        [model.id]
      );
      registered++;
      logger.info(`Registered model: ${model.model_id}`, { score: model.overall_score });
    } else {
      await query(
        `UPDATE discovered_models SET status = 'rejected' WHERE id = $1`,
        [model.id]
      );
      rejected++;
      logger.debug(`Rejected model: ${model.model_id}`, { score: model.overall_score, speed: model.avg_speed_ms });
    }
  }

  logger.info('Auto-registration complete', { registered, rejected });
  return { registered, rejected };
}

module.exports = { registerPassingModels };
