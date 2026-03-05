'use strict';

jest.mock('../../engines/1-trend-scraper/google-trends');
jest.mock('../../engines/1-trend-scraper/etsy');
jest.mock('../../engines/1-trend-scraper/pinterest');
jest.mock('../../engines/1-trend-scraper/playwright/scraper-base');
jest.mock('../../engines/1-trend-scraper/playwright/gumroad');
jest.mock('../../engines/1-trend-scraper/playwright/redbubble');
jest.mock('../../engines/1-trend-scraper/playwright/society6');
jest.mock('../../engines/1-trend-scraper/playwright/creative-market');
jest.mock('../../engines/1-trend-scraper/image-analyzer');
jest.mock('../../engines/1-trend-scraper/trend-db');

const { scrapeGoogleTrends, getArtKeywords } = require('../../engines/1-trend-scraper/google-trends');
const { scrapeEtsy } = require('../../engines/1-trend-scraper/etsy');
const { scrapePinterest } = require('../../engines/1-trend-scraper/pinterest');
const { launchBrowser } = require('../../engines/1-trend-scraper/playwright/scraper-base');
const { scrapeGumroad } = require('../../engines/1-trend-scraper/playwright/gumroad');
const { scrapeRedbubble } = require('../../engines/1-trend-scraper/playwright/redbubble');
const { scrapeSociety6 } = require('../../engines/1-trend-scraper/playwright/society6');
const { scrapeCreativeMarket } = require('../../engines/1-trend-scraper/playwright/creative-market');
const { enrichWithColors } = require('../../engines/1-trend-scraper/image-analyzer');
const { saveTrends } = require('../../engines/1-trend-scraper/trend-db');
const { runFullScrape } = require('../../engines/1-trend-scraper/index');

const MOCK_RECORDS = [
  { platform: 'test', listing_url: 'https://example.com/1', title: 'Test 1' },
  { platform: 'test', listing_url: 'https://example.com/2', title: 'Test 2' },
];

const MOCK_BROWSER = {
  close: jest.fn().mockResolvedValue(undefined),
};

describe('TrendScraperEngine', () => {
  beforeEach(() => {
    getArtKeywords.mockReturnValue(['fox art', 'botanical print', 'nursery print']);
    scrapeGoogleTrends.mockResolvedValue(MOCK_RECORDS);
    scrapeEtsy.mockResolvedValue(MOCK_RECORDS);
    scrapePinterest.mockResolvedValue(MOCK_RECORDS);
    launchBrowser.mockResolvedValue(MOCK_BROWSER);
    scrapeGumroad.mockResolvedValue(MOCK_RECORDS);
    scrapeRedbubble.mockResolvedValue(MOCK_RECORDS);
    scrapeSociety6.mockResolvedValue(MOCK_RECORDS);
    scrapeCreativeMarket.mockResolvedValue(MOCK_RECORDS);
    enrichWithColors.mockImplementation(async records => records.map(r => ({ ...r, color_palette: { dominant: '#ff0000' } })));
    saveTrends.mockResolvedValue(14);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('runFullScrape returns summary with total, saved, errors', async () => {
    const result = await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('saved');
    expect(result).toHaveProperty('errors');
    expect(typeof result.total).toBe('number');
  });

  test('calls all 3 API scrapers', async () => {
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(scrapeGoogleTrends).toHaveBeenCalled();
    expect(scrapeEtsy).toHaveBeenCalled();
    expect(scrapePinterest).toHaveBeenCalled();
  });

  test('calls all 4 Playwright scrapers when skipPlaywright is false', async () => {
    await runFullScrape({ skipPlaywright: false, skipColorAnalysis: true });
    expect(scrapeGumroad).toHaveBeenCalled();
    expect(scrapeRedbubble).toHaveBeenCalled();
    expect(scrapeSociety6).toHaveBeenCalled();
    expect(scrapeCreativeMarket).toHaveBeenCalled();
    expect(MOCK_BROWSER.close).toHaveBeenCalled();
  });

  test('skips Playwright scrapers when skipPlaywright is true', async () => {
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(scrapeGumroad).not.toHaveBeenCalled();
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  test('calls enrichWithColors when skipColorAnalysis is false', async () => {
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: false });
    expect(enrichWithColors).toHaveBeenCalled();
  });

  test('skips enrichWithColors when skipColorAnalysis is true', async () => {
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(enrichWithColors).not.toHaveBeenCalled();
  });

  test('calls saveTrends with all collected records', async () => {
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(saveTrends).toHaveBeenCalled();
  });

  test('errors counter increments when a scraper fails', async () => {
    scrapeEtsy.mockRejectedValue(new Error('Etsy API down'));
    const result = await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(result.errors).toBeGreaterThan(0);
  });

  test('still saves other results when one scraper fails', async () => {
    scrapeEtsy.mockRejectedValue(new Error('Etsy API down'));
    await runFullScrape({ skipPlaywright: true, skipColorAnalysis: true });
    expect(saveTrends).toHaveBeenCalled();
  });
});
