'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/trend-scraper/trend-store', () => ({
  insertTrends: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../../engines/trend-scraper/scrapers/etsy', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([
      { platform: 'etsy', title: 'Test Art', price: 12.99 },
    ]),
  }));
});
jest.mock('../../../engines/trend-scraper/scrapers/google-trends', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([
      { keyword: 'wall art', interest: 85, trend_direction: 'rising' },
    ]),
  }));
});
jest.mock('../../../engines/trend-scraper/scrapers/playwright-scraper', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([]),
  }));
});

const { runTrendScraper } = require('../../../engines/trend-scraper/index');
const { insertTrends } = require('../../../engines/trend-scraper/trend-store');

test('runTrendScraper executes all scrapers and stores results', async () => {
  const result = await runTrendScraper();
  expect(result).toHaveProperty('total_scraped');
  expect(result).toHaveProperty('google_trends');
  expect(result).toHaveProperty('platforms');
  expect(insertTrends).toHaveBeenCalled();
});

test('runTrendScraper returns summary even if some scrapers fail', async () => {
  const EtsyScraper = require('../../../engines/trend-scraper/scrapers/etsy');
  EtsyScraper.mockImplementation(() => ({
    scrape: jest.fn().mockRejectedValue(new Error('API down')),
  }));

  const result = await runTrendScraper();
  expect(result).toHaveProperty('total_scraped');
});
