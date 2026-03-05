'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/mockup-generator/art-placer', () => ({
  placeArtOnScene: jest.fn().mockResolvedValue({
    buffer: Buffer.from('mock-composite'),
    scene: 'living-room',
    width: 1200,
    height: 900,
  }),
}));
jest.mock('../../../engines/mockup-generator/format-optimizer', () => ({
  PRINT_SIZES: [{ name: '8x10', width: 2400, height: 3000, dpi: 300 }],
  exportAllSizes: jest.fn().mockResolvedValue([
    { name: '8x10', path: '/tmp/art-8x10.png', width: 2400, height: 3000, dpi: 300 },
  ]),
}));
jest.mock('../../../engines/mockup-generator/package-builder', () => ({
  buildPackage: jest.fn().mockResolvedValue({
    zipPath: '/tmp/packages/art-package.zip',
    fileCount: 1,
    size: 2048,
  }),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

const { query } = require('../../../core/database');
const { generateMockups, runMockupGeneration } = require('../../../engines/mockup-generator/index');

beforeEach(() => query.mockReset());

test('generateMockups creates mockups for all scenes and returns summary', async () => {
  // Mock: INSERT mockup for each scene + format export + package insert
  query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

  const result = await generateMockups({
    artworkId: 1,
    artworkUrl: 'https://example.com/art.png',
    artworkUuid: 'abc-123',
  });

  expect(result).toHaveProperty('mockups_created');
  expect(result).toHaveProperty('package_path');
  expect(result.mockups_created).toBeGreaterThan(0);
});

test('runMockupGeneration processes approved artworks without mockups', async () => {
  // Mock: get approved artworks without mockups
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, uuid: 'abc-123', master_image_url: 'https://example.com/art.png' },
    ],
  });
  // Mock: INSERT mockups + package
  query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

  const result = await runMockupGeneration();
  expect(result).toHaveProperty('artworks_processed');
  expect(result).toHaveProperty('total_mockups');
});
