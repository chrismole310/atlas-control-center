'use strict';

jest.mock('google-trends-api', () => ({
  interestOverTime: jest.fn(),
  relatedQueries: jest.fn(),
}));

const googleTrends = require('google-trends-api');
const GoogleTrendsScraper = require('../../../../engines/trend-scraper/scrapers/google-trends');

let scraper;
beforeEach(() => {
  scraper = new GoogleTrendsScraper({ rateLimitMs: 0 });
  googleTrends.interestOverTime.mockReset();
  googleTrends.relatedQueries.mockReset();
});

test('scrape returns trend data for keywords', async () => {
  googleTrends.interestOverTime.mockResolvedValue(JSON.stringify({
    default: {
      timelineData: [
        { time: '1709600000', value: [85] },
        { time: '1710200000', value: [92] },
      ],
    },
  }));

  googleTrends.relatedQueries.mockResolvedValue(JSON.stringify({
    default: {
      rankedList: [
        { rankedKeyword: [{ query: 'nursery wall art boho', value: 100 }] },
        { rankedKeyword: [{ query: 'animal nursery decor', value: 80 }] },
      ],
    },
  }));

  const results = await scraper.scrape(['nursery wall art']);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]).toHaveProperty('keyword');
  expect(results[0]).toHaveProperty('interest');
  expect(results[0]).toHaveProperty('trend_direction');
});

test('scrape handles API errors gracefully', async () => {
  googleTrends.interestOverTime.mockRejectedValue(new Error('Rate limited'));
  const results = await scraper.scrape(['wall art']);
  expect(results).toEqual([]);
});
