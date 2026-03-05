'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('silo-prioritizer');

function allocateSlots(silos, dailyTarget = 200) {
  const totalPriority = silos.reduce((sum, s) => sum + (s.priority || 1), 0);
  return silos.map(silo => ({
    id: silo.id,
    name: silo.name,
    allocation: Math.max(1, Math.round((silo.priority / totalPriority) * dailyTarget)),
  }));
}

async function updateSiloPriorities() {
  logger.info('Updating silo priorities');

  const { rows: silos } = await query(
    "SELECT id, name, priority, total_sales, total_artworks, total_revenue FROM silos WHERE status = 'active'"
  );

  let updated = 0;
  for (const silo of silos) {
    const artworks = parseInt(silo.total_artworks) || 1;
    const sales = parseInt(silo.total_sales) || 0;
    const conversionRate = sales / artworks;

    let newPriority = silo.priority;
    if (conversionRate > 0.1) {
      newPriority = Math.min(100, Math.round(silo.priority * 1.2));
    } else if (conversionRate < 0.01 && artworks > 20) {
      newPriority = Math.max(10, Math.round(silo.priority * 0.5));
    }

    await query(
      'UPDATE silos SET priority = $1, performance_score = $2, updated_at = NOW() WHERE id = $3',
      [newPriority, Math.round(conversionRate * 10000) / 100, silo.id]
    );
    updated++;
  }

  logger.info(`Updated ${updated} silo priorities`);
  return { silos_updated: updated };
}

module.exports = { updateSiloPriorities, allocateSlots };
