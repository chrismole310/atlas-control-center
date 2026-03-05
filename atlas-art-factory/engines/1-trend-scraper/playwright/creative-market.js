'use strict';

const { newPage, navigate } = require('./scraper-base');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('creative-market-scraper');

const CREATIVE_MARKET_URL = 'https://creativemarket.com/graphics?sort=sales';
const MAX_ITEMS = 20;

/**
 * Scrape Creative Market top-selling graphics.
 * @param {Browser} browser - Playwright browser instance
 * @returns {Array<object>} Trend records
 */
async function scrapeCreativeMarket(browser) {
  const page = await newPage(browser);
  try {
    await navigate(page, CREATIVE_MARKET_URL);
    await page.waitForSelector('[class*="product"], .shop-item, article', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate((max) => {
      const cards = document.querySelectorAll('[class*="ProductItem"], [class*="product-item"], .shop-item, article');
      const results = [];
      const limit = Math.min(cards.length, max);
      for (let i = 0; i < limit; i++) {
        const card = cards[i];
        const titleEl = card.querySelector('[class*="title"], [class*="Title"], h3, h2');
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');
        const salesEl = card.querySelector('[class*="sales"], [class*="Sales"]');

        const title = titleEl?.textContent?.trim() || '';
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
        const url = linkEl?.href || '';
        const img = imgEl?.src || imgEl?.dataset?.src || '';
        const salesText = salesEl?.textContent?.trim() || '';
        const salesCount = parseInt(salesText.replace(/[^0-9]/g, '')) || null;

        if (title && url) {
          results.push({ title, price, url, img, salesCount });
        }
      }
      return results;
    }, MAX_ITEMS);

    logger.info(`Creative Market: scraped ${items.length} products`);

    return items.map(item => ({
      platform: 'creative-market',
      listing_url: item.url,
      title: item.title,
      price: item.price,
      image_urls: item.img ? [item.img] : [],
      keywords: [item.title.toLowerCase()],
      tags: [],
      favorites: null,
      views: null,
      sales_count: item.salesCount,
      category: 'graphics',
      subject: null,
      style: null,
    }));

  } catch (err) {
    logger.error('Creative Market scrape failed', { error: err.message });
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { scrapeCreativeMarket };
