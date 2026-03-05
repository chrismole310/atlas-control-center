'use strict';

const { newPage, navigate } = require('./scraper-base');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('gumroad-scraper');

const GUMROAD_URL = 'https://gumroad.com/discover?category=Design+Assets&sort=hot';
const MAX_ITEMS = 20;

/**
 * Scrape Gumroad trending design products.
 * @param {Browser} browser - Playwright browser instance
 * @returns {Array<object>} Trend records
 */
async function scrapeGumroad(browser) {
  const page = await newPage(browser);
  try {
    await navigate(page, GUMROAD_URL);
    await page.waitForSelector('[data-testid="product-card"], .product-card, article', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate((max) => {
      // Try multiple selector patterns — Gumroad may change their markup
      const cards = document.querySelectorAll(
        '[data-testid="product-card"], .js-discover-product, .product-card'
      );
      const results = [];
      const limit = Math.min(cards.length, max);
      for (let i = 0; i < limit; i++) {
        const card = cards[i];
        const titleEl = card.querySelector('h3, h2, .product-name, [itemprop="name"]');
        const priceEl = card.querySelector('.price, [data-price], .product-price');
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');
        const salesEl = card.querySelector('.sales, .sales-count, [data-sales]');

        const title = titleEl?.textContent?.trim() || '';
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
        const url = linkEl?.href || '';
        const img = imgEl?.src || imgEl?.dataset?.src || '';

        if (title && url) {
          results.push({ title, price, url, img, salesText: salesEl?.textContent?.trim() || '' });
        }
      }
      return results;
    }, MAX_ITEMS);

    logger.info(`Gumroad: scraped ${items.length} products`);

    return items.map(item => ({
      platform: 'gumroad',
      listing_url: item.url,
      title: item.title,
      price: item.price,
      image_urls: item.img ? [item.img] : [],
      keywords: [item.title.toLowerCase()],
      tags: [],
      favorites: null,
      views: null,
      sales_count: null,
      category: 'design-assets',
      subject: null,
      style: null,
    }));

  } catch (err) {
    logger.error('Gumroad scrape failed', { error: err.message });
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { scrapeGumroad };
