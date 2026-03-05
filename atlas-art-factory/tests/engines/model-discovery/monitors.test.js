'use strict';

jest.mock('axios', () => ({ get: jest.fn() }));

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const axios = require('axios');
const { query } = require('../../../core/database');
const { scanHuggingFace } = require('../../../engines/model-discovery/huggingface-monitor');
const { scanReplicate } = require('../../../engines/model-discovery/replicate-monitor');

beforeEach(() => {
  query.mockReset();
  axios.get.mockReset();
});

describe('HuggingFace Monitor', () => {
  test('scanHuggingFace discovers new text-to-image models', async () => {
    axios.get.mockResolvedValueOnce({
      data: [
        { modelId: 'user/new-model-v1', pipeline_tag: 'text-to-image', downloads: 5000, likes: 100 },
        { modelId: 'user/old-model', pipeline_tag: 'text-to-image', downloads: 200, likes: 5 },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValue({ rowCount: 1 });

    const result = await scanHuggingFace();
    expect(result).toHaveProperty('models_found');
    expect(result).toHaveProperty('new_models');
  });
});

describe('Replicate Monitor', () => {
  test('scanReplicate discovers new image generation models', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        results: [
          { url: 'https://replicate.com/user/model', name: 'new-flux-model', description: 'A new image model', run_count: 10000 },
        ],
      },
    });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValue({ rowCount: 1 });

    const result = await scanReplicate();
    expect(result).toHaveProperty('models_found');
    expect(result).toHaveProperty('new_models');
  });
});
