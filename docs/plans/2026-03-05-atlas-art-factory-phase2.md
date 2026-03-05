# Atlas Art Factory — Phase 2: Trend Scraper Engine

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-platform trend scraper that harvests bestseller data from 7 marketplaces, extracts colors/styles via node-vibrant, and stores results in `scraped_trends` for the market intelligence engine.

**Architecture:** Each platform gets its own scraper module in `engines/trend-scraper/scrapers/`. A `TrendStore` layer handles bulk-inserting into PostgreSQL. A coordinator (`engines/trend-scraper/index.js`) runs all scrapers in sequence with rate limiting, wired into the orchestrator's 06:00 cron. Scrapers that need browser automation use Playwright; API-based platforms use axios.

**Tech Stack:** Node.js, axios, Playwright (chromium), google-trends-api, node-vibrant, pg (via core/database), Bull queue (via core/queue)

**Existing code patterns:**
- Logger: `const logger = createLogger('module-name')` → `logger.info(msg, data)`
- Database: `const { query } = require('../../core/database')` → `query(sql, params)`
- Config: `const { getPlatform } = require('../../core/config')` → platform rate limits
- Queue: `const { getQueue, QUEUE_NAMES } = require('../../core/queue')`

---

### Task 11: TrendStore — bulk insert storage layer

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/trend-store.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/trend-store.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/trend-scraper/trend-store.test.js`:

```javascript
'use strict';

jest.mock('../../../core/database', () => {
  const mockQuery = jest.fn();
  return { query: mockQuery, closePool: jest.fn() };
});

const { query } = require('../../../core/database');
const { insertTrends, getRecentTrends } = require('../../../engines/trend-scraper/trend-store');

beforeEach(() => query.mockReset());

const fakeTrend = {
  platform: 'etsy',
  listing_url: 'https://etsy.com/listing/123',
  title: 'Nursery Wall Art Print',
  description: 'Cute animal nursery print',
  price: 12.99,
  sales_count: 450,
  review_count: 120,
  rating: 4.8,
  favorites: 890,
  views: null,
  keywords: ['nursery art', 'baby animals'],
  tags: ['nursery', 'wall art', 'print'],
  category: 'nursery',
  style: 'watercolor',
  subject: 'animals',
  color_palette: { dominant: '#F5E6D3', palette: ['#F5E6D3', '#8B4513'] },
  image_urls: ['https://example.com/img.jpg'],
};

test('insertTrends bulk-inserts rows and returns count', async () => {
  query.mockResolvedValueOnce({ rowCount: 2 });
  const count = await insertTrends([fakeTrend, fakeTrend]);
  expect(count).toBe(2);
  expect(query).toHaveBeenCalledTimes(1);
  // Should use a multi-row INSERT
  expect(query.mock.calls[0][0]).toContain('INSERT INTO scraped_trends');
});

test('insertTrends returns 0 for empty array', async () => {
  const count = await insertTrends([]);
  expect(count).toBe(0);
  expect(query).not.toHaveBeenCalled();
});

