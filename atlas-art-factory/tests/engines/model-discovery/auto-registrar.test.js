'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { registerPassingModels } = require('../../../engines/model-discovery/auto-registrar');

beforeEach(() => query.mockReset());

test('registerPassingModels promotes benchmarked models above threshold', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, model_id: 'user/good-model', source: 'replicate', overall_score: 85, avg_speed_ms: 3000, cost_per_image: 0 },
      { id: 2, model_id: 'user/bad-model', source: 'replicate', overall_score: 40, avg_speed_ms: 10000, cost_per_image: 0.05 },
    ],
  });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await registerPassingModels();
  expect(result).toHaveProperty('registered');
  expect(result).toHaveProperty('rejected');
});
