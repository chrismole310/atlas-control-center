'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/distribution/seo-optimizer', () => ({
  generateTitle: jest.fn().mockResolvedValue('Watercolor Fox Art Print | Nursery Wall Decor'),
  generateDescription: jest.fn().mockResolvedValue('Beautiful watercolor fox art print for your nursery. Digital download includes 6 sizes.'),
  optimizeTags: jest.fn().mockResolvedValue(['nursery art', 'fox print', 'wall art', 'digital download']),
}));
jest.mock('../../../engines/distribution/pricing-engine', () => ({
  calculatePrice: jest.fn().mockResolvedValue(12.99),
  getPricingTier: jest.fn().mockReturnValue('standard'),
}));
jest.mock('../../../engines/distribution/rate-limiter', () => ({
  createLimiter: jest.fn().mockReturnValue({
    canProceed: jest.fn().mockResolvedValue(true),
    waitForSlot: jest.fn().mockResolvedValue(undefined),
    recordAction: jest.fn().mockResolvedValue(undefined),
  }),
  RateLimiter: jest.fn(),
  PLATFORM_LIMITS: {},
}));

const { query } = require('../../../core/database');
const { prepareListing, runDistribution } = require('../../../engines/distribution/index');

beforeEach(() => query.mockReset());

test('prepareListing generates SEO content and price', async () => {
  const result = await prepareListing({
    artwork: { id: 1, uuid: 'abc-123', prompt: 'watercolor fox', quality_score: 90 },
    silo: { id: 1, name: 'nursery-animals' },
  });

  expect(result).toHaveProperty('title');
  expect(result).toHaveProperty('description');
  expect(result).toHaveProperty('tags');
  expect(result).toHaveProperty('price');
  expect(result.price).toBe(12.99);
});

test('runDistribution processes approved artworks without listings', async () => {
  query.mockResolvedValueOnce({
    rows: [{
      id: 1, uuid: 'abc-123', master_image_url: 'https://example.com/art.png',
      prompt: 'watercolor fox', quality_score: 90, silo_id: 1, silo_name: 'nursery-animals',
    }],
  });
  query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
  query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

  const result = await runDistribution();
  expect(result).toHaveProperty('artworks_listed');
  expect(result).toHaveProperty('listings_created');
});
