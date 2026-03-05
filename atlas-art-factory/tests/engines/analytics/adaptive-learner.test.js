'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));

const { query } = require('../../../core/database');
const { adjustSiloPriorities } = require('../../../engines/analytics/adaptive-learner');

beforeEach(() => query.mockReset());

test('adjustSiloPriorities boosts winners and penalizes losers', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, name: 'nursery', priority: 50, avg_conversion: 0.08 },
      { id: 2, name: 'abstract', priority: 50, avg_conversion: 0.01 },
      { id: 3, name: 'minimal', priority: 50, avg_conversion: 0.04 },
    ],
  });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await adjustSiloPriorities();
  expect(result).toHaveProperty('silos_adjusted');
  expect(result.silos_adjusted).toBe(3);
});
