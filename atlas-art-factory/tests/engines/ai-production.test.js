'use strict';

// Mock all dependencies before requiring index.js

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../core/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../engines/4-ai-artist/prompt-builder', () => ({
  buildArtworkPrompt: jest.fn().mockReturnValue('mocked prompt text'),
}));

jest.mock('../../engines/4-ai-artist/router', () => ({
  routeAndGenerate: jest.fn().mockResolvedValue({
    id: 'gen-001',
    file_path: '/storage/gen-001.png',
    engine: 'flux-schnell',
    width: 1024,
    height: 1024,
  }),
}));

jest.mock('../../engines/4-ai-artist/quality-control', () => ({
  scoreArtwork: jest.fn().mockResolvedValue({
    score: 85,
    passes: true,
    model: 'clip-vit-large-patch14',
  }),
}));

jest.mock('../../engines/4-ai-artist/variation-generator', () => ({
  generateVariations: jest.fn().mockResolvedValue([
    { variationIndex: 1, prompt: 'variation 1', baseArtworkId: 1 },
    { variationIndex: 2, prompt: 'variation 2', baseArtworkId: 1 },
    { variationIndex: 3, prompt: 'variation 3', baseArtworkId: 1 },
  ]),
}));

const { query } = require('../../core/database');
const { buildArtworkPrompt } = require('../../engines/4-ai-artist/prompt-builder');
const { routeAndGenerate } = require('../../engines/4-ai-artist/router');
const { scoreArtwork } = require('../../engines/4-ai-artist/quality-control');
const { generateVariations } = require('../../engines/4-ai-artist/variation-generator');
const { generateArtwork, runDailyBatch } = require('../../engines/4-ai-artist/index');

const mockSavedArtwork = {
  id: 1,
  uuid: 'mock-uuid-1234',
  artist_id: 10,
  silo_id: 5,
  title: 'TestArtist — TestSilo',
  prompt: 'mocked prompt text',
  ai_engine: 'flux-schnell',
  master_image_path: '/storage/gen-001.png',
  quality_score: 85,
  status: 'generated',
};

describe('generateArtwork', () => {
  const artist = { id: 10, name: 'TestArtist', preferred_engine: 'flux-schnell' };
  const silo = { id: 5, name: 'TestSilo' };

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply mocks after clearAllMocks
    buildArtworkPrompt.mockReturnValue('mocked prompt text');
    routeAndGenerate.mockResolvedValue({
      id: 'gen-001',
      file_path: '/storage/gen-001.png',
      engine: 'flux-schnell',
      width: 1024,
      height: 1024,
    });
    scoreArtwork.mockResolvedValue({ score: 85, passes: true, model: 'clip-vit-large-patch14' });
    generateVariations.mockResolvedValue([
      { variationIndex: 1, prompt: 'v1', baseArtworkId: 1 },
      { variationIndex: 2, prompt: 'v2', baseArtworkId: 1 },
      { variationIndex: 3, prompt: 'v3', baseArtworkId: 1 },
    ]);
    query.mockResolvedValue({ rows: [mockSavedArtwork] });
  });

  test('generateArtwork runs all pipeline stages', async () => {
    const result = await generateArtwork({ artist, silo, options: {} });

    expect(buildArtworkPrompt).toHaveBeenCalledTimes(1);
    expect(buildArtworkPrompt).toHaveBeenCalledWith(artist, silo, {});

    expect(routeAndGenerate).toHaveBeenCalledTimes(1);
    expect(scoreArtwork).toHaveBeenCalledTimes(1);
    expect(scoreArtwork).toHaveBeenCalledWith('/storage/gen-001.png', 'mocked prompt text');

    expect(query).toHaveBeenCalledTimes(1);
    expect(generateVariations).toHaveBeenCalledTimes(1);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('artwork');
    expect(result).toHaveProperty('variations');
    expect(result).toHaveProperty('qcResult');
    expect(result.qcResult.passes).toBe(true);
  });

  test('generateArtwork returns null and logs rejection when QC fails', async () => {
    scoreArtwork.mockResolvedValueOnce({ score: 50, passes: false, model: 'clip-vit-large-patch14' });

    const result = await generateArtwork({ artist, silo, options: {} });

    expect(result).toBeNull();
    // DB insert should NOT be called when QC fails
    expect(query).not.toHaveBeenCalled();
    // Variations should NOT be generated when QC fails
    expect(generateVariations).not.toHaveBeenCalled();
  });
});

describe('runDailyBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildArtworkPrompt.mockReturnValue('mocked prompt text');
    routeAndGenerate.mockResolvedValue({
      id: 'gen-001',
      file_path: '/storage/gen-001.png',
      engine: 'flux-schnell',
    });
    scoreArtwork.mockResolvedValue({ score: 85, passes: true, model: 'clip-vit-large-patch14' });
    generateVariations.mockResolvedValue([]);
    query.mockResolvedValue({ rows: [mockSavedArtwork] });
  });

  test('runDailyBatch returns summary with generated/rejected/errors', async () => {
    const silos = [{ id: 1, name: 'Silo A', priority: 50 }];
    const artists = [{ id: 10, name: 'ArtistA', silo_id: 1 }];

    // Run a small batch: dailyTarget=3
    const summary = await runDailyBatch({ dailyTarget: 3, silos, artists });

    expect(summary).toHaveProperty('generated');
    expect(summary).toHaveProperty('rejected');
    expect(summary).toHaveProperty('errors');
    expect(summary).toHaveProperty('elapsed');
    expect(typeof summary.generated).toBe('number');
    expect(typeof summary.rejected).toBe('number');
    expect(typeof summary.errors).toBe('number');
    expect(typeof summary.elapsed).toBe('number');
    expect(summary.generated + summary.rejected + summary.errors).toBe(3);
  });

  test('runDailyBatch counts rejections correctly when QC fails', async () => {
    scoreArtwork.mockResolvedValue({ score: 40, passes: false, model: 'clip-vit-large-patch14' });

    const silos = [{ id: 1, name: 'Silo A', priority: 50 }];
    const artists = [{ id: 10, name: 'ArtistA', silo_id: 1 }];

    const summary = await runDailyBatch({ dailyTarget: 2, silos, artists });

    expect(summary.rejected).toBe(2);
    expect(summary.generated).toBe(0);
    expect(summary.errors).toBe(0);
  });

  test('runDailyBatch returns early when no silos available', async () => {
    // When silos is empty array and artists is empty, uses provided silos
    const summary = await runDailyBatch({ dailyTarget: 5, silos: [], artists: [{ id: 1, name: 'A' }] });

    expect(summary.generated).toBe(0);
    expect(summary.rejected).toBe(0);
    expect(summary.errors).toBe(0);
  });
});
