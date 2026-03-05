'use strict';

const { createLogger } = require('../../core/logger');
const { loadConfig } = require('../../core/config');
const { insertTrends } = require('./trend-store');
const EtsyScraper = require('./scrapers/etsy');
const GoogleTrendsScraper = require('./scrapers/google-trends');
const PlaywrightScraper = require('./scrapers/playwright-scraper');

const logger = createLogger('trend-scraper');

function getSearchKeywords() {
  try {
    const config = loadConfig();
    const silos = Array.isArray(config.silos) ? config.silos : (config.silos?.silos || []);
    const keywords = new Set();
    for (const silo of silos) {
      if (Array.isArray(silo.keywords)) {
        silo.keywords.forEach(k => keywords.add(k));
      }
    }
    return [...keywords];
  } catch {
    return ['wall art print', 'digital download art', 'printable wall art'];
  }
}

async function runTrendScraper() {
  logger.info('Starting trend scraper run');
  const allKeywords = getSearchKeywords();
  const keywordSample = allKeywords.slice(0, 20);

  const summary = { total_scraped: 0, google_trends: 0, platforms: {} };
  const allTrends = [];

  // 1. Etsy API scraper
  try {
    const etsy = new EtsyScraper();
    const etsyResults = await etsy.scrape(keywordSample.slice(0, 10));
    allTrends.push(...etsyResults);
    summary.platforms.etsy = etsyResults.length;
    logger.info(`Etsy: ${etsyResults.length} trends`);
  } catch (err) {
    logger.error('Etsy scraper failed', { error: err.message });
    summary.platforms.etsy = 0;
  }

  // 2. Playwright scrapers
  const playwrightPlatforms = ['gumroad', 'redbubble', 'society6', 'creative-market'];
  for (const platform of playwrightPlatforms) {
    try {
      const scraper = new PlaywrightScraper(platform);
      const results = await scraper.scrape(keywordSample.slice(0, 5));
      allTrends.push(...results);
      summary.platforms[platform] = results.length;
      logger.info(`${platform}: ${results.length} trends`);
    } catch (err) {
      logger.error(`${platform} scraper failed`, { error: err.message });
      summary.platforms[platform] = 0;
    }
  }

  // 3. Store marketplace trends
  if (allTrends.length > 0) {
    const inserted = await insertTrends(allTrends);
    summary.total_scraped = inserted;
    logger.info(`Stored ${inserted} trends total`);
  }

  // 4. Google Trends (feeds demand_scores, not scraped_trends)
  try {
    const gt = new GoogleTrendsScraper();
    const trendData = await gt.scrape(keywordSample.slice(0, 10));
    summary.google_trends = trendData.length;
    logger.info(`Google Trends: ${trendData.length} keyword analyses`);
  } catch (err) {
    logger.error('Google Trends scraper failed', { error: err.message });
  }

  logger.info('Trend scraper run complete', summary);
  return summary;
}

module.exports = { runTrendScraper, getSearchKeywords };
