'use strict';

const { createLogger } = require('../../../core/logger');

class BaseScraper {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.rateLimitMs = options.rateLimitMs ?? 2000;
    this.maxPages = options.maxPages || 5;
    this.logger = createLogger(`scraper:${platform}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms ?? this.rateLimitMs));
  }

  async scrape(keywords) {
    throw new Error(`${this.platform}: scrape() not implemented`);
  }

  normalize(raw) {
    return {
      platform: this.platform,
      listing_url: raw.listing_url || null,
      title: raw.title || null,
      description: raw.description || null,
      price: raw.price ?? null,
      sales_count: raw.sales_count ?? null,
      review_count: raw.review_count ?? null,
      rating: raw.rating ?? null,
      favorites: raw.favorites ?? null,
      views: raw.views ?? null,
      keywords: raw.keywords || [],
      tags: raw.tags || [],
      category: raw.category || null,
      style: raw.style || null,
      subject: raw.subject || null,
      color_palette: raw.color_palette || {},
      image_urls: raw.image_urls || [],
    };
  }
}

module.exports = BaseScraper;
