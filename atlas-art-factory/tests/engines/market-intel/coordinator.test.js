'use strict';

jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/market-intel/demand-calculator', () => ({
  calculateDemandScores: jest.fn().mockResolvedValue({ keywords_scored: 10 }),
}));
jest.mock('../../../engines/market-intel/niche-ranker', () => ({
  rankOpportunities: jest.fn().mockResolvedValue({ opportunities_ranked: 5 }),
}));
jest.mock('../../../engines/market-intel/silo-prioritizer', () => ({
  updateSiloPriorities: jest.fn().mockResolvedValue({ silos_updated: 50 }),
}));
jest.mock('../../../engines/market-intel/trend-alerts', () => ({
  detectTrendAlerts: jest.fn().mockResolvedValue([{ keyword: 'test', priority: 'high' }]),
}));

const { runMarketIntelligence } = require('../../../engines/market-intel/index');

test('runMarketIntelligence runs all steps and returns summary', async () => {
  const result = await runMarketIntelligence();
  expect(result).toHaveProperty('keywords_scored', 10);
  expect(result).toHaveProperty('opportunities_ranked', 5);
  expect(result).toHaveProperty('silos_updated', 50);
  expect(result).toHaveProperty('trend_alerts', 1);
});
