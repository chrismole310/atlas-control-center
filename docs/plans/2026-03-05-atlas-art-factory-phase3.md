# Atlas Art Factory — Phase 3: Market Intelligence Engine

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the market intelligence engine that calculates demand scores from scraped trends, ranks niche opportunities, dynamically reallocates silo production quotas, and flags fast-rising keywords for immediate production.

**Architecture:** Modules in `engines/market-intel/`. A `DemandCalculator` aggregates scraped_trends + Google Trends data into `demand_scores`. A `NicheRanker` identifies top opportunities in `market_opportunities`. A `SiloPrioritizer` reallocates the 200 daily slots across silos based on performance. A `TrendAlerts` module flags fast-rising keywords. A coordinator wires them into the 08:00 orchestrator schedule.

**Tech Stack:** Node.js, PostgreSQL (via core/database), Bull queue (via core/queue)

---

### Task 18: Demand score calculator

**Files:**
- Create: `atlas-art-factory/engines/market-intel/demand-calculator.js`
- Create: `atlas-art-factory/tests/engines/market-intel/demand-calculator.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/market-intel/demand-calculator.test.js`:

```javascript
'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { calculateDemandScores, computeScore } = require('../../../engines/market-intel/demand-calculator');

beforeEach(() => query.mockReset());

test('computeScore applies formula correctly', () => {
  const score = computeScore({
    search_volume: 1000,
    sales_velocity: 50,
    social_engagement: 500,
    competition_count: 100,
  });
  // (1000 * 50 * 500) / 100 = 250000
  expect(score).toBe(250000);
});

test('computeScore handles zero competition (caps at 1)', () => {
  const score = computeScore({
    search_volume: 100,
    sales_velocity: 10,
    social_engagement: 50,
    competition_count: 0,
  });
  // (100 * 10 * 50) / 1 = 50000
  expect(score).toBe(50000);
});

test('calculateDemandScores aggregates trends and upserts scores', async () => {
  // Mock: get keywords from scraped_trends
  query
    .mockResolvedValueOnce({
      rows: [
        { keyword: 'nursery art', total_sales: 500, total_favorites: 2000, avg_price: 14.99, listing_count: 80 },
        { keyword: 'abstract print', total_sales: 300, total_favorites: 1200, avg_price: 18.50, listing_count: 150 },
      ],
    })
    // Mock: upsert demand_scores (2 calls, one per keyword)
    .mockResolvedValue({ rowCount: 1 });

  const result = await calculateDemandScores();
  expect(result.keywords_scored).toBe(2);
  // Should have called query for aggregate + 2 upserts
  expect(query).toHaveBeenCalledTimes(3);
  // Second call should be an UPSERT
  expect(query.mock.calls[1][0]).toContain('ON CONFLICT');
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/market-intel/demand-calculator.test.js --no-cache
```

Expected: FAIL — cannot find module

**Step 3: Create demand-calculator.js**

Create `atlas-art-factory/engines/market-intel/demand-calculator.js`:

