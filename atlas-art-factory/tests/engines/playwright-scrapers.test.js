'use strict';

// Mock playwright before any requires
jest.mock('playwright', () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
  };
  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser),
    },
    __mockBrowser: mockBrowser,
    __mockPage: mockPage,
  };
});

const playwright = require('playwright');
const { scrapeGumroad } = require('../../engines/1-trend-scraper/playwright/gumroad');
const { scrapeRedbubble } = require('../../engines/1-trend-scraper/playwright/redbubble');
const { scrapeSociety6 } = require('../../engines/1-trend-scraper/playwright/society6');
const { scrapeCreativeMarket } = require('../../engines/1-trend-scraper/playwright/creative-market');
const { launchBrowser } = require('../../engines/1-trend-scraper/playwright/scraper-base');

const MOCK_BROWSER = playwright.__mockBrowser;
const MOCK_PAGE = playwright.__mockPage;

const MOCK_PRODUCTS = [
  { title: 'Fox Art Print', price: 12.99, url: 'https://example.com/fox', img: 'https://example.com/fox.jpg', tags: ['fox', 'nursery'] },
  { title: 'Botanical Print', price: 8.50, url: 'https://example.com/botanical', img: '', tags: [] },
];

function setupPageMock(items) {
  MOCK_PAGE.evaluate.mockResolvedValue(items);
}

describe('Playwright scrapers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupPageMock(MOCK_PRODUCTS);
  });

  describe('Gumroad scraper', () => {
    test('returns normalized records', async () => {
      const results = await scrapeGumroad(MOCK_BROWSER);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].platform).toBe('gumroad');
    });

    test('record has listing_url and title', async () => {
      const results = await scrapeGumroad(MOCK_BROWSER);
      expect(results[0].listing_url).toBe('https://example.com/fox');
      expect(results[0].title).toBe('Fox Art Print');
    });

    test('returns empty array on error', async () => {
      MOCK_PAGE.evaluate.mockRejectedValue(new Error('navigation failed'));
      const results = await scrapeGumroad(MOCK_BROWSER);
      expect(results).toEqual([]);
    });
  });

  describe('Redbubble scraper', () => {
    test('returns normalized records', async () => {
      setupPageMock(MOCK_PRODUCTS.map(p => ({ ...p, tags: ['wall-art', 'print'] })));
      const results = await scrapeRedbubble(MOCK_BROWSER);
      expect(results.length).toBe(2);
      expect(results[0].platform).toBe('redbubble');
    });

    test('returns empty array on error', async () => {
      MOCK_PAGE.evaluate.mockRejectedValue(new Error('timeout'));
      const results = await scrapeRedbubble(MOCK_BROWSER);
      expect(results).toEqual([]);
    });
  });

  describe('Society6 scraper', () => {
    test('returns normalized records', async () => {
      const results = await scrapeSociety6(MOCK_BROWSER);
      expect(results.length).toBe(2);
      expect(results[0].platform).toBe('society6');
    });

    test('returns empty array on error', async () => {
      MOCK_PAGE.evaluate.mockRejectedValue(new Error('timeout'));
      const results = await scrapeSociety6(MOCK_BROWSER);
      expect(results).toEqual([]);
    });
  });

  describe('Creative Market scraper', () => {
    test('returns normalized records', async () => {
      setupPageMock(MOCK_PRODUCTS.map(p => ({ ...p, salesCount: 123 })));
      const results = await scrapeCreativeMarket(MOCK_BROWSER);
      expect(results.length).toBe(2);
      expect(results[0].platform).toBe('creative-market');
    });

    test('maps salesCount to sales_count', async () => {
      setupPageMock([{ title: 'Test', price: 10, url: 'https://example.com/t', img: '', salesCount: 500 }]);
      const results = await scrapeCreativeMarket(MOCK_BROWSER);
      expect(results[0].sales_count).toBe(500);
    });

    test('returns empty array on error', async () => {
      MOCK_PAGE.evaluate.mockRejectedValue(new Error('timeout'));
      const results = await scrapeCreativeMarket(MOCK_BROWSER);
      expect(results).toEqual([]);
    });
  });

  describe('launchBrowser', () => {
    test('returns a browser instance', async () => {
      const browser = await launchBrowser();
      expect(browser).toBeTruthy();
      expect(playwright.chromium.launch).toHaveBeenCalled();
    });
  });
});
