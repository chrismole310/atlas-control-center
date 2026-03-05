'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('pricing-engine');

const FLOOR_PRICE = 3.99;
const CEILING_PRICE = 49.99;

const PRICING_TIERS = {
  premium: { minQuality: 90, multiplier: 1.3 },
  standard: { minQuality: 75, multiplier: 1.0 },
  value: { minQuality: 0, multiplier: 0.8 },
};

function getPricingTier(qualityScore) {
  if (qualityScore >= PRICING_TIERS.premium.minQuality) return 'premium';
  if (qualityScore >= PRICING_TIERS.standard.minQuality) return 'standard';
  return 'value';
}

async function calculatePrice({ siloId, qualityScore, artworkId }) {
  logger.info('Calculating price', { siloId, qualityScore, artworkId });

  const { rows: priceData } = await query(
    `SELECT
       AVG(price) AS avg_price,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
       MIN(price) AS min_price,
       MAX(price) AS max_price
     FROM scraped_trends
     WHERE category IN (SELECT name FROM silos WHERE id = $1)
       AND price > 0`,
    [siloId]
  );

  const { rows: demandData } = await query(
    `SELECT AVG(demand_score) AS demand_score
     FROM demand_scores
     WHERE silo_id = $1`,
    [siloId]
  );

  const competitorMedian = priceData[0]?.median_price || 9.99;
  const demandScore = demandData[0]?.demand_score || 50;

  let basePrice = Number(competitorMedian);

  const tier = getPricingTier(qualityScore);
  basePrice *= PRICING_TIERS[tier].multiplier;

  if (demandScore > 80) {
    basePrice *= 1.15;
  } else if (demandScore > 60) {
    basePrice *= 1.05;
  } else if (demandScore < 30) {
    basePrice *= 0.9;
  }

  let finalPrice = Math.round(basePrice) - 0.01;
  finalPrice = Math.max(FLOOR_PRICE, Math.min(CEILING_PRICE, finalPrice));

  logger.info('Price calculated', { basePrice: competitorMedian, tier, demandScore, finalPrice });
  return finalPrice;
}

module.exports = { calculatePrice, getPricingTier, FLOOR_PRICE, CEILING_PRICE };
