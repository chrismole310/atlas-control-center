'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { insertTrends, getRecentTrends } = require('../../../engines/trend-scraper/trend-store');

beforeEach(() => query.mockReset());

const fakeTrend = {
  platform: 'etsy',
  listing_url: 'https://etsy.com/listing/123',
  title: 'Nursery Wall Art Print',
  description: 'Cute animal nursery print',
  price: 12.99,
  sales_count: 450,
  review_count: 120,
  rating: 4.8,
  favorites: 890,
  views: null,
  keywords: ['nursery art', 'baby animals'],
  tags: ['nursery', 'wall art', 'print'],
  category: 'nursery',
  style: 'watercolor',
  subject: 'animals',
  color_palette: { dominant: '#F5E6D3', palette: ['#F5E6D3', '#8B4513'] },
  image_urls: ['https://example.com/img.jpg'],
};

test('insertTrends bulk-inserts rows and returns count', async () => {
  query.mockResolvedValueOnce({ rowCount: 2 });
  const count = await insertTrends([fakeTrend, fakeTrend]);
  expect(count).toBe(2);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('INSERT INTO scraped_trends');
});

test('insertTrends returns 0 for empty array', async () => {
  const count = await insertTrends([]);
  expect(count).toBe(0);
  expect(query).not.toHaveBeenCalled();
});

test('getRecentTrends queries by platform and limit', async () => {
  query.mockResolvedValueOnce({ rows: [fakeTrend] });
  const rows = await getRecentTrends('etsy', 10);
  expect(rows).toHaveLength(1);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('scraped_trends'),
    ['etsy', 10]
  );
});
