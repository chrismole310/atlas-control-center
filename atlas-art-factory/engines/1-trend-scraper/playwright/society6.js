'use strict';

const { newPage, navigate } = require('./scraper-base');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('society6-scraper');

const SOCIETY6_URL = 'https://society6.com/prints/wall-art';
const MAX_ITEMS = 20;

/**
 * Scrape Society6 wall art prints.
 * @param {Browser} browser - Playwright browser instance
 * @returns {Array<object>} Trend records
 */
async function scrapeSociety6(browser) {
  const page = await newPage(browser);
  try {
    await navigate(page, SOCIETY6_URL);
    await page.waitForSelector('[class*="ProductCard"], [class*="product-card"], article', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate((max) => {
      const cards = document.querySelectorAll('[class*="ProductCard"], [class*="product-card"], .product-item, article');
      const results = [];
      const limit = Math.min(cards.length, max);
      for (let i = 0; i < limit; i++) {
        const card = cards[i];
        const titleEl = card.querySelector('[class*="title"], [class*="Title"], h3, h2');
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');

        const title = titleEl?.textContent?.trim() || '';
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
        const url = linkEl?.href || '';
        const img = imgEl?.src || imgEl?.dataset?.src || '';

        if (title && url) {
          results.push({ title, price, url, img });
        }
      }
      return results;
    }, MAX_ITEMS);

    logger.info(`Society6: scraped ${items.length} products`);

    return items.map(item => ({
      platform: 'society6',
      listing_url: item.url,
      title: item.title,
      price: item.price,
      image_urls: item.img ? [item.img] : [],
      keywords: [item.title.toLowerCase()],
      tags: [],
      favorites: null,
      views: null,
      sales_count: null,
      category: 'wall-art',
      subject: null,
      style: null,
    }));

  } catch (err) {
    logger.error('Society6 scrape failed', { error: err.message });
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { scrapeSociety6 };
