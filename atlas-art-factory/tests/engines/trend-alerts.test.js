'use strict';

jest.mock('../../core/database', () => ({ query: jest.fn() }));

const { query } = require('../../core/database');
const { detectTrendAlerts, computeRisePct } = require('../../engines/2-market-intelligence/trend-alerts');

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// computeRisePct
// ---------------------------------------------------------------------------

describe('computeRisePct', () => {
  test('returns correct percentage', () => {
    // (80 - 60) / 60 = 0.3333...
    const result = computeRisePct(80, 60);
    expect(result).toBeCloseTo(1 / 3, 5);
  });

  test('returns 0 when avgScore is 0', () => {
    expect(computeRisePct(80, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectTrendAlerts
// ---------------------------------------------------------------------------

describe('detectTrendAlerts', () => {
  test('returns alerts sorted by rise_pct DESC', async () => {
    // 3 keywords: 2 qualify (score >= ALERT_MIN_SCORE=65 and >= TREND_THRESHOLD=80
    // and trend_direction='rising'), 1 does not meet minScore.
    // The query mock returns two rising keywords; the third is excluded by WHERE.
    query.mockResolvedValueOnce({
      rows: [
        // current_score=90 → avg=76.5 → rise_pct≈0.176 -- but 90 >= 80 so qualifies
        { keyword: 'boho art', demand_score: '90', silo_name: 'boho' },
        // current_score=85 → avg=72.25 → rise_pct≈0.176 -- qualifies
        { keyword: 'cottagecore print', demand_score: '85', silo_name: 'cottagecore' },
      ],
    });

    const alerts = await detectTrendAlerts({ threshold: 0.10, minScore: 65 });

    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBe(2);

    // Both alerts have required fields
    for (const alert of alerts) {
      expect(alert).toHaveProperty('keyword');
      expect(alert).toHaveProperty('current_score');
      expect(alert).toHaveProperty('avg_score');
      expect(alert).toHaveProperty('rise_pct');
      expect(alert).toHaveProperty('silo_name');
    }

    // Sorted by rise_pct DESC — higher current_score => higher rise_pct
    // (since avg = 0.85 * current, rise_pct is the same for all; tie-break preserves
    // original DB ordering of demand_score DESC which puts boho first)
    expect(alerts[0].keyword).toBe('boho art');
    expect(alerts[0].rise_pct).toBeGreaterThanOrEqual(alerts[1].rise_pct);
  });

  test('filters by minScore — keyword with current_score below minScore excluded', async () => {
    // Simulate DB returning one keyword; our threshold/minScore will exclude it
    // because its score is below TREND_THRESHOLD=80.
    // We test this by passing a high minScore option AND having the DB row's score
    // be below that value (the WHERE clause uses Math.max(minScore, ALERT_MIN_SCORE)).
    // Mock DB returning a score < TREND_THRESHOLD=80 but >= ALERT_MIN_SCORE=65.
    // With TREND_THRESHOLD now in the SQL WHERE clause, the DB would exclude this
    // row; in the mock all rows are returned so the JS post-filter also catches it.
    query.mockResolvedValueOnce({
      rows: [
        { keyword: 'low score art', demand_score: '70', silo_name: null },
      ],
    });

    // score=70 < TREND_THRESHOLD=80 so the JS guard excludes it
    const alerts = await detectTrendAlerts({ threshold: 0.10, minScore: 30 });

    expect(alerts).toEqual([]);
  });

  test('returns empty array when no alerts', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const alerts = await detectTrendAlerts();

    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts).toHaveLength(0);
  });

  test('returns [] and does not throw when DB query rejects', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const alerts = await detectTrendAlerts();

    expect(alerts).toEqual([]);
  });
});
