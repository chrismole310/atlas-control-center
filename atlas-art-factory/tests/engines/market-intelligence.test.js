'use strict';

// Mock all stage modules before requiring the index
jest.mock('../../engines/2-market-intelligence/demand-scorer');
jest.mock('../../engines/2-market-intelligence/opportunity-ranker');
jest.mock('../../engines/2-market-intelligence/silo-updater');
jest.mock('../../engines/2-market-intelligence/trend-alerts');

const { scoreDemand, getAllScrapedKeywords } = require('../../engines/2-market-intelligence/demand-scorer');
const { rankOpportunities } = require('../../engines/2-market-intelligence/opportunity-ranker');
const { updateSiloPriorities } = require('../../engines/2-market-intelligence/silo-updater');
const { detectTrendAlerts } = require('../../engines/2-market-intelligence/trend-alerts');
const { runMarketIntelligence } = require('../../engines/2-market-intelligence/index');

const MOCK_OPPORTUNITIES = [
  { niche: 'watercolor art', demand_score: 90, opportunity_rank: 1 },
];
const MOCK_SILO_UPDATES = [
  { silo_id: 1, silo_name: 'nursery-animals', new_slots: 50 },
];
const MOCK_ALERTS = [
  { keyword: 'boho print', current_score: 85, rise_pct: 0.25 },
];

describe('runMarketIntelligence', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: all stages succeed
    getAllScrapedKeywords.mockResolvedValue(['watercolor art', 'botanical prints']);
    scoreDemand.mockResolvedValue([{ keyword: 'watercolor art', score: 90, qualifies: true }]);
    rankOpportunities.mockResolvedValue(MOCK_OPPORTUNITIES);
    updateSiloPriorities.mockResolvedValue(MOCK_SILO_UPDATES);
    detectTrendAlerts.mockResolvedValue(MOCK_ALERTS);
  });

  test('runMarketIntelligence runs all 4 stages', async () => {
    const result = await runMarketIntelligence();

    // All stage functions were called
    expect(getAllScrapedKeywords).toHaveBeenCalledTimes(1);
    expect(scoreDemand).toHaveBeenCalledTimes(1);
    expect(rankOpportunities).toHaveBeenCalledTimes(1);
    expect(updateSiloPriorities).toHaveBeenCalledTimes(1);
    expect(detectTrendAlerts).toHaveBeenCalledTimes(1);

    // Result has correct shape
    expect(result).toHaveProperty('opportunities');
    expect(result).toHaveProperty('siloUpdates');
    expect(result).toHaveProperty('alerts');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(Array.isArray(result.siloUpdates)).toBe(true);
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);

    // Data from mocks is present
    expect(result.opportunities).toEqual(MOCK_OPPORTUNITIES);
    expect(result.siloUpdates).toEqual(MOCK_SILO_UPDATES);
    expect(result.alerts).toEqual(MOCK_ALERTS);
    expect(result.errors).toHaveLength(0);
  });

  test('runMarketIntelligence continues if one stage fails', async () => {
    // Stage 2 (opportunity ranking) throws
    rankOpportunities.mockRejectedValue(new Error('DB connection lost'));

    const result = await runMarketIntelligence();

    // Stages 1, 3, 4 still called
    expect(getAllScrapedKeywords).toHaveBeenCalledTimes(1);
    expect(scoreDemand).toHaveBeenCalledTimes(1);
    expect(updateSiloPriorities).toHaveBeenCalledTimes(1);
    expect(detectTrendAlerts).toHaveBeenCalledTimes(1);

    // Stage 2 was attempted
    expect(rankOpportunities).toHaveBeenCalledTimes(1);

    // opportunities is empty (stage 2 failed)
    expect(result.opportunities).toEqual([]);

    // siloUpdates and alerts come from successful stages
    expect(result.siloUpdates).toEqual(MOCK_SILO_UPDATES);
    expect(result.alerts).toEqual(MOCK_ALERTS);

    // Exactly one error recorded
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe('opportunity-ranking');
    expect(result.errors[0].message).toBe('DB connection lost');
  });

  test('runMarketIntelligence returns empty arrays when all stages fail', async () => {
    // All 4 stage functions throw
    getAllScrapedKeywords.mockRejectedValue(new Error('keywords fail'));
    rankOpportunities.mockRejectedValue(new Error('ranking fail'));
    updateSiloPriorities.mockRejectedValue(new Error('silo fail'));
    detectTrendAlerts.mockRejectedValue(new Error('alerts fail'));

    const result = await runMarketIntelligence();

    // All arrays are empty
    expect(result.opportunities).toEqual([]);
    expect(result.siloUpdates).toEqual([]);
    expect(result.alerts).toEqual([]);

    // All 4 errors recorded
    expect(result.errors).toHaveLength(4);
    const stages = result.errors.map(e => e.stage);
    expect(stages).toContain('demand-scoring');
    expect(stages).toContain('opportunity-ranking');
    expect(stages).toContain('silo-update');
    expect(stages).toContain('trend-alerts');
  });
});
