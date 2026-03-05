'use strict';

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: { id: 'pred-1', urls: { get: 'https://api.replicate.com/v1/predictions/pred-1' } },
  }),
  get: jest.fn().mockResolvedValue({
    data: { status: 'succeeded', output: ['https://replicate.delivery/img.png'], metrics: { predict_time: 2.5 } },
  }),
}));

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { benchmarkModel } = require('../../../engines/model-discovery/benchmarker');

beforeEach(() => query.mockReset());

test('benchmarkModel runs test prompts and returns scores', async () => {
  query.mockResolvedValue({ rowCount: 1 });

  const result = await benchmarkModel({
    modelId: 'user/test-model',
    source: 'replicate',
  });

  expect(result).toHaveProperty('avg_quality_score');
  expect(result).toHaveProperty('avg_speed_ms');
  expect(result).toHaveProperty('overall_score');
  expect(result.prompts_tested).toBe(5);
});
