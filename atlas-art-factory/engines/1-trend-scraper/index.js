'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const { scrapeGoogleTrends, getArtKeywords } = require('./google-trends');
const { scrapeEtsy } = require('./etsy');
const { scrapePinterest } = require('./pinterest');
const { launchBrowser } = require('./playwright/scraper-base');
const { scrapeGumroad } = require('./playwright/gumroad');
const { scrapeRedbubble } = require('./playwright/redbubble');
const { scrapeSociety6 } = require('./playwright/society6');
const { scrapeCreativeMarket } = require('./playwright/creative-market');
const { enrichWithColors } = require('./image-analyzer');
const { saveTrends } = require('./trend-db');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-scraper-engine');

/**
 * Run a full scrape of all 7 platforms.
 * Orchestrated sequence:
 *   1. Get art keywords from silos config
 *   2. Run API scrapers (Google Trends, Etsy, Pinterest) in parallel
 *   3. Run Playwright scrapers in sequence (shared browser)
 *   4. Enrich records with color analysis
 *   5. Save all results to scraped_trends
 *
 * @param {object} options
 * @param {number} options.maxKeywords - Max keywords per silo to scrape (default 3)
 * @param {boolean} options.skipPlaywright - Skip browser scrapers (for testing/speed)
 * @param {boolean} options.skipColorAnalysis - Skip image color extraction
 * @returns {object} Summary { total, saved, errors }
 */
async function runFullScrape(options = {}) {
  const {
    maxKeywords = 3,
    skipPlaywright = false,
    skipColorAnalysis = false,
  } = options;

  logger.info('Starting full trend scrape');
  const startTime = Date.now();
  const allRecords = [];
  const errors = [];

  // --- Step 1: Get keywords ---
  const keywords = getArtKeywords(maxKeywords);
  // Use first 20 keywords to keep runtime reasonable
  const scrapeKeywords = keywords.slice(0, 20);
  logger.info(`Scraping ${scrapeKeywords.length} keywords across 7 platforms`);

  // --- Step 2: API scrapers in parallel ---
  const [googleResults, etsyResults, pinterestResults] = await Promise.allSettled([
    scrapeGoogleTrends(scrapeKeywords),
    scrapeEtsy(scrapeKeywords),
    scrapePinterest(scrapeKeywords),
  ]);

  for (const [name, result] of [
    ['google-trends', googleResults],
    ['etsy', etsyResults],
    ['pinterest', pinterestResults],
  ]) {
    if (result.status === 'fulfilled') {
      allRecords.push(...result.value);
    } else {
      logger.error(`${name} scraper failed`, { error: result.reason?.message });
      errors.push({ platform: name, error: result.reason?.message });
    }
  }

  // --- Step 3: Playwright scrapers ---
  if (!skipPlaywright) {
    let browser = null;
    try {
      browser = await launchBrowser();
      const playwrightScrapers = [
        { name: 'gumroad', fn: () => scrapeGumroad(browser) },
        { name: 'redbubble', fn: () => scrapeRedbubble(browser) },
        { name: 'society6', fn: () => scrapeSociety6(browser) },
        { name: 'creative-market', fn: () => scrapeCreativeMarket(browser) },
      ];

      for (const { name, fn } of playwrightScrapers) {
        try {
          const results = await fn();
          allRecords.push(...results);
          logger.info(`${name}: ${results.length} records`);
        } catch (err) {
          logger.error(`${name} scraper failed`, { error: err.message });
          errors.push({ platform: name, error: err.message });
        }
      }
    } finally {
      if (browser) {
        await browser.close().catch(err => logger.warn('Browser close error', { error: err.message }));
      }
    }
  }

  // --- Step 4: Color analysis ---
  let finalRecords = allRecords;
  if (!skipColorAnalysis && allRecords.length > 0) {
    logger.info(`Enriching ${allRecords.length} records with color analysis`);
    finalRecords = await enrichWithColors(allRecords);
  }

  // --- Step 5: Save ---
  const saved = await saveTrends(finalRecords);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const summary = {
    total: allRecords.length,
    saved,
    errors: errors.length,
    elapsed: `${elapsed}s`,
  };
  logger.info('Full trend scrape complete', summary);
  return summary;
}

module.exports = { runFullScrape };
