'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('silo-updater');

const DAILY_TARGET = 200;
const MIN_SLOTS_PER_SILO = 1;
const DEFAULT_DEMAND_SCORE = 50;

/**
 * Distribute totalSlots proportionally across siloScores, ensuring each gets >= minSlots.
 * @param {Array<{id, score}>} siloScores
 * @param {number} totalSlots
 * @param {number} minSlots
 * @returns {Map<id, slots>}
 */
function distributeSlots(siloScores, totalSlots, minSlots) {
  const result = new Map();

  if (!siloScores || siloScores.length === 0) {
    return result;
  }

  const count = siloScores.length;

  // Step 1: Assign minSlots to every silo (clamp to prevent sum exceeding totalSlots)
  const effectiveMin = count > 0 ? Math.min(minSlots, Math.floor(totalSlots / count)) : minSlots;
  for (const silo of siloScores) {
    result.set(silo.id, effectiveMin);
  }

  // Step 2: Remaining slots after minimum allocation
  const remaining = totalSlots - count * effectiveMin;

  if (remaining <= 0) {
    // Nothing more to distribute — already at or above totalSlots
    return result;
  }

  // Step 3: Compute total score (treat non-positive scores as 0 for proportioning)
  const totalScore = siloScores.reduce((sum, s) => sum + Math.max(0, s.score), 0);

  if (totalScore === 0) {
    // All scores are 0 or negative — distribute remaining evenly
    const perSilo = Math.floor(remaining / count);
    let leftover = remaining - perSilo * count;

    for (const silo of siloScores) {
      result.set(silo.id, result.get(silo.id) + perSilo);
    }

    // Step 4: Distribute leftover 1-at-a-time (arbitrary order when scores are all 0)
    for (let i = 0; i < leftover; i++) {
      const silo = siloScores[i];
      result.set(silo.id, result.get(silo.id) + 1);
    }

    return result;
  }

  // Step 3 cont: Proportional allocation — floor first, then handle rounding remainder
  const proportionalExtra = siloScores.map(silo => {
    const raw = Math.max(0, silo.score) / totalScore * remaining;
    return { id: silo.id, score: silo.score, raw, floored: Math.floor(raw) };
  });

  let distributed = 0;
  for (const entry of proportionalExtra) {
    result.set(entry.id, result.get(entry.id) + entry.floored);
    distributed += entry.floored;
  }

  // Step 4: Distribute any rounding remainder 1 slot at a time to highest-scoring silos
  let remainder = remaining - distributed;
  if (remainder > 0) {
    // Sort by fractional part descending, break ties by score descending
    const sorted = [...proportionalExtra].sort((a, b) => {
      const fracA = a.raw - a.floored;
      const fracB = b.raw - b.floored;
      if (Math.abs(fracB - fracA) > 1e-9) return fracB - fracA;
      return b.score - a.score;
    });

    for (let i = 0; i < remainder; i++) {
      const entry = sorted[i];
      result.set(entry.id, result.get(entry.id) + 1);
    }
  }

  return result;
}

/**
 * Compute average demand score for a silo based on its keywords.
 * @param {number} siloId
 * @returns {Promise<number>} average demand score, or DEFAULT_DEMAND_SCORE if none
 */
async function getSiloDemandScore(siloId) {
  const result = await query(`
    SELECT AVG(ds.demand_score) AS avg_score
    FROM silo_keywords sk
    JOIN demand_scores ds ON ds.keyword = sk.keyword
    WHERE sk.silo_id = $1
      AND ds.demand_score IS NOT NULL
  `, [siloId]);

  const row = result.rows[0];
  if (!row || row.avg_score === null || row.avg_score === undefined) {
    return DEFAULT_DEMAND_SCORE;
  }

  const score = parseFloat(row.avg_score);
  return isNaN(score) ? DEFAULT_DEMAND_SCORE : score;
}

/**
 * Reallocate target_daily_output across all active silos by demand score.
 * @returns {Promise<Array<{silo_id, silo_name, old_slots, new_slots, demand_score}>>}
 */
async function updateSiloPriorities() {
  logger.info('Updating silo priorities by demand score');

  // Step 1: Get all active silos
  const silosResult = await query(`
    SELECT id, name, target_daily_output, priority
    FROM silos
    WHERE status = 'active'
    ORDER BY id ASC
  `);

  const silos = silosResult.rows;

  if (!silos.length) {
    logger.info('No active silos found');
    return [];
  }

  // Step 2: Fetch demand score for each silo
  const siloScores = [];
  const demandMap = new Map();

  for (const silo of silos) {
    let score;
    try {
      score = await getSiloDemandScore(silo.id);
    } catch (err) {
      logger.warn(`Failed to get demand score for silo ${silo.id}, using default`, err);
      score = DEFAULT_DEMAND_SCORE;
    }
    demandMap.set(silo.id, score);
    siloScores.push({ id: silo.id, score });
  }

  // Step 3 + 4 + 5: Distribute 200 slots proportionally, min 1, sum = 200
  const allocationMap = distributeSlots(siloScores, DAILY_TARGET, MIN_SLOTS_PER_SILO);

  // Step 6: UPDATE silos table and build result array
  const results = [];

  for (const silo of silos) {
    const newSlots = allocationMap.get(silo.id) ?? MIN_SLOTS_PER_SILO;
    const oldSlots = parseInt(silo.target_daily_output) || 0;
    const demandScore = demandMap.get(silo.id);

    try {
      await query(`
        UPDATE silos
        SET target_daily_output = $1, updated_at = NOW()
        WHERE id = $2
      `, [newSlots, silo.id]);
      results.push({
        silo_id: silo.id,
        silo_name: silo.name,
        old_slots: oldSlots,
        new_slots: newSlots,
        demand_score: demandScore,
      });
    } catch (err) {
      logger.error(`Failed to update silo ${silo.id}`, err);
    }
  }

  // Step 7: Sort by new_slots DESC
  results.sort((a, b) => b.new_slots - a.new_slots);

  logger.info(`Updated ${results.length} silos, total slots = ${results.reduce((s, r) => s + r.new_slots, 0)}`);
  return results;
}

module.exports = { updateSiloPriorities, getSiloDemandScore, distributeSlots };