test('getRecentTrends queries by platform and limit', async () => {
  query.mockResolvedValueOnce({ rows: [fakeTrend] });
  const rows = await getRecentTrends('etsy', 10);
  expect(rows).toHaveLength(1);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('scraped_trends'),
    ['etsy', 10]
  );
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/trend-store.test.js --no-cache
```

Expected: FAIL — `Cannot find module '../../../engines/trend-scraper/trend-store'`

**Step 3: Create trend-store.js**

Create `atlas-art-factory/engines/trend-scraper/trend-store.js`:

```javascript
'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('trend-store');

/**
 * Bulk-insert scraped trend rows into scraped_trends.
 * Uses a single multi-row INSERT for efficiency.
 * Returns the number of rows inserted.
 */
async function insertTrends(trends) {
  if (!trends.length) return 0;

  const columns = [
    'platform', 'listing_url', 'title', 'description', 'price',
    'sales_count', 'review_count', 'rating', 'favorites', 'views',
    'keywords', 'tags', 'category', 'style', 'subject',
    'color_palette', 'image_urls',
  ];

  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const t of trends) {
    const row = [];
    row.push(t.platform);
    row.push(t.listing_url || null);
    row.push(t.title || null);
    row.push(t.description || null);
    row.push(t.price ?? null);
    row.push(t.sales_count ?? null);
    row.push(t.review_count ?? null);
    row.push(t.rating ?? null);
    row.push(t.favorites ?? null);
    row.push(t.views ?? null);
    row.push(t.keywords || []);
    row.push(t.tags || []);
    row.push(t.category || null);
    row.push(t.style || null);
    row.push(t.subject || null);
    row.push(JSON.stringify(t.color_palette || {}));
    row.push(t.image_urls || []);

    const ph = columns.map(() => `$${idx++}`);
    placeholders.push(`(${ph.join(', ')})`);
    values.push(...row);
  }

  const sql = `INSERT INTO scraped_trends (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
  const result = await query(sql, values);
  logger.info(`Inserted ${result.rowCount} trends`);
  return result.rowCount;
}

/**
 * Get recent trends for a platform.
 */
async function getRecentTrends(platform, limit = 100) {
  const result = await query(
    'SELECT * FROM scraped_trends WHERE platform = $1 ORDER BY scraped_at DESC LIMIT $2',
    [platform, limit]
  );
  return result.rows;
}

module.exports = { insertTrends, getRecentTrends };
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/trend-store.test.js --no-cache
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/trend-store.js atlas-art-factory/tests/engines/trend-scraper/trend-store.test.js
git commit -m "feat(art-factory): trend-store bulk insert layer for scraped_trends"
```

---

### Task 12: Base scraper class + Etsy API scraper

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/scrapers/base.js`
- Create: `atlas-art-factory/engines/trend-scraper/scrapers/etsy.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/scrapers/etsy.test.js`

**Step 1: Create base scraper**

Create `atlas-art-factory/engines/trend-scraper/scrapers/base.js`:

```javascript
'use strict';

const { createLogger } = require('../../../core/logger');

class BaseScraper {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.rateLimitMs = options.rateLimitMs || 2000;
    this.maxPages = options.maxPages || 5;
    this.logger = createLogger(`scraper:${platform}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms || this.rateLimitMs));
  }

  /**
   * Subclasses must implement this.
   * Returns an array of trend objects matching the scraped_trends schema.
   */
  async scrape(keywords) {
    throw new Error(`${this.platform}: scrape() not implemented`);
  }

  /**
   * Normalize a raw scraped item into the standard trend shape.
   */
  normalize(raw) {
    return {
      platform: this.platform,
      listing_url: raw.listing_url || null,
      title: raw.title || null,
      description: raw.description || null,
      price: raw.price ?? null,
      sales_count: raw.sales_count ?? null,
      review_count: raw.review_count ?? null,
      rating: raw.rating ?? null,
      favorites: raw.favorites ?? null,
      views: raw.views ?? null,
      keywords: raw.keywords || [],
      tags: raw.tags || [],
      category: raw.category || null,
      style: raw.style || null,
      subject: raw.subject || null,
      color_palette: raw.color_palette || {},
      image_urls: raw.image_urls || [],
    };
  }
}

module.exports = BaseScraper;
```

**Step 2: Write Etsy scraper tests**

Create `atlas-art-factory/tests/engines/trend-scraper/scrapers/etsy.test.js`:

```javascript
'use strict';

jest.mock('axios');
const axios = require('axios');
const EtsyScraper = require('../../../../engines/trend-scraper/scrapers/etsy');

let scraper;
beforeEach(() => {
  scraper = new EtsyScraper({ apiKey: 'test-key' });
  axios.get.mockReset();
});

const fakeEtsyResponse = {
  data: {
    count: 2,
    results: [
      {
        listing_id: 111,
        title: 'Nursery Wall Art Baby Animals',
        description: 'Cute watercolor animals',
        price: { amount: 1299, divisor: 100, currency_code: 'USD' },
        tags: ['nursery', 'wall art', 'baby'],
        num_favorers: 890,
        views: 3200,
        url: 'https://www.etsy.com/listing/111',
        images: [{ url_570xN: 'https://i.etsystatic.com/img1.jpg' }],
      },
      {
        listing_id: 222,
        title: 'Abstract Modern Print',
        description: 'Minimalist abstract art',
        price: { amount: 1599, divisor: 100, currency_code: 'USD' },
        tags: ['abstract', 'modern', 'minimalist'],
        num_favorers: 450,
        views: 1800,
        url: 'https://www.etsy.com/listing/222',
        images: [{ url_570xN: 'https://i.etsystatic.com/img2.jpg' }],
      },
    ],
  },
};

test('scrape fetches Etsy listings and normalizes them', async () => {
  axios.get.mockResolvedValue(fakeEtsyResponse);
  const results = await scraper.scrape(['wall art']);
  expect(results.length).toBeGreaterThanOrEqual(2);
  expect(results[0].platform).toBe('etsy');
  expect(results[0].title).toContain('Nursery');
  expect(results[0].price).toBe(12.99);
  expect(results[0].favorites).toBe(890);
  expect(results[0].tags).toContain('nursery');
});

test('scrape handles API errors gracefully', async () => {
  axios.get.mockRejectedValue(new Error('401 Unauthorized'));
  const results = await scraper.scrape(['wall art']);
  expect(results).toEqual([]);
});

test('normalize maps Etsy fields correctly', () => {
  const raw = fakeEtsyResponse.data.results[0];
  const normalized = scraper.normalizeEtsyListing(raw);
  expect(normalized.platform).toBe('etsy');
  expect(normalized.listing_url).toContain('111');
  expect(typeof normalized.price).toBe('number');
  expect(Array.isArray(normalized.tags)).toBe(true);
  expect(Array.isArray(normalized.image_urls)).toBe(true);
});
```

**Step 3: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/etsy.test.js --no-cache
```

Expected: FAIL

**Step 4: Create Etsy scraper**

Create `atlas-art-factory/engines/trend-scraper/scrapers/etsy.js`:

```javascript
'use strict';

const axios = require('axios');
const BaseScraper = require('./base');

class EtsyScraper extends BaseScraper {
  constructor(options = {}) {
    super('etsy', { rateLimitMs: options.rateLimitMs || 2000, maxPages: options.maxPages || 5 });
    this.apiKey = options.apiKey || process.env.ETSY_API_KEY;
    this.baseUrl = 'https://openapi.etsy.com/v3/application';
  }

  normalizeEtsyListing(item) {
    const price = item.price ? item.price.amount / item.price.divisor : null;
    const imageUrls = (item.images || []).map(img => img.url_570xN).filter(Boolean);

    return this.normalize({
      listing_url: item.url || `https://www.etsy.com/listing/${item.listing_id}`,
      title: item.title || null,
      description: (item.description || '').slice(0, 500),
      price,
      sales_count: item.quantity_sold ?? null,
      review_count: item.review_count ?? null,
      rating: null,
      favorites: item.num_favorers ?? null,
      views: item.views ?? null,
      keywords: (item.tags || []).slice(0, 13),
      tags: item.tags || [],
      category: item.taxonomy_path ? item.taxonomy_path[0] : null,
      style: null,
      subject: null,
      image_urls: imageUrls,
    });
  }

  async scrape(keywords) {
    if (!this.apiKey) {
      this.logger.warn('No ETSY_API_KEY set, skipping Etsy scraper');
      return [];
    }

    const allResults = [];

    for (const keyword of keywords) {
      try {
        this.logger.info(`Searching Etsy: "${keyword}"`);
        const response = await axios.get(`${this.baseUrl}/listings/active`, {
          headers: { 'x-api-key': this.apiKey },
          params: {
            keywords: keyword,
            sort_on: 'score',
            limit: 100,
            includes: 'images',
          },
        });

        const listings = response.data?.results || [];
        const normalized = listings.map(item => this.normalizeEtsyListing(item));
        allResults.push(...normalized);
        this.logger.info(`Etsy: ${normalized.length} results for "${keyword}"`);

        await this.sleep();
      } catch (err) {
        this.logger.error(`Etsy search failed for "${keyword}"`, { error: err.message });
      }
    }

    return allResults;
  }
}

module.exports = EtsyScraper;
```

**Step 5: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/etsy.test.js --no-cache
```

Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/scrapers/
git commit -m "feat(art-factory): base scraper class + Etsy API v3 trend scraper"
```

---

### Task 13: Google Trends scraper

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/scrapers/google-trends.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/scrapers/google-trends.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/trend-scraper/scrapers/google-trends.test.js`:

```javascript
'use strict';

jest.mock('google-trends-api', () => ({
  interestOverTime: jest.fn(),
  relatedQueries: jest.fn(),
}));

const googleTrends = require('google-trends-api');
const GoogleTrendsScraper = require('../../../../engines/trend-scraper/scrapers/google-trends');

let scraper;
beforeEach(() => {
  scraper = new GoogleTrendsScraper();
  googleTrends.interestOverTime.mockReset();
  googleTrends.relatedQueries.mockReset();
});

test('scrape returns trend data for keywords', async () => {
  googleTrends.interestOverTime.mockResolvedValue(JSON.stringify({
    default: {
      timelineData: [
        { time: '1709600000', value: [85] },
        { time: '1710200000', value: [92] },
      ],
    },
  }));

  googleTrends.relatedQueries.mockResolvedValue(JSON.stringify({
    default: {
      rankedList: [
        { rankedKeyword: [{ query: 'nursery wall art boho', value: 100 }] },
        { rankedKeyword: [{ query: 'animal nursery decor', value: 80 }] },
      ],
    },
  }));

  const results = await scraper.scrape(['nursery wall art']);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]).toHaveProperty('keyword');
  expect(results[0]).toHaveProperty('interest');
  expect(results[0]).toHaveProperty('trend_direction');
});

test('scrape handles API errors gracefully', async () => {
  googleTrends.interestOverTime.mockRejectedValue(new Error('Rate limited'));
  const results = await scraper.scrape(['wall art']);
  expect(results).toEqual([]);
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/google-trends.test.js --no-cache
```

Expected: FAIL

**Step 3: Create Google Trends scraper**

Create `atlas-art-factory/engines/trend-scraper/scrapers/google-trends.js`:

```javascript
'use strict';

const googleTrends = require('google-trends-api');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('scraper:google-trends');

class GoogleTrendsScraper {
  constructor(options = {}) {
    this.rateLimitMs = options.rateLimitMs || 3000;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms || this.rateLimitMs));
  }

  /**
   * For each keyword, fetch interest-over-time and related queries.
   * Returns array of { keyword, interest, trend_direction, related_queries }.
   * These are NOT inserted into scraped_trends directly — they feed into demand_scores.
   */
  async scrape(keywords) {
    const results = [];

    for (const keyword of keywords) {
      try {
        logger.info(`Google Trends: "${keyword}"`);

        const interestRaw = await googleTrends.interestOverTime({ keyword, geo: 'US' });
        const interestData = JSON.parse(interestRaw);
        const timeline = interestData?.default?.timelineData || [];

        // Calculate trend direction from last 4 data points
        let interest = 0;
        let trendDirection = 'stable';
        if (timeline.length >= 2) {
          const recent = timeline.slice(-4);
          const values = recent.map(p => p.value[0]);
          interest = values[values.length - 1];
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          if (interest > avg * 1.1) trendDirection = 'rising';
          else if (interest < avg * 0.9) trendDirection = 'declining';
        }

        // Related queries
        let relatedQueries = [];
        try {
          const relatedRaw = await googleTrends.relatedQueries({ keyword, geo: 'US' });
          const relatedData = JSON.parse(relatedRaw);
          const lists = relatedData?.default?.rankedList || [];
          for (const list of lists) {
            const items = list.rankedKeyword || [];
            relatedQueries.push(...items.map(i => i.query));
          }
        } catch {
          // Related queries are optional
        }

        results.push({
          keyword,
          interest,
          trend_direction: trendDirection,
          related_queries: relatedQueries.slice(0, 20),
          timeline_length: timeline.length,
        });

        await this.sleep();
      } catch (err) {
        logger.error(`Google Trends failed for "${keyword}"`, { error: err.message });
      }
    }

    return results;
  }
}

module.exports = GoogleTrendsScraper;
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/google-trends.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/scrapers/google-trends.js atlas-art-factory/tests/engines/trend-scraper/scrapers/google-trends.test.js
git commit -m "feat(art-factory): Google Trends scraper for keyword interest + related queries"
```

---

### Task 14: Playwright scrapers (Gumroad, Redbubble, Society6, Creative Market)

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/scrapers/playwright-scraper.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/scrapers/playwright-scraper.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/trend-scraper/scrapers/playwright-scraper.test.js`:

```javascript
'use strict';

// Mock playwright — we don't want real browser launches in tests
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          waitForSelector: jest.fn(),
          $$eval: jest.fn().mockResolvedValue([]),
          close: jest.fn(),
        }),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

const PlaywrightScraper = require('../../../../engines/trend-scraper/scrapers/playwright-scraper');

test('has scraper configs for all 4 platforms', () => {
  const platforms = PlaywrightScraper.PLATFORMS;
  expect(platforms).toHaveProperty('gumroad');
  expect(platforms).toHaveProperty('redbubble');
  expect(platforms).toHaveProperty('society6');
  expect(platforms).toHaveProperty('creative-market');
});

test('scrape returns empty array when no results found', async () => {
  const scraper = new PlaywrightScraper('gumroad');
  const results = await scraper.scrape(['wall art']);
  expect(Array.isArray(results)).toBe(true);
});

test('normalizeListing creates standard trend object', () => {
  const scraper = new PlaywrightScraper('redbubble');
  const normalized = scraper.normalizeListing({
    title: 'Test Art',
    price: '$15.99',
    url: 'https://redbubble.com/test',
    image: 'https://img.redbubble.com/test.jpg',
  });
  expect(normalized.platform).toBe('redbubble');
  expect(normalized.title).toBe('Test Art');
  expect(normalized.price).toBe(15.99);
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/playwright-scraper.test.js --no-cache
```

Expected: FAIL

**Step 3: Create Playwright scraper**

Create `atlas-art-factory/engines/trend-scraper/scrapers/playwright-scraper.js`:

```javascript
'use strict';

const { chromium } = require('playwright');
const BaseScraper = require('./base');

class PlaywrightScraper extends BaseScraper {
  constructor(platform, options = {}) {
    super(platform, { rateLimitMs: options.rateLimitMs || 5000, maxPages: options.maxPages || 3 });
    this.config = PlaywrightScraper.PLATFORMS[platform];
    if (!this.config) throw new Error(`Unknown platform: ${platform}`);
  }

  normalizeListing(raw) {
    const price = typeof raw.price === 'string'
      ? parseFloat(raw.price.replace(/[^0-9.]/g, '')) || null
      : raw.price ?? null;

    return this.normalize({
      listing_url: raw.url || null,
      title: raw.title || null,
      description: raw.description || null,
      price,
      sales_count: raw.sales_count ?? null,
      review_count: null,
      rating: null,
      favorites: raw.favorites ?? null,
      views: null,
      keywords: [],
      tags: raw.tags || [],
      category: null,
      style: null,
      subject: null,
      image_urls: raw.image ? [raw.image] : [],
    });
  }

  async scrape(keywords) {
    const allResults = [];
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });

      for (const keyword of keywords) {
        try {
          const page = await context.newPage();
          const searchUrl = this.config.searchUrl(keyword);
          this.logger.info(`${this.platform}: scraping "${keyword}"`);

          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // Try to wait for product cards, but don't fail if selector missing
          try {
            await page.waitForSelector(this.config.cardSelector, { timeout: 8000 });
          } catch {
            this.logger.warn(`${this.platform}: no results found for "${keyword}"`);
            await page.close();
            continue;
          }

          const items = await page.$$eval(this.config.cardSelector, (cards, extractFn) => {
            // extractFn is injected per-platform via config
            return cards.slice(0, 50).map(card => ({
              title: card.querySelector('[class*="title"], h2, h3, [data-testid*="title"]')?.textContent?.trim() || '',
              price: card.querySelector('[class*="price"], [data-testid*="price"]')?.textContent?.trim() || '',
              url: card.querySelector('a')?.href || '',
              image: card.querySelector('img')?.src || '',
            }));
          });

          const normalized = items
            .filter(item => item.title)
            .map(item => this.normalizeListing(item));

          allResults.push(...normalized);
          this.logger.info(`${this.platform}: ${normalized.length} results for "${keyword}"`);

          await page.close();
          await this.sleep();
        } catch (err) {
          this.logger.error(`${this.platform}: failed for "${keyword}"`, { error: err.message });
        }
      }

      await context.close();
    } catch (err) {
      this.logger.error(`${this.platform}: browser launch failed`, { error: err.message });
    } finally {
      if (browser) await browser.close();
    }

    return allResults;
  }
}

