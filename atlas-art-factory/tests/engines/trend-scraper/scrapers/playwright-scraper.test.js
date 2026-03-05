'use strict';

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          waitForSelector: jest.fn(),
          $$eval: jest.fn().mockResolvedValue([]),
          close: jest.fn(),
        }),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

const PlaywrightScraper = require('../../../../engines/trend-scraper/scrapers/playwright-scraper');

test('has scraper configs for all 4 platforms', () => {
  const platforms = PlaywrightScraper.PLATFORMS;
  expect(platforms).toHaveProperty('gumroad');
  expect(platforms).toHaveProperty('redbubble');
  expect(platforms).toHaveProperty('society6');
  expect(platforms).toHaveProperty('creative-market');
});

test('scrape returns empty array when no results found', async () => {
  const scraper = new PlaywrightScraper('gumroad', { rateLimitMs: 0 });
  const results = await scraper.scrape(['wall art']);
  expect(Array.isArray(results)).toBe(true);
}, 10000);

test('normalizeListing creates standard trend object', () => {
  const scraper = new PlaywrightScraper('redbubble');
  const normalized = scraper.normalizeListing({
    title: 'Test Art',
    price: '$15.99',
    url: 'https://redbubble.com/test',
    image: 'https://img.redbubble.com/test.jpg',
  });
  expect(normalized.platform).toBe('redbubble');
  expect(normalized.title).toBe('Test Art');
  expect(normalized.price).toBe(15.99);
});
