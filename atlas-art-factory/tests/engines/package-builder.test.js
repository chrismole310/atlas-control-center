'use strict';

jest.mock('archiver');
jest.mock('fs');

jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const archiver = require('archiver');
const fs = require('fs');

const mockArchive = {
  pipe: jest.fn(),
  file: jest.fn(),
  finalize: jest.fn(),
  on: jest.fn(),
  pointer: jest.fn(() => 1024),
};

const mockOutput = {
  on: jest.fn((event, cb) => {
    if (event === 'close') cb();
  }),
};

archiver.mockReturnValue(mockArchive);
fs.createWriteStream = jest.fn().mockReturnValue(mockOutput);
fs.mkdirSync = jest.fn().mockReturnValue(undefined);
fs.existsSync = jest.fn().mockReturnValue(true);

const { buildPackage } = require('../../engines/5-mockup-generation/package-builder');

const sampleArtwork = { id: 'art-001', title: 'Test Artwork' };
const sampleFormats = [
  { name: '8x10',  file_path: '/tmp/art-001_8x10.png' },
  { name: '11x14', file_path: '/tmp/art-001_11x14.png' },
];
const sampleMockups = [
  { template_id: 'living-room', file_path: '/tmp/mockup_living-room.png' },
  { template_id: 'bedroom',     file_path: '/tmp/mockup_bedroom.png' },
];

beforeEach(() => {
  jest.clearAllMocks();
  archiver.mockReturnValue(mockArchive);
  mockArchive.pipe.mockClear();
  mockArchive.file.mockClear();
  mockArchive.finalize.mockClear();
  mockArchive.on.mockClear();
  mockArchive.pointer.mockReturnValue(1024);
  mockOutput.on.mockImplementation((event, cb) => {
    if (event === 'close') cb();
  });
  fs.createWriteStream.mockReturnValue(mockOutput);
  fs.mkdirSync.mockReturnValue(undefined);
  fs.existsSync.mockReturnValue(true);
});

test('buildPackage creates zip at correct path', async () => {
  const result = await buildPackage(sampleArtwork, sampleFormats, sampleMockups);
  expect(result.zip_path).toContain('art-001.zip');
});

test('buildPackage adds format files under print-formats/ folder', async () => {
  await buildPackage(sampleArtwork, sampleFormats, sampleMockups);

  expect(mockArchive.file).toHaveBeenCalledWith(
    '/tmp/art-001_8x10.png',
    { name: 'print-formats/8x10.png' }
  );
  expect(mockArchive.file).toHaveBeenCalledWith(
    '/tmp/art-001_11x14.png',
    { name: 'print-formats/11x14.png' }
  );
});

test('buildPackage adds mockup files under mockups/ folder', async () => {
  await buildPackage(sampleArtwork, sampleFormats, sampleMockups);

  expect(mockArchive.file).toHaveBeenCalledWith(
    '/tmp/mockup_living-room.png',
    { name: 'mockups/living-room.png' }
  );
  expect(mockArchive.file).toHaveBeenCalledWith(
    '/tmp/mockup_bedroom.png',
    { name: 'mockups/bedroom.png' }
  );
});

test('buildPackage resolves with zip_path and size_bytes', async () => {
  const result = await buildPackage(sampleArtwork, sampleFormats, sampleMockups);

  expect(result).toHaveProperty('zip_path');
  expect(result).toHaveProperty('size_bytes', 1024);
  expect(result).toHaveProperty('file_count', 4);
});

test('buildPackage file_count reflects only files that exist on disk', async () => {
  // Make existsSync return false for some files so they are skipped
  fs.existsSync.mockReturnValue(false);

  const result = await buildPackage(sampleArtwork, sampleFormats, sampleMockups);

  // No files passed the existsSync guard, so file_count must be less than the total input count
  expect(result.file_count).toBeLessThan(sampleFormats.length + sampleMockups.length);
  expect(result.file_count).toBe(0);
  // archive.file should never have been called
  expect(mockArchive.file).not.toHaveBeenCalled();
});

test('buildPackage rejects on archive error', async () => {
  mockArchive.on.mockImplementation((event, cb) => {
    if (event === 'error') cb(new Error('archive write failed'));
  });
  // Prevent close from firing so only the error fires
  mockOutput.on.mockImplementation(() => {});

  await expect(
    buildPackage(sampleArtwork, sampleFormats, sampleMockups)
  ).rejects.toThrow('Package build failed for artwork art-001: archive write failed');
});
