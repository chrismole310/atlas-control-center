'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('demand-scorer');

const SCORE_THRESHOLD = 65; // Minimum score to qualify for production

/**
 * Extract search volume signal for a keyword from google-trends scraped data.
 * @param {string} keyword
 * @returns {number} 0-100 search volume
 */
async function getSearchVolume(keyword) {
  const result = await query(`
    SELECT description FROM scraped_trends
    WHERE platform = 'google-trends' AND subject = $1
    ORDER BY scraped_at DESC LIMIT 1
  `, [keyword]);

  if (!result.rows.length) return 0;
  try {
    const meta = JSON.parse(result.rows[0].description || '{}');
    return meta.avgValue || 0;
  } catch {
    return 0;
  }
}

/**
 * Extract sales velocity signal for a keyword (favorites as proxy when sales_count is null).
 * @param {string} keyword
 * @returns {number} average sales/favorites count across listings
 */
async function getSalesVelocity(keyword) {
  const result = await query(`
    SELECT AVG(COALESCE(sales_count, favorites, 0)) AS avg_sales
    FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
      AND platform IN ('etsy', 'gumroad', 'creative-market')
      AND scraped_at > NOW() - INTERVAL '7 days'
  `, [keyword]);

  return parseFloat(result.rows[0]?.avg_sales) || 0;
}

/**
 * Extract social engagement signal (Pinterest saves).
 * @param {string} keyword
 * @returns {number} average Pinterest saves for this keyword
 */
async function getSocialEngagement(keyword) {
  const result = await query(`
    SELECT AVG(COALESCE(favorites, 0)) AS avg_engagement
    FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
      AND platform = 'pinterest'
      AND scraped_at > NOW() - INTERVAL '7 days'
  `, [keyword]);

  return parseFloat(result.rows[0]?.avg_engagement) || 0;
}

/**
 * Get competition count — number of active listings with this keyword.
 * @param {string} keyword
 * @returns {number} competition count (min 1 to avoid division by zero)
 */
async function getCompetitionCount(keyword) {
  const result = await query(`
    SELECT COUNT(*) AS cnt FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
      AND scraped_at > NOW() - INTERVAL '7 days'
  `, [keyword]);

  return Math.max(parseInt(result.rows[0]?.cnt) || 1, 1);
}

/**
 * Compute normalized demand score (0-100) for a keyword.
 *
 * Formula: (SearchVolume × SalesVelocity × SocialEngagement) / CompetitionCount
 * Normalized against a theoretical maximum of 100 * 500 * 500 / 1 = 25,000,000.
 *
 * @param {string} keyword
 * @returns {object} { keyword, score, searchVolume, salesVelocity, socialEngagement, competitionCount, qualifies }
 */
async function computeDemandScore(keyword) {
  const [searchVolume, salesVelocity, socialEngagement, competitionCount] = await Promise.all([
    getSearchVolume(keyword),
    getSalesVelocity(keyword),
    getSocialEngagement(keyword),
    getCompetitionCount(keyword),
  ]);

  const rawScore = (searchVolume * salesVelocity * socialEngagement) / competitionCount;

  // Normalize: cap raw score at a reasonable max (tunable) and scale to 0-100.
  // Using 100 * 500 * 500 / 1 = 25,000,000 as theoretical max.
  const MAX_RAW = 25_000_000;
  const normalizedScore = Math.min(100, Math.round((rawScore / MAX_RAW) * 100));

  return {
    keyword,
    score: normalizedScore,
    searchVolume,
    salesVelocity,
    socialEngagement,
    competitionCount,
    qualifies: normalizedScore >= SCORE_THRESHOLD,
  };
}

/**
 * Compute demand scores for a list of keywords and persist to the demand_scores table.
 *
 * Column mapping (from schema.sql):
 *   demand_score      = normalizedScore  (not "score")
 *   search_volume     = searchVolume
 *   sales_velocity    = salesVelocity
 *   social_engagement = socialEngagement
 *   competition_count = competitionCount
 *   calculated_at     = NOW()            (not "computed_at")
 *   updated_at        = NOW()
 * Unique constraint: keyword (keyword VARCHAR(200) UNIQUE NOT NULL)
 *
 * @param {string[]} keywords
 * @returns {Array<object>} Scored keyword objects
 */
async function scoreDemand(keywords) {
  logger.info(`Computing demand scores for ${keywords.length} keywords`);
  const scores = [];

  for (const keyword of keywords) {
    try {
      const scored = await computeDemandScore(keyword);
      scores.push(scored);

      // Persist to demand_scores — column names verified against schema.sql.
      // Unique constraint is on keyword; ON CONFLICT updates all signal columns.
      await query(`
        INSERT INTO demand_scores
          (keyword, demand_score, search_volume, sales_velocity, social_engagement, competition_count, calculated_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (keyword) DO UPDATE SET
          demand_score      = EXCLUDED.demand_score,
          search_volume     = EXCLUDED.search_volume,
          sales_velocity    = EXCLUDED.sales_velocity,
          social_engagement = EXCLUDED.social_engagement,
          competition_count = EXCLUDED.competition_count,
          calculated_at     = NOW(),
          updated_at        = NOW()
      `, [
        keyword,
        scored.score,
        scored.searchVolume,
        scored.salesVelocity,
        scored.socialEngagement,
        scored.competitionCount,
      ]);

    } catch (err) {
      logger.error(`Failed to score keyword "${keyword}"`, { error: err.message });
    }
  }

  const qualified = scores.filter(s => s.qualifies).length;
  logger.info('Demand scoring complete', { total: scores.length, qualified });
  return scores;
}

/**
 * Get all distinct keywords from scraped_trends records within the last 7 days.
 * Unnests the keywords array column and deduplicates.
 * @returns {string[]}
 */
async function getAllScrapedKeywords() {
  const result = await query(`
    SELECT DISTINCT unnest(keywords) AS kw FROM scraped_trends
    WHERE scraped_at > NOW() - INTERVAL '7 days'
    ORDER BY kw
  `);
  return result.rows.map(r => r.kw).filter(Boolean);
}

module.exports = { scoreDemand, computeDemandScore, getAllScrapedKeywords, SCORE_THRESHOLD };
