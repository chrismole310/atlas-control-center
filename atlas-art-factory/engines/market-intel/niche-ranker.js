'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('niche-ranker');

function classifyCompetition(count) {
  if (count < 50) return 'low';
  if (count < 200) return 'medium';
  return 'high';
}

function estimateProfitPotential(demandScore, avgPrice, saturation) {
  const base = (demandScore / 1000) * (avgPrice || 10);
  const saturationPenalty = 1 - (saturation / 200);
  return Math.round(base * saturationPenalty * 100) / 100;
}

async function rankOpportunities(limit = 20) {
  logger.info('Ranking niche opportunities');

  const { rows: topKeywords } = await query(
    `SELECT keyword, demand_score, competition_count, avg_price, trend_direction, saturation_level
     FROM demand_scores ORDER BY demand_score DESC LIMIT $1`,
    [limit]
  );

  await query("UPDATE market_opportunities SET status = 'expired' WHERE status = 'active'");

  let ranked = 0;
  for (const kw of topKeywords) {
    ranked++;
    const competitionLevel = classifyCompetition(kw.competition_count);
    const profitPotential = estimateProfitPotential(
      parseFloat(kw.demand_score), parseFloat(kw.avg_price), parseFloat(kw.saturation_level)
    );
    const trendStrength = parseFloat(kw.demand_score) > 10000 ? 0.8 : parseFloat(kw.demand_score) > 1000 ? 0.5 : 0.2;

    await query(
      `INSERT INTO market_opportunities
        (niche, demand_score, competition_level, profit_potential, trend_strength,
         recommended_price, recommended_keywords, opportunity_rank, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [kw.keyword, parseFloat(kw.demand_score), competitionLevel, profitPotential, trendStrength,
       parseFloat(kw.avg_price) || 12.99, [kw.keyword], ranked]
    );
  }

  logger.info(`Ranked ${ranked} opportunities`);
  return { opportunities_ranked: ranked };
}

module.exports = { rankOpportunities, classifyCompetition, estimateProfitPotential };