PlaywrightScraper.PLATFORMS = {
  'gumroad': {
    searchUrl: (q) => `https://gumroad.com/discover?query=${encodeURIComponent(q)}&sort=featured`,
    cardSelector: '[class*="ProductCard"], article, .product-card',
  },
  'redbubble': {
    searchUrl: (q) => `https://www.redbubble.com/shop/?query=${encodeURIComponent(q)}&ref=search_box`,
    cardSelector: '[class*="SearchResult"], [data-testid="search-result"]',
  },
  'society6': {
    searchUrl: (q) => `https://society6.com/search?q=${encodeURIComponent(q)}`,
    cardSelector: '[class*="ProductCard"], [data-testid*="product"]',
  },
  'creative-market': {
    searchUrl: (q) => `https://creativemarket.com/search?q=${encodeURIComponent(q)}&categoryIDs=10`,
    cardSelector: '[class*="ProductCard"], .product-card',
  },
};

module.exports = PlaywrightScraper;
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/scrapers/playwright-scraper.test.js --no-cache
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/scrapers/playwright-scraper.js atlas-art-factory/tests/engines/trend-scraper/scrapers/playwright-scraper.test.js
git commit -m "feat(art-factory): Playwright-based scrapers for Gumroad, Redbubble, Society6, Creative Market"
```

---

### Task 15: Image color analyzer (node-vibrant)

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/color-analyzer.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/color-analyzer.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/trend-scraper/color-analyzer.test.js`:

