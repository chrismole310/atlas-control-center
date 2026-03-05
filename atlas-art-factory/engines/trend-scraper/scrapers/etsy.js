'use strict';

const axios = require('axios');
const BaseScraper = require('./base');

class EtsyScraper extends BaseScraper {
  constructor(options = {}) {
    super('etsy', { rateLimitMs: options.rateLimitMs ?? 2000, maxPages: options.maxPages ?? 5 });
    this.apiKey = options.apiKey || process.env.ETSY_API_KEY;
    this.baseUrl = 'https://openapi.etsy.com/v3/application';
  }

  normalizeEtsyListing(item) {
    const price = item.price ? item.price.amount / item.price.divisor : null;
    const imageUrls = (item.images || []).map(img => img.url_570xN).filter(Boolean);

    return this.normalize({
      listing_url: item.url || `https://www.etsy.com/listing/${item.listing_id}`,
      title: item.title || null,
      description: (item.description || '').slice(0, 500),
      price,
      sales_count: item.quantity_sold ?? null,
      review_count: item.review_count ?? null,
      rating: null,
      favorites: item.num_favorers ?? null,
      views: item.views ?? null,
      keywords: (item.tags || []).slice(0, 13),
      tags: item.tags || [],
      category: item.taxonomy_path ? item.taxonomy_path[0] : null,
      style: null,
      subject: null,
      image_urls: imageUrls,
    });
  }

  async scrape(keywords) {
    if (!this.apiKey) {
      this.logger.warn('No ETSY_API_KEY set, skipping Etsy scraper');
      return [];
    }

    const allResults = [];

    for (const keyword of keywords) {
      try {
        this.logger.info(`Searching Etsy: "${keyword}"`);
        const response = await axios.get(`${this.baseUrl}/listings/active`, {
          headers: { 'x-api-key': this.apiKey },
          params: {
            keywords: keyword,
            sort_on: 'score',
            limit: 100,
            includes: 'images',
          },
        });

        const listings = response.data?.results || [];
        const normalized = listings.map(item => this.normalizeEtsyListing(item));
        allResults.push(...normalized);
        this.logger.info(`Etsy: ${normalized.length} results for "${keyword}"`);

        await this.sleep();
      } catch (err) {
        this.logger.error(`Etsy search failed for "${keyword}"`, { error: err.message });
      }
    }

    return allResults;
  }
}

module.exports = EtsyScraper;
