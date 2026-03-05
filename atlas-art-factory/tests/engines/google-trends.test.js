'use strict';

// Mock google-trends-api before requiring our module
jest.mock('google-trends-api', () => ({
  interestOverTime: jest.fn(),
  relatedQueries: jest.fn(),
}));

const googleTrends = require('google-trends-api');
const { scrapeGoogleTrends, getArtKeywords } = require('../../engines/1-trend-scraper/google-trends');

const MOCK_INTEREST_RESPONSE = JSON.stringify({
  default: {
    timelineData: [
      { value: [45], formattedTime: '2026-02-26' },
      { value: [52], formattedTime: '2026-02-27' },
      { value: [61], formattedTime: '2026-02-28' },
      { value: [58], formattedTime: '2026-03-01' },
      { value: [70], formattedTime: '2026-03-02' },
      { value: [75], formattedTime: '2026-03-03' },
      { value: [80], formattedTime: '2026-03-04' },
    ],
  },
});

const MOCK_RELATED_RESPONSE = JSON.stringify({
  default: {
    rankedList: [{
      rankedKeyword: [
        { query: 'watercolor fox print', value: 100 },
        { query: 'nursery fox art', value: 85 },
        { query: 'fox wall art', value: 72 },
      ],
    }],
  },
});

describe('Google Trends scraper', () => {
  beforeEach(() => {
    googleTrends.interestOverTime.mockResolvedValue(MOCK_INTEREST_RESPONSE);
    googleTrends.relatedQueries.mockResolvedValue(MOCK_RELATED_RESPONSE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns array of trend records', async () => {
    const results = await scrapeGoogleTrends(['fox art print']);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
  });

  test('record has correct platform and required fields', async () => {
    const results = await scrapeGoogleTrends(['nursery art']);
    const record = results[0];
    expect(record.platform).toBe('google-trends');
    expect(record.listing_url).toContain('trends.google.com');
    expect(record.title).toBe('nursery art');
    expect(Array.isArray(record.keywords)).toBe(true);
    expect(record.keywords[0]).toBe('nursery art');
  });

  test('detects rising trend when recent values are higher', async () => {
    const results = await scrapeGoogleTrends(['botanical print']);
    const record = results[0];
    const meta = JSON.parse(record.description);
    expect(meta.trend).toBe('rising');
  });

  test('handles multiple keywords', async () => {
    const results = await scrapeGoogleTrends(['fox art', 'botanical print', 'abstract painting']);
    expect(results.length).toBe(3);
  });

  test('continues on individual keyword failure', async () => {
    googleTrends.interestOverTime
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValue(MOCK_INTEREST_RESPONSE);

    const results = await scrapeGoogleTrends(['failing keyword', 'good keyword']);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('good keyword');
  });

  test('returns empty array for empty keyword list', async () => {
    const results = await scrapeGoogleTrends([]);
    expect(results).toEqual([]);
  });

  test('getArtKeywords returns non-empty array', () => {
    const keywords = getArtKeywords(2);
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  test('getArtKeywords maxPerSilo limits output per silo', () => {
    const keywords2 = getArtKeywords(2);
    const keywords5 = getArtKeywords(5);
    expect(keywords5.length).toBeGreaterThanOrEqual(keywords2.length);
  });

  test('includes related terms in keywords array', async () => {
    const results = await scrapeGoogleTrends(['fox art']);
    const record = results[0];
    expect(record.keywords.length).toBeGreaterThan(1);
    expect(record.tags.length).toBeGreaterThan(0);
  });
});
