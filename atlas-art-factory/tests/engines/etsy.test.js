'use strict';

jest.mock('axios');
const axios = require('axios');
const { scrapeEtsy, scrapeEtsyKeyword, normalizeEtsyListing } = require('../../engines/1-trend-scraper/etsy');

const MOCK_LISTING = {
  listing_id: 1234567890,
  title: 'Cute Fox Nursery Print',
  description: 'A beautiful watercolor fox print for nurseries.',
  price: { amount: 1299, divisor: 100, currency_code: 'USD' },
  url: 'https://www.etsy.com/listing/1234567890/cute-fox-nursery-print',
  tags: ['nursery', 'fox', 'watercolor', 'print'],
  views: 1543,
  num_favorers: 234,
  images: [{ url_570xN: 'https://i.etsystatic.com/test.jpg' }],
  taxonomy_path_ids: [68887337],
};

const MOCK_RESPONSE = {
  data: { count: 1, results: [MOCK_LISTING] },
};

describe('Etsy scraper', () => {
  beforeEach(() => {
    process.env.ETSY_API_KEY = 'test-api-key';
    axios.get.mockResolvedValue(MOCK_RESPONSE);
  });

  afterEach(() => {
    delete process.env.ETSY_API_KEY;
    jest.clearAllMocks();
  });

  test('scrapeEtsyKeyword returns normalized records', async () => {
    const results = await scrapeEtsyKeyword('nursery art');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].platform).toBe('etsy');
  });

  test('returns empty array when API key is missing', async () => {
    delete process.env.ETSY_API_KEY;
    const results = await scrapeEtsyKeyword('nursery art');
    expect(results).toEqual([]);
  });

  test('returns empty array on 401 error', async () => {
    axios.get.mockRejectedValue({ response: { status: 401 } });
    const results = await scrapeEtsyKeyword('nursery art');
    expect(results).toEqual([]);
  });

  test('returns empty array on network error', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const results = await scrapeEtsyKeyword('nursery art');
    expect(results).toEqual([]);
  });

  test('normalizeEtsyListing maps price correctly', () => {
    const record = normalizeEtsyListing(MOCK_LISTING, 'nursery art');
    expect(record.price).toBeCloseTo(12.99);
  });

  test('normalizeEtsyListing includes source keyword in keywords array', () => {
    const record = normalizeEtsyListing(MOCK_LISTING, 'nursery art');
    expect(record.keywords[0]).toBe('nursery art');
  });

  test('normalizeEtsyListing maps all required fields', () => {
    const record = normalizeEtsyListing(MOCK_LISTING, 'test keyword');
    expect(record.platform).toBe('etsy');
    expect(record.listing_url).toContain('etsy.com');
    expect(record.title).toBe('Cute Fox Nursery Print');
    expect(record.favorites).toBe(234);
    expect(record.views).toBe(1543);
    expect(Array.isArray(record.tags)).toBe(true);
    expect(Array.isArray(record.image_urls)).toBe(true);
  });

  test('scrapeEtsy handles multiple keywords', async () => {
    const results = await scrapeEtsy(['fox art', 'botanical print']);
    expect(results.length).toBe(2); // 1 result per keyword from mock
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('uses x-api-key header', async () => {
    await scrapeEtsyKeyword('fox art');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('listings/active'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
      })
    );
  });
});
