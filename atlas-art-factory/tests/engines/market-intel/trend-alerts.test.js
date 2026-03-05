'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { detectTrendAlerts } = require('../../../engines/market-intel/trend-alerts');

beforeEach(() => query.mockReset());

test('detectTrendAlerts identifies fast-rising keywords', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'cottagecore art', demand_score: 50000, trend_direction: 'rising', saturation_level: 10 },
      { keyword: 'dark academia print', demand_score: 35000, trend_direction: 'rising', saturation_level: 5 },
    ],
  });

  const alerts = await detectTrendAlerts();
  expect(alerts.length).toBe(2);
  expect(alerts[0].keyword).toBe('cottagecore art');
  expect(alerts[0].priority).toBe('high');
});

test('detectTrendAlerts returns empty when no rising trends', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  const alerts = await detectTrendAlerts();
  expect(alerts).toEqual([]);
});
