'use strict';

jest.mock('../../core/database');
const { query } = require('../../core/database');
const { computeDemandScore, scoreDemand, SCORE_THRESHOLD } = require('../../engines/2-market-intelligence/demand-scorer');

describe('Demand Score Calculator', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper: set up the four mocked query calls that computeDemandScore makes
   * (getSearchVolume, getSalesVelocity, getSocialEngagement, getCompetitionCount).
   */
  function setupMocks({ searchVolume = 0, salesVelocity = 0, socialEngagement = 0, competitionCount = 1 } = {}) {
    query
      // getSearchVolume — google-trends query
      .mockResolvedValueOnce({ rows: [{ description: JSON.stringify({ avgValue: searchVolume }) }] })
      // getSalesVelocity
      .mockResolvedValueOnce({ rows: [{ avg_sales: salesVelocity }] })
      // getSocialEngagement
      .mockResolvedValueOnce({ rows: [{ avg_engagement: socialEngagement }] })
      // getCompetitionCount
      .mockResolvedValueOnce({ rows: [{ cnt: competitionCount }] });
  }

  test('computeDemandScore returns score object with required fields', async () => {
    setupMocks({ searchVolume: 75, salesVelocity: 200, socialEngagement: 150, competitionCount: 10 });
    const result = await computeDemandScore('nursery art');
    expect(result).toHaveProperty('keyword', 'nursery art');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('qualifies');
    expect(result).toHaveProperty('searchVolume');
    expect(result).toHaveProperty('salesVelocity');
    expect(result).toHaveProperty('socialEngagement');
    expect(result).toHaveProperty('competitionCount');
  });

  test('score is between 0 and 100', async () => {
    setupMocks({ searchVolume: 100, salesVelocity: 1000, socialEngagement: 1000, competitionCount: 1 });
    const result = await computeDemandScore('popular niche');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('zero signals produce score of 0', async () => {
    setupMocks({ searchVolume: 0, salesVelocity: 0, socialEngagement: 0, competitionCount: 5 });
    const result = await computeDemandScore('unknown niche');
    expect(result.score).toBe(0);
  });

  test('qualifies is true when score >= SCORE_THRESHOLD', async () => {
    // Mock high values to guarantee a high score
    setupMocks({ searchVolume: 100, salesVelocity: 1000, socialEngagement: 1000, competitionCount: 1 });
    const result = await computeDemandScore('hot niche');
    // Verify qualifies mirrors the score threshold comparison
    expect(result.qualifies).toBe(result.score >= SCORE_THRESHOLD);
  });

  test('qualifies is false when score is 0', async () => {
    setupMocks({ searchVolume: 0, salesVelocity: 0, socialEngagement: 0, competitionCount: 5 });
    const result = await computeDemandScore('cold niche');
    expect(result.qualifies).toBe(false);
  });

  test('higher competition reduces score', async () => {
    setupMocks({ searchVolume: 50, salesVelocity: 100, socialEngagement: 100, competitionCount: 10 });
    const resultLow = await computeDemandScore('niche A');

    setupMocks({ searchVolume: 50, salesVelocity: 100, socialEngagement: 100, competitionCount: 100 });
    const resultHigh = await computeDemandScore('niche B');

    expect(resultLow.score).toBeGreaterThanOrEqual(resultHigh.score);
  });

  test('scoreDemand returns array of scores and saves to DB', async () => {
    // Keyword 1: 4 signal queries + 1 INSERT
    setupMocks({ searchVolume: 60, salesVelocity: 150, socialEngagement: 200, competitionCount: 5 });
    query.mockResolvedValueOnce({ rows: [] }); // INSERT for keyword 1

    // Keyword 2: 4 signal queries + 1 INSERT
    setupMocks({ searchVolume: 30, salesVelocity: 80, socialEngagement: 60, competitionCount: 3 });
    query.mockResolvedValueOnce({ rows: [] }); // INSERT for keyword 2

    const results = await scoreDemand(['botanical print', 'abstract art']);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0].keyword).toBe('botanical print');
  });

  test('scoreDemand continues on individual keyword failure', async () => {
    // computeDemandScore uses Promise.all for all 4 signal queries concurrently.
    // When keyword 1 fails we need to account for all 4 concurrent calls:
    // one rejects, the other 3 still resolve (consuming mock slots).
    query
      .mockRejectedValueOnce(new Error('DB error')) // getSearchVolume rejects
      .mockResolvedValueOnce({ rows: [{ avg_sales: 0 }] })    // getSalesVelocity resolves
      .mockResolvedValueOnce({ rows: [{ avg_engagement: 0 }] }) // getSocialEngagement resolves
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });           // getCompetitionCount resolves

    // Second keyword: 4 signal queries + 1 INSERT succeed
    setupMocks({ searchVolume: 50, salesVelocity: 100, socialEngagement: 80, competitionCount: 5 });
    query.mockResolvedValueOnce({ rows: [] }); // INSERT for keyword 2

    const results = await scoreDemand(['bad keyword', 'good keyword']);
    // Only the successful keyword should be in results
    expect(results.length).toBe(1);
    expect(results[0].keyword).toBe('good keyword');
  });

  test('SCORE_THRESHOLD is exported as a number', () => {
    expect(typeof SCORE_THRESHOLD).toBe('number');
    expect(SCORE_THRESHOLD).toBeGreaterThan(0);
    expect(SCORE_THRESHOLD).toBeLessThanOrEqual(100);
  });
});
