'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('opportunity-ranker');

const DEMAND_THRESHOLD = 65;
const TOP_N = 20;
const DEFAULT_PRICE = 14.99;
const DEFAULT_STYLE = 'modern';

// Style keywords to scan for in title/tags
const STYLE_KEYWORDS = [
  'watercolor', 'minimalist', 'boho', 'bohemian', 'vintage', 'retro',
  'abstract', 'geometric', 'floral', 'botanical', 'illustration',
  'line art', 'nordic', 'scandinavian', 'cottagecore', 'aesthetic',
  'pastel', 'monochrome', 'sketch', 'folk', 'art deco', 'surreal',
];

/**
 * Detect a style keyword from a text string (title or combined tags).
 * Returns the first matching style or null.
 * @param {string} text
 * @returns {string|null}
 */
function detectStyle(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const style of STYLE_KEYWORDS) {
    if (lower.includes(style)) return style;
  }
  return null;
}

/**
 * Compute recommended price for a keyword from scraped_trends median price.
 * @param {string} keyword
 * @returns {Promise<number>} median price (default 14.99 if no data)
 */
async function getRecommendedPrice(keyword) {
  const result = await query(`
    SELECT price FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
      AND price IS NOT NULL
    ORDER BY price ASC
  `, [keyword]);

  const rows = result.rows;
  if (!rows.length) return DEFAULT_PRICE;

  const prices = rows.map(r => parseFloat(r.price)).filter(p => !isNaN(p) && p > 0);
  if (!prices.length) return DEFAULT_PRICE;

  const mid = Math.floor(prices.length / 2);
  if (prices.length % 2 === 1) {
    return prices[mid];
  }
  // Even count: average the two middle values
  return parseFloat(((prices[mid - 1] + prices[mid]) / 2).toFixed(2));
}

/**
 * Get top tags/keywords for a niche from scraped_trends.
 * @param {string} keyword
 * @param {number} limit
 * @returns {Promise<string[]>} array of top tags (deduplicated)
 */
async function getTopKeywords(keyword, limit = 10) {
  const result = await query(`
    SELECT tags, keywords FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
    ORDER BY COALESCE(favorites, 0) + COALESCE(sales_count, 0) DESC
    LIMIT 50
  `, [keyword]);

  const seen = new Set();
  const merged = [];

  for (const row of result.rows) {
    const sources = [
      ...(Array.isArray(row.tags) ? row.tags : []),
      ...(Array.isArray(row.keywords) ? row.keywords : []),
    ];
    for (const tag of sources) {
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        merged.push(tag);
      }
    }
  }

  return merged.slice(0, limit);
}

/**
 * Detect the recommended style for a keyword from scraped_trends.
 * Picks the style associated with the highest-engagement listing.
 * @param {string} keyword
 * @returns {Promise<string>}
 */
async function getRecommendedStyle(keyword) {
  const result = await query(`
    SELECT title, tags, style,
           COALESCE(favorites, 0) + COALESCE(sales_count, 0) AS engagement
    FROM scraped_trends
    WHERE (keywords @> ARRAY[$1]::text[] OR subject = $1)
    ORDER BY engagement DESC
    LIMIT 10
  `, [keyword]);

  for (const row of result.rows) {
    // Prefer the explicit style column if populated
    if (row.style) return row.style;

    // Otherwise scan title and tags
    const tagText = Array.isArray(row.tags) ? row.tags.join(' ') : '';
    const detected = detectStyle(row.title + ' ' + tagText);
    if (detected) return detected;
  }

  return DEFAULT_STYLE;
}

/**
 * Rank top 20 niches by demand score and store as market_opportunities.
 * @returns {Promise<Array>} top 20 opportunities sorted by demand_score desc
 */
async function rankOpportunities() {
  logger.info('Ranking top opportunities from demand_scores');

  // 1. Read qualifying demand scores
  const demandResult = await query(`
    SELECT keyword, demand_score, competition_count, avg_price, trend_direction, saturation_level
    FROM demand_scores
    WHERE demand_score >= $1
    ORDER BY demand_score DESC
    LIMIT $2
  `, [DEMAND_THRESHOLD, TOP_N]);

  const rows = demandResult.rows;

  if (!rows.length) {
    logger.info('No qualifying demand scores found');
    return [];
  }

  const opportunities = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { keyword, demand_score, competition_count, avg_price, trend_direction, saturation_level } = row;
    const rank = i + 1;

    // Compute enriched fields in parallel
    const [recommendedPrice, topKeywords, recommendedStyle] = await Promise.all([
      getRecommendedPrice(keyword),
      getTopKeywords(keyword, 10),
      getRecommendedStyle(keyword),
    ]);

    // Determine competition level from competition_count
    const competitionCount = parseInt(competition_count) || 0;
    let competitionLevel;
    if (competitionCount < 50) {
      competitionLevel = 'low';
    } else if (competitionCount < 200) {
      competitionLevel = 'medium';
    } else {
      competitionLevel = 'high';
    }

    // Derive profit_potential from demand_score and price
    const profitPotential = parseFloat(((parseFloat(demand_score) / 100) * recommendedPrice).toFixed(2));

    // trend_strength from saturation_level (inverse — lower saturation = higher strength)
    const trendStrength = parseFloat(saturation_level) > 0
      ? parseFloat((100 - Math.min(100, parseFloat(saturation_level))).toFixed(2))
      : 50;

    // Upsert into market_opportunities — delete existing niche entry then insert
    await query(`
      DELETE FROM market_opportunities WHERE niche = $1
    `, [keyword]);

    await query(`
      INSERT INTO market_opportunities
        (niche, demand_score, competition_level, profit_potential, trend_strength,
         recommended_price, recommended_styles, recommended_keywords, opportunity_rank,
         status, identified_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW(), NOW())
    `, [
      keyword,
      demand_score,
      competitionLevel,
      profitPotential,
      trendStrength,
      recommendedPrice,
      [recommendedStyle],
      topKeywords,
      rank,
    ]);

    opportunities.push({
      niche: keyword,
      demand_score: parseFloat(demand_score),
      competition_level: competitionLevel,
      profit_potential: profitPotential,
      trend_strength: trendStrength,
      recommended_price: recommendedPrice,
      recommended_styles: [recommendedStyle],
      recommended_keywords: topKeywords,
      opportunity_rank: rank,
      status: 'active',
    });
  }

  logger.info(`Ranked and stored ${opportunities.length} opportunities`);
  return opportunities;
}

module.exports = { rankOpportunities, getRecommendedPrice, getTopKeywords };
