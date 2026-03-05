'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('demand-calculator');

function computeScore({ search_volume, sales_velocity, social_engagement, competition_count }) {
  const sv = search_volume || 0;
  const vel = sales_velocity || 0;
  const eng = social_engagement || 0;
  const comp = Math.max(competition_count || 0, 1);
  return (sv * vel * eng) / comp;
}

async function calculateDemandScores() {
  logger.info('Calculating demand scores');

  const aggregateSQL = `
    SELECT
      kw AS keyword,
      SUM(sales_count) AS total_sales,
      SUM(favorites) AS total_favorites,
      AVG(price) AS avg_price,
      COUNT(*) AS listing_count
    FROM scraped_trends, unnest(keywords) AS kw
    WHERE scraped_at > NOW() - INTERVAL '7 days'
    GROUP BY kw
    ORDER BY SUM(sales_count) DESC NULLS LAST
    LIMIT 500
  `;

  const { rows: keywords } = await query(aggregateSQL);
  let scored = 0;

  for (const row of keywords) {
    const score = computeScore({
      search_volume: Math.round((row.total_favorites || 0) / 10),
      sales_velocity: parseFloat(row.total_sales) || 0,
      social_engagement: parseInt(row.total_favorites) || 0,
      competition_count: parseInt(row.listing_count) || 1,
    });

    const trendDirection = score > 10000 ? 'rising' : score > 1000 ? 'stable' : 'declining';
    const saturation = Math.min(100, (parseInt(row.listing_count) / 500) * 100);

    await query(
      `INSERT INTO demand_scores (keyword, search_volume, sales_velocity, social_engagement, competition_count, demand_score, trend_direction, saturation_level, avg_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (keyword) DO UPDATE SET
         search_volume = EXCLUDED.search_volume,
         sales_velocity = EXCLUDED.sales_velocity,
         social_engagement = EXCLUDED.social_engagement,
         competition_count = EXCLUDED.competition_count,
         demand_score = EXCLUDED.demand_score,
         trend_direction = EXCLUDED.trend_direction,
         saturation_level = EXCLUDED.saturation_level,
         avg_price = EXCLUDED.avg_price,
         updated_at = NOW()`,
      [
        row.keyword,
        Math.round((row.total_favorites || 0) / 10),
        parseFloat(row.total_sales) || 0,
        parseInt(row.total_favorites) || 0,
        parseInt(row.listing_count) || 1,
        score,
        trendDirection,
        saturation,
        parseFloat(row.avg_price) || 0,
      ]
    );
    scored++;
  }

  logger.info(`Scored ${scored} keywords`);
  return { keywords_scored: scored };
}

module.exports = { calculateDemandScores, computeScore };
