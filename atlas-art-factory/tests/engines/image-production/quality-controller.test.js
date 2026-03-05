'use strict';

jest.mock('sharp', () => {
  return jest.fn().mockReturnValue({
    metadata: jest.fn().mockResolvedValue({ width: 1024, height: 1024, format: 'png', size: 2048000 }),
    stats: jest.fn().mockResolvedValue({
      channels: [
        { mean: 128, stdev: 60 },
        { mean: 120, stdev: 55 },
        { mean: 115, stdev: 50 },
      ],
    }),
  });
});

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: Buffer.from('fake-image-data') }),
}));

const { scoreImage, meetsQualityThreshold } = require('../../../engines/image-production/quality-controller');

test('scoreImage returns quality score with components', async () => {
  const result = await scoreImage('https://example.com/img.png');
  expect(result).toHaveProperty('total_score');
  expect(result).toHaveProperty('resolution_score');
  expect(result).toHaveProperty('color_diversity_score');
  expect(result.total_score).toBeGreaterThan(0);
  expect(result.total_score).toBeLessThanOrEqual(100);
});

test('meetsQualityThreshold checks against min score', async () => {
  const passes = await meetsQualityThreshold('https://example.com/img.png', 50);
  expect(typeof passes).toBe('boolean');
});
