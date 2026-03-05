'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/image-production/ai-router', () => ({
  selectEngine: jest.fn().mockReturnValue('flux-schnell'),
  getAdapter: jest.fn().mockReturnValue({
    generate: jest.fn().mockResolvedValue({
      image_url: 'https://example.com/generated.png',
      engine: 'replicate',
      model: 'flux-schnell',
    }),
  }),
}));
jest.mock('../../../engines/image-production/quality-controller', () => ({
  scoreImage: jest.fn().mockResolvedValue({ total_score: 85 }),
  meetsQualityThreshold: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../engines/4-ai-artist/dna-prompt-builder', () => ({
  buildPrompt: jest.fn().mockReturnValue('test prompt for nursery art'),
}));

const { query } = require('../../../core/database');
const { generateArtwork, runImageProduction } = require('../../../engines/image-production/index');

beforeEach(() => query.mockReset());

test('generateArtwork creates artwork record and returns result', async () => {
  // Mock: INSERT artwork
  query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
  // Mock: UPDATE artwork with image URL
  query.mockResolvedValue({ rowCount: 1 });

  const result = await generateArtwork({
    artist: { id: 1, name: 'TestArtist', enhancedPromptTemplate: 'test {{animal}}' },
    silo: { id: 1, name: 'nursery-animals' },
    subject: { animal: 'fox' },
  });

  expect(result).toHaveProperty('artwork_id');
  expect(result).toHaveProperty('image_url');
  expect(result).toHaveProperty('quality_score');
});

test('runImageProduction processes jobs for active silos', async () => {
  // Mock: get active silos with artists
  query.mockResolvedValueOnce({
    rows: [
      { silo_id: 1, silo_name: 'nursery', artist_id: 1, artist_name: 'TestArtist', allocation: 2,
        enhancedPromptTemplate: 'test', negative_prompts: [], preferred_ai_engine: 'flux-schnell',
        style_rules: '{}', prompt_templates: '{}' },
    ],
  });
  // Mock: INSERT + UPDATE for each artwork
  query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

  const result = await runImageProduction();
  expect(result).toHaveProperty('total_generated');
  expect(result).toHaveProperty('total_passed_qc');
});