```javascript
'use strict';

jest.mock('node-vibrant', () => {
  const mockPalette = {
    Vibrant: { hex: '#E74C3C', population: 100 },
    DarkVibrant: { hex: '#C0392B', population: 80 },
    LightVibrant: { hex: '#F5B7B1', population: 60 },
    Muted: { hex: '#95A5A6', population: 40 },
    DarkMuted: { hex: '#2C3E50', population: 30 },
    LightMuted: { hex: '#D5DBDB', population: 20 },
  };
  return {
    from: jest.fn().mockReturnValue({
      getPalette: jest.fn().mockResolvedValue(mockPalette),
    }),
  };
});

const { analyzeImageColors } = require('../../../engines/trend-scraper/color-analyzer');

test('analyzeImageColors extracts palette from image URL', async () => {
  const result = await analyzeImageColors('https://example.com/img.jpg');
  expect(result).toHaveProperty('dominant');
  expect(result).toHaveProperty('palette');
  expect(Array.isArray(result.palette)).toBe(true);
  expect(result.palette.length).toBeGreaterThan(0);
});

test('analyzeImageColors returns empty palette on error', async () => {
  const Vibrant = require('node-vibrant');
  Vibrant.from.mockReturnValueOnce({
    getPalette: jest.fn().mockRejectedValue(new Error('network error')),
  });
  const result = await analyzeImageColors('https://example.com/bad.jpg');
  expect(result.dominant).toBeNull();
  expect(result.palette).toEqual([]);
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/color-analyzer.test.js --no-cache
```

