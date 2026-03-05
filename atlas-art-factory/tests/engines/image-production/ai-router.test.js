'use strict';

jest.mock('axios');
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

jest.mock('../../../core/config', () => ({
  loadConfig: jest.fn().mockReturnValue({
    engines: {
      engines: {
        'flux-schnell': { enabled: true, quality_tier: 'good', cost_per_image: 0, via: 'replicate', model: 'black-forest-labs/FLUX.1-schnell' },
        'flux-dev': { enabled: true, quality_tier: 'excellent', cost_per_image: 0, via: 'replicate', model: 'black-forest-labs/FLUX.1-dev' },
        'dalle3': { enabled: true, quality_tier: 'premium', cost_per_image: 0.04, via: 'openai' },
        'ideogram': { enabled: true, quality_tier: 'excellent', cost_per_image: 0.02, via: 'ideogram' },
        'sdxl': { enabled: true, quality_tier: 'good', cost_per_image: 0, via: 'replicate', model: 'stability-ai/sdxl' },
      },
      routing_rules: { typography: 'ideogram', premium: 'dalle3', batch: 'flux-schnell', quality: 'flux-dev', fallback: 'sdxl' },
    },
  }),
  getEngine: jest.fn(),
}));

const { selectEngine, getAdapter } = require('../../../engines/image-production/ai-router');

test('selectEngine returns typography engine for text-heavy prompts', () => {
  const engine = selectEngine({ tags: ['typography', 'quotes'] });
  expect(engine).toBe('ideogram');
});

test('selectEngine returns batch engine by default', () => {
  const engine = selectEngine({});
  expect(engine).toBe('flux-schnell');
});

test('selectEngine returns premium engine when requested', () => {
  const engine = selectEngine({ quality: 'premium' });
  expect(engine).toBe('dalle3');
});

test('selectEngine returns quality engine for high-quality requests', () => {
  const engine = selectEngine({ quality: 'excellent' });
  expect(engine).toBe('flux-dev');
});

test('getAdapter returns adapter for engine name', () => {
  const adapter = getAdapter('dalle3');
  expect(adapter).toBeTruthy();
  expect(adapter.engineName).toBe('dalle3');
});
