'use strict';

jest.mock('../../core/database', () => ({ query: jest.fn() }));

const { query } = require('../../core/database');
const { rankOpportunities, getRecommendedPrice, getTopKeywords, getRecommendedStyle } = require('../../engines/2-market-intelligence/opportunity-ranker');

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// rankOpportunities
// ---------------------------------------------------------------------------

describe('rankOpportunities', () => {
  test('returns empty array when no qualifying scores', async () => {
    // demand_scores query returns no rows
    query.mockResolvedValueOnce({ rows: [] });

    const result = await rankOpportunities();

    expect(result).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('returns ranked list of opportunities', async () => {
    // 1. demand_scores SELECT — 3 qualifying rows (already ordered desc by DB)
    query.mockResolvedValueOnce({
      rows: [
        { keyword: 'nursery art',    demand_score: '90', competition_count: '30',  avg_price: '14.99', trend_direction: 'rising', saturation_level: '10' },
        { keyword: 'boho print',     demand_score: '80', competition_count: '120', avg_price: '18.00', trend_direction: 'stable', saturation_level: '25' },
        { keyword: 'abstract lines', demand_score: '70', competition_count: '300', avg_price: '12.00', trend_direction: 'falling', saturation_level: '60' },
      ],
    });

    // For each keyword: getRecommendedPrice, getTopKeywords, getRecommendedStyle → 3 queries per kw
    // Then DELETE + INSERT → 2 queries per kw
    // Total per keyword: 5 queries, 3 keywords = 15 queries (+ 1 initial = 16 total)

    // Helper to mock all 5 sub-queries for one keyword
    function mockKeywordQueries({ prices = [{ price: 14.99 }], trendRows = [], styleRows = [] } = {}) {
      // getRecommendedPrice
      query.mockResolvedValueOnce({ rows: prices });
      // getTopKeywords
      query.mockResolvedValueOnce({ rows: trendRows });
      // getRecommendedStyle
      query.mockResolvedValueOnce({ rows: styleRows });
      // DELETE
      query.mockResolvedValueOnce({ rowCount: 0 });
      // INSERT
      query.mockResolvedValueOnce({ rowCount: 1 });
    }

    mockKeywordQueries({
      prices: [{ price: 10 }, { price: 20 }, { price: 30 }],
      trendRows: [{ tags: ['cute', 'baby'], keywords: ['nursery', 'kids'] }],
      styleRows: [{ title: 'watercolor nursery art', tags: ['watercolor'], style: null, engagement: 500 }],
    });
    mockKeywordQueries({
      prices: [{ price: 15 }, { price: 25 }],
      trendRows: [{ tags: ['boho'], keywords: ['bohemian', 'print'] }],
      styleRows: [{ title: 'boho minimalist', tags: ['minimalist'], style: null, engagement: 300 }],
    });
    mockKeywordQueries({
      prices: [],
      trendRows: [],
      styleRows: [],
    });

    const result = await rankOpportunities();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);

    // Verify sort order (rank 1 = highest demand)
    expect(result[0].niche).toBe('nursery art');
    expect(result[0].opportunity_rank).toBe(1);
    expect(result[1].niche).toBe('boho print');
    expect(result[1].opportunity_rank).toBe(2);
    expect(result[2].niche).toBe('abstract lines');
    expect(result[2].opportunity_rank).toBe(3);

    // Spot-check fields are present
    expect(result[0]).toHaveProperty('demand_score');
    expect(result[0]).toHaveProperty('competition_level');
    expect(result[0]).toHaveProperty('profit_potential');
    expect(result[0]).toHaveProperty('recommended_price');
    expect(result[0]).toHaveProperty('recommended_styles');
    expect(result[0]).toHaveProperty('recommended_keywords');
    expect(result[0].status).toBe('active');

    // Low competition (30 < 50)
    expect(result[0].competition_level).toBe('low');
    // Medium competition (120)
    expect(result[1].competition_level).toBe('medium');
    // High competition (300)
    expect(result[2].competition_level).toBe('high');

    // recommended_styles assertions — nursery art: detected 'watercolor' from title
    expect(result[0].recommended_styles).toEqual(['watercolor']);
    // boho print: detected 'minimalist' from title (first STYLE_KEYWORDS match wins)
    expect(result[1].recommended_styles).toEqual(['minimalist']);
    // abstract lines: no data → DEFAULT_STYLE
    expect(result[2].recommended_styles).toEqual(['modern']);
  });

  test('skips failing keyword and returns partial results', async () => {
    // demand_scores SELECT — 2 qualifying rows
    query.mockResolvedValueOnce({
      rows: [
        { keyword: 'nursery art', demand_score: '90', competition_count: '30', saturation_level: '10' },
        { keyword: 'boho print',  demand_score: '80', competition_count: '120', saturation_level: '25' },
      ],
    });

    // nursery art: all 5 sub-queries succeed
    query.mockResolvedValueOnce({ rows: [{ price: 20 }] });           // getRecommendedPrice
    query.mockResolvedValueOnce({ rows: [{ tags: ['baby'], keywords: ['nursery'] }] }); // getTopKeywords
    query.mockResolvedValueOnce({ rows: [{ title: 'watercolor art', tags: [], style: null, engagement: 100 }] }); // getRecommendedStyle
    query.mockResolvedValueOnce({ rowCount: 0 });                     // DELETE
    query.mockResolvedValueOnce({ rowCount: 1 });                     // INSERT

    // boho print: DELETE query throws
    query.mockResolvedValueOnce({ rows: [{ price: 15 }] });           // getRecommendedPrice
    query.mockResolvedValueOnce({ rows: [] });                        // getTopKeywords
    query.mockResolvedValueOnce({ rows: [] });                        // getRecommendedStyle
    query.mockRejectedValueOnce(new Error('DB error on DELETE'));      // DELETE throws

    const result = await rankOpportunities();

    // Should not throw and should return the one successful keyword
    expect(result.length).toBe(1);
    expect(result[0].niche).toBe('nursery art');
  });
});

// ---------------------------------------------------------------------------
// getRecommendedPrice
// ---------------------------------------------------------------------------

describe('getRecommendedPrice', () => {
  test('returns median price from scraped_trends (odd count)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ price: 10 }, { price: 20 }, { price: 30 }],
    });

    const price = await getRecommendedPrice('nursery art');
    expect(price).toBe(20);
  });

  test('returns median price (even count — average of two middle)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ price: 10 }, { price: 20 }, { price: 30 }, { price: 40 }],
    });

    const price = await getRecommendedPrice('abstract');
    expect(price).toBe(25);
  });

  test('returns default 14.99 when no data', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const price = await getRecommendedPrice('unknown niche');
    expect(price).toBe(14.99);
  });

  test('returns default 14.99 when all prices are null/zero', async () => {
    query.mockResolvedValueOnce({
      rows: [{ price: null }, { price: 0 }],
    });

    const price = await getRecommendedPrice('bad data niche');
    expect(price).toBe(14.99);
  });
});

