'use strict';

jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

const { generateVariationPrompts, generateVariations } = require('../../engines/4-ai-artist/variation-generator');

describe('generateVariationPrompts', () => {
  test('generateVariationPrompts returns 3 prompts', () => {
    const prompts = generateVariationPrompts('a fox in the forest', {});
    expect(Array.isArray(prompts)).toBe(true);
    expect(prompts).toHaveLength(3);
    prompts.forEach((p) => expect(typeof p).toBe('string'));
  });

  test('generateVariationPrompts prompts are different from each other', () => {
    const prompts = generateVariationPrompts('a fox in the forest', {});
    const [p1, p2, p3] = prompts;
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
    expect(p2).not.toBe(p3);
  });

  test('generateVariationPrompts includes base prompt content in each variation', () => {
    const base = 'golden retriever portrait';
    const prompts = generateVariationPrompts(base, {});
    prompts.forEach((p) => {
      expect(p).toContain('golden retriever portrait');
    });
  });
});

describe('generateVariations', () => {
  test('generateVariations calls routeAndGenerate for each variation', async () => {
    const mockRouteAndGenerate = jest.fn().mockResolvedValue({
      id: 'gen-result',
      file_path: '/storage/test.png',
      engine: 'flux-schnell',
    });

    const baseArtwork = {
      id: 42,
      prompt: 'abstract landscape painting',
      artist: { name: 'TestArtist', id: 1 },
      file_path: '/storage/base.png',
    };

    await generateVariations(baseArtwork, { routeAndGenerate: mockRouteAndGenerate });

    expect(mockRouteAndGenerate).toHaveBeenCalledTimes(3);
  });

  test('generateVariations returns array of results', async () => {
    const mockRouteAndGenerate = jest.fn().mockResolvedValue({
      id: 'gen-result',
      file_path: '/storage/test.png',
      engine: 'flux-schnell',
    });

    const baseArtwork = {
      id: 42,
      prompt: 'abstract landscape painting',
      artist: { name: 'TestArtist', id: 1 },
      file_path: '/storage/base.png',
    };

    const results = await generateVariations(baseArtwork, { routeAndGenerate: mockRouteAndGenerate });

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r).toHaveProperty('variationIndex');
      expect(r).toHaveProperty('prompt');
      expect(r).toHaveProperty('baseArtworkId', 42);
    });
  });

  test('generateVariations throws if routeAndGenerate is not a function', async () => {
    const baseArtwork = { id: 1, prompt: 'test', artist: {}, file_path: '/storage/test.png' };
    await expect(generateVariations(baseArtwork, {})).rejects.toThrow('routeAndGenerate must be a function');
  });
});
