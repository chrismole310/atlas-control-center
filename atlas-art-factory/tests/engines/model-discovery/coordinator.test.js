'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/model-discovery/huggingface-monitor', () => ({
  scanHuggingFace: jest.fn().mockResolvedValue({ models_found: 10, new_models: 2 }),
}));
jest.mock('../../../engines/model-discovery/replicate-monitor', () => ({
  scanReplicate: jest.fn().mockResolvedValue({ models_found: 8, new_models: 1 }),
}));
jest.mock('../../../engines/model-discovery/benchmarker', () => ({
  benchmarkModel: jest.fn().mockResolvedValue({ avg_quality_score: 80, overall_score: 75 }),
  TEST_PROMPTS: ['test'],
}));
jest.mock('../../../engines/model-discovery/auto-registrar', () => ({
  registerPassingModels: jest.fn().mockResolvedValue({ registered: 2, rejected: 1 }),
}));

const { runModelDiscovery } = require('../../../engines/model-discovery/index');

test('runModelDiscovery runs all steps and returns summary', async () => {
  const { query } = require('../../../core/database');
  // Mock: get discovered models for benchmarking
  query.mockResolvedValueOnce({
    rows: [{ model_id: 'test/model', source: 'replicate' }],
  });

  const result = await runModelDiscovery();
  expect(result).toHaveProperty('huggingface');
  expect(result).toHaveProperty('replicate');
  expect(result).toHaveProperty('benchmarked');
  expect(result).toHaveProperty('registration');
});
