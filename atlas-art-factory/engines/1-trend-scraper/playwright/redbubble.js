'use strict';

const { newPage, navigate } = require('./scraper-base');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('redbubble-scraper');

const REDBUBBLE_URL = 'https://www.redbubble.com/shop/wall+art?sortOrder=top+sellers';
const MAX_ITEMS = 20;

/**
 * Scrape Redbubble top-selling wall art.
 * @param {Browser} browser - Playwright browser instance
 * @returns {Array<object>} Trend records
 */
async function scrapeRedbubble(browser) {
  const page = await newPage(browser);
  try {
    await navigate(page, REDBUBBLE_URL);
    await page.waitForSelector('[data-testid="work"], .work, .result-item', { timeout: 8000 }).catch(() => {});

    const items = await page.evaluate((max) => {
      const cards = document.querySelectorAll('[data-testid="work"], .work, [class*="result"]');
      const results = [];
      const limit = Math.min(cards.length, max);
      for (let i = 0; i < limit; i++) {
        const card = cards[i];
        const titleEl = card.querySelector('[data-testid="work-title"], .work-title, h3, h2');
        const priceEl = card.querySelector('[data-testid="price"], .price, [class*="price"]');
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');
        const tagsEl = card.querySelectorAll('.tag, [data-tag]');

        const title = titleEl?.textContent?.trim() || '';
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
        const url = linkEl?.href || '';
        const img = imgEl?.src || '';
        const tags = [...tagsEl].map(t => t.textContent.trim()).filter(Boolean);

        if (title && url) {
          results.push({ title, price, url, img, tags });
        }
      }
      return results;
    }, MAX_ITEMS);

    logger.info(`Redbubble: scraped ${items.length} products`);

    return items.map(item => ({
      platform: 'redbubble',
      listing_url: item.url,
      title: item.title,
      price: item.price,
      image_urls: item.img ? [item.img] : [],
      keywords: [item.title.toLowerCase(), ...item.tags.slice(0, 3)],
      tags: item.tags,
      favorites: null,
      views: null,
      sales_count: null,
      category: 'wall-art',
      subject: null,
      style: null,
    }));

  } catch (err) {
    logger.error('Redbubble scrape failed', { error: err.message });
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { scrapeRedbubble };