// ---------------------------------------------------------------------------
// getTopKeywords
// ---------------------------------------------------------------------------

describe('getTopKeywords', () => {
  test('returns deduplicated top tags from scraped_trends', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { tags: ['watercolor', 'art', 'print'], keywords: ['nursery', 'baby'] },
        { tags: ['art', 'cute'],               keywords: ['nursery', 'kids'] },
        { tags: ['wall art'],                  keywords: ['print'] },
      ],
    });

    const tags = await getTopKeywords('nursery art', 10);

    expect(Array.isArray(tags)).toBe(true);
    // Should be deduplicated
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
    // Should contain expected values
    expect(tags).toContain('watercolor');
    expect(tags).toContain('nursery');
  });

  test('respects the limit parameter', async () => {
    // 15 distinct tags
    const manyTags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    query.mockResolvedValueOnce({
      rows: [{ tags: manyTags, keywords: [] }],
    });

    const tags = await getTopKeywords('busy niche', 5);
    expect(tags.length).toBe(5);
  });

  test('returns empty array when no scraped trends exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const tags = await getTopKeywords('empty niche', 10);
    expect(tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRecommendedStyle
// ---------------------------------------------------------------------------

describe('getRecommendedStyle', () => {
  test('returns explicit style from style column when present', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { title: 'some nursery art', tags: [], style: 'watercolor', engagement: 800 },
        { title: 'another listing',  tags: [], style: 'boho',       engagement: 400 },
      ],
    });

    const style = await getRecommendedStyle('nursery art');
    // First row has an explicit style — should be returned immediately
    expect(style).toBe('watercolor');
  });

  test('falls back to detecting style from title text when style column is null', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { title: 'beautiful minimalist wall print', tags: ['wall', 'art'], style: null, engagement: 600 },
      ],
    });

    const style = await getRecommendedStyle('wall print');
    // No explicit style — detectStyle should find 'minimalist' in the title
    expect(style).toBe('minimalist');
  });

  test('returns DEFAULT_STYLE (modern) when no data is returned', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const style = await getRecommendedStyle('unknown niche');
    expect(style).toBe('modern');
  });
});