```javascript
'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('demand-calculator');

/**
 * Core formula: (SearchVolume * SalesVelocity * SocialEngagement) / CompetitionCount
 * CompetitionCount is floored at 1 to prevent division by zero.
 */
function computeScore({ search_volume, sales_velocity, social_engagement, competition_count }) {
  const sv = search_volume || 0;
  const vel = sales_velocity || 0;
  const eng = social_engagement || 0;
  const comp = Math.max(competition_count || 0, 1);
  return (sv * vel * eng) / comp;
}

/**
 * Aggregate scraped_trends data by keyword, compute demand scores,
 * and upsert into demand_scores table.
 */
async function calculateDemandScores() {
  logger.info('Calculating demand scores');

  // Aggregate: unnest keywords from recent scraped_trends, group by keyword
  const aggregateSQL = `
    SELECT
      kw AS keyword,
      SUM(sales_count) AS total_sales,
      SUM(favorites) AS total_favorites,
      AVG(price) AS avg_price,
      COUNT(*) AS listing_count
    FROM scraped_trends, unnest(keywords) AS kw
    WHERE scraped_at > NOW() - INTERVAL '7 days'
    GROUP BY kw
    ORDER BY SUM(sales_count) DESC NULLS LAST
    LIMIT 500
  `;

  const { rows: keywords } = await query(aggregateSQL);
  let scored = 0;

  for (const row of keywords) {
    const score = computeScore({
      search_volume: Math.round((row.total_favorites || 0) / 10),
      sales_velocity: parseFloat(row.total_sales) || 0,
      social_engagement: parseInt(row.total_favorites) || 0,
      competition_count: parseInt(row.listing_count) || 1,
    });

    const trendDirection = score > 10000 ? 'rising' : score > 1000 ? 'stable' : 'declining';
    const saturation = Math.min(100, (parseInt(row.listing_count) / 500) * 100);

    await query(
      `INSERT INTO demand_scores (keyword, search_volume, sales_velocity, social_engagement, competition_count, demand_score, trend_direction, saturation_level, avg_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (keyword) DO UPDATE SET
         search_volume = EXCLUDED.search_volume,
         sales_velocity = EXCLUDED.sales_velocity,
         social_engagement = EXCLUDED.social_engagement,
         competition_count = EXCLUDED.competition_count,
         demand_score = EXCLUDED.demand_score,
         trend_direction = EXCLUDED.trend_direction,
         saturation_level = EXCLUDED.saturation_level,
         avg_price = EXCLUDED.avg_price,
         updated_at = NOW()`,
      [
        row.keyword,
        Math.round((row.total_favorites || 0) / 10),
        parseFloat(row.total_sales) || 0,
        parseInt(row.total_favorites) || 0,
        parseInt(row.listing_count) || 1,
        score,
        trendDirection,
        saturation,
        parseFloat(row.avg_price) || 0,
      ]
    );
    scored++;
  }

  logger.info(`Scored ${scored} keywords`);
  return { keywords_scored: scored };
}

module.exports = { calculateDemandScores, computeScore };
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/market-intel/demand-calculator.test.js --no-cache
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/market-intel/ atlas-art-factory/tests/engines/market-intel/
git commit -m "feat(art-factory): demand score calculator with aggregation + upsert"
```

---

### Task 19: Niche opportunity ranker

**Files:**
- Create: `atlas-art-factory/engines/market-intel/niche-ranker.js`
- Create: `atlas-art-factory/tests/engines/market-intel/niche-ranker.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/market-intel/niche-ranker.test.js`:

```javascript
'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { rankOpportunities } = require('../../../engines/market-intel/niche-ranker');

beforeEach(() => query.mockReset());

test('rankOpportunities reads top demand_scores and inserts market_opportunities', async () => {
  // Mock: fetch top keywords by demand_score
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'nursery art', demand_score: 50000, competition_count: 80, avg_price: 14.99, trend_direction: 'rising', saturation_level: 16 },
      { keyword: 'abstract print', demand_score: 30000, competition_count: 150, avg_price: 18.50, trend_direction: 'stable', saturation_level: 30 },
    ],
  });
  // Mock: clear old opportunities
  query.mockResolvedValueOnce({ rowCount: 5 });
  // Mock: inserts
  query.mockResolvedValue({ rowCount: 1 });

  const result = await rankOpportunities();
  expect(result.opportunities_ranked).toBe(2);
  // First call = select, second = delete old, then 2 inserts
  expect(query).toHaveBeenCalledTimes(4);
});

test('rankOpportunities assigns competition_level based on count', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { keyword: 'low-comp', demand_score: 10000, competition_count: 30, avg_price: 10, trend_direction: 'rising', saturation_level: 6 },
    ],
  });
  query.mockResolvedValue({ rowCount: 1 });

  await rankOpportunities();
  // The INSERT call should include 'low' for competition_level
  const insertCall = query.mock.calls[2];
  expect(insertCall[1]).toContain('low');
});
```

**Step 2: Create niche-ranker.js**

Create `atlas-art-factory/engines/market-intel/niche-ranker.js`:

```javascript
'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('niche-ranker');

function classifyCompetition(count) {
  if (count < 50) return 'low';
  if (count < 200) return 'medium';
  return 'high';
}

function estimateProfitPotential(demandScore, avgPrice, saturation) {
  const base = (demandScore / 1000) * (avgPrice || 10);
  const saturationPenalty = 1 - (saturation / 200);
  return Math.round(base * saturationPenalty * 100) / 100;
}

/**
 * Rank top demand_scores as market opportunities.
 * Clears old opportunities and inserts fresh top 20.
 */
async function rankOpportunities(limit = 20) {
  logger.info('Ranking niche opportunities');

  const { rows: topKeywords } = await query(
    `SELECT keyword, demand_score, competition_count, avg_price, trend_direction, saturation_level
     FROM demand_scores
     ORDER BY demand_score DESC
     LIMIT $1`,
    [limit]
  );

  // Clear stale opportunities
  await query("UPDATE market_opportunities SET status = 'expired' WHERE status = 'active'");

  let ranked = 0;
  for (const kw of topKeywords) {
    ranked++;
    const competitionLevel = classifyCompetition(kw.competition_count);
    const profitPotential = estimateProfitPotential(
      parseFloat(kw.demand_score),
      parseFloat(kw.avg_price),
      parseFloat(kw.saturation_level)
    );
    const trendStrength = parseFloat(kw.demand_score) > 10000 ? 0.8 : parseFloat(kw.demand_score) > 1000 ? 0.5 : 0.2;

    await query(
      `INSERT INTO market_opportunities
        (niche, demand_score, competition_level, profit_potential, trend_strength,
         recommended_price, recommended_keywords, opportunity_rank, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [
        kw.keyword,
        parseFloat(kw.demand_score),
        competitionLevel,
        profitPotential,
        trendStrength,
        parseFloat(kw.avg_price) || 12.99,
        [kw.keyword],
        ranked,
      ]
    );
  }

  logger.info(`Ranked ${ranked} opportunities`);
  return { opportunities_ranked: ranked };
}

