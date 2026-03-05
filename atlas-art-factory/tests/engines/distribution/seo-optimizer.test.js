'use strict';

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Watercolor Fox Nursery Wall Art Print | Woodland Animal Decor' }],
      }),
    },
  }));
});

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({
    rows: [
      { keyword: 'nursery wall art', demand_score: 92 },
      { keyword: 'woodland animals', demand_score: 88 },
      { keyword: 'fox print', demand_score: 85 },
      { keyword: 'watercolor nursery', demand_score: 80 },
    ],
    rowCount: 4,
  }),
  closePool: jest.fn(),
}));

const { generateTitle, generateDescription, optimizeTags } = require('../../../engines/distribution/seo-optimizer');

test('generateTitle returns keyword-rich title', async () => {
  const title = await generateTitle({
    artwork: { id: 1, title: 'fox-abc123', prompt: 'watercolor fox in forest' },
    silo: { name: 'nursery-animals' },
  });
  expect(typeof title).toBe('string');
  expect(title.length).toBeGreaterThan(10);
  expect(title.length).toBeLessThanOrEqual(140);
});

test('generateDescription returns description text', async () => {
  const desc = await generateDescription({
    artwork: { id: 1, title: 'Watercolor Fox Print', prompt: 'watercolor fox' },
    silo: { name: 'nursery-animals' },
  });
  expect(typeof desc).toBe('string');
  expect(desc.length).toBeGreaterThan(50);
});

test('optimizeTags returns up to 13 tags from demand scores', async () => {
  const tags = await optimizeTags({
    siloId: 1,
    artwork: { id: 1, prompt: 'watercolor fox nursery' },
  });
  expect(Array.isArray(tags)).toBe(true);
  expect(tags.length).toBeLessThanOrEqual(13);
  expect(tags.length).toBeGreaterThan(0);
});
