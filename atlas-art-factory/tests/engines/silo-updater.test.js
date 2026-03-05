'use strict';

jest.mock('../../core/database', () => ({ query: jest.fn() }));

const { query } = require('../../core/database');
const { updateSiloPriorities, getSiloDemandScore, distributeSlots } = require('../../engines/2-market-intelligence/silo-updater');

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// distributeSlots
// ---------------------------------------------------------------------------

describe('distributeSlots', () => {
  test('distributes 200 slots proportionally', () => {
    const siloScores = [
      { id: 1, score: 90 },
      { id: 2, score: 80 },
      { id: 3, score: 50 },
    ];

    const result = distributeSlots(siloScores, 200, 1);

    // Sum must equal exactly 200
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(200);

    // Higher score should get more slots
    expect(result.get(1)).toBeGreaterThan(result.get(3));
    expect(result.get(2)).toBeGreaterThan(result.get(3));

    // Each gets at least 1
    for (const slots of result.values()) {
      expect(slots).toBeGreaterThanOrEqual(1);
    }
  });

  test('ensures every silo gets at least minSlots=1', () => {
    const siloScores = [
      { id: 1, score: 100 },
      { id: 2, score: 0 },   // zero score silo
    ];

    const result = distributeSlots(siloScores, 200, 1);

    // Zero-score silo should still get at least 1
    expect(result.get(2)).toBeGreaterThanOrEqual(1);

    // Total still = 200
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(200);
  });

  test('handles single silo — gets all 200 slots', () => {
    const siloScores = [{ id: 7, score: 75 }];

    const result = distributeSlots(siloScores, 200, 1);

    expect(result.get(7)).toBe(200);
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(200);
  });

  test('empty array returns empty Map', () => {
    const result = distributeSlots([], 200, 1);
    expect(result.size).toBe(0);
  });

  test('all-negative scores treated as equal-distribution (sum = 200, each >= 1)', () => {
    const siloScores = [
      { id: 1, score: -10 },
      { id: 2, score: -50 },
      { id: 3, score: -1 },
    ];

    const result = distributeSlots(siloScores, 200, 1);

    // Sum must equal exactly 200
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(200);

    // Each gets at least 1
    for (const slots of result.values()) {
      expect(slots).toBeGreaterThanOrEqual(1);
    }
  });

  test('overflow case: count * minSlots > totalSlots — sum still equals totalSlots', () => {
    // 201 silos with minSlots=1 and totalSlots=200 would overflow without Fix 1
    const siloScores = Array.from({ length: 201 }, (_, i) => ({ id: i + 1, score: 10 }));

    const result = distributeSlots(siloScores, 200, 1);

    // Sum must still equal exactly 200
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(200);

    // Each silo should have received at least 0 slots (effectiveMin floors to 0 here)
    for (const slots of result.values()) {
      expect(slots).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getSiloDemandScore
// ---------------------------------------------------------------------------

describe('getSiloDemandScore', () => {
  test('returns average of silo keywords demand scores', async () => {
    // The query returns an avg of two keywords with scores 70 and 90 → avg = 80
    query.mockResolvedValueOnce({ rows: [{ avg_score: '80' }] });

    const score = await getSiloDemandScore(1);
    expect(score).toBe(80);
    expect(query).toHaveBeenCalledTimes(1);
    // Verify the query joined silo_keywords with demand_scores
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/silo_keywords/);
    expect(sql).toMatch(/demand_scores/);
  });

  test('returns DEFAULT_DEMAND_SCORE=50 when no keywords match', async () => {
    // avg_score is null when no rows match the join
    query.mockResolvedValueOnce({ rows: [{ avg_score: null }] });

    const score = await getSiloDemandScore(99);
    expect(score).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// updateSiloPriorities
// ---------------------------------------------------------------------------

describe('updateSiloPriorities', () => {
  test('returns updated allocation sorted by new_slots DESC', async () => {
    // 1st call: SELECT active silos — silo 1 has high demand, silo 2 has low
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'nursery',  target_daily_output: 4, priority: 80 },
        { id: 2, name: 'abstract', target_daily_output: 4, priority: 50 },
      ],
    });

    // getSiloDemandScore for silo 1 → 90
    query.mockResolvedValueOnce({ rows: [{ avg_score: '90' }] });
    // getSiloDemandScore for silo 2 → 30
    query.mockResolvedValueOnce({ rows: [{ avg_score: '30' }] });

    // UPDATE for silo 1
    query.mockResolvedValueOnce({ rowCount: 1 });
    // UPDATE for silo 2
    query.mockResolvedValueOnce({ rowCount: 1 });

    const results = await updateSiloPriorities();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // Total must be exactly 200
    const total = results.reduce((s, r) => s + r.new_slots, 0);
    expect(total).toBe(200);

    // Sorted by new_slots DESC — higher demand silo first
    expect(results[0].silo_name).toBe('nursery');
    expect(results[0].new_slots).toBeGreaterThan(results[1].new_slots);

    // All expected fields present
    expect(results[0]).toHaveProperty('silo_id');
    expect(results[0]).toHaveProperty('silo_name');
    expect(results[0]).toHaveProperty('old_slots');
    expect(results[0]).toHaveProperty('new_slots');
    expect(results[0]).toHaveProperty('demand_score');

    // old_slots reflects what was in DB
    expect(results[0].old_slots).toBe(4);
  });

  test('handles no active silos — returns empty array', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const results = await updateSiloPriorities();
    expect(results).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('getSiloDemandScore rejection falls back to DEFAULT_DEMAND_SCORE and still returns 1 result', async () => {
    // 1st call: SELECT active silos — 1 silo
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'floral', target_daily_output: 5, priority: 60 }],
    });

    // getSiloDemandScore for silo 1 → rejects
    query.mockRejectedValueOnce(new Error('DB connection lost'));

    // UPDATE for silo 1 → succeeds
    query.mockResolvedValueOnce({ rowCount: 1 });

    const results = await updateSiloPriorities();

    // Should not throw; returns 1 result using DEFAULT_DEMAND_SCORE=50
    expect(results.length).toBe(1);
    expect(results[0].demand_score).toBe(50);
    expect(results[0].silo_name).toBe('floral');
  });
});