module.exports = { rankOpportunities, classifyCompetition, estimateProfitPotential };
```

**Step 3: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/market-intel/niche-ranker.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 4: Commit**

```bash
git add atlas-art-factory/engines/market-intel/niche-ranker.js atlas-art-factory/tests/engines/market-intel/niche-ranker.test.js
git commit -m "feat(art-factory): niche opportunity ranker — top 20 daily from demand scores"
```

---

### Task 20: Silo priority updater

**Files:**
- Create: `atlas-art-factory/engines/market-intel/silo-prioritizer.js`
- Create: `atlas-art-factory/tests/engines/market-intel/silo-prioritizer.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/market-intel/silo-prioritizer.test.js`:

```javascript
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
  // Higher priority should get more slots
  expect(slots[0].allocation).toBeGreaterThan(slots[2].allocation);
});

test('updateSiloPriorities adjusts based on conversion rate', async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, name: 'nursery', priority: 50, total_sales: 100, total_artworks: 200, total_revenue: '500' },
      { id: 2, name: 'abstract', priority: 50, total_sales: 5, total_artworks: 200, total_revenue: '25' },
    ],
  });
  // Mock: UPDATE calls
  query.mockResolvedValue({ rowCount: 1 });

  const result = await updateSiloPriorities();
  expect(result.silos_updated).toBe(2);
  // Higher conversion silo should get higher priority
  const updateCalls = query.mock.calls.filter(c => c[0].includes('UPDATE silos'));
  expect(updateCalls.length).toBe(2);
});
```

**Step 2: Create silo-prioritizer.js**

Create `atlas-art-factory/engines/market-intel/silo-prioritizer.js`:

```javascript
'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('silo-prioritizer');

/**
 * Allocate daily production slots proportional to priority.
 */
function allocateSlots(silos, dailyTarget = 200) {
  const totalPriority = silos.reduce((sum, s) => sum + (s.priority || 1), 0);
  return silos.map(silo => ({
    id: silo.id,
    name: silo.name,
    allocation: Math.max(1, Math.round((silo.priority / totalPriority) * dailyTarget)),
  }));
}

/**
 * Recalculate silo priorities based on sales performance.
 * Winners (+20% priority), losers (-50% priority, floored at 10).
 */
async function updateSiloPriorities() {
  logger.info('Updating silo priorities');

  const { rows: silos } = await query(
    "SELECT id, name, priority, total_sales, total_artworks, total_revenue FROM silos WHERE status = 'active'"
  );

  let updated = 0;
  for (const silo of silos) {
    const artworks = parseInt(silo.total_artworks) || 1;
    const sales = parseInt(silo.total_sales) || 0;
    const conversionRate = sales / artworks;

    let newPriority = silo.priority;
    if (conversionRate > 0.1) {
      // Winner: +20%
      newPriority = Math.min(100, Math.round(silo.priority * 1.2));
    } else if (conversionRate < 0.01 && artworks > 20) {
      // Loser with enough data: -50%
      newPriority = Math.max(10, Math.round(silo.priority * 0.5));
    }

    await query(
      'UPDATE silos SET priority = $1, performance_score = $2, updated_at = NOW() WHERE id = $3',
      [newPriority, Math.round(conversionRate * 10000) / 100, silo.id]
    );
    updated++;
  }

  logger.info(`Updated ${updated} silo priorities`);
  return { silos_updated: updated };
}

