'use strict';

// Mock the database before requiring the module
jest.mock('../../core/database', () => ({
  query: jest.fn(),
}));

// Mock logger
jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock art-placer
jest.mock('../../engines/5-mockup-generation/art-placer', () => ({
  generateAllMockups: jest.fn(),
}));

// Mock format-optimizer
jest.mock('../../engines/5-mockup-generation/format-optimizer', () => ({
  exportAllSizes: jest.fn(),
}));

// Mock package-builder
jest.mock('../../engines/5-mockup-generation/package-builder', () => ({
  buildPackage: jest.fn(),
}));

const { query } = require('../../core/database');
const { generateAllMockups } = require('../../engines/5-mockup-generation/art-placer');
const { exportAllSizes } = require('../../engines/5-mockup-generation/format-optimizer');
const { buildPackage } = require('../../engines/5-mockup-generation/package-builder');
const { processArtworkMockups, runMockupBatch } = require('../../engines/5-mockup-generation/index');

const sampleArtwork = {
  id: 42,
  master_image_path: '/storage/artworks/42.png',
  title: 'Test Artwork',
};

const sampleMockups = [
  { file_path: '/storage/mockups/42_living-room.png', template_id: 'living-room', width: 1200, height: 900 },
  { file_path: '/storage/mockups/42_bedroom.png', template_id: 'bedroom', width: 1200, height: 900 },
];

const sampleFormats = [
  { name: '8x10', file_path: '/storage/packages/42/sizes/42_8x10.png', width: 2400, height: 3000 },
  { name: '11x14', file_path: '/storage/packages/42/sizes/42_11x14.png', width: 3300, height: 4200 },
];

const samplePackage = {
  zip_path: '/storage/packages/42.zip',
  file_count: 4,
  size_bytes: 2048,
};

beforeEach(() => {
  jest.clearAllMocks();
  generateAllMockups.mockResolvedValue(sampleMockups);
  exportAllSizes.mockResolvedValue(sampleFormats);
  buildPackage.mockResolvedValue(samplePackage);
  query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('processArtworkMockups', () => {
  test('processArtworkMockups calls all 3 pipeline stages', async () => {
    await processArtworkMockups(sampleArtwork);

    expect(generateAllMockups).toHaveBeenCalledTimes(1);
    expect(generateAllMockups).toHaveBeenCalledWith(
      sampleArtwork.master_image_path,
      expect.objectContaining({ outputPrefix: expect.any(String) })
    );

    expect(exportAllSizes).toHaveBeenCalledTimes(1);
    expect(exportAllSizes).toHaveBeenCalledWith(
      sampleArtwork.master_image_path,
      expect.objectContaining({ artworkId: sampleArtwork.id })
    );

    expect(buildPackage).toHaveBeenCalledTimes(1);
    expect(buildPackage).toHaveBeenCalledWith(
      { id: sampleArtwork.id, title: sampleArtwork.title },
      sampleFormats,
      sampleMockups
    );
  });

  test('processArtworkMockups updates artwork status to mockup_ready', async () => {
    await processArtworkMockups(sampleArtwork);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'mockup_ready'"),
      [sampleArtwork.id]
    );
  });

  test('processArtworkMockups returns correct summary shape', async () => {
    const result = await processArtworkMockups(sampleArtwork);

    expect(result).toMatchObject({
      artwork_id: sampleArtwork.id,
      mockups: sampleMockups,
      formats: sampleFormats,
      packagePath: samplePackage.zip_path,
      file_count: samplePackage.file_count,
      size_bytes: samplePackage.size_bytes,
    });
  });
});

describe('runMockupBatch', () => {
  test('runMockupBatch processes artworks from DB', async () => {
    // First query returns artworks, subsequent ones are DB updates
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 1, master_image_path: '/storage/artworks/1.png', title: 'Art 1' },
          { id: 2, master_image_path: '/storage/artworks/2.png', title: 'Art 2' },
        ],
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await runMockupBatch({ limit: 10 });

    // Should have queried the DB for artworks with status = 'generated'
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'generated'"),
      [10]
    );

    expect(result.processed).toBe(2);
  });

  test('runMockupBatch returns summary with processed/errors/elapsed', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 10, master_image_path: '/storage/artworks/10.png', title: 'Art 10' },
        ],
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await runMockupBatch();

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('elapsed');
    expect(typeof result.processed).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.elapsed).toBe('number');
  });

  test('runMockupBatch continues when one artwork fails', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 1, master_image_path: '/storage/artworks/1.png', title: 'Art 1' },
          { id: 2, master_image_path: '/storage/artworks/2.png', title: 'Art 2' },
          { id: 3, master_image_path: '/storage/artworks/3.png', title: 'Art 3' },
        ],
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    // Make the second artwork's mockup generation fail
    let callCount = 0;
    generateAllMockups.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Sharp error on artwork 2');
      return sampleMockups;
    });

    const result = await runMockupBatch({ limit: 50 });

    // 2 succeed, 1 fails — but processing continues
    expect(result.processed).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      artworkId: 2,
      error: expect.stringContaining('Sharp error'),
    });
  });
});