Expected: FAIL

**Step 3: Create color analyzer**

Create `atlas-art-factory/engines/trend-scraper/color-analyzer.js`:

```javascript
'use strict';

const Vibrant = require('node-vibrant');
const { createLogger } = require('../../core/logger');

const logger = createLogger('color-analyzer');

/**
 * Extract dominant colors from an image URL using node-vibrant.
 * Returns { dominant: '#hex', palette: ['#hex', ...] }
 */
async function analyzeImageColors(imageUrl) {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();

    const swatches = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted', 'LightMuted'];
    const colors = swatches
      .map(name => palette[name])
      .filter(Boolean)
      .sort((a, b) => b.population - a.population);

    return {
      dominant: colors.length > 0 ? colors[0].hex : null,
      palette: colors.map(c => c.hex),
    };
  } catch (err) {
    logger.warn(`Color analysis failed for ${imageUrl}`, { error: err.message });
    return { dominant: null, palette: [] };
  }
}

module.exports = { analyzeImageColors };
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/color-analyzer.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/color-analyzer.js atlas-art-factory/tests/engines/trend-scraper/color-analyzer.test.js
git commit -m "feat(art-factory): node-vibrant color analyzer for trend image palette extraction"
```

---

### Task 16: Trend scraper coordinator

**Files:**
- Create: `atlas-art-factory/engines/trend-scraper/index.js`
- Create: `atlas-art-factory/tests/engines/trend-scraper/coordinator.test.js`

