'use strict';

jest.mock('axios');
const axios = require('axios');
const { scrapePinterest, scrapePinterestKeyword, normalizePinterestPin } = require('../../engines/1-trend-scraper/pinterest');

const MOCK_PIN = {
  id: '987654321',
  title: 'Beautiful Fox Art Print',
  description: 'A stunning watercolor fox print perfect for nurseries.',
  link: 'https://www.etsy.com/listing/123456/beautiful-fox-art-print',
  media: {
    media_type: 'image',
    images: {
      originals: { url: 'https://i.pinimg.com/originals/ab/cd/ef/test.jpg' },
      '1200x': { url: 'https://i.pinimg.com/1200x/ab/cd/ef/test.jpg' },
    },
  },
  save_count: 456,
};

const MOCK_RESPONSE = {
  data: { items: [MOCK_PIN], bookmark: 'cursor_abc' },
};

describe('Pinterest scraper', () => {
  beforeEach(() => {
    process.env.PINTEREST_ACCESS_TOKEN = 'test-bearer-token';
    axios.get.mockResolvedValue(MOCK_RESPONSE);
  });

  afterEach(() => {
    delete process.env.PINTEREST_ACCESS_TOKEN;
    jest.clearAllMocks();
  });

  test('scrapePinterestKeyword returns normalized records', async () => {
    const results = await scrapePinterestKeyword('fox art');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].platform).toBe('pinterest');
  });

  test('returns empty array when token is missing', async () => {
    delete process.env.PINTEREST_ACCESS_TOKEN;
    const results = await scrapePinterestKeyword('fox art');
    expect(results).toEqual([]);
  });

  test('returns empty array on 401 error', async () => {
    axios.get.mockRejectedValue({ response: { status: 401 } });
    const results = await scrapePinterestKeyword('fox art');
    expect(results).toEqual([]);
  });

  test('returns empty array on network error', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const results = await scrapePinterestKeyword('fox art');
    expect(results).toEqual([]);
  });

  test('normalizePinterestPin maps save_count to favorites', () => {
    const record = normalizePinterestPin(MOCK_PIN, 'fox art');
    expect(record.favorites).toBe(456);
  });

  test('normalizePinterestPin includes 1200x image URL', () => {
    const record = normalizePinterestPin(MOCK_PIN, 'fox art');
    expect(record.image_urls[0]).toContain('1200x');
  });

  test('normalizePinterestPin maps all required fields', () => {
    const record = normalizePinterestPin(MOCK_PIN, 'fox art');
    expect(record.platform).toBe('pinterest');
    expect(record.listing_url).toContain('pinterest.com/pin/987654321');
    expect(record.title).toBe('Beautiful Fox Art Print');
    expect(record.keywords[0]).toBe('fox art');
  });

  test('uses Bearer token in Authorization header', async () => {
    await scrapePinterestKeyword('fox art');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('search/pins'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-bearer-token' }),
      })
    );
  });

  test('scrapePinterest handles multiple keywords', async () => {
    const results = await scrapePinterest(['fox art', 'botanical print']);
    expect(results.length).toBe(2);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('normalizePinterestPin handles missing media gracefully', () => {
    const pinNoMedia = { id: '111', title: 'Test', save_count: 10 };
    const record = normalizePinterestPin(pinNoMedia, 'test');
    expect(record.image_urls).toEqual([]);
  });
});
