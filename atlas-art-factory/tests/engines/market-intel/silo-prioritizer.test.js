'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { updateSiloPriorities, allocateSlots } = require('../../../engines/market-intel/silo-prioritizer');

beforeEach(() => query.mockReset());

test('allocateSlots distributes 200 slots by priority', () => {
  const silos = [
    { id: 1, name: 'nursery', priority: 80, total_sales: 100, total_artworks: 50 },
    { id: 2, name: 'abstract', priority: 60, total_sales: 50, total_artworks: 30 },
    { id: 3, name: 'botanical', priority: 40, total_sales: 10, total_artworks: 20 },
  ];
  const slots = allocateSlots(silos, 200);
  expect(slots.reduce((a, b) => a + b.allocation, 0)).toBeLessThanOrEqual(200);
  expect(slots[0].allocation).toBeGreaterThan(slots[2].allocation);
});

test('updateSiloPriorities adjusts based on conversion rate', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, name: 'nursery', priority: 50, total_sales: 100, total_artworks: 200, total_revenue: '500' },
      { id: 2, name: 'abstract', priority: 50, total_sales: 5, total_artworks: 200, total_revenue: '25' },
    ],
  });
  query.mockResolvedValue({ rowCount: 1 });

  const result = await updateSiloPriorities();
  expect(result.silos_updated).toBe(2);
  const updateCalls = query.mock.calls.filter(c => c[0].includes('UPDATE silos'));
  expect(updateCalls.length).toBe(2);
});