**Step 1: Write failing tests**

Create `atlas-art-factory/tests/engines/trend-scraper/coordinator.test.js`:

```javascript
'use strict';

// Mock all dependencies
jest.mock('../../../core/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  closePool: jest.fn(),
}));
jest.mock('../../../engines/trend-scraper/trend-store', () => ({
  insertTrends: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../../engines/trend-scraper/scrapers/etsy', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([
      { platform: 'etsy', title: 'Test Art', price: 12.99 },
    ]),
  }));
});
jest.mock('../../../engines/trend-scraper/scrapers/google-trends', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([
      { keyword: 'wall art', interest: 85, trend_direction: 'rising' },
    ]),
  }));
});
jest.mock('../../../engines/trend-scraper/scrapers/playwright-scraper', () => {
  return jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue([]),
  }));
});

const { runTrendScraper } = require('../../../engines/trend-scraper/index');
const { insertTrends } = require('../../../engines/trend-scraper/trend-store');

test('runTrendScraper executes all scrapers and stores results', async () => {
  const result = await runTrendScraper();
  expect(result).toHaveProperty('total_scraped');
  expect(result).toHaveProperty('google_trends');
  expect(result).toHaveProperty('platforms');
  expect(insertTrends).toHaveBeenCalled();
});

test('runTrendScraper returns summary even if some scrapers fail', async () => {
  const EtsyScraper = require('../../../engines/trend-scraper/scrapers/etsy');
  EtsyScraper.mockImplementation(() => ({
    scrape: jest.fn().mockRejectedValue(new Error('API down')),
  }));

  const result = await runTrendScraper();
  expect(result).toHaveProperty('total_scraped');
  // Should not throw
});
```

