'use strict';

jest.mock('axios');
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    images: {
      generate: jest.fn().mockResolvedValue({
        data: [{ url: 'https://oaidalleapi.com/img.png', revised_prompt: 'enhanced prompt' }],
      }),
    },
  }));
});

const axios = require('axios');
const ReplicateAdapter = require('../../../engines/image-production/adapters/replicate');
const DalleAdapter = require('../../../engines/image-production/adapters/openai-dalle');
const IdeogramAdapter = require('../../../engines/image-production/adapters/ideogram');

describe('ReplicateAdapter', () => {
  let adapter;
  beforeEach(() => {
    adapter = new ReplicateAdapter({ apiToken: 'test-token', pollIntervalMs: 0 });
    axios.post.mockReset();
    axios.get.mockReset();
  });

  test('generate sends prediction and polls for result', async () => {
    axios.post.mockResolvedValueOnce({
      data: { id: 'pred-123', urls: { get: 'https://api.replicate.com/v1/predictions/pred-123' } },
    });
    axios.get.mockResolvedValueOnce({
      data: { status: 'succeeded', output: ['https://replicate.delivery/img.png'] },
    });

    const result = await adapter.generate({
      prompt: 'test prompt',
      model: 'black-forest-labs/FLUX.1-schnell',
    });
    expect(result.image_url).toBe('https://replicate.delivery/img.png');
    expect(result.engine).toBe('replicate');
  });

  test('generate throws on failure', async () => {
    axios.post.mockResolvedValueOnce({
      data: { id: 'pred-456', urls: { get: 'https://api.replicate.com/v1/predictions/pred-456' } },
    });
    axios.get.mockResolvedValueOnce({
      data: { status: 'failed', error: 'Model error' },
    });

    await expect(adapter.generate({ prompt: 'test', model: 'test-model' }))
      .rejects.toThrow('Model error');
  });
});

describe('DalleAdapter', () => {
  test('generate calls OpenAI images API', async () => {
    const adapter = new DalleAdapter({ apiKey: 'test-key' });
    const result = await adapter.generate({ prompt: 'cute nursery art' });
    expect(result.image_url).toBe('https://oaidalleapi.com/img.png');
    expect(result.engine).toBe('dalle3');
  });
});

describe('IdeogramAdapter', () => {
  test('generate calls Ideogram API', async () => {
    axios.post.mockResolvedValueOnce({
      data: { data: [{ url: 'https://ideogram.ai/img.png' }] },
    });
    const adapter = new IdeogramAdapter({ apiKey: 'test-key' });
    const result = await adapter.generate({ prompt: 'typography art' });
    expect(result.image_url).toBe('https://ideogram.ai/img.png');
    expect(result.engine).toBe('ideogram');
  });
});
