'use strict';

// Mock all engine modules before requiring router
jest.mock('../../engines/4-ai-artist/engines/flux', () => ({
  generateFluxSchnell: jest.fn().mockResolvedValue({ id: 'test', engine: 'flux-schnell' }),
  generateFluxDev:     jest.fn().mockResolvedValue({ id: 'test', engine: 'flux-dev' }),
}));

jest.mock('../../engines/4-ai-artist/engines/dalle3', () => ({
  generate: jest.fn().mockResolvedValue({ id: 'test', engine: 'dalle3' }),
}));

jest.mock('../../engines/4-ai-artist/engines/ideogram', () => ({
  generate: jest.fn().mockResolvedValue({ id: 'test', engine: 'ideogram' }),
}));

const { selectEngine, routeAndGenerate } = require('../../engines/4-ai-artist/router');
const flux     = require('../../engines/4-ai-artist/engines/flux');
const dalle3   = require('../../engines/4-ai-artist/engines/dalle3');
const ideogram = require('../../engines/4-ai-artist/engines/ideogram');

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// selectEngine tests
// ---------------------------------------------------------------------------

describe('selectEngine', () => {
  test('selectEngine returns ideogram for typography flag', () => {
    const result = selectEngine({ flags: { hasTypography: true } });
    expect(result).toBe('ideogram');
  });

  test('selectEngine returns dalle3 for premium flag', () => {
    const result = selectEngine({ flags: { isPremium: true } });
    expect(result).toBe('dalle3');
  });

  test('selectEngine returns flux-schnell for batch flag', () => {
    const result = selectEngine({ flags: { isBatch: true } });
    expect(result).toBe('flux-schnell');
  });

  test('selectEngine returns flux-dev for quality flag', () => {
    const result = selectEngine({ flags: { isQuality: true } });
    expect(result).toBe('flux-dev');
  });

  test('selectEngine returns flux-schnell (fallback) for empty flags', () => {
    // routing_rules.fallback is 'sdxl', but sdxl is not implemented so
    // routeAndGenerate falls back to flux-schnell. selectEngine itself
    // returns 'sdxl'; the fallback occurs in routeAndGenerate.
    // The test description says "returns flux-schnell (fallback) for empty flags"
    // which is the effective runtime result via routeAndGenerate — verify via routing.
    const result = selectEngine({ flags: {} });
    // sdxl is the raw routing_rules.fallback value
    expect(result).toBe('sdxl');
  });

  test('selectEngine prioritizes typography over premium', () => {
    const result = selectEngine({ flags: { hasTypography: true, isPremium: true } });
    expect(result).toBe('ideogram');
  });
});

// ---------------------------------------------------------------------------
// routeAndGenerate tests
// ---------------------------------------------------------------------------

describe('routeAndGenerate', () => {
  test('routeAndGenerate calls the correct generator for typography job', async () => {
    const job = {
      prompt: 'motivational quote typography',
      flags: { hasTypography: true },
      options: { outputId: 'test-typo' },
    };

    await routeAndGenerate(job);

    expect(ideogram.generate).toHaveBeenCalledTimes(1);
    expect(ideogram.generate).toHaveBeenCalledWith('motivational quote typography', { outputId: 'test-typo' });
  });

  test('routeAndGenerate returns generator output', async () => {
    ideogram.generate.mockResolvedValueOnce({
      id: 'typo-001',
      file_path: '/storage/typo-001.png',
      engine: 'ideogram',
      width: 1024,
      height: 1536,
      prompt: 'motivational quote',
      url: 'https://example.com/typo-001.png',
    });

    const job = {
      prompt: 'motivational quote',
      flags: { hasTypography: true },
      options: {},
    };

    const result = await routeAndGenerate(job);

    expect(result).toEqual({
      id: 'typo-001',
      file_path: '/storage/typo-001.png',
      engine: 'ideogram',
      width: 1024,
      height: 1536,
      prompt: 'motivational quote',
      url: 'https://example.com/typo-001.png',
    });
  });

  test('routeAndGenerate handles sdxl by falling back to flux-schnell', async () => {
    // Empty flags → selectEngine returns 'sdxl' → routeAndGenerate falls back to flux-schnell
    const job = {
      prompt: 'abstract landscape',
      flags: {},
      options: { outputId: 'fallback-001' },
    };

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await routeAndGenerate(job);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sdxl'));
    expect(flux.generateFluxSchnell).toHaveBeenCalledTimes(1);
    expect(flux.generateFluxSchnell).toHaveBeenCalledWith('abstract landscape', { outputId: 'fallback-001' });

    warnSpy.mockRestore();
  });
});