**Step 2: Run tests to verify they fail**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/coordinator.test.js --no-cache
```

Expected: FAIL

**Step 3: Create coordinator**

Create `atlas-art-factory/engines/trend-scraper/index.js`:

```javascript
'use strict';

const { createLogger } = require('../../core/logger');
const { loadConfig } = require('../../core/config');
const { insertTrends } = require('./trend-store');
const EtsyScraper = require('./scrapers/etsy');
const GoogleTrendsScraper = require('./scrapers/google-trends');
const PlaywrightScraper = require('./scrapers/playwright-scraper');

const logger = createLogger('trend-scraper');

/**
 * Gather search keywords from all silo configs.
 */
function getSearchKeywords() {
  try {
    const config = loadConfig();
    const silos = Array.isArray(config.silos) ? config.silos : (config.silos?.silos || []);
    const keywords = new Set();
    for (const silo of silos) {
      if (Array.isArray(silo.keywords)) {
        silo.keywords.forEach(k => keywords.add(k));
      }
    }
    return [...keywords];
  } catch {
    // Fallback keywords if config fails
    return ['wall art print', 'digital download art', 'printable wall art'];
  }
}

/**
 * Main entry point: runs all scrapers, stores results.
 * Returns a summary object.
 */
async function runTrendScraper() {
  logger.info('Starting trend scraper run');
  const allKeywords = getSearchKeywords();
  // Sample keywords per scraper to avoid hitting rate limits
  const keywordSample = allKeywords.slice(0, 20);

  const summary = { total_scraped: 0, google_trends: 0, platforms: {} };
  const allTrends = [];

  // 1. Etsy API scraper
  try {
    const etsy = new EtsyScraper();
    const etsyResults = await etsy.scrape(keywordSample.slice(0, 10));
    allTrends.push(...etsyResults);
    summary.platforms.etsy = etsyResults.length;
    logger.info(`Etsy: ${etsyResults.length} trends`);
  } catch (err) {
    logger.error('Etsy scraper failed', { error: err.message });
    summary.platforms.etsy = 0;
  }

  // 2. Playwright scrapers (Gumroad, Redbubble, Society6, Creative Market)
  const playwrightPlatforms = ['gumroad', 'redbubble', 'society6', 'creative-market'];
  for (const platform of playwrightPlatforms) {
    try {
      const scraper = new PlaywrightScraper(platform);
      const results = await scraper.scrape(keywordSample.slice(0, 5));
      allTrends.push(...results);
      summary.platforms[platform] = results.length;
      logger.info(`${platform}: ${results.length} trends`);
    } catch (err) {
      logger.error(`${platform} scraper failed`, { error: err.message });
      summary.platforms[platform] = 0;
    }
  }

  // 3. Store all marketplace trends
  if (allTrends.length > 0) {
    const inserted = await insertTrends(allTrends);
    summary.total_scraped = inserted;
    logger.info(`Stored ${inserted} trends total`);
  }

  // 4. Google Trends (separate — feeds demand_scores, not scraped_trends)
  try {
    const gt = new GoogleTrendsScraper();
    const trendData = await gt.scrape(keywordSample.slice(0, 10));
    summary.google_trends = trendData.length;
    logger.info(`Google Trends: ${trendData.length} keyword analyses`);
  } catch (err) {
    logger.error('Google Trends scraper failed', { error: err.message });
  }

  logger.info('Trend scraper run complete', summary);
  return summary;
}

