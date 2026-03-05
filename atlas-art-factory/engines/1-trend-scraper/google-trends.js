'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const googleTrends = require('google-trends-api');
const { createLogger } = require('../../core/logger');

const logger = createLogger('google-trends-scraper');

// How many days back to look for trend data
const TREND_WINDOW_DAYS = 7;

/**
 * Scrape Google Trends interest data for an array of keywords.
 *
 * @param {string[]} keywords - Art-related search terms
 * @returns {Array<object>} Normalized trend records ready for saveTrends()
 */
async function scrapeGoogleTrends(keywords) {
  const results = [];

  for (const keyword of keywords) {
    try {
      const startTime = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      // Get interest over time
      const rawInterest = await googleTrends.interestOverTime({
        keyword,
        startTime,
        hl: 'en-US',
        geo: 'US',
      });

      const interestData = JSON.parse(rawInterest);
      const timelineData = interestData?.default?.timelineData || [];

      // Compute average value over window
      const values = timelineData.map(d => d.value[0]);
      const avgValue = values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0;

      // Latest trend direction (rising/stable/falling)
      let trend = 'stable';
      if (values.length >= 2) {
        const recent = values.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
        const earlier = values.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
        if (recent > earlier * 1.15) trend = 'rising';
        else if (recent < earlier * 0.85) trend = 'falling';
      }

      // Get related queries (best effort)
      let relatedTerms = [];
      try {
        const rawRelated = await googleTrends.relatedQueries({ keyword, hl: 'en-US', geo: 'US' });
        const relatedData = JSON.parse(rawRelated);
        const top = relatedData?.default?.rankedList?.[0]?.rankedKeyword || [];
        relatedTerms = top.slice(0, 5).map(item => item.query);
      } catch (e) {
        logger.warn(`Could not fetch related queries for "${keyword}"`, { error: e.message });
      }

      results.push({
        platform: 'google-trends',
        listing_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=US`,
        title: keyword,
        keywords: [keyword, ...relatedTerms],
        tags: relatedTerms,
        sales_count: null,
        favorites: null,
        price: null,
        // Store trend metadata in description field
        description: JSON.stringify({ avgValue, trend, windowDays: TREND_WINDOW_DAYS, relatedTerms }),
        style: trend,
        subject: keyword,
      });

      logger.info(`Google Trends: ${keyword} — avg ${avgValue}, trend: ${trend}`);

      // Be polite — small delay between requests
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      logger.error(`Failed to scrape Google Trends for "${keyword}"`, { error: err.message });
      // Continue with next keyword — don't let one failure abort the whole run
    }
  }

  logger.info(`Google Trends scrape complete`, { keywords: keywords.length, results: results.length });
  return results;
}

/**
 * Get the top art keywords from the silos config for trend scraping.
 * Returns a flattened array of keywords from all silos.
 *
 * @param {number} maxPerSilo - Max keywords to take per silo (default 3)
 * @returns {string[]} Keyword list
 */
function getArtKeywords(maxPerSilo = 3) {
  const { loadConfig } = require('../../core/config');
  const config = loadConfig();
  const silos = Array.isArray(config.silos) ? config.silos : [];

  const keywords = new Set();
  for (const silo of silos) {
    const siloKeywords = silo.keywords || [];
    siloKeywords.slice(0, maxPerSilo).forEach(k => keywords.add(k));
  }
  return [...keywords];
}

module.exports = { scrapeGoogleTrends, getArtKeywords };
