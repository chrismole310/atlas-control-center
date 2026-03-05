'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { saveTrends, getTrendsByPlatform, getTopTrends, purgeTrends } = require('../../engines/1-trend-scraper/trend-db');
const { query, closePool } = require('../../core/database');

describe('TrendDatabase', () => {
  const testPlatform = 'test-platform-' + Date.now();

  afterAll(async () => {
    // Cleanup test data
    await query('DELETE FROM scraped_trends WHERE platform = $1', [testPlatform]);
    await closePool();
  });

  test('saveTrends inserts records', async () => {
    const ts = Date.now();
    const records = [
      {
        platform: testPlatform,
        listing_url: `https://example.com/item/1-${ts}`,
        title: 'Test Artwork 1',
        price: 12.99,
        favorites: 42,
        tags: ['watercolor', 'fox', 'nursery'],
        keywords: ['fox art', 'nursery print'],
        image_urls: ['https://example.com/img1.jpg'],
      },
      {
        platform: testPlatform,
        listing_url: `https://example.com/item/2-${ts}`,
        title: 'Test Artwork 2',
        price: 8.50,
        favorites: 17,
        tags: ['botanical', 'floral'],
        keywords: ['botanical print'],
        image_urls: [],
      },
    ];

    const count = await saveTrends(records);
    expect(count).toBe(2);
  });

  test('saveTrends returns 0 for empty array', async () => {
    const count = await saveTrends([]);
    expect(count).toBe(0);
  });

  test('saveTrends is idempotent (upsert on same listing_url)', async () => {
    const url = `https://example.com/item/upsert-${Date.now()}`;
    const record = { platform: testPlatform, listing_url: url, title: 'Original', price: 5.00 };
    await saveTrends([record]);
    await saveTrends([{ ...record, title: 'Updated', price: 6.00 }]);

    const results = await getTrendsByPlatform(testPlatform);
    const found = results.find(r => r.listing_url === url);
    expect(found.title).toBe('Updated');
    expect(parseFloat(found.price)).toBe(6.00);
  });

  test('getTrendsByPlatform returns records for platform', async () => {
    const results = await getTrendsByPlatform(testPlatform);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    results.forEach(r => expect(r.platform).toBe(testPlatform));
  });

  test('getTopTrends returns array', async () => {
    const results = await getTopTrends(10);
    expect(Array.isArray(results)).toBe(true);
  });
});
