'use strict';

// NOTE: caller must invoke require('dotenv').config() before requiring this module.

const axios = require('axios');
const { createLogger } = require('../../core/logger');

const logger = createLogger('pinterest-scraper');

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';
const PAGE_SIZE = 25;
const REQUEST_DELAY_MS = 500;

/**
 * Search Pinterest pins for a keyword and return normalized trend records.
 *
 * @param {string} keyword - Art keyword to search
 * @param {object} options - { pageSize }
 * @returns {Array<object>} Records for saveTrends()
 */
async function scrapePinterestKeyword(keyword, options = {}) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) {
    logger.warn('PINTEREST_ACCESS_TOKEN not set — skipping Pinterest scrape');
    return [];
  }

  const pageSize = options.pageSize || PAGE_SIZE;

  try {
    const response = await axios.get(`${PINTEREST_API_BASE}/search/pins`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { query: keyword, page_size: pageSize },
      timeout: 10000,
    });

    const pins = response.data?.items || [];
    logger.info(`Pinterest: fetched ${pins.length} pins for "${keyword}"`);

    return pins.map(pin => normalizePinterestPin(pin, keyword));
  } catch (err) {
    if (err.response?.status === 401) {
      logger.error('Pinterest API: invalid or expired access token (401)');
    } else if (err.response?.status === 429) {
      logger.warn('Pinterest API: rate limited (429)');
    } else {
      logger.error(`Pinterest scrape failed for "${keyword}"`, { error: err.message });
    }
    return [];
  }
}

/**
 * Normalize a raw Pinterest pin to scraped_trends format.
 */
function normalizePinterestPin(pin, sourceKeyword) {
  const imageUrl = pin.media?.images?.['1200x']?.url
    || pin.media?.images?.originals?.url
    || null;

  return {
    platform: 'pinterest',
    listing_url: `https://www.pinterest.com/pin/${pin.id}/`,
    title: pin.title || pin.description?.slice(0, 100) || sourceKeyword,
    description: pin.description ? pin.description.slice(0, 500) : null,
    price: null, // Pinterest pins don't have prices
    favorites: pin.save_count || null,
    views: null,
    sales_count: null,
    tags: [],
    keywords: [sourceKeyword],
    image_urls: imageUrl ? [imageUrl] : [],
    color_palette: null, // Populated by image analyzer (Task 15)
    category: null,
    subject: sourceKeyword,
    style: null,
  };
}

/**
 * Scrape Pinterest for multiple keywords.
 *
 * @param {string[]} keywords
 * @returns {Array<object>}
 */
async function scrapePinterest(keywords) {
  const allResults = [];

  for (const keyword of keywords) {
    const results = await scrapePinterestKeyword(keyword);
    allResults.push(...results);
    if (keywords.length > 1) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  logger.info(`Pinterest scrape complete`, { keywords: keywords.length, total: allResults.length });
  return allResults;
}

module.exports = { scrapePinterest, scrapePinterestKeyword, normalizePinterestPin };
