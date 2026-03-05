'use strict';

const { chromium } = require('playwright');
const BaseScraper = require('./base');

class PlaywrightScraper extends BaseScraper {
  constructor(platform, options = {}) {
    super(platform, { rateLimitMs: options.rateLimitMs ?? 5000, maxPages: options.maxPages || 3 });
    this.config = PlaywrightScraper.PLATFORMS[platform];
    if (!this.config) throw new Error(`Unknown platform: ${platform}`);
  }

  normalizeListing(raw) {
    const price = typeof raw.price === 'string'
      ? parseFloat(raw.price.replace(/[^0-9.]/g, '')) || null
      : raw.price ?? null;

    return this.normalize({
      listing_url: raw.url || null,
      title: raw.title || null,
      description: raw.description || null,
      price,
      sales_count: raw.sales_count ?? null,
      review_count: null,
      rating: null,
      favorites: raw.favorites ?? null,
      views: null,
      keywords: [],
      tags: raw.tags || [],
      category: null,
      style: null,
      subject: null,
      image_urls: raw.image ? [raw.image] : [],
    });
  }

  async scrape(keywords) {
    const allResults = [];
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });

      for (const keyword of keywords) {
        try {
          const page = await context.newPage();
          const searchUrl = this.config.searchUrl(keyword);
          this.logger.info(`${this.platform}: scraping "${keyword}"`);

          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

          try {
            await page.waitForSelector(this.config.cardSelector, { timeout: 8000 });
          } catch {
            this.logger.warn(`${this.platform}: no results found for "${keyword}"`);
            await page.close();
            continue;
          }

          const items = await page.$$eval(this.config.cardSelector, (cards) => {
            return cards.slice(0, 50).map(card => ({
              title: card.querySelector('[class*="title"], h2, h3, [data-testid*="title"]')?.textContent?.trim() || '',
              price: card.querySelector('[class*="price"], [data-testid*="price"]')?.textContent?.trim() || '',
              url: card.querySelector('a')?.href || '',
              image: card.querySelector('img')?.src || '',
            }));
          });

          const normalized = items
            .filter(item => item.title)
            .map(item => this.normalizeListing(item));

          allResults.push(...normalized);
          this.logger.info(`${this.platform}: ${normalized.length} results for "${keyword}"`);

          await page.close();
          await this.sleep();
        } catch (err) {
          this.logger.error(`${this.platform}: failed for "${keyword}"`, { error: err.message });
        }
      }

      await context.close();
    } catch (err) {
      this.logger.error(`${this.platform}: browser launch failed`, { error: err.message });
    } finally {
      if (browser) await browser.close();
    }

    return allResults;
  }
}

PlaywrightScraper.PLATFORMS = {
  'gumroad': {
    searchUrl: (q) => `https://gumroad.com/discover?query=${encodeURIComponent(q)}&sort=featured`,
    cardSelector: '[class*="ProductCard"], article, .product-card',
  },
  'redbubble': {
    searchUrl: (q) => `https://www.redbubble.com/shop/?query=${encodeURIComponent(q)}&ref=search_box`,
    cardSelector: '[class*="SearchResult"], [data-testid="search-result"]',
  },
  'society6': {
    searchUrl: (q) => `https://society6.com/search?q=${encodeURIComponent(q)}`,
    cardSelector: '[class*="ProductCard"], [data-testid*="product"]',
  },
  'creative-market': {
    searchUrl: (q) => `https://creativemarket.com/search?q=${encodeURIComponent(q)}&categoryIDs=10`,
    cardSelector: '[class*="ProductCard"], .product-card',
  },
};

module.exports = PlaywrightScraper;
