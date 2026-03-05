'use strict';

jest.mock('axios', () => ({
  get: jest.fn(),
  create: jest.fn().mockReturnValue({ get: jest.fn() }),
}));

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const axios = require('axios');
const { query } = require('../../../core/database');
const { pullEtsyStats } = require('../../../engines/analytics/etsy-puller');
const { pullGumroadStats } = require('../../../engines/analytics/gumroad-puller');

beforeEach(() => {
  query.mockReset();
  axios.get.mockReset();
});

describe('EtsyPuller', () => {
  test('pullEtsyStats fetches and returns listing stats', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, platform_listing_id: '12345', artwork_id: 1 }],
    });
    query.mockResolvedValue({ rowCount: 1 });

    axios.get.mockResolvedValueOnce({
      data: { results: [{ listing_id: 12345, views: 100, num_favorers: 20 }] },
    });

    const result = await pullEtsyStats();
    expect(result).toHaveProperty('listings_updated');
  });
});

describe('GumroadPuller', () => {
  test('pullGumroadStats fetches and returns product stats', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, platform_listing_id: 'gum-123', artwork_id: 1 }],
    });
    query.mockResolvedValue({ rowCount: 1 });

    axios.get.mockResolvedValueOnce({
      data: { success: true, product: { id: 'gum-123', sales_count: 5, sales_usd_cents: 6495, views_count: 200 } },
    });

    const result = await pullGumroadStats();
    expect(result).toHaveProperty('products_updated');
  });
});
