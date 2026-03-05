'use strict';

// Mock logger before requiring the module under test
jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock replicate before requiring the module under test
jest.mock('replicate');
const Replicate = require('replicate');

// Mock fs before requiring the module under test
jest.mock('fs');
const fs = require('fs');

let mockRun;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: file exists
  fs.existsSync.mockReturnValue(true);
  // Default: readFileSync returns a buffer-like object
  fs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));
  // Default: Replicate run resolves with a high score
  mockRun = jest.fn().mockResolvedValue([{ label: 'test prompt', score: 0.92 }]);
  Replicate.mockImplementation(() => ({ run: mockRun }));
});

const { scoreArtwork, batchScoreArtworks, QUALITY_THRESHOLD } = require('../../engines/4-ai-artist/quality-control');

// ---------------------------------------------------------------------------
// QUALITY_THRESHOLD constant
// ---------------------------------------------------------------------------

test('QUALITY_THRESHOLD is 80', () => {
  expect(QUALITY_THRESHOLD).toBe(80);
});

// ---------------------------------------------------------------------------
// scoreArtwork tests
// ---------------------------------------------------------------------------

describe('scoreArtwork', () => {
  test('returns score and passes=true for high score', async () => {
    mockRun.mockResolvedValueOnce([{ label: 'beautiful mountain landscape', score: 0.92 }]);

    const result = await scoreArtwork('/fake/path/image.png', 'beautiful mountain landscape');

    expect(result).toEqual({
      score: 92,
      passes: true,
      model: 'clip-vit-large-patch14',
    });
  });

  test('returns passes=false for score below 80', async () => {
    mockRun.mockResolvedValueOnce([{ label: 'generic art', score: 0.70 }]);

    const result = await scoreArtwork('/fake/path/image.png', 'generic art');

    expect(result).toEqual({
      score: 70,
      passes: false,
      model: 'clip-vit-large-patch14',
    });
  });

  test('handles numeric output', async () => {
    mockRun.mockResolvedValueOnce(0.85);

    const result = await scoreArtwork('/fake/path/image.png', 'some prompt');

    expect(result).toEqual({
      score: 85,
      passes: true,
      model: 'clip-vit-large-patch14',
    });
  });

  test('throws when file not found', async () => {
    fs.existsSync.mockReturnValueOnce(false);

    await expect(
      scoreArtwork('/fake/path/missing.png', 'some prompt')
    ).rejects.toThrow('not found');
  });

  test('throws with context on Replicate error', async () => {
    mockRun.mockRejectedValueOnce(new Error('API unavailable'));

    await expect(
      scoreArtwork('/fake/path/image.png', 'some prompt')
    ).rejects.toThrow('CLIP scoring failed');
  });
});

// ---------------------------------------------------------------------------
// batchScoreArtworks tests
// ---------------------------------------------------------------------------

describe('batchScoreArtworks', () => {
  test('scores all artworks and merges results', async () => {
    mockRun
      .mockResolvedValueOnce([{ label: 'first prompt', score: 0.90 }])
      .mockResolvedValueOnce([{ label: 'second prompt', score: 0.65 }]);

    const artworks = [
      { id: 'art-001', file_path: '/fake/path/art-001.png', prompt: 'first prompt' },
      { id: 'art-002', file_path: '/fake/path/art-002.png', prompt: 'second prompt' },
    ];

    const results = await batchScoreArtworks(artworks);

    expect(results).toHaveLength(2);

    expect(results[0]).toMatchObject({
      id: 'art-001',
      file_path: '/fake/path/art-001.png',
      prompt: 'first prompt',
      score: 90,
      passes: true,
    });

    expect(results[1]).toMatchObject({
      id: 'art-002',
      file_path: '/fake/path/art-002.png',
      prompt: 'second prompt',
      score: 65,
      passes: false,
    });
  });
});