module.exports = { runTrendScraper, getSearchKeywords };
```

**Step 4: Run tests**

```bash
cd atlas-art-factory && npx jest tests/engines/trend-scraper/coordinator.test.js --no-cache
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add atlas-art-factory/engines/trend-scraper/index.js atlas-art-factory/tests/engines/trend-scraper/coordinator.test.js
git commit -m "feat(art-factory): trend scraper coordinator — runs all scrapers, stores results"
```

---

### Task 17: Wire trend scraper into orchestrator

**Files:**
- Modify: `atlas-art-factory/core/orchestrator.js`

**Step 1: Update orchestrator to import trend scraper**

In `atlas-art-factory/core/orchestrator.js`, replace the placeholder `runTrendScraper`:

```javascript
// Replace this line:
async function runTrendScraper() { logger.info('Trend scraper: not yet implemented'); }

// With this import:
const { runTrendScraper } = require('../engines/trend-scraper/index');
```

Keep all other placeholder functions as-is.

**Step 2: Verify all tests pass**

```bash
cd atlas-art-factory && npx jest --no-cache
```

Expected: ALL tests pass (existing + new trend scraper tests).

**Step 3: Commit**

```bash
git add atlas-art-factory/core/orchestrator.js
git commit -m "feat(art-factory): wire trend scraper into orchestrator 06:00 schedule"
```

---

## Verification Checklist (Phase 2)

After completing all tasks, verify:

```bash
# 1. All tests pass
cd atlas-art-factory && npx jest --no-cache

# 2. Trend store handles bulk inserts (mocked)
npx jest tests/engines/trend-scraper/trend-store.test.js -v

# 3. Etsy scraper normalizes listings (mocked)
npx jest tests/engines/trend-scraper/scrapers/etsy.test.js -v

# 4. Google Trends returns keyword analysis (mocked)
npx jest tests/engines/trend-scraper/scrapers/google-trends.test.js -v

# 5. Playwright scrapers have all 4 platform configs (mocked)
npx jest tests/engines/trend-scraper/scrapers/playwright-scraper.test.js -v

# 6. Color analyzer extracts palette (mocked)
npx jest tests/engines/trend-scraper/color-analyzer.test.js -v

# 7. Coordinator runs all scrapers (mocked)
npx jest tests/engines/trend-scraper/coordinator.test.js -v
```

Expected: All pass. Total new tests: ~15. All scrapers properly mocked for CI.
