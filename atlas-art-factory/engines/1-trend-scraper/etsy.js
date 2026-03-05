'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const axios = require('axios');
const { createLogger } = require('../../core/logger');

const logger = createLogger('etsy-scraper');

const ETSY_API_BASE = 'https://openapi.etsy.com/v3/application';
const MAX_RESULTS_PER_KEYWORD = 25; // Keep costs low; increase later
const REQUEST_DELAY_MS = 300;

/**
 * Search Etsy listings for a keyword and return normalized trend records.
 *
 * @param {string} keyword - Art keyword to search
 * @param {object} options - { limit, sortOn }
 * @returns {Array<object>} Records for saveTrends()
 */
async function scrapeEtsyKeyword(keyword, options = {}) {
  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) {
    logger.warn('ETSY_API_KEY not set — skipping Etsy scrape');
    return [];
  }

  const limit = options.limit || MAX_RESULTS_PER_KEYWORD;
  const sortOn = options.sortOn || 'score';

  try {
    const response = await axios.get(`${ETSY_API_BASE}/listings/active`, {
      headers: { 'x-api-key': apiKey },
      params: { keywords: keyword, sort_on: sortOn, limit, offset: 0 },
      timeout: 10000,
    });

    const listings = response.data?.results || [];
    logger.info(`Etsy: fetched ${listings.length} listings for "${keyword}"`);

    return listings.map(listing => normalizeEtsyListing(listing, keyword));
  } catch (err) {
    if (err.response?.status === 401) {
      logger.error('Etsy API: invalid API key (401)');
    } else if (err.response?.status === 429) {
      logger.warn('Etsy API: rate limited (429)');
    } else {
      logger.error(`Etsy scrape failed for "${keyword}"`, { error: err.message });
    }
    return [];
  }
}

/**
 * Normalize a raw Etsy listing API response to scraped_trends format.
 */
function normalizeEtsyListing(listing, sourceKeyword) {
  const priceAmount = listing.price?.amount || 0;
  const priceDivisor = listing.price?.divisor || 100;
  const priceUsd = priceAmount / priceDivisor;

  const imageUrls = (listing.images || [])
    .slice(0, 3)
    .map(img => img.url_570xN || img.url_fullxfull || '')
    .filter(Boolean);

  return {
    platform: 'etsy',
    listing_url: listing.url || `https://www.etsy.com/listing/${listing.listing_id}`,
    title: listing.title || '',
    description: listing.description ? listing.description.slice(0, 500) : null,
    price: priceUsd > 0 ? priceUsd : null,
    favorites: listing.num_favorers || null,
    views: listing.views || null,
    sales_count: null, // Not available in listing search endpoint
    tags: listing.tags || [],
    keywords: [sourceKeyword, ...(listing.tags || []).slice(0, 5)],
    image_urls: imageUrls,
    color_palette: null, // Populated by image analyzer (Task 15)
    category: listing.taxonomy_path_ids ? String(listing.taxonomy_path_ids[0]) : null,
    subject: sourceKeyword,
  };
}

/**
 * Scrape Etsy for multiple keywords, returning all records.
 *
 * @param {string[]} keywords
 * @returns {Array<object>}
 */
async function scrapeEtsy(keywords) {
  const allResults = [];

  for (const keyword of keywords) {
    const results = await scrapeEtsyKeyword(keyword);
    allResults.push(...results);
    if (keywords.length > 1) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  logger.info(`Etsy scrape complete`, { keywords: keywords.length, total: allResults.length });
  return allResults;
}

module.exports = { scrapeEtsy, scrapeEtsyKeyword, normalizeEtsyListing };
