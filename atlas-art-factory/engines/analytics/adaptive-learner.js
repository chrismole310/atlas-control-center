'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('adaptive-learner');

const WINNER_BOOST = 1.20;
const LOSER_PENALTY = 0.50;

async function adjustSiloPriorities() {
  logger.info('Adjusting silo priorities based on performance');

  const { rows: silos } = await query(
    `SELECT s.id, s.name, s.priority, s.avg_conversion
     FROM silos s WHERE s.status = 'active'
     ORDER BY s.avg_conversion DESC NULLS LAST`
  );

  if (silos.length === 0) return { silos_adjusted: 0 };

  const conversions = silos.map(s => s.avg_conversion || 0).sort((a, b) => a - b);
  const medianIdx = Math.floor(conversions.length * 0.5);
  const median = conversions[medianIdx] || 0;

  let adjusted = 0;
  for (const silo of silos) {
    const conversion = silo.avg_conversion || 0;
    let newPriority;

    if (conversion > median && conversion > 0) {
      newPriority = Math.min(100, Math.round(silo.priority * WINNER_BOOST));
    } else if (conversion < median * 0.5) {
      newPriority = Math.max(1, Math.round(silo.priority * LOSER_PENALTY));
    } else {
      newPriority = silo.priority;
    }

    if (newPriority !== silo.priority) {
      await query(
        `UPDATE silos SET priority = $1, updated_at = NOW() WHERE id = $2`,
        [newPriority, silo.id]
      );
    }
    adjusted++;
  }

  logger.info('Silo priorities adjusted', { silos_adjusted: adjusted });
  return { silos_adjusted: adjusted };
}

module.exports = { adjustSiloPriorities };
