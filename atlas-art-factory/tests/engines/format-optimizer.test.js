'use strict';

jest.mock('sharp');
jest.mock('fs');

jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const sharp = require('sharp');
const fs = require('fs');

const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue({ size: 1000 }),
};

sharp.mockImplementation(() => mockSharpInstance);
fs.mkdirSync = jest.fn();

const { exportAllSizes, exportSize, PRINT_SIZES } = require('../../engines/5-mockup-generation/format-optimizer');

beforeEach(() => {
  jest.clearAllMocks();
  sharp.mockImplementation(() => mockSharpInstance);
  mockSharpInstance.resize.mockReturnThis();
  mockSharpInstance.png.mockReturnThis();
  mockSharpInstance.toFile.mockResolvedValue({ size: 1000 });
  fs.mkdirSync.mockImplementation(() => {});
});

test('PRINT_SIZES has 6 entries', () => {
  expect(PRINT_SIZES).toHaveLength(6);
});

test('exportSize exports a single size correctly', async () => {
  const result = await exportSize('/fake/artwork.png', '8x10', {
    outputDir: '/tmp/sizes',
    artworkId: 'art123',
  });

  expect(sharp).toHaveBeenCalledWith('/fake/artwork.png');
  expect(mockSharpInstance.resize).toHaveBeenCalledWith(2400, 3000, {
    fit: 'cover',
    position: 'center',
  });
  expect(result).toEqual({
    name: '8x10',
    file_path: expect.stringContaining('art123_8x10.png'),
    width: 2400,
    height: 3000,
  });
});

test('exportSize throws with context on Sharp error', async () => {
  mockSharpInstance.toFile.mockRejectedValueOnce(new Error('disk full'));

  await expect(
    exportSize('/fake/artwork.png', '11x14', { outputDir: '/tmp/sizes', artworkId: 'art123' })
  ).rejects.toThrow('Format export failed for 11x14: disk full');
});

test('exportAllSizes exports all 6 sizes', async () => {
  const results = await exportAllSizes('/fake/artwork.png', {
    outputDir: '/tmp/sizes',
    artworkId: 'art123',
  });

  expect(sharp).toHaveBeenCalledTimes(6);
  expect(results).toHaveLength(6);
  for (const r of results) {
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('file_path');
    expect(r).toHaveProperty('width');
    expect(r).toHaveProperty('height');
  }
});

test('exportAllSizes continues when one size fails', async () => {
  let callCount = 0;
  mockSharpInstance.toFile.mockImplementation(() => {
    callCount++;
    if (callCount === 3) return Promise.reject(new Error('write error'));
    return Promise.resolve({ size: 1000 });
  });

  const results = await exportAllSizes('/fake/artwork.png', {
    outputDir: '/tmp/sizes',
    artworkId: 'art123',
  });

  expect(results).toHaveLength(5);
});

test('exportSize uses artworkId in filename', async () => {
  const result = await exportSize('/fake/artwork.png', 'square', {
    outputDir: '/tmp/sizes',
    artworkId: 'my-artwork-42',
  });

  expect(result.file_path).toContain('my-artwork-42_square.png');
});
