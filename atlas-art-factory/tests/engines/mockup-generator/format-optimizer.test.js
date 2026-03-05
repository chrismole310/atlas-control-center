'use strict';

jest.mock('sharp', () => {
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image')),
    toFile: jest.fn().mockResolvedValue({ width: 800, height: 1000, size: 500000 }),
  };
  return jest.fn().mockReturnValue(mockInstance);
});

const { PRINT_SIZES, exportAllSizes } = require('../../../engines/mockup-generator/format-optimizer');

test('PRINT_SIZES has 6 standard sizes', () => {
  expect(PRINT_SIZES).toHaveLength(6);
  const names = PRINT_SIZES.map(s => s.name);
  expect(names).toContain('8x10');
  expect(names).toContain('11x14');
  expect(names).toContain('16x20');
  expect(names).toContain('24x36');
  expect(names).toContain('square');
  expect(names).toContain('A4');
});

test('exportAllSizes returns array of exported formats', async () => {
  const results = await exportAllSizes({
    imageBuffer: Buffer.from('test-image'),
    outputDir: '/tmp/test-output',
    baseFilename: 'test-art',
  });
  expect(results).toHaveLength(6);
  for (const r of results) {
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('path');
    expect(r).toHaveProperty('width');
    expect(r).toHaveProperty('height');
  }
});