module.exports = { updateSiloPriorities, allocateSlots };
```

**Step 3: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/market-intel/silo-prioritizer.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 4: Commit**

```bash
git add atlas-art-factory/engines/market-intel/silo-prioritizer.js atlas-art-factory/tests/engines/market-intel/silo-prioritizer.test.js
git commit -m "feat(art-factory): silo priority updater — adaptive learning for production allocation"
```

---

### Task 21: Trend alerts

**Files:**
- Create: `atlas-art-factory/engines/market-intel/trend-alerts.js`
- Create: `atlas-art-factory/tests/engines/market-intel/trend-alerts.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/market-intel/trend-alerts.test.js`:

```javascript
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
      { keyword: 'boring art', demand_score: 100, trend_direction: 'declining', saturation_level: 80 },
    ],
  });

  const alerts = await detectTrendAlerts();
  // Only rising + low saturation should be flagged
  expect(alerts.length).toBe(2);
  expect(alerts[0].keyword).toBe('cottagecore art');
  expect(alerts[0].priority).toBe('high');
});

test('detectTrendAlerts returns empty when no rising trends', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  const alerts = await detectTrendAlerts();
  expect(alerts).toEqual([]);
});
```

**Step 2: Create trend-alerts.js**

Create `atlas-art-factory/engines/market-intel/trend-alerts.js`:

```javascript
'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-alerts');

/**
 * Detect fast-rising keywords with low saturation.
 * Returns alert objects for immediate production.
 */
async function detectTrendAlerts(options = {}) {
  const minScore = options.minScore || 10000;
  const maxSaturation = options.maxSaturation || 30;

  const { rows } = await query(
    `SELECT keyword, demand_score, trend_direction, saturation_level
     FROM demand_scores
     WHERE trend_direction = 'rising'
       AND demand_score > $1
       AND saturation_level < $2
     ORDER BY demand_score DESC
     LIMIT 20`,
    [minScore, maxSaturation]
  );

  const alerts = rows.map(row => ({
    keyword: row.keyword,
    demand_score: parseFloat(row.demand_score),
    saturation: parseFloat(row.saturation_level),
    priority: parseFloat(row.demand_score) > 30000 ? 'high' : 'medium',
    action: 'immediate_production',
  }));

  if (alerts.length > 0) {
    logger.info(`${alerts.length} trend alerts detected`, {
      keywords: alerts.map(a => a.keyword),
    });
  }

  return alerts;
}

module.exports = { detectTrendAlerts };
```

**Step 3: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/market-intel/trend-alerts.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 4: Commit**

```bash
git add atlas-art-factory/engines/market-intel/trend-alerts.js atlas-art-factory/tests/engines/market-intel/trend-alerts.test.js
git commit -m "feat(art-factory): trend alerts — flag fast-rising keywords for immediate production"
```

---

### Task 22: Market intel coordinator + wire into orchestrator

**Files:**
- Create: `atlas-art-factory/engines/market-intel/index.js`
- Create: `atlas-art-factory/tests/engines/market-intel/coordinator.test.js`
- Modify: `atlas-art-factory/core/orchestrator.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/market-intel/coordinator.test.js`:

```javascript
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
```

**Step 2: Create coordinator**

Create `atlas-art-factory/engines/market-intel/index.js`:

```javascript
'use strict';

const { createLogger } = require('../../core/logger');
const { calculateDemandScores } = require('./demand-calculator');
const { rankOpportunities } = require('./niche-ranker');
const { updateSiloPriorities } = require('./silo-prioritizer');
const { detectTrendAlerts } = require('./trend-alerts');

const logger = createLogger('market-intel');

async function runMarketIntelligence() {
  logger.info('Starting market intelligence run');

  const scores = await calculateDemandScores();
  const opportunities = await rankOpportunities();
  const priorities = await updateSiloPriorities();
  const alerts = await detectTrendAlerts();

  const summary = {
    keywords_scored: scores.keywords_scored,
    opportunities_ranked: opportunities.opportunities_ranked,
    silos_updated: priorities.silos_updated,
    trend_alerts: alerts.length,
  };

  logger.info('Market intelligence complete', summary);
  return summary;
}

module.exports = { runMarketIntelligence };
```

**Step 3: Wire into orchestrator**

In `atlas-art-factory/core/orchestrator.js`, add after the trend scraper import:

```javascript
const { runMarketIntelligence } = require('../engines/market-intel/index');
```

And in `registerProcessors()`, add:

```javascript
const intelQueue = getQueue(QUEUE_NAMES.MARKET_INTELLIGENCE);
intelQueue.process(async (job) => {
  logger.info('Processing market intelligence job', { jobId: job.id });
  const result = await runMarketIntelligence();
  logger.info('Market intelligence job complete', result);
  return result;
});
```

**Step 4: Run all tests**

```bash
cd atlas-art-factory && npx jest --no-cache
```

Expected: ALL tests pass

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/market-intel/index.js atlas-art-factory/tests/engines/market-intel/coordinator.test.js atlas-art-factory/core/orchestrator.js
git commit -m "feat(art-factory): market intel coordinator + wire into orchestrator 08:00 schedule"
```
