'use strict';

jest.mock('axios');
const axios = require('axios');
const EtsyScraper = require('../../../../engines/trend-scraper/scrapers/etsy');

let scraper;
beforeEach(() => {
  scraper = new EtsyScraper({ apiKey: 'test-key', rateLimitMs: 0 });
  axios.get.mockReset();
});

const fakeEtsyResponse = {
  data: {
    count: 2,
    results: [
      {
        listing_id: 111,
        title: 'Nursery Wall Art Baby Animals',
        description: 'Cute watercolor animals',
        price: { amount: 1299, divisor: 100, currency_code: 'USD' },
        tags: ['nursery', 'wall art', 'baby'],
        num_favorers: 890,
        views: 3200,
        url: 'https://www.etsy.com/listing/111',
        images: [{ url_570xN: 'https://i.etsystatic.com/img1.jpg' }],
      },
      {
        listing_id: 222,
        title: 'Abstract Modern Print',
        description: 'Minimalist abstract art',
        price: { amount: 1599, divisor: 100, currency_code: 'USD' },
        tags: ['abstract', 'modern', 'minimalist'],
        num_favorers: 450,
        views: 1800,
        url: 'https://www.etsy.com/listing/222',
        images: [{ url_570xN: 'https://i.etsystatic.com/img2.jpg' }],
      },
    ],
  },
};

test('scrape fetches Etsy listings and normalizes them', async () => {
  axios.get.mockResolvedValue(fakeEtsyResponse);
  const results = await scraper.scrape(['wall art']);
  expect(results.length).toBeGreaterThanOrEqual(2);
  expect(results[0].platform).toBe('etsy');
  expect(results[0].title).toContain('Nursery');
  expect(results[0].price).toBe(12.99);
  expect(results[0].favorites).toBe(890);
  expect(results[0].tags).toContain('nursery');
});

test('scrape handles API errors gracefully', async () => {
  axios.get.mockRejectedValue(new Error('401 Unauthorized'));
  const results = await scraper.scrape(['wall art']);
  expect(results).toEqual([]);
});

test('normalizeEtsyListing maps Etsy fields correctly', () => {
  const raw = fakeEtsyResponse.data.results[0];
  const normalized = scraper.normalizeEtsyListing(raw);
  expect(normalized.platform).toBe('etsy');
  expect(normalized.listing_url).toContain('111');
  expect(typeof normalized.price).toBe('number');
  expect(Array.isArray(normalized.tags)).toBe(true);
  expect(Array.isArray(normalized.image_urls)).toBe(true);
});
