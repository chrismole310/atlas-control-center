# Atlas AI Art Factory — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a fully automated, data-driven digital art empire that scrapes 7+ marketplaces, generates 200+ AI artworks daily, creates professional mockups, and auto-publishes to 6 platforms with adaptive learning.

**Architecture:** Node.js engines in `atlas-art-factory/` (port 3001) backed by PostgreSQL + Redis, orchestrated by Bull queues, with a Next.js dashboard at `/art-factory`. 9 independent engines handle: trend scraping, market intelligence, category/silo management, AI artist personas, image production (FLUX local + DALL-E 3 API), mockup generation (Sharp + node-canvas), distribution (Etsy/Gumroad API + Playwright for others), analytics, and auto model discovery.

**Tech Stack:** Node.js 25, PostgreSQL, Redis, Bull, Sharp, node-canvas, Playwright, node-cron, Express, Next.js 16 + React 19, Jest, Docker Compose (for Postgres + Redis)

**Design doc:** `docs/plans/2026-03-05-atlas-art-factory-design.md`

---

## PHASE 1: Core Infrastructure

---

### Task 1: Project scaffold + package.json

**Files:**
- Create: `atlas-art-factory/package.json`
- Create: `atlas-art-factory/.env.example`
- Create: `atlas-art-factory/.gitignore`

**Step 1: Create directory and package.json**

```bash
mkdir -p atlas-art-factory
```

Create `atlas-art-factory/package.json`:
```json
{
  "name": "atlas-art-factory",
  "version": "1.0.0",
  "description": "Atlas AI Art Factory — automated digital art production",
  "main": "core/orchestrator.js",
  "scripts": {
    "start": "node core/orchestrator.js",
    "dev": "nodemon core/orchestrator.js",
    "api": "node api/index.js",
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "migrate": "node database/migrate.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "ioredis": "^5.3.2",
    "bull": "^4.12.0",
    "node-cron": "^3.0.3",
    "playwright": "^1.41.0",
    "sharp": "^0.33.2",
    "canvas": "^2.11.2",
    "axios": "^1.6.7",
    "openai": "^4.28.0",
    "google-trends-api": "^4.9.2",
    "node-vibrant": "^3.1.6",
    "uuid": "^9.0.0",
    "dotenv": "^16.4.1",
    "anthropic": "^0.20.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.0.3"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

**Step 2: Create `.env.example`**

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=atlas_art_factory
POSTGRES_USER=atlas
POSTGRES_PASSWORD=atlas_secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI APIs
OPENAI_API_KEY=
GOAPI_KEY=
IDEOGRAM_API_KEY=
REPLICATE_API_TOKEN=

# Platform APIs
ETSY_API_KEY=
ETSY_API_SECRET=
ETSY_ACCESS_TOKEN=
ETSY_SHOP_ID=
PINTEREST_ACCESS_TOKEN=
GUMROAD_ACCESS_TOKEN=

# App
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
```

**Step 3: Create `.gitignore`**

```
node_modules/
.env
storage/artworks/
storage/mockups/
storage/packages/
*.log
```

**Step 4: Install dependencies**

```bash
cd atlas-art-factory && npm install
```

Expected: `node_modules/` created, no errors.

**Step 5: Install Playwright browsers**

```bash
cd atlas-art-factory && npx playwright install chromium
```

**Step 6: Commit**

```bash
git add atlas-art-factory/package.json atlas-art-factory/.env.example atlas-art-factory/.gitignore
git commit -m "feat(art-factory): project scaffold + dependencies"
```

---

### Task 2: Docker Compose — PostgreSQL + Redis

**Files:**
- Create: `atlas-art-factory/docker-compose.yml`

**Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: atlas_art_postgres
    environment:
      POSTGRES_DB: atlas_art_factory
      POSTGRES_USER: atlas
      POSTGRES_PASSWORD: atlas_secret
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: atlas_art_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

**Step 2: Start containers**

```bash
cd atlas-art-factory && docker compose up -d
```

Expected output:
```
✔ Container atlas_art_postgres  Started
✔ Container atlas_art_redis     Started
```

**Step 3: Verify PostgreSQL**

```bash
docker exec atlas_art_postgres psql -U atlas -d atlas_art_factory -c "SELECT version();"
```

Expected: PostgreSQL 16.x version string.

**Step 4: Verify Redis**

```bash
docker exec atlas_art_redis redis-cli ping
```

Expected: `PONG`

**Step 5: Commit**

```bash
git add atlas-art-factory/docker-compose.yml
git commit -m "feat(art-factory): docker-compose for postgres + redis"
```

---

### Task 3: Database schema migration

**Files:**
- Create: `atlas-art-factory/database/schema.sql`
- Create: `atlas-art-factory/database/migrate.js`

**Step 1: Create schema.sql**

Copy the full PostgreSQL schema (from design doc) into `atlas-art-factory/database/schema.sql`. The schema includes these tables:
- `scraped_trends` — raw marketplace data
- `demand_scores` — calculated demand per keyword
- `market_opportunities` — ranked niches
- `silos` — 50 art categories
- `silo_keywords`
- `ai_artists` — 50 AI personas
- `prompt_library`
- `artworks` — generated images
- `artwork_variations`
- `mockups`
- `product_packages`
- `listings` — platform listings
- `listing_images`
- `sales`
- `analytics_daily`
- `performance_metrics`
- `job_queue`
- `system_logs`
- `api_usage`
- `system_config`

Full schema content:

```sql
-- ============================================
-- TREND & MARKET INTELLIGENCE
-- ============================================

CREATE TABLE IF NOT EXISTS scraped_trends (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    listing_url TEXT,
    title TEXT,
    description TEXT,
    price DECIMAL(10,2),
    sales_count INTEGER,
    review_count INTEGER,
    rating DECIMAL(3,2),
    favorites INTEGER,
    views INTEGER,
    keywords TEXT[],
    tags TEXT[],
    category VARCHAR(100),
    style VARCHAR(100),
    subject VARCHAR(100),
    color_palette JSONB,
    image_urls TEXT[],
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trends_platform ON scraped_trends(platform);
CREATE INDEX IF NOT EXISTS idx_trends_keywords ON scraped_trends USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_trends_scraped_at ON scraped_trends(scraped_at);

CREATE TABLE IF NOT EXISTS demand_scores (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(200) UNIQUE NOT NULL,
    search_volume INTEGER,
    sales_velocity DECIMAL(10,2),
    social_engagement INTEGER,
    competition_count INTEGER,
    demand_score DECIMAL(10,2),
    trend_direction VARCHAR(20),
    saturation_level DECIMAL(5,2),
    avg_price DECIMAL(10,2),
    calculated_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_score ON demand_scores(demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_keyword ON demand_scores(keyword);

CREATE TABLE IF NOT EXISTS market_opportunities (
    id SERIAL PRIMARY KEY,
    niche VARCHAR(200),
    demand_score DECIMAL(10,2),
    competition_level VARCHAR(20),
    profit_potential DECIMAL(10,2),
    trend_strength DECIMAL(5,2),
    recommended_price DECIMAL(10,2),
    recommended_styles TEXT[],
    recommended_keywords TEXT[],
    opportunity_rank INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    identified_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CATEGORY & SILO SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS silos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100),
    description TEXT,
    target_daily_output INTEGER DEFAULT 4,
    priority INTEGER DEFAULT 50,
    performance_score DECIMAL(5,2),
    total_artworks INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    avg_conversion DECIMAL(5,4),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS silo_keywords (
    id SERIAL PRIMARY KEY,
    silo_id INTEGER REFERENCES silos(id),
    keyword VARCHAR(200),
    relevance_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- AI ARTIST SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS ai_artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    persona TEXT,
    silo_id INTEGER REFERENCES silos(id),
    preferred_ai_engine VARCHAR(50),
    backup_ai_engine VARCHAR(50),
    style_rules JSONB,
    color_palettes JSONB,
    composition_rules JSONB,
    prompt_templates JSONB,
    negative_prompts TEXT[],
    technical_params JSONB,
    daily_quota INTEGER DEFAULT 4,
    total_created INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    avg_sale_rate DECIMAL(5,4),
    performance_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_library (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER REFERENCES ai_artists(id),
    prompt_template TEXT NOT NULL,
    variation_rules JSONB,
    success_rate DECIMAL(5,4),
    avg_sales DECIMAL(5,2),
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- IMAGE PRODUCTION
-- ============================================

CREATE TABLE IF NOT EXISTS artworks (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    artist_id INTEGER REFERENCES ai_artists(id),
    silo_id INTEGER REFERENCES silos(id),
    title VARCHAR(200),
    prompt TEXT,
    negative_prompt TEXT,
    ai_engine VARCHAR(50),
    ai_params JSONB,
    style_tags TEXT[],
    color_palette JSONB,
    master_image_url TEXT,
    master_image_path TEXT,
    image_hash VARCHAR(64),
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    quality_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'generated',
    generation_time INTEGER,
    generation_cost DECIMAL(6,4),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_silo ON artworks(silo_id);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_created ON artworks(created_at);

CREATE TABLE IF NOT EXISTS artwork_variations (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    variation_type VARCHAR(50),
    image_url TEXT,
    image_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mockups (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    scene_type VARCHAR(50),
    mockup_url TEXT,
    mockup_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PRODUCT PACKAGES
-- ============================================

CREATE TABLE IF NOT EXISTS product_packages (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    package_type VARCHAR(50),
    formats JSONB,
    file_paths JSONB,
    total_files INTEGER,
    package_size INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DISTRIBUTION & LISTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS listings (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50) NOT NULL,
    platform_listing_id VARCHAR(100),
    listing_url TEXT,
    title VARCHAR(200),
    description TEXT,
    tags TEXT[],
    price DECIMAL(10,2),
    discount_price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'draft',
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_artwork ON listings(artwork_id);
CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

CREATE TABLE IF NOT EXISTS listing_images (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES listings(id),
    image_url TEXT,
    image_type VARCHAR(50),
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SALES & ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES listings(id),
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50),
    sale_date TIMESTAMP,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    net_revenue DECIMAL(10,2),
    customer_location VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_artwork ON sales(artwork_id);
CREATE INDEX IF NOT EXISTS idx_sales_platform ON sales(platform);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

CREATE TABLE IF NOT EXISTS analytics_daily (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    artworks_created INTEGER DEFAULT 0,
    listings_published INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    gross_revenue DECIMAL(10,2) DEFAULT 0,
    net_revenue DECIMAL(10,2) DEFAULT 0,
    ai_costs DECIMAL(10,2) DEFAULT 0,
    platform_fees DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,4),
    avg_sale_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50),
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    favorites INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,4),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SYSTEM OPERATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS job_queue (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    job_data JSONB,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON job_queue(scheduled_at);

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20),
    component VARCHAR(50),
    message TEXT,
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at);

CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    service VARCHAR(50),
    endpoint VARCHAR(100),
    cost DECIMAL(10,4),
    response_time INTEGER,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_config (key, value, description) VALUES
('daily_production_target', '200', 'Target number of artworks per day'),
('min_quality_score', '80', 'Minimum quality score to publish'),
('max_listings_per_day', '50', 'Max new listings per platform per day'),
('auto_republish', 'true', 'Auto-republish underperformers'),
('adaptive_learning', 'true', 'Enable adaptive learning system')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- MODEL DISCOVERY (Engine 9)
-- ============================================

CREATE TABLE IF NOT EXISTS discovered_models (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(200) UNIQUE NOT NULL,
    source VARCHAR(50),
    name VARCHAR(200),
    description TEXT,
    benchmark_scores JSONB,
    avg_quality_score DECIMAL(5,2),
    avg_speed_ms INTEGER,
    cost_per_image DECIMAL(8,4),
    overall_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'discovered',
    discovered_at TIMESTAMP DEFAULT NOW(),
    last_benchmarked TIMESTAMP
);
```

**Step 2: Create migrate.js**

```javascript
// atlas-art-factory/database/migrate.js
require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'atlas_art_factory',
    user: process.env.POSTGRES_USER || 'atlas',
    password: process.env.POSTGRES_PASSWORD || 'atlas_secret',
  });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    await pool.query(schema);
    console.log('✅ Schema migrated successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
```

**Step 3: Copy .env.example to .env and fill in local values**

```bash
cp atlas-art-factory/.env.example atlas-art-factory/.env
```

Edit `.env` — the Docker defaults work as-is for local dev:
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=atlas_art_factory
POSTGRES_USER=atlas
POSTGRES_PASSWORD=atlas_secret
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Step 4: Run migration**

```bash
cd atlas-art-factory && npm run migrate
```

Expected: `✅ Schema migrated successfully`

**Step 5: Verify tables exist**

```bash
docker exec atlas_art_postgres psql -U atlas -d atlas_art_factory -c "\dt"
```

Expected: 20 tables listed (scraped_trends, demand_scores, artworks, listings, etc.)

**Step 6: Commit**

```bash
git add atlas-art-factory/database/
git commit -m "feat(art-factory): postgresql schema + migration script"
```

---

### Task 4: Core config files — 50 silos + 50 AI artists

**Files:**
- Create: `atlas-art-factory/config/silos.json`
- Create: `atlas-art-factory/config/artists.json`
- Create: `atlas-art-factory/config/ai-engines.json`
- Create: `atlas-art-factory/config/platforms.json`

**Step 1: Create silos.json (50 art categories)**

```json
[
  { "id": 1,  "name": "nursery-animals",       "category": "nursery",     "description": "Cute animals for nursery rooms",             "target_daily_output": 4, "priority": 80, "keywords": ["nursery art", "baby animals", "kids wall art", "cute animals nursery"] },
  { "id": 2,  "name": "botanical-prints",       "category": "nature",      "description": "Botanical illustrations and plant art",       "target_daily_output": 4, "priority": 78, "keywords": ["botanical print", "plant art", "floral print", "herb print"] },
  { "id": 3,  "name": "motivational-quotes",    "category": "quotes",      "description": "Inspirational and motivational quote prints", "target_daily_output": 4, "priority": 76, "keywords": ["motivational poster", "inspirational quote", "office art", "success quote"] },
  { "id": 4,  "name": "minimalist-abstract",    "category": "abstract",    "description": "Clean minimalist abstract designs",           "target_daily_output": 4, "priority": 74, "keywords": ["minimalist art", "abstract print", "modern wall art", "simple art"] },
  { "id": 5,  "name": "bathroom-humor",         "category": "bathroom",    "description": "Funny bathroom wall art",                     "target_daily_output": 4, "priority": 73, "keywords": ["bathroom art funny", "toilet humor", "bathroom wall decor", "funny bathroom sign"] },
  { "id": 6,  "name": "kitchen-food-art",       "category": "kitchen",     "description": "Food and kitchen themed prints",              "target_daily_output": 4, "priority": 71, "keywords": ["kitchen art", "food print", "recipe art", "chef wall art"] },
  { "id": 7,  "name": "watercolor-landscapes",  "category": "landscape",   "description": "Watercolor landscape and nature scenes",      "target_daily_output": 4, "priority": 70, "keywords": ["watercolor landscape", "nature print", "mountain art", "watercolor print"] },
  { "id": 8,  "name": "cat-art",                "category": "animals",     "description": "Cat illustrations in various styles",         "target_daily_output": 4, "priority": 69, "keywords": ["cat art", "cat print", "cat wall art", "cute cat decor"] },
  { "id": 9,  "name": "dog-art",                "category": "animals",     "description": "Dog portraits and illustrations",             "target_daily_output": 4, "priority": 68, "keywords": ["dog art", "dog print", "dog wall art", "pet portrait print"] },
  { "id": 10, "name": "celestial-moon-stars",   "category": "celestial",   "description": "Moon, stars, and celestial art",             "target_daily_output": 4, "priority": 67, "keywords": ["moon art", "celestial print", "stars wall art", "lunar print"] },
  { "id": 11, "name": "vintage-retro-posters",  "category": "vintage",     "description": "Vintage and retro styled posters",           "target_daily_output": 4, "priority": 66, "keywords": ["vintage poster", "retro print", "retro wall art", "vintage art"] },
  { "id": 12, "name": "geometric-art",          "category": "geometric",   "description": "Geometric shapes and patterns",              "target_daily_output": 4, "priority": 65, "keywords": ["geometric art", "geometric print", "modern geometric", "shapes art"] },
  { "id": 13, "name": "ocean-beach-coastal",    "category": "coastal",     "description": "Ocean, beach, and coastal themed art",       "target_daily_output": 4, "priority": 64, "keywords": ["beach art", "ocean print", "coastal decor", "sea wall art"] },
  { "id": 14, "name": "floral-paintings",       "category": "floral",      "description": "Floral paintings and flower art",            "target_daily_output": 4, "priority": 63, "keywords": ["floral print", "flower art", "rose print", "floral wall art"] },
  { "id": 15, "name": "mountain-hiking",        "category": "outdoor",     "description": "Mountain and outdoor adventure art",         "target_daily_output": 4, "priority": 62, "keywords": ["mountain art", "hiking print", "adventure art", "nature poster"] },
  { "id": 16, "name": "yoga-wellness",          "category": "wellness",    "description": "Yoga, meditation, and wellness art",         "target_daily_output": 4, "priority": 61, "keywords": ["yoga art", "wellness print", "meditation art", "mindfulness poster"] },
  { "id": 17, "name": "coffee-cafe-art",        "category": "coffee",      "description": "Coffee and cafe themed prints",              "target_daily_output": 4, "priority": 60, "keywords": ["coffee art", "coffee print", "cafe wall art", "coffee lover gift"] },
  { "id": 18, "name": "music-art",              "category": "music",       "description": "Music themed art and instruments",           "target_daily_output": 4, "priority": 59, "keywords": ["music art", "guitar print", "music poster", "musician wall art"] },
  { "id": 19, "name": "sport-fitness",          "category": "sports",      "description": "Sports and fitness motivation prints",       "target_daily_output": 4, "priority": 58, "keywords": ["fitness motivation", "gym art", "workout poster", "sports print"] },
  { "id": 20, "name": "african-art",            "category": "cultural",    "description": "African inspired art and patterns",          "target_daily_output": 4, "priority": 57, "keywords": ["african art", "african print", "tribal art", "afrocentric wall art"] },
  { "id": 21, "name": "japanese-art",           "category": "cultural",    "description": "Japanese art styles and themes",             "target_daily_output": 4, "priority": 56, "keywords": ["japanese art", "japanese print", "zen art", "japanese wall art"] },
  { "id": 22, "name": "boho-art",               "category": "boho",        "description": "Bohemian and eclectic art styles",           "target_daily_output": 4, "priority": 55, "keywords": ["boho art", "bohemian print", "boho wall art", "eclectic decor"] },
  { "id": 23, "name": "abstract-faces",         "category": "portrait",    "description": "Abstract face and portrait art",             "target_daily_output": 4, "priority": 54, "keywords": ["abstract face", "face art", "portrait print", "abstract woman"] },
  { "id": 24, "name": "kids-educational",       "category": "educational", "description": "Educational prints for children",           "target_daily_output": 4, "priority": 53, "keywords": ["kids educational print", "alphabet art", "number art", "classroom decor"] },
  { "id": 25, "name": "map-travel-art",         "category": "travel",      "description": "Map and travel destination art",             "target_daily_output": 4, "priority": 52, "keywords": ["map art", "travel print", "city map print", "travel poster"] },
  { "id": 26, "name": "sun-moon-duality",       "category": "spiritual",   "description": "Sun, moon, and duality spiritual art",       "target_daily_output": 4, "priority": 51, "keywords": ["sun moon art", "spiritual print", "duality art", "mystical print"] },
  { "id": 27, "name": "typography-word-art",    "category": "typography",  "description": "Typography and word-based art",              "target_daily_output": 4, "priority": 50, "keywords": ["word art", "typography print", "text art", "letter art"] },
  { "id": 28, "name": "christmas-holiday",      "category": "seasonal",    "description": "Christmas and holiday themed art",           "target_daily_output": 4, "priority": 49, "keywords": ["christmas art", "holiday print", "christmas wall art", "festive print"] },
  { "id": 29, "name": "halloween-art",          "category": "seasonal",    "description": "Halloween themed spooky art",                "target_daily_output": 4, "priority": 48, "keywords": ["halloween art", "spooky print", "halloween decor", "witch art"] },
  { "id": 30, "name": "dinosaur-art",           "category": "kids",        "description": "Dinosaur art for kids rooms",                "target_daily_output": 4, "priority": 47, "keywords": ["dinosaur art", "dinosaur print", "dino wall art", "kids dinosaur"] },
  { "id": 31, "name": "unicorn-fantasy",        "category": "fantasy",     "description": "Unicorn and fantasy magical art",            "target_daily_output": 4, "priority": 46, "keywords": ["unicorn art", "fantasy print", "magical art", "unicorn wall art"] },
  { "id": 32, "name": "fox-woodland",           "category": "animals",     "description": "Fox and woodland animal art",                "target_daily_output": 4, "priority": 45, "keywords": ["fox art", "woodland art", "forest animal", "fox print"] },
  { "id": 33, "name": "desert-southwest",       "category": "regional",    "description": "Desert and American Southwest art",          "target_daily_output": 4, "priority": 44, "keywords": ["desert art", "cactus print", "southwest art", "cactus wall art"] },
  { "id": 34, "name": "bird-art",               "category": "animals",     "description": "Bird illustrations and prints",              "target_daily_output": 4, "priority": 43, "keywords": ["bird art", "bird print", "bird wall art", "ornithology print"] },
  { "id": 35, "name": "space-galaxy",           "category": "space",       "description": "Space, galaxy, and cosmos art",              "target_daily_output": 4, "priority": 42, "keywords": ["space art", "galaxy print", "cosmos art", "planet print"] },
  { "id": 36, "name": "fishing-hunting",        "category": "outdoor",     "description": "Fishing and hunting themed art",             "target_daily_output": 4, "priority": 41, "keywords": ["fishing art", "hunting print", "fishing wall art", "outdoorsman art"] },
  { "id": 37, "name": "feminine-empowerment",   "category": "empowerment", "description": "Female empowerment and feminist art",        "target_daily_output": 4, "priority": 40, "keywords": ["girl boss", "feminist art", "empowerment print", "strong woman art"] },
  { "id": 38, "name": "halloween-cute",         "category": "seasonal",    "description": "Cute Halloween art for all ages",            "target_daily_output": 4, "priority": 39, "keywords": ["cute halloween", "kawaii halloween", "friendly ghost", "cute witch"] },
  { "id": 39, "name": "horse-equestrian",       "category": "animals",     "description": "Horse and equestrian art",                   "target_daily_output": 4, "priority": 38, "keywords": ["horse art", "equestrian print", "horse wall art", "horse lover gift"] },
  { "id": 40, "name": "wine-beer-art",          "category": "beverage",    "description": "Wine, beer, and cocktail art",               "target_daily_output": 4, "priority": 37, "keywords": ["wine art", "wine print", "beer art", "cocktail print", "bar art"] },
  { "id": 41, "name": "reading-library-art",    "category": "literary",    "description": "Books, reading, and library art",            "target_daily_output": 4, "priority": 36, "keywords": ["book art", "reading print", "library art", "bookworm gift"] },
  { "id": 42, "name": "nurse-doctor-art",       "category": "profession",  "description": "Healthcare and medical profession art",      "target_daily_output": 4, "priority": 35, "keywords": ["nurse art", "doctor print", "medical art", "healthcare worker gift"] },
  { "id": 43, "name": "teacher-art",            "category": "profession",  "description": "Teacher appreciation and classroom art",     "target_daily_output": 4, "priority": 34, "keywords": ["teacher art", "teacher gift", "classroom art", "teacher appreciation"] },
  { "id": 44, "name": "gaming-art",             "category": "gaming",      "description": "Video game and gamer themed art",            "target_daily_output": 4, "priority": 33, "keywords": ["gaming art", "gamer print", "video game art", "gaming room decor"] },
  { "id": 45, "name": "pride-lgbtq",            "category": "pride",       "description": "LGBTQ+ pride and rainbow art",               "target_daily_output": 4, "priority": 32, "keywords": ["pride art", "lgbtq print", "rainbow art", "pride wall art"] },
  { "id": 46, "name": "succulent-cactus",       "category": "plants",      "description": "Succulent and cactus plant art",             "target_daily_output": 4, "priority": 31, "keywords": ["succulent art", "cactus art", "plant print", "succulent print"] },
  { "id": 47, "name": "farmhouse-rustic",       "category": "farmhouse",   "description": "Farmhouse and rustic home decor art",        "target_daily_output": 4, "priority": 30, "keywords": ["farmhouse art", "rustic print", "farmhouse decor", "country art"] },
  { "id": 48, "name": "baby-shower-art",        "category": "celebration", "description": "Baby shower and new baby art",               "target_daily_output": 4, "priority": 29, "keywords": ["baby shower art", "new baby print", "baby decor", "baby shower gift"] },
  { "id": 49, "name": "graduation-art",         "category": "celebration", "description": "Graduation and achievement art",             "target_daily_output": 4, "priority": 28, "keywords": ["graduation art", "graduation gift", "diploma art", "class of 2026"] },
  { "id": 50, "name": "zen-buddha-art",         "category": "spiritual",   "description": "Zen, Buddha, and spiritual peace art",       "target_daily_output": 4, "priority": 27, "keywords": ["zen art", "buddha print", "spiritual art", "peace art"] }
]
```

**Step 2: Create artists.json (50 AI artist personas — one per silo)**

```json
[
  { "id": 1,  "name": "Lily",    "silo": "nursery-animals",      "preferred_engine": "flux-schnell", "style": "cute, soft watercolor, pastel colors, rounded shapes", "negative_prompts": ["scary", "dark", "adult", "realistic gritty"], "color_palette": ["#FFB7C5", "#B7E5FF", "#FFEDB7", "#C5FFB7"] },
  { "id": 2,  "name": "Fern",    "silo": "botanical-prints",     "preferred_engine": "flux-dev",     "style": "detailed botanical illustration, vintage scientific, clean white background", "negative_prompts": ["cartoon", "3d render", "digital art"], "color_palette": ["#2D5A27", "#7CB87B", "#F5F0E8", "#C4A882"] },
  { "id": 3,  "name": "Max",     "silo": "motivational-quotes",  "preferred_engine": "ideogram",     "style": "bold typography, modern design, clean layout, inspirational", "negative_prompts": ["cluttered", "ugly font", "low quality"], "color_palette": ["#1A1A2E", "#16213E", "#0F3460", "#E94560"] },
  { "id": 4,  "name": "Sage",    "silo": "minimalist-abstract",  "preferred_engine": "flux-dev",     "style": "minimalist, clean lines, negative space, Scandinavian design", "negative_prompts": ["busy", "cluttered", "colorful chaos", "detailed"], "color_palette": ["#F5F5F0", "#E8E8E0", "#333333", "#888888"] },
  { "id": 5,  "name": "Rex",     "silo": "bathroom-humor",       "preferred_engine": "dalle3",       "style": "funny illustration, cartoon style, bold colors, humorous", "negative_prompts": ["offensive", "vulgar", "dark humor"], "color_palette": ["#FFE66D", "#FF6B6B", "#4ECDC4", "#45B7D1"] },
  { "id": 6,  "name": "Basil",   "silo": "kitchen-food-art",     "preferred_engine": "flux-schnell", "style": "food illustration, warm colors, appetizing, retro kitchen style", "negative_prompts": ["unappetizing", "dark", "horror"], "color_palette": ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89"] },
  { "id": 7,  "name": "Iris",    "silo": "watercolor-landscapes","preferred_engine": "flux-dev",     "style": "loose watercolor, impressionistic, nature scenes, soft edges", "negative_prompts": ["photorealistic", "sharp edges", "digital"], "color_palette": ["#87CEEB", "#98FB98", "#DEB887", "#F0E68C"] },
  { "id": 8,  "name": "Mochi",   "silo": "cat-art",              "preferred_engine": "flux-schnell", "style": "cute cat illustration, playful, kawaii, charming", "negative_prompts": ["scary", "realistic photo", "dark"], "color_palette": ["#FFD700", "#FF69B4", "#98DBC6", "#E8A87C"] },
  { "id": 9,  "name": "Biscuit", "silo": "dog-art",              "preferred_engine": "dalle3",       "style": "charming dog portrait, expressive, warm tones, friendly", "negative_prompts": ["scary", "aggressive", "dark"], "color_palette": ["#D2691E", "#8B4513", "#F4A460", "#FFDEAD"] },
  { "id": 10, "name": "Luna",    "silo": "celestial-moon-stars", "preferred_engine": "flux-dev",     "style": "mystical celestial art, deep blues and purples, gold accents, magical", "negative_prompts": ["bright daylight", "mundane", "corporate"], "color_palette": ["#1A0A2E", "#3D1A78", "#9B5DE5", "#F5E642"] },
  { "id": 11, "name": "Vera",    "silo": "vintage-retro-posters","preferred_engine": "flux-dev",     "style": "vintage poster art, retro typography, aged texture, classic design", "negative_prompts": ["modern", "clean digital", "glossy"], "color_palette": ["#D4AF37", "#8B0000", "#F5F5DC", "#228B22"] },
  { "id": 12, "name": "Hex",     "silo": "geometric-art",        "preferred_engine": "flux-schnell", "style": "precise geometric shapes, bold colors, mathematical patterns, modern", "negative_prompts": ["organic", "hand-drawn", "messy"], "color_palette": ["#FF0054", "#FFBD00", "#00D1A0", "#7B2FBE"] },
  { "id": 13, "name": "Pearl",   "silo": "ocean-beach-coastal",  "preferred_engine": "flux-dev",     "style": "coastal watercolor, soft ocean tones, beachy, relaxing", "negative_prompts": ["harsh", "dark", "landlocked scenes"], "color_palette": ["#006994", "#40B4C4", "#F5DEB3", "#FFFFFF"] },
  { "id": 14, "name": "Rose",    "silo": "floral-paintings",     "preferred_engine": "flux-dev",     "style": "lush floral oil painting style, rich colors, romantic, botanical", "negative_prompts": ["cartoon flowers", "flat design", "ugly"], "color_palette": ["#FF007F", "#FF6EC7", "#FFB3C6", "#C71585"] },
  { "id": 15, "name": "Summit",  "silo": "mountain-hiking",      "preferred_engine": "flux-dev",     "style": "mountain landscape illustration, adventure, bold lines, National Park poster style", "negative_prompts": ["urban", "indoors", "flat"], "color_palette": ["#2C3E50", "#3498DB", "#FFFFFF", "#E67E22"] },
  { "id": 16, "name": "Zen",     "silo": "yoga-wellness",        "preferred_engine": "flux-schnell", "style": "serene wellness illustration, soft pastels, peaceful, holistic", "negative_prompts": ["energetic chaos", "dark", "aggressive"], "color_palette": ["#E8D5C4", "#9CAF88", "#C9B8A8", "#F0EAD6"] },
  { "id": 17, "name": "Brew",    "silo": "coffee-cafe-art",      "preferred_engine": "flux-schnell", "style": "warm coffee shop illustration, cozy, brown tones, artisanal", "negative_prompts": ["cold", "sterile", "cold colors"], "color_palette": ["#3E1F00", "#7B3F00", "#C68642", "#F5DEB3"] },
  { "id": 18, "name": "Riff",    "silo": "music-art",            "preferred_engine": "dalle3",       "style": "bold music illustration, rock poster style, expressive, vibrant", "negative_prompts": ["silent", "boring", "corporate"], "color_palette": ["#000000", "#FFD700", "#FF0000", "#FFFFFF"] },
  { "id": 19, "name": "Blaze",   "silo": "sport-fitness",        "preferred_engine": "flux-schnell", "style": "dynamic sports illustration, energetic, bold, motivational", "negative_prompts": ["static", "lazy", "weak"], "color_palette": ["#FF4500", "#000000", "#FFFFFF", "#FFD700"] },
  { "id": 20, "name": "Kente",   "silo": "african-art",          "preferred_engine": "flux-dev",     "style": "vibrant African patterns, Kente-inspired, bold geometric, cultural richness", "negative_prompts": ["stereotypical", "offensive", "appropriative"], "color_palette": ["#FFD700", "#008000", "#FF0000", "#000000"] },
  { "id": 21, "name": "Hana",    "silo": "japanese-art",         "preferred_engine": "flux-dev",     "style": "Japanese woodblock inspired, minimalist, traditional motifs, elegant", "negative_prompts": ["western style", "cluttered", "photo realistic"], "color_palette": ["#C62A2F", "#1B4F72", "#F5F5F0", "#2D8653"] },
  { "id": 22, "name": "Indigo",  "silo": "boho-art",             "preferred_engine": "flux-dev",     "style": "bohemian eclectic, warm earthy tones, layered, free-spirited", "negative_prompts": ["corporate", "minimalist", "cold"], "color_palette": ["#9B2335", "#E8A87C", "#B5A642", "#7B5EA7"] },
  { "id": 23, "name": "Muse",    "silo": "abstract-faces",       "preferred_engine": "flux-dev",     "style": "abstract female portrait, line art, elegant, Matisse-inspired", "negative_prompts": ["photo realistic", "ugly", "distorted"], "color_palette": ["#F5E6D3", "#C0A882", "#8B6914", "#2C1810"] },
  { "id": 24, "name": "Pixel",   "silo": "kids-educational",     "preferred_engine": "dalle3",       "style": "bright educational illustration, friendly characters, clear labels, fun", "negative_prompts": ["scary", "dark", "violent", "adult"], "color_palette": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFBE0B"] },
  { "id": 25, "name": "Atlas",   "silo": "map-travel-art",       "preferred_engine": "flux-dev",     "style": "illustrated travel map, vintage cartography, adventure, wanderlust", "negative_prompts": ["boring", "corporate", "no-style"], "color_palette": ["#DEB887", "#8B4513", "#228B22", "#4682B4"] },
  { "id": 26, "name": "Orion",   "silo": "sun-moon-duality",     "preferred_engine": "flux-dev",     "style": "mystical sun and moon art, celestial duality, spiritual symbols, ethereal", "negative_prompts": ["mundane", "scientific", "cold"], "color_palette": ["#FFD700", "#C0C0C0", "#1A0A2E", "#FF8C00"] },
  { "id": 27, "name": "Script",  "silo": "typography-word-art",  "preferred_engine": "ideogram",     "style": "elegant typography, lettering art, professional font use, impactful", "negative_prompts": ["illegible", "ugly fonts", "pixelated"], "color_palette": ["#1A1A1A", "#F5F5F5", "#C0A060", "#2C4770"] },
  { "id": 28, "name": "Holly",   "silo": "christmas-holiday",    "preferred_engine": "dalle3",       "style": "warm Christmas illustration, cozy holiday feeling, traditional red and green", "negative_prompts": ["commercial", "cheap", "garish"], "color_palette": ["#CC0000", "#006600", "#FFD700", "#FFFFFF"] },
  { "id": 29, "name": "Spook",   "silo": "halloween-art",        "preferred_engine": "dalle3",       "style": "spooky Halloween illustration, dramatic, orange and black, haunted", "negative_prompts": ["cute", "friendly", "non-spooky"], "color_palette": ["#FF6600", "#000000", "#800080", "#00CC00"] },
  { "id": 30, "name": "Dino",    "silo": "dinosaur-art",         "preferred_engine": "dalle3",       "style": "fun dinosaur illustration, kids-friendly, colorful, roaring adventures", "negative_prompts": ["scary realistic", "dark", "violent"], "color_palette": ["#228B22", "#32CD32", "#FF6347", "#4682B4"] },
  { "id": 31, "name": "Sparkle", "silo": "unicorn-fantasy",      "preferred_engine": "dalle3",       "style": "magical unicorn art, rainbow colors, glitter, fantasy dreamscape", "negative_prompts": ["dark fantasy", "violent", "scary"], "color_palette": ["#FF69B4", "#DDA0DD", "#87CEEB", "#FFD700"] },
  { "id": 32, "name": "Rustle",  "silo": "fox-woodland",         "preferred_engine": "flux-dev",     "style": "charming woodland illustration, autumnal colors, cozy nature", "negative_prompts": ["urban", "scary", "dark"], "color_palette": ["#D2691E", "#FF8C00", "#228B22", "#F5DEB3"] },
  { "id": 33, "name": "Cactus",  "silo": "desert-southwest",     "preferred_engine": "flux-dev",     "style": "desert watercolor illustration, warm sandy tones, cactus and sunset", "negative_prompts": ["cold", "wet", "tropical"], "color_palette": ["#CD853F", "#DEB887", "#FF7F50", "#4682B4"] },
  { "id": 34, "name": "Robin",   "silo": "bird-art",             "preferred_engine": "flux-dev",     "style": "detailed bird illustration, naturalist style, elegant, Audubon-inspired", "negative_prompts": ["cartoon", "ugly", "distorted"], "color_palette": ["#4682B4", "#228B22", "#FFD700", "#8B4513"] },
  { "id": 35, "name": "Nova",    "silo": "space-galaxy",         "preferred_engine": "flux-dev",     "style": "cosmic space art, nebula colors, deep space, awe-inspiring", "negative_prompts": ["mundane", "earthly", "bright daylight"], "color_palette": ["#000033", "#4B0082", "#9400D3", "#00BFFF"] },
  { "id": 36, "name": "Buck",    "silo": "fishing-hunting",      "preferred_engine": "flux-schnell", "style": "rustic outdoor illustration, cabin art style, earthy tones, nature sports", "negative_prompts": ["urban", "indoor", "feminine"], "color_palette": ["#4A2C0A", "#8B6914", "#228B22", "#4682B4"] },
  { "id": 37, "name": "Viv",     "silo": "feminine-empowerment", "preferred_engine": "flux-dev",     "style": "bold empowerment art, strong women illustration, modern feminist design", "negative_prompts": ["passive", "weak", "stereotypical"], "color_palette": ["#FF1493", "#800080", "#FFD700", "#000000"] },
  { "id": 38, "name": "Boo",     "silo": "halloween-cute",       "preferred_engine": "dalle3",       "style": "kawaii Halloween, adorable ghosts and pumpkins, pastel spooky, not scary", "negative_prompts": ["scary", "dark", "violent", "gory"], "color_palette": ["#FFB347", "#DDA0DD", "#98FB98", "#87CEEB"] },
  { "id": 39, "name": "Gallop",  "silo": "horse-equestrian",     "preferred_engine": "flux-dev",     "style": "elegant horse illustration, equestrian art, movement and grace, classical", "negative_prompts": ["cartoon horse", "ugly", "static"], "color_palette": ["#8B4513", "#D2691E", "#F5DEB3", "#228B22"] },
  { "id": 40, "name": "Vino",    "silo": "wine-beer-art",        "preferred_engine": "flux-schnell", "style": "sophisticated wine and bar art, warm tones, artisanal, European café style", "negative_prompts": ["cheap", "tacky", "overly commercial"], "color_palette": ["#722F37", "#C5A028", "#F5F5DC", "#2C1810"] },
  { "id": 41, "name": "Page",    "silo": "reading-library-art",  "preferred_engine": "flux-dev",     "style": "cozy library illustration, warm bookshelf scenes, literary art, intellectual", "negative_prompts": ["digital", "cold", "sterile"], "color_palette": ["#8B4513", "#DEB887", "#F5DEB3", "#2C1810"] },
  { "id": 42, "name": "Care",    "silo": "nurse-doctor-art",     "preferred_engine": "ideogram",     "style": "clean healthcare art, professional, heartfelt, appreciation-focused", "negative_prompts": ["gory", "graphic medical", "scary"], "color_palette": ["#FFFFFF", "#0066CC", "#FF6B6B", "#00CC66"] },
  { "id": 43, "name": "Apple",   "silo": "teacher-art",          "preferred_engine": "ideogram",     "style": "cheerful classroom art, apple motifs, educational symbols, warm and welcoming", "negative_prompts": ["boring", "corporate", "cold"], "color_palette": ["#FF0000", "#228B22", "#FFD700", "#4682B4"] },
  { "id": 44, "name": "Pixel2",  "silo": "gaming-art",           "preferred_engine": "flux-dev",     "style": "retro gaming art, pixel art influence, neon colors, gaming culture", "negative_prompts": ["realistic", "boring", "non-digital"], "color_palette": ["#00FF00", "#FF0000", "#0000FF", "#000000"] },
  { "id": 45, "name": "Pride",   "silo": "pride-lgbtq",          "preferred_engine": "flux-schnell", "style": "vibrant pride art, rainbow colors, inclusive, celebratory", "negative_prompts": ["dark", "sad", "divisive"], "color_palette": ["#FF0018", "#FFA52C", "#FFFF41", "#008018", "#0000F9", "#86007D"] },
  { "id": 46, "name": "Prickle", "silo": "succulent-cactus",     "preferred_engine": "flux-dev",     "style": "charming succulent illustration, clean white background, botanical, modern", "negative_prompts": ["messy", "dying plants", "dark"], "color_palette": ["#228B22", "#90EE90", "#F5F5DC", "#DEB887"] },
  { "id": 47, "name": "Rusty",   "silo": "farmhouse-rustic",     "preferred_engine": "flux-dev",     "style": "rustic farmhouse illustration, worn textures, country charm, homey", "negative_prompts": ["modern", "sleek", "urban"], "color_palette": ["#8B4513", "#D2691E", "#F5DEB3", "#228B22"] },
  { "id": 48, "name": "Bunny",   "silo": "baby-shower-art",      "preferred_engine": "dalle3",       "style": "sweet baby shower art, pastel colors, delicate, precious, new life", "negative_prompts": ["scary", "dark", "adult themes"], "color_palette": ["#FFB6C1", "#B0E0E6", "#FFFACD", "#E6E6FA"] },
  { "id": 49, "name": "Cap",     "silo": "graduation-art",       "preferred_engine": "ideogram",     "style": "celebratory graduation art, achievement, proud, caps and diplomas", "negative_prompts": ["sad", "failure", "dark"], "color_palette": ["#000080", "#FFD700", "#FFFFFF", "#C0C0C0"] },
  { "id": 50, "name": "Bodhi",   "silo": "zen-buddha-art",       "preferred_engine": "flux-dev",     "style": "serene Buddha and Zen art, peaceful, lotus motifs, spiritual tranquility", "negative_prompts": ["chaotic", "violent", "disrespectful"], "color_palette": ["#FFD700", "#FF8C00", "#FFFFFF", "#2C1810"] }
]
```

**Step 3: Create ai-engines.json**

```json
{
  "engines": {
    "flux-schnell": {
      "type": "local",
      "model": "black-forest-labs/FLUX.1-schnell",
      "description": "Free, fast, Apache 2.0 — for high-volume batch production",
      "cost_per_image": 0,
      "avg_time_seconds": 3,
      "quality_tier": "good",
      "via": "replicate",
      "enabled": true
    },
    "flux-dev": {
      "type": "local",
      "model": "black-forest-labs/FLUX.1-dev",
      "description": "Free open weights — best quality local model",
      "cost_per_image": 0,
      "avg_time_seconds": 15,
      "quality_tier": "excellent",
      "via": "replicate",
      "enabled": true
    },
    "sdxl": {
      "type": "local",
      "model": "stability-ai/sdxl",
      "description": "Stable Diffusion XL — free fallback",
      "cost_per_image": 0,
      "avg_time_seconds": 8,
      "quality_tier": "good",
      "via": "replicate",
      "enabled": true
    },
    "dalle3": {
      "type": "api",
      "model": "dall-e-3",
      "description": "OpenAI DALL-E 3 — complex compositions",
      "cost_per_image": 0.04,
      "avg_time_seconds": 10,
      "quality_tier": "premium",
      "via": "openai",
      "enabled": true
    },
    "ideogram": {
      "type": "api",
      "model": "ideogram-v2",
      "description": "Ideogram v2 — best for typography in art",
      "cost_per_image": 0.02,
      "avg_time_seconds": 8,
      "quality_tier": "excellent",
      "via": "ideogram",
      "enabled": true
    },
    "midjourney": {
      "type": "api",
      "model": "midjourney-v6",
      "description": "Midjourney via GoAPI — premium quality",
      "cost_per_image": 0.04,
      "avg_time_seconds": 30,
      "quality_tier": "premium",
      "via": "goapi",
      "enabled": false
    }
  },
  "routing_rules": {
    "typography": "ideogram",
    "premium": "dalle3",
    "batch": "flux-schnell",
    "quality": "flux-dev",
    "fallback": "sdxl"
  },
  "discovery": {
    "enabled": true,
    "sources": ["huggingface", "replicate", "fal"],
    "benchmark_prompts": [
      "minimalist botanical print, white background, elegant",
      "cute nursery animals, soft watercolor, pastel",
      "motivational quote typography, bold modern design",
      "abstract geometric art, vibrant colors",
      "watercolor landscape, mountains and forest"
    ],
    "min_quality_score": 75,
    "run_every_days": 7
  }
}
```

**Step 4: Create platforms.json**

```json
{
  "platforms": {
    "etsy": {
      "enabled": true,
      "type": "api",
      "daily_limit": 50,
      "rate_limit_ms": 2000,
      "fee_percent": 6.5,
      "api_version": "v3"
    },
    "gumroad": {
      "enabled": true,
      "type": "api",
      "daily_limit": 50,
      "rate_limit_ms": 1000,
      "fee_percent": 10
    },
    "pinterest": {
      "enabled": true,
      "type": "api",
      "daily_limit": 20,
      "rate_limit_ms": 3000,
      "fee_percent": 0
    },
    "redbubble": {
      "enabled": true,
      "type": "playwright",
      "daily_limit": 30,
      "rate_limit_ms": 5000,
      "fee_percent": 20
    },
    "society6": {
      "enabled": true,
      "type": "playwright",
      "daily_limit": 30,
      "rate_limit_ms": 5000,
      "fee_percent": 15
    },
    "creative-market": {
      "enabled": true,
      "type": "playwright",
      "daily_limit": 20,
      "rate_limit_ms": 5000,
      "fee_percent": 30
    }
  }
}
```

**Step 5: Commit**

```bash
git add atlas-art-factory/config/
git commit -m "feat(art-factory): 50 silos, 50 AI artists, engine + platform configs"
```

---

### Task 5: Database connection module + Bull queue

**Files:**
- Create: `atlas-art-factory/core/database.js`
- Create: `atlas-art-factory/core/queue.js`
- Create: `atlas-art-factory/tests/core.test.js`

**Step 1: Write failing test**

```javascript
// atlas-art-factory/tests/core.test.js
const { getPool, closePool } = require('../core/database');
const { getQueue, closeQueues } = require('../core/queue');

describe('Core infrastructure', () => {
  afterAll(async () => {
    await closePool();
    await closeQueues();
  });

  test('PostgreSQL connection is alive', async () => {
    const pool = getPool();
    const result = await pool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  test('system_config table exists with default rows', async () => {
    const pool = getPool();
    const result = await pool.query("SELECT key FROM system_config WHERE key = 'daily_production_target'");
    expect(result.rows.length).toBe(1);
  });

  test('Bull queue is reachable', async () => {
    const q = getQueue('test-queue');
    const job = await q.add({ test: true });
    expect(job.id).toBeDefined();
    await job.remove();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd atlas-art-factory && npm test -- tests/core.test.js
```

Expected: FAIL — `Cannot find module '../core/database'`

**Step 3: Create database.js**

```javascript
// atlas-art-factory/core/database.js
require('dotenv').config();
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.POSTGRES_HOST || 'localhost',
      port:     parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'atlas_art_factory',
      user:     process.env.POSTGRES_USER || 'atlas',
      password: process.env.POSTGRES_PASSWORD || 'atlas_secret',
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[DB] Unexpected pool error:', err.message));
  }
  return pool;
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, closePool };
```

**Step 4: Create queue.js**

```javascript
// atlas-art-factory/core/queue.js
require('dotenv').config();
const Bull = require('bull');

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

const queues = {};

const QUEUE_NAMES = [
  'trend-scraping',
  'market-intelligence',
  'image-generation',
  'mockup-generation',
  'distribution',
  'analytics',
  'model-discovery',
];

function getQueue(name) {
  if (!queues[name]) {
    queues[name] = new Bull(name, { redis: REDIS_CONFIG });
  }
  return queues[name];
}

async function closeQueues() {
  for (const q of Object.values(queues)) {
    await q.close();
  }
}

module.exports = { getQueue, QUEUE_NAMES, closeQueues };
```

**Step 5: Run test to verify it passes**

```bash
cd atlas-art-factory && npm test -- tests/core.test.js
```

Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add atlas-art-factory/core/database.js atlas-art-factory/core/queue.js atlas-art-factory/tests/core.test.js
git commit -m "feat(art-factory): postgres connection + bull queue"
```

---

### Task 6: Config loader + logger

**Files:**
- Create: `atlas-art-factory/core/config.js`
- Create: `atlas-art-factory/core/logger.js`

**Step 1: Create config.js**

```javascript
// atlas-art-factory/core/config.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, filename), 'utf8'));
}

const silos      = loadJson('silos.json');
const artists    = loadJson('artists.json');
const aiEngines  = loadJson('ai-engines.json');
const platforms  = loadJson('platforms.json');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
['artworks', 'mockups', 'packages'].forEach(dir => {
  const p = path.join(STORAGE_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

module.exports = {
  silos,
  artists,
  aiEngines,
  platforms,
  STORAGE_DIR,
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DAILY_TARGET: 200,
  MIN_QUALITY_SCORE: 80,
};
```

**Step 2: Create logger.js**

```javascript
// atlas-art-factory/core/logger.js
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[process.env.LOG_LEVEL || 'info'];

function log(level, component, message, data = null) {
  if (levels[level] > currentLevel) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${component}] ${message}`;
  if (data) {
    console.log(line, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(line);
  }
}

module.exports = {
  info:  (c, m, d) => log('info',  c, m, d),
  warn:  (c, m, d) => log('warn',  c, m, d),
  error: (c, m, d) => log('error', c, m, d),
  debug: (c, m, d) => log('debug', c, m, d),
};
```

**Step 3: Commit**

```bash
git add atlas-art-factory/core/config.js atlas-art-factory/core/logger.js
git commit -m "feat(art-factory): config loader + logger"
```

---

### Task 7: Seed silos + artists into PostgreSQL

**Files:**
- Create: `atlas-art-factory/database/seed.js`
- Create: `atlas-art-factory/tests/seed.test.js`

**Step 1: Write failing test**

```javascript
// atlas-art-factory/tests/seed.test.js
const { query, closePool } = require('../core/database');

afterAll(closePool);

test('50 silos are seeded', async () => {
  const r = await query('SELECT COUNT(*) AS n FROM silos');
  expect(parseInt(r.rows[0].n)).toBe(50);
});

test('50 artists are seeded', async () => {
  const r = await query('SELECT COUNT(*) AS n FROM ai_artists');
  expect(parseInt(r.rows[0].n)).toBe(50);
});

test('nursery-animals silo exists', async () => {
  const r = await query("SELECT name FROM silos WHERE name = 'nursery-animals'");
  expect(r.rows.length).toBe(1);
});
```

**Step 2: Run to verify it fails**

```bash
cd atlas-art-factory && npm test -- tests/seed.test.js
```

Expected: FAIL — `expected 50, received 0`

**Step 3: Create seed.js**

```javascript
// atlas-art-factory/database/seed.js
const { query, closePool } = require('../core/database');
const { silos, artists } = require('../core/config');

async function seedSilos() {
  for (const silo of silos) {
    await query(`
      INSERT INTO silos (name, category, description, target_daily_output, priority)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO NOTHING
    `, [silo.name, silo.category, silo.description, silo.target_daily_output, silo.priority]);
  }
  console.log(`✅ Seeded ${silos.length} silos`);
}

async function seedArtists() {
  for (const artist of artists) {
    const siloRow = await query('SELECT id FROM silos WHERE name = $1', [artist.silo]);
    const siloId = siloRow.rows[0]?.id;
    await query(`
      INSERT INTO ai_artists (name, silo_id, preferred_ai_engine, style_rules, color_palettes, negative_prompts, daily_quota)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (name) DO NOTHING
    `, [
      artist.name,
      siloId,
      artist.preferred_engine,
      JSON.stringify({ style: artist.style }),
      JSON.stringify(artist.color_palette),
      artist.negative_prompts,
      4,
    ]);
  }
  console.log(`✅ Seeded ${artists.length} AI artists`);
}

async function seed() {
  await seedSilos();
  await seedArtists();
  await closePool();
}

seed().catch(err => { console.error(err); process.exit(1); });
```

**Step 4: Add seed script to package.json**

```json
"seed": "node database/seed.js"
```

**Step 5: Run seed**

```bash
cd atlas-art-factory && npm run seed
```

Expected:
```
✅ Seeded 50 silos
✅ Seeded 50 AI artists
```

**Step 6: Run tests**

```bash
cd atlas-art-factory && npm test -- tests/seed.test.js
```

Expected: PASS (3 tests)

**Step 7: Commit**

```bash
git add atlas-art-factory/database/seed.js atlas-art-factory/tests/seed.test.js atlas-art-factory/package.json
git commit -m "feat(art-factory): seed 50 silos + 50 AI artists into postgres"
```

---

### Task 8: Express API server + basic endpoints

**Files:**
- Create: `atlas-art-factory/api/index.js`
- Create: `atlas-art-factory/tests/api.test.js`

**Step 1: Write failing tests**

```javascript
// atlas-art-factory/tests/api.test.js
const request = require('supertest');
// npm install --save-dev supertest
const { createApp } = require('../api/index');

let app;
beforeAll(() => { app = createApp(); });

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('GET /api/silos returns 50 silos', async () => {
  const res = await request(app).get('/api/silos');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(50);
});

test('GET /api/stats returns production stats', async () => {
  const res = await request(app).get('/api/stats');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('artworks_today');
  expect(res.body).toHaveProperty('listings_total');
  expect(res.body).toHaveProperty('revenue_today');
});
```

**Step 2: Install supertest**

```bash
cd atlas-art-factory && npm install --save-dev supertest
```

**Step 3: Run tests to verify they fail**

```bash
cd atlas-art-factory && npm test -- tests/api.test.js
```

Expected: FAIL — `Cannot find module '../api/index'`

**Step 4: Create api/index.js**

```javascript
// atlas-art-factory/api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { query } = require('../core/database');
const logger = require('../core/logger');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'atlas-art-factory', timestamp: new Date().toISOString() });
  });

  app.get('/api/silos', async (req, res) => {
    try {
      const r = await query('SELECT * FROM silos ORDER BY priority DESC');
      res.json(r.rows);
    } catch (err) {
      logger.error('api', 'GET /api/silos failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/artists', async (req, res) => {
    try {
      const r = await query('SELECT * FROM ai_artists ORDER BY performance_score DESC NULLS LAST');
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [artworks, listings, revenue, opportunities] = await Promise.all([
        query("SELECT COUNT(*) AS n FROM artworks WHERE created_at::date = $1", [today]),
        query("SELECT COUNT(*) AS n FROM listings"),
        query("SELECT COALESCE(SUM(net_revenue),0) AS total FROM sales WHERE sale_date::date = $1", [today]),
        query("SELECT COUNT(*) AS n FROM market_opportunities WHERE status = 'active'"),
      ]);
      res.json({
        artworks_today:    parseInt(artworks.rows[0].n),
        listings_total:    parseInt(listings.rows[0].n),
        revenue_today:     parseFloat(revenue.rows[0].total),
        opportunities:     parseInt(opportunities.rows[0].n),
        target:            200,
        timestamp:         new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/artworks', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const r = await query('SELECT * FROM artworks ORDER BY created_at DESC LIMIT $1', [limit]);
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/opportunities', async (req, res) => {
    try {
      const r = await query("SELECT * FROM market_opportunities WHERE status='active' ORDER BY opportunity_rank ASC LIMIT 20");
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

function startServer() {
  const { PORT } = require('../core/config');
  const app = createApp();
  app.listen(PORT, () => {
    logger.info('api', `Atlas Art Factory API running on port ${PORT}`);
  });
  return app;
}

module.exports = { createApp, startServer };
```

**Step 5: Run tests**

```bash
cd atlas-art-factory && npm test -- tests/api.test.js
```

Expected: PASS (3 tests)

**Step 6: Verify server starts manually**

```bash
cd atlas-art-factory && node -e "require('./api/index').startServer()"
# Then in another terminal:
curl http://localhost:3001/health
```

Expected: `{"status":"ok","service":"atlas-art-factory",...}`

**Step 7: Commit**

```bash
git add atlas-art-factory/api/ atlas-art-factory/tests/api.test.js
git commit -m "feat(art-factory): express API server with health, silos, artists, stats endpoints"
```

---

### Task 9: Orchestrator + scheduler

**Files:**
- Create: `atlas-art-factory/core/orchestrator.js`
- Create: `atlas-art-factory/core/scheduler.js`

**Step 1: Create scheduler.js**

```javascript
// atlas-art-factory/core/scheduler.js
const cron = require('node-cron');
const logger = require('./logger');

const jobs = [];

function schedule(name, cronExpr, fn) {
  const task = cron.schedule(cronExpr, async () => {
    logger.info('scheduler', `Starting job: ${name}`);
    try {
      await fn();
      logger.info('scheduler', `Completed job: ${name}`);
    } catch (err) {
      logger.error('scheduler', `Job failed: ${name}`, err.message);
    }
  }, { scheduled: false });

  jobs.push({ name, task, cronExpr });
  return task;
}

function startAll() {
  jobs.forEach(({ name, task }) => {
    task.start();
    logger.info('scheduler', `Scheduled: ${name}`);
  });
}

function stopAll() {
  jobs.forEach(({ task }) => task.stop());
}

module.exports = { schedule, startAll, stopAll };
```

**Step 2: Create orchestrator.js**

```javascript
// atlas-art-factory/core/orchestrator.js
require('dotenv').config();
const { startServer } = require('../api/index');
const { schedule, startAll } = require('./scheduler');
const logger = require('./logger');

// Placeholder engine imports — filled in as engines are built
async function runTrendScraper()       { logger.info('orchestrator', 'Trend scraper: not yet implemented'); }
async function runMarketIntelligence() { logger.info('orchestrator', 'Market intelligence: not yet implemented'); }
async function runImageProduction()    { logger.info('orchestrator', 'Image production: not yet implemented'); }
async function runDistribution()       { logger.info('orchestrator', 'Distribution: not yet implemented'); }
async function runAnalytics()          { logger.info('orchestrator', 'Analytics: not yet implemented'); }
async function runModelDiscovery()     { logger.info('orchestrator', 'Model discovery: not yet implemented'); }

// Daily schedule
schedule('trend-scraper',        '0 6 * * *',   runTrendScraper);
schedule('market-intelligence',  '0 8 * * *',   runMarketIntelligence);
schedule('image-production',     '30 9 * * *',  runImageProduction);
schedule('distribution',         '0 18 * * *',  runDistribution);
schedule('analytics',            '0 22 * * *',  runAnalytics);
schedule('model-discovery',      '0 2 * * 1',   runModelDiscovery);  // Weekly, Monday 2am

startAll();
startServer();

logger.info('orchestrator', '🎨 Atlas Art Factory orchestrator started');
logger.info('orchestrator', 'Schedule: scrape 06:00 | intel 08:00 | generate 09:30 | publish 18:00 | analytics 22:00');

process.on('SIGINT',  () => { require('./scheduler').stopAll(); process.exit(0); });
process.on('SIGTERM', () => { require('./scheduler').stopAll(); process.exit(0); });
```

**Step 3: Verify orchestrator starts**

```bash
cd atlas-art-factory && node core/orchestrator.js
```

Expected output:
```
[...] [INFO] [scheduler] Scheduled: trend-scraper
[...] [INFO] [scheduler] Scheduled: market-intelligence
[...] [INFO] [api] Atlas Art Factory API running on port 3001
[...] [INFO] [orchestrator] 🎨 Atlas Art Factory orchestrator started
```

Stop with `Ctrl+C`.

**Step 4: Commit**

```bash
git add atlas-art-factory/core/orchestrator.js atlas-art-factory/core/scheduler.js
git commit -m "feat(art-factory): orchestrator + cron scheduler (daily workflow)"
```

---

### Task 10: Next.js dashboard shell — `/art-factory`

**Files:**
- Create: `frontend/app/art-factory/page.tsx`
- Modify: `frontend/app/page.tsx` (update Art Factory card)

**Step 1: Create the dashboard page**

```typescript
// frontend/app/art-factory/page.tsx
"use client"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

const FACTORY_API = "http://localhost:3001"

interface FactoryStats {
  artworks_today: number
  listings_total: number
  revenue_today: number
  opportunities: number
  target: number
  timestamp: string
}

interface Silo {
  id: number
  name: string
  category: string
  priority: number
  performance_score: number | null
  total_artworks: number
  total_sales: number
  total_revenue: string
  status: string
}

type Tab = "overview" | "silos" | "artists" | "trends" | "analytics"

export default function ArtFactory() {
  const [tab, setTab] = useState<Tab>("overview")
  const [stats, setStats] = useState<FactoryStats | null>(null)
  const [silos, setSilos] = useState<Silo[]>([])
  const [loading, setLoading] = useState(true)
  const [apiOnline, setApiOnline] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const [statsRes, silosRes] = await Promise.all([
        fetch(`${FACTORY_API}/api/stats`),
        fetch(`${FACTORY_API}/api/silos`),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (silosRes.ok) setSilos(await silosRes.json())
      setApiOnline(true)
    } catch {
      setApiOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [loadStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",  label: "Overview"   },
    { id: "silos",     label: "Silos"      },
    { id: "artists",   label: "Artists"    },
    { id: "trends",    label: "Trends"     },
    { id: "analytics", label: "Analytics"  },
  ]

  const progressPct = stats ? Math.min(100, (stats.artworks_today / stats.target) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-mono">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white/40 hover:text-white text-sm">← Back</Link>
          <h1 className="text-lg font-bold tracking-widest">ATLAS ART FACTORY</h1>
          <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
            apiOnline ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${apiOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {apiOnline ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
        {stats && (
          <div className="text-right text-xs text-white/40">
            Today: {stats.artworks_today}/{stats.target} artworks
          </div>
        )}
      </div>

      {!apiOnline && !loading && (
        <div className="mx-6 mt-4 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded text-yellow-400 text-sm">
          ⚠ Art Factory API offline — start with: <code className="bg-white/10 px-1 rounded">cd atlas-art-factory && npm start</code>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/10 px-6">
        <div className="flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? "border-indigo-400 text-white"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Artworks Today",    value: stats?.artworks_today ?? "—",              unit: `/ ${stats?.target ?? 200}` },
                { label: "Total Listings",    value: stats?.listings_total?.toLocaleString() ?? "—", unit: "listings" },
                { label: "Revenue Today",     value: stats ? `$${stats.revenue_today.toFixed(2)}` : "—", unit: "" },
                { label: "Opportunities",     value: stats?.opportunities ?? "—",                unit: "niches" },
              ].map(s => (
                <div key={s.label} className="border border-white/10 rounded-lg p-4 bg-white/5">
                  <div className="text-xs text-white/40 mb-1">{s.label}</div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  {s.unit && <div className="text-xs text-white/30 mt-0.5">{s.unit}</div>}
                </div>
              ))}
            </div>

            {/* Daily progress */}
            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <div className="flex justify-between text-xs text-white/40 mb-2">
                <span>Daily Production Progress</span>
                <span>{progressPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>06:00 Scrape</span>
                <span>08:00 Intel</span>
                <span>09:30 Generate</span>
                <span>18:00 Publish</span>
                <span>22:00 Analytics</span>
              </div>
            </div>

            {/* Top silos preview */}
            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <div className="text-xs text-white/40 mb-3 uppercase tracking-wider">Top Silos by Priority</div>
              <div className="space-y-2">
                {silos.slice(0, 8).map(silo => (
                  <div key={silo.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/70 capitalize">{silo.name.replace(/-/g, ' ')}</span>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span>{silo.total_artworks} artworks</span>
                      <span className="text-green-400">${parseFloat(silo.total_revenue || '0').toFixed(0)}</span>
                      <span className="text-white/20">{silo.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SILOS TAB */}
        {tab === "silos" && (
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Silo</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Priority</th>
                  <th className="text-right p-3">Artworks</th>
                  <th className="text-right p-3">Sales</th>
                  <th className="text-right p-3">Revenue</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {silos.map((silo, i) => (
                  <tr key={silo.id} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                    <td className="p-3 capitalize">{silo.name.replace(/-/g, ' ')}</td>
                    <td className="p-3 text-white/40">{silo.category}</td>
                    <td className="p-3 text-right">{silo.priority}</td>
                    <td className="p-3 text-right">{silo.total_artworks}</td>
                    <td className="p-3 text-right">{silo.total_sales}</td>
                    <td className="p-3 text-right text-green-400">${parseFloat(silo.total_revenue || '0').toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        silo.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'
                      }`}>{silo.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* COMING SOON TABS */}
        {["artists", "trends", "analytics"].includes(tab) && (
          <div className="flex items-center justify-center h-64 text-white/20 text-sm border border-white/10 rounded-lg">
            <div className="text-center">
              <div className="text-2xl mb-2">🚧</div>
              <div className="capitalize">{tab} — built in Phase {tab === "artists" ? "4" : tab === "trends" ? "2" : "7"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Update the homepage card in `frontend/app/page.tsx`**

Find the PDF Art Factory card and add an Atlas Art Factory card. Search for the `Palette` icon usage and update or add alongside it:

```typescript
// Find this block in page.tsx (the modules array) and add/update:
{
  name: "Art Factory",
  description: "AI art empire — 200 artworks/day",
  href: "/art-factory",
  icon: Palette,
  status: "building",
  stats: "50 silos · 50 artists"
},
```

**Step 3: Verify TypeScript builds clean**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors on `art-factory/page.tsx`.

**Step 4: Commit**

```bash
git add frontend/app/art-factory/ frontend/app/page.tsx
git commit -m "feat(art-factory): Next.js dashboard shell at /art-factory"
```

---

## PHASE 2: Trend Scraper Engine

*(Detailed tasks written when Phase 1 is complete)*

**Tasks to implement:**
- Task 11: Etsy API v3 scraper (OAuth + search bestsellers endpoint)
- Task 12: Pinterest API v5 scraper (pin search + engagement data)
- Task 13: Google Trends scraper (`google-trends-api` npm package)
- Task 14: Playwright scrapers × 4 (Gumroad, Redbubble, Society6, Creative Market)
- Task 15: Image analyzer — node-vibrant for color extraction + style classification
- Task 16: TrendDatabase storage layer (bulk insert to `scraped_trends`)
- Task 17: Wire scraper into orchestrator + schedule 06:00 daily

---

## PHASE 3: Market Intelligence Engine

**Tasks to implement:**
- Task 18: Demand score calculator (formula: `(SearchVolume × SalesVelocity × SocialEngagement) / CompetitionCount`)
- Task 19: Niche opportunity ranker (top 20 daily, stored in `market_opportunities`)
- Task 20: Silo priority updater (reallocates 200 daily slots based on performance)
- Task 21: Trend alerts (fast-rising keywords flagged for immediate production)
- Task 22: Wire into orchestrator at 08:00

---

## PHASE 4: AI Artist + Image Production Engine

**Tasks to implement:**
- Task 23: Prompt builder — injects trending keywords into artist template
- Task 24: FLUX.1 schnell integration via Replicate API
- Task 25: FLUX.1 dev integration via Replicate API
- Task 26: DALL-E 3 integration via OpenAI SDK
- Task 27: Ideogram v2 API integration
- Task 28: AI router — picks engine per job per routing_rules
- Task 29: Quality control — CLIP score via Replicate (`openai/clip-vit-large-patch14`)
- Task 30: Variation generator (3 variations per artwork: color, composition, style)
- Task 31: Batch queue processor (200/day via Bull queue, `image-generation` queue)
- Task 32: Wire into orchestrator at 09:30

---

## PHASE 5: Mockup Generation Engine

**Tasks to implement:**
- Task 33: Base room scene templates (5 PNG templates: living room, bedroom, office, nursery, bathroom)
- Task 34: Smart art placer — Sharp compositing, perspective transform via canvas
- Task 35: Format optimizer — export 6 sizes per artwork (8×10, 11×14, 16×20, 24×36, square, A4)
- Task 36: Package builder — ZIP with all formats
- Task 37: Batch mockup processor (1,000+ mockups/day via Bull queue)
- Task 38: Wire into orchestrator (runs after image production completes)

---

## PHASE 6: Distribution Engine

**Tasks to implement:**
- Task 39: SEO title generator — Claude Haiku, keyword front-loaded, competitor pattern analysis
- Task 40: SEO description writer — Claude Haiku, 300+ words, silo-specific template
- Task 41: Tag optimizer — fills all 13 Etsy tags from demand score keywords
- Task 42: Dynamic pricing engine — median competitor price × quality/demand modifiers
- Task 43: Etsy uploader — OAuth2, create digital listing, upload all 10 images
- Task 44: Gumroad uploader — API, create product, attach ZIP package
- Task 45: Pinterest poster — API v5, create pin per artwork to themed board
- Task 46: Redbubble uploader — Playwright automation (login, upload, configure)
- Task 47: Society6 uploader — Playwright automation
- Task 48: Rate limiter — per-platform delay + daily quota enforcement
- Task 49: Wire into orchestrator at 18:00

---

## PHASE 7: Analytics Engine + Full Dashboard

**Tasks to implement:**
- Task 50: Etsy analytics puller — listing stats API
- Task 51: Gumroad analytics puller — sales API
- Task 52: Platform stats aggregator — unified `performance_metrics` update
- Task 53: Adaptive learning engine — winners +20%, losers -50% in silo allocation
- Task 54: Daily analytics report — revenue, costs, profit, top 10 artworks
- Task 55: Dashboard — Production tab (live Bull queue status)
- Task 56: Dashboard — Artists tab (performance per AI artist)
- Task 57: Dashboard — Trends tab (demand scores, top opportunities)
- Task 58: Dashboard — Analytics tab (revenue charts, conversion rates, ROI)

---

## PHASE 8: Model Discovery Engine + Hardening

**Tasks to implement:**
- Task 59: HuggingFace Hub monitor — weekly scan for new `text-to-image` models
- Task 60: Replicate + fal.ai new model feed monitor
- Task 61: Auto-benchmarker — 5 test prompts, CLIP quality score, speed, cost
- Task 62: Auto-registration — adds passing models to `discovered_models` + AI router pool
- Task 63: Dashboard — "New Models Discovered" feed with benchmark scores
- Task 64: End-to-end pipeline test (full cycle: scrape → score → generate → mockup → publish)
- Task 65: Error resilience — retry logic for each engine, dead letter queue for failed jobs
- Task 66: Load test — verify 200 images/day throughput
- Task 67: Documentation — README, API reference, deployment guide

---

## Verification Checklist (Phase 1)

After completing Phase 1, verify:

```bash
# 1. Docker containers running
docker ps | grep atlas_art

# 2. Postgres has all tables + data
docker exec atlas_art_postgres psql -U atlas -d atlas_art_factory -c "SELECT name, total_artworks FROM silos LIMIT 5;"

# 3. API responds
curl http://localhost:3001/health
curl http://localhost:3001/api/stats
curl http://localhost:3001/api/silos | python3 -m json.tool | head -20

# 4. Frontend builds clean
cd frontend && npm run build

# 5. Dashboard page loads
open http://localhost:3000/art-factory
```

Expected: All pass, dashboard shows 50 silos in the Silos tab, API status shows ONLINE.

---

## SCHEMA AMENDMENT: Artist Inspiration & Style DNA

*Added after initial plan approval. Three new tables + two column additions to `artworks`.*

---

### Task 1A: Artist DNA schema migration

**Files:**
- Modify: `atlas-art-factory/database/schema.sql` (append)
- Modify: `atlas-art-factory/database/migrate.js` (already runs full schema — no change needed)

**Step 1: Append to schema.sql**

```sql
-- ============================================
-- ARTIST INSPIRATION & STYLE DNA
-- ============================================

CREATE TABLE IF NOT EXISTS artist_inspirations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    era VARCHAR(50),
    style_characteristics JSONB,
    color_signatures JSONB,
    composition_patterns JSONB,
    famous_works TEXT[],
    market_value_tier VARCHAR(20),
    cultural_influence INTEGER,
    atlas_application JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_artist_dna (
    id SERIAL PRIMARY KEY,
    ai_artist_id INTEGER REFERENCES ai_artists(id),
    inspiration_source_id INTEGER REFERENCES artist_inspirations(id),
    influence_percentage INTEGER,
    inherited_characteristics JSONB,
    style_fusion_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS style_clusters (
    id SERIAL PRIMARY KEY,
    cluster_name VARCHAR(100) UNIQUE,
    description TEXT,
    inspiration_ids INTEGER[],
    market_segment VARCHAR(50),
    target_platforms TEXT[],
    avg_price_point DECIMAL(10,2),
    performance_score DECIMAL(5,2),
    cultural_markers JSONB,
    key_characteristics JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE artworks
    ADD COLUMN IF NOT EXISTS inspiration_dna_id INTEGER REFERENCES artist_inspirations(id),
    ADD COLUMN IF NOT EXISTS style_cluster_id INTEGER REFERENCES style_clusters(id);
```

**Step 2: Re-run migration**

```bash
cd atlas-art-factory && npm run migrate
```

Expected: `✅ Schema migrated successfully` (IF NOT EXISTS guards make it safe to re-run)

**Step 3: Verify new tables**

```bash
docker exec atlas_art_postgres psql -U atlas -d atlas_art_factory -c "\dt" | grep -E "artist_inspir|ai_artist_dna|style_cluster"
```

Expected: 3 new tables listed.

**Step 4: Commit**

```bash
git add atlas-art-factory/database/schema.sql
git commit -m "feat(art-factory): artist DNA schema — inspirations, dna links, style clusters"
```

---

### Task 1B: Artist inspiration + style cluster config files

**Files:**
- Create: `atlas-art-factory/config/artist-inspirations.json`
- Create: `atlas-art-factory/config/style-clusters.json`
- Modify: `atlas-art-factory/config/artists.json` (replace with DNA-enhanced format)

**Step 1: Create `config/artist-inspirations.json`**

The 8 seed artist inspirations (Warhol, Basquiat, Banksy, KAWS, Murakami, Rothko, Wiley, Kusama) plus 42 additional artists to fill out the full set:

```json
[
  {
    "id": 1, "name": "Andy Warhol", "category": "pop_art", "era": "1960s-1980s",
    "styleCharacteristics": { "technique": "screen printing, bold colors, repetition", "subjects": "consumer products, celebrities, everyday objects", "composition": "grid layouts, repeated images, flat colors", "iconicElements": ["soup cans", "celebrity portraits", "bright colors", "commercial aesthetic"] },
    "colorSignatures": { "primary": ["#FF00FF", "#FFFF00", "#00FFFF", "#FF0000"], "palette": "bold saturated primaries, high contrast", "style": "flat, screen-printed look" },
    "compositionPatterns": { "layout": "grid repetition, centered subjects", "background": "solid flat colors", "elements": "clean edges, no gradients, commercial polish" },
    "culturalInfluence": 100, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["pop_art_animals", "consumer_culture_art"], "promptModifiers": ["warhol style", "pop art", "screen print aesthetic", "bold flat colors", "repeated grid pattern"], "targetMarket": "luxury homes, corporate art, modern collectors" }
  },
  {
    "id": 2, "name": "Jean-Michel Basquiat", "category": "street_art", "era": "1980s",
    "styleCharacteristics": { "technique": "graffiti, text, symbols, chaotic layering", "subjects": "faces, crowns, skulls, words, abstract figures", "composition": "layered, energetic, raw, expressive", "iconicElements": ["three-pointed crown", "skull motifs", "text integration", "anatomical drawings"] },
    "colorSignatures": { "primary": ["#000000", "#FFFF00", "#FF0000", "#00FFFF", "#FFFFFF"], "palette": "bright primaries on raw backgrounds", "style": "bold strokes, drips, gestural marks" },
    "compositionPatterns": { "layout": "asymmetric, energetic, layered", "background": "raw canvas, newspaper, wood texture", "elements": "crown symbols, text scratched out, anatomical elements" },
    "culturalInfluence": 98, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["crown_animals", "graffiti_luxury_art", "street_art_abstracts"], "promptModifiers": ["basquiat style", "graffiti crown", "neo-expressionist", "raw energy", "text and symbols"], "targetMarket": "luxury collectors, hedge fund offices, contemporary galleries" }
  },
  {
    "id": 3, "name": "Banksy", "category": "street_art", "era": "2000s-present",
    "styleCharacteristics": { "technique": "stencil, spray paint, political satire", "subjects": "social commentary, rats, children, police, politicians", "composition": "clean stencil lines, powerful messaging", "iconicElements": ["rats", "girl with balloon", "flower thrower", "kissing policemen"] },
    "colorSignatures": { "primary": ["#000000", "#FFFFFF", "#FF0000"], "palette": "monochrome with red accent", "style": "high contrast stencil aesthetic" },
    "compositionPatterns": { "layout": "centered subject, minimal background", "background": "weathered walls, urban textures", "elements": "political messages, irony, subversion" },
    "culturalInfluence": 97, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["urban_animal_art", "stencil_street_art"], "promptModifiers": ["banksy style", "stencil art", "urban graffiti", "street art", "political commentary"], "targetMarket": "contemporary collectors, urban art lovers, millennials" }
  },
  {
    "id": 4, "name": "KAWS", "category": "street_art", "era": "1990s-present",
    "styleCharacteristics": { "technique": "cartoon appropriation, x-ed out eyes, soft edges", "subjects": "companion character, cartoon characters, skulls", "composition": "clean graphic style, toy-like aesthetic", "iconicElements": ["XX eyes", "companion figure", "soft rounded forms", "pastel colors"] },
    "colorSignatures": { "primary": ["#FFB6C1", "#87CEEB", "#FFE4B5", "#B0E0E6"], "palette": "soft pastels, gentle colors", "style": "clean toy aesthetic, vinyl figure look" },
    "compositionPatterns": { "layout": "centered characters, clean backgrounds", "background": "solid colors or minimal patterns", "elements": "x-ed eyes, rounded forms, toy-like finish" },
    "culturalInfluence": 92, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["kawaii_animals", "toy_aesthetic_art"], "promptModifiers": ["kaws style", "xx eyes", "toy aesthetic", "soft pastel", "companion character"], "targetMarket": "streetwear collectors, young professionals, modern nurseries" }
  },
  {
    "id": 5, "name": "Takashi Murakami", "category": "contemporary", "era": "1990s-present",
    "styleCharacteristics": { "technique": "superflat, anime influence, pattern repetition", "subjects": "smiling flowers, rainbow colors, cartoon characters", "composition": "flat perspective, pattern fills, joyful chaos", "iconicElements": ["smiling flower", "mr. dob character", "rainbow patterns", "anime eyes"] },
    "colorSignatures": { "primary": ["#FF1493", "#00CED1", "#FFD700", "#FF4500", "#00FF00"], "palette": "super bright rainbow explosion", "style": "flat digital color, no shadows" },
    "compositionPatterns": { "layout": "all-over pattern, no focal point", "background": "filled with repeating motifs", "elements": "smiling faces, flowers, anime characters" },
    "culturalInfluence": 95, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["rainbow_flower_art", "kawaii_maximalist"], "promptModifiers": ["murakami style", "superflat", "smiling flowers", "rainbow explosion", "anime aesthetic"], "targetMarket": "luxury collectors, fashion collaborations, pop culture fans" }
  },
  {
    "id": 6, "name": "Mark Rothko", "category": "abstract", "era": "1940s-1970s",
    "styleCharacteristics": { "technique": "color field, soft edges, emotional atmosphere", "subjects": "rectangles of color, pure abstraction", "composition": "stacked horizontal bands, floating forms", "iconicElements": ["soft-edged rectangles", "luminous color", "emotional depth"] },
    "colorSignatures": { "primary": ["#8B0000", "#FF4500", "#4B0082", "#000080"], "palette": "deep rich colors, luminous quality", "style": "soft blurred edges, layered transparency" },
    "compositionPatterns": { "layout": "horizontal bands, floating rectangles", "background": "color itself is the subject", "elements": "soft edges, no hard lines, meditative" },
    "culturalInfluence": 98, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["color_field_abstracts", "meditative_wall_art", "luxury_minimalism"], "promptModifiers": ["rothko style", "color field", "soft edges", "luminous", "emotional abstraction"], "targetMarket": "corporate lobbies, luxury condos, meditation spaces" }
  },
  {
    "id": 7, "name": "Kehinde Wiley", "category": "figurative", "era": "2000s-present",
    "styleCharacteristics": { "technique": "classical portraiture, ornate backgrounds, photorealistic", "subjects": "contemporary people in classical poses", "composition": "centered figure, elaborate pattern backgrounds", "iconicElements": ["ornate floral backgrounds", "classical poses", "vibrant patterns", "regal presentation"] },
    "colorSignatures": { "primary": ["#228B22", "#FFD700", "#4169E1", "#DC143C"], "palette": "rich jewel tones, ornate patterns", "style": "photorealistic with decorative backgrounds" },
    "compositionPatterns": { "layout": "centered portrait, elaborate background", "background": "ornate floral and decorative patterns", "elements": "classical poses, regal dignity, vibrant decoration" },
    "culturalInfluence": 90, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["regal_pet_portraits", "ornate_animal_portraits"], "promptModifiers": ["kehinde wiley style", "ornate floral background", "regal portrait", "classical pose", "vibrant patterns"], "targetMarket": "luxury homes, contemporary collectors, cultural institutions" }
  },
  {
    "id": 8, "name": "Yayoi Kusama", "category": "conceptual", "era": "1950s-present",
    "styleCharacteristics": { "technique": "polka dots, infinite repetition, immersive patterns", "subjects": "dots covering everything, pumpkins, infinity rooms", "composition": "all-over pattern, obsessive repetition", "iconicElements": ["polka dots everywhere", "infinity nets", "pumpkin sculptures"] },
    "colorSignatures": { "primary": ["#FF0000", "#FFFF00", "#000000", "#FFFFFF"], "palette": "bold primaries with polka dots", "style": "dots covering every surface" },
    "compositionPatterns": { "layout": "repetitive pattern fills entire canvas", "background": "covered in dots or nets", "elements": "obsessive repetition, infinite pattern" },
    "culturalInfluence": 95, "marketValueTier": "millions",
    "atlasApplication": { "silos": ["polka_dot_animals", "pattern_maximalism"], "promptModifiers": ["kusama style", "polka dots", "infinite pattern", "repetitive dots", "obsessive detail"], "targetMarket": "contemporary collectors, maximalist interiors, Instagram-worthy art" }
  },
  { "id": 9,  "name": "Keith Haring",       "category": "street_art",   "era": "1980s",          "culturalInfluence": 96, "marketValueTier": "millions",  "colorSignatures": { "primary": ["#FF0000", "#FFFF00", "#0000FF", "#000000"] }, "atlasApplication": { "promptModifiers": ["keith haring style", "bold outlines", "dancing figures", "graffiti energy", "accessible pop art"] } },
  { "id": 10, "name": "Frida Kahlo",         "category": "surrealism",   "era": "1930s-1950s",    "culturalInfluence": 97, "marketValueTier": "millions",  "colorSignatures": { "primary": ["#FF0000", "#228B22", "#FFD700", "#4B0082"] }, "atlasApplication": { "promptModifiers": ["frida kahlo style", "symbolic self portrait", "flower crown", "vibrant mexican folk art", "surrealist elements"] } },
  { "id": 11, "name": "Salvador Dali",       "category": "surrealism",   "era": "1920s-1980s",    "culturalInfluence": 98, "marketValueTier": "millions",  "colorSignatures": { "primary": ["#DAA520", "#8B0000", "#87CEEB", "#DEB887"] }, "atlasApplication": { "promptModifiers": ["dali surrealist style", "melting forms", "dreamlike", "surreal landscape", "impossible objects"] } },
  { "id": 12, "name": "Vincent van Gogh",    "category": "post_impressionism", "era": "1880s-1890s", "culturalInfluence": 100, "marketValueTier": "millions", "colorSignatures": { "primary": ["#4169E1", "#FFD700", "#228B22", "#FF8C00"] }, "atlasApplication": { "promptModifiers": ["van gogh style", "swirling brushstrokes", "impasto", "starry night aesthetic", "bold expressive strokes"] } },
  { "id": 13, "name": "Pablo Picasso",       "category": "cubism",       "era": "1900s-1970s",    "culturalInfluence": 100, "marketValueTier": "millions",  "colorSignatures": { "primary": ["#8B0000", "#4169E1", "#228B22", "#1C1C1C"] }, "atlasApplication": { "promptModifiers": ["picasso cubist style", "geometric fragmentation", "multiple perspectives", "cubism", "abstract figure"] } },
  { "id": 14, "name": "Claude Monet",        "category": "impressionism","era": "1860s-1920s",    "culturalInfluence": 99, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#87CEEB", "#98FB98", "#FFB6C1", "#F0E68C"] }, "atlasApplication": { "promptModifiers": ["monet impressionist style", "soft brushwork", "light and atmosphere", "water lilies aesthetic", "plein air painting"] } },
  { "id": 15, "name": "Henri Matisse",       "category": "fauvism",      "era": "1900s-1950s",    "culturalInfluence": 98, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FF4500", "#4169E1", "#228B22", "#FFD700"] }, "atlasApplication": { "promptModifiers": ["matisse style", "bold flat colors", "decorative patterns", "joy of life", "fauvism"] } },
  { "id": 16, "name": "Roy Lichtenstein",    "category": "pop_art",      "era": "1960s-1990s",    "culturalInfluence": 94, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FF0000", "#FFFF00", "#0000FF", "#000000"] }, "atlasApplication": { "promptModifiers": ["lichtenstein style", "ben-day dots", "comic book aesthetic", "bold outlines", "speech bubble"] } },
  { "id": 17, "name": "Damien Hirst",        "category": "contemporary", "era": "1990s-present",  "culturalInfluence": 91, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FF0000", "#FFFF00", "#0000FF", "#FFFFFF"] }, "atlasApplication": { "promptModifiers": ["damien hirst style", "spot painting", "colorful dots grid", "pharmaceutical aesthetic", "conceptual art"] } },
  { "id": 18, "name": "Jeff Koons",          "category": "contemporary", "era": "1980s-present",  "culturalInfluence": 89, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#C0C0C0", "#FFD700", "#FF69B4", "#87CEEB"] }, "atlasApplication": { "promptModifiers": ["jeff koons style", "balloon animal", "high gloss", "reflective surface", "kitsch luxury"] } },
  { "id": 19, "name": "Shepard Fairey",      "category": "street_art",   "era": "1990s-present",  "culturalInfluence": 88, "marketValueTier": "high",       "colorSignatures": { "primary": ["#FF0000", "#003366", "#F5C518", "#FFFFFF"] }, "atlasApplication": { "promptModifiers": ["shepard fairey style", "obey propaganda", "bold graphic", "stencil portrait", "political poster"] } },
  { "id": 20, "name": "Yoshitomo Nara",      "category": "neo_pop",      "era": "1990s-present",  "culturalInfluence": 87, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FFFACD", "#FFB6C1", "#87CEEB", "#000000"] }, "atlasApplication": { "promptModifiers": ["yoshitomo nara style", "big eyes children", "defiant innocence", "simple background", "emotional child figure"] } },
  { "id": 21, "name": "Kara Walker",         "category": "contemporary", "era": "1990s-present",  "culturalInfluence": 92, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#000000", "#FFFFFF"] }, "atlasApplication": { "promptModifiers": ["silhouette art", "high contrast black white", "narrative silhouette", "gothic style", "historical allegory"] } },
  { "id": 22, "name": "Wifredo Lam",         "category": "surrealism",   "era": "1940s-1980s",    "culturalInfluence": 85, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#228B22", "#000000", "#8B4513", "#FFD700"] }, "atlasApplication": { "promptModifiers": ["wifredo lam style", "afro-cuban surrealism", "jungle spirits", "hybrid figures", "lush tropical"] } },
  { "id": 23, "name": "Jean Dubuffet",       "category": "outsider_art", "era": "1940s-1980s",    "culturalInfluence": 84, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#000000", "#FFFFFF", "#FF0000", "#8B8B00"] }, "atlasApplication": { "promptModifiers": ["dubuffet art brut style", "crude figures", "outsider art", "childlike energy", "textured surfaces"] } },
  { "id": 24, "name": "Helen Frankenthaler", "category": "abstract",     "era": "1950s-2000s",    "culturalInfluence": 89, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FF69B4", "#87CEEB", "#98FB98", "#DDA0DD"] }, "atlasApplication": { "promptModifiers": ["frankenthaler style", "color stain painting", "soft organic forms", "poured paint", "lyrical abstraction"] } },
  { "id": 25, "name": "Ellsworth Kelly",     "category": "minimalism",   "era": "1950s-2010s",    "culturalInfluence": 87, "marketValueTier": "millions",   "colorSignatures": { "primary": ["#FF0000", "#0000FF", "#FFFF00", "#000000"] }, "atlasApplication": { "promptModifiers": ["ellsworth kelly style", "bold color shapes", "hard edge abstraction", "pure color", "minimal form"] } }
]
```

**Step 2: Create `config/style-clusters.json`**

```json
[
  {
    "id": 1,
    "name": "Hedge Fund Office Luxury",
    "description": "Bold contemporary art for wealth display — Billions aesthetic",
    "inspirationArtists": ["Jean-Michel Basquiat", "Andy Warhol", "Damien Hirst", "Jeff Koons", "Takashi Murakami"],
    "marketSegment": "ultra_luxury",
    "targetPlatforms": ["society6", "saatchi", "artsy"],
    "avgPricePoint": 150.00,
    "culturalMarkers": ["Billions TV show aesthetic", "Axe Capital office", "Wealth signaling", "Contemporary power"],
    "keyCharacteristics": { "size": "large scale", "colors": "bold, high impact", "style": "contemporary, street art influenced", "message": "cultural sophistication + rebellion" }
  },
  {
    "id": 2,
    "name": "Luxury Condo Minimalism",
    "description": "Serene abstracts and color fields for high-end living",
    "inspirationArtists": ["Mark Rothko", "Gerhard Richter", "Helen Frankenthaler", "Ellsworth Kelly", "Agnes Martin"],
    "marketSegment": "luxury_residential",
    "targetPlatforms": ["society6", "etsy_premium", "saatchi"],
    "avgPricePoint": 120.00,
    "culturalMarkers": ["Modern luxury condos", "Architectural Digest aesthetic", "Peaceful sophistication"],
    "keyCharacteristics": { "size": "medium to large", "colors": "sophisticated, muted, luminous", "style": "abstract, color field, minimal", "message": "calm, cultured, expensive taste" }
  },
  {
    "id": 3,
    "name": "Pop Culture Rebellion",
    "description": "Street art and pop art for millennials and Gen Z",
    "inspirationArtists": ["Banksy", "KAWS", "Shepard Fairey", "Keith Haring", "Mr. Brainwash"],
    "marketSegment": "contemporary_youth",
    "targetPlatforms": ["etsy", "gumroad", "redbubble"],
    "avgPricePoint": 45.00,
    "culturalMarkers": ["Streetwear culture", "Instagram aesthetic", "Subversive humor", "Contemporary cool"],
    "keyCharacteristics": { "size": "small to medium", "colors": "bold, urban, contrasted", "style": "street art, stencil, graffiti", "message": "anti-establishment + accessible" }
  },
  {
    "id": 4,
    "name": "Kawaii Maximalism",
    "description": "Japanese-influenced joyful chaos for pop culture fans",
    "inspirationArtists": ["Takashi Murakami", "Yayoi Kusama", "Yoshitomo Nara", "KAWS"],
    "marketSegment": "fashion_forward",
    "targetPlatforms": ["redbubble", "society6", "gumroad"],
    "avgPricePoint": 55.00,
    "culturalMarkers": ["Fashion collaborations", "Anime influence", "Superflat movement", "Instagram maximalism"],
    "keyCharacteristics": { "size": "medium", "colors": "rainbow, super saturated, joyful", "style": "flat, pattern-heavy, kawaii", "message": "joy, abundance, pop culture" }
  },
  {
    "id": 5,
    "name": "Corporate Sophistication",
    "description": "Professional abstracts for offices and lobbies",
    "inspirationArtists": ["Mark Rothko", "Ellsworth Kelly", "Frank Stella", "Bridget Riley", "Sol LeWitt"],
    "marketSegment": "corporate",
    "targetPlatforms": ["society6", "saatchi", "etsy_business"],
    "avgPricePoint": 95.00,
    "culturalMarkers": ["Law firm lobbies", "Corporate headquarters", "Professional polish"],
    "keyCharacteristics": { "size": "large", "colors": "sophisticated, restrained, professional", "style": "geometric, minimal, abstract", "message": "success, order, professionalism" }
  },
  {
    "id": 6,
    "name": "Nursery Whimsy",
    "description": "Gentle, nurturing art for babies and children's rooms",
    "inspirationArtists": ["KAWS", "Yoshitomo Nara", "Keith Haring"],
    "marketSegment": "family_home",
    "targetPlatforms": ["etsy", "gumroad", "society6"],
    "avgPricePoint": 25.00,
    "culturalMarkers": ["New parent lifestyle", "Pottery Barn Kids aesthetic", "Safe and nurturing"],
    "keyCharacteristics": { "size": "small to medium", "colors": "soft pastels, warm", "style": "cute, rounded, friendly", "message": "safety, wonder, growth" }
  },
  {
    "id": 7,
    "name": "Botanical Luxury",
    "description": "High-end botanical and nature art for sophisticated homes",
    "inspirationArtists": ["Henri Matisse", "Frida Kahlo", "Kehinde Wiley"],
    "marketSegment": "luxury_residential",
    "targetPlatforms": ["etsy_premium", "society6", "creative_market"],
    "avgPricePoint": 75.00,
    "culturalMarkers": ["Biophilic design", "Luxury wellness", "Nature-connected living"],
    "keyCharacteristics": { "size": "medium to large", "colors": "rich botanicals, jewel tones", "style": "detailed illustration, lush", "message": "nature, growth, refined taste" }
  }
]
```

**Step 3: Update `config/artists.json` with DNA-enhanced format**

Replace the simple artists.json with DNA-enhanced versions. The first 7 are fully defined; the remaining 43 follow the same pattern using appropriate inspiration sources per silo:

```json
[
  {
    "id": 1, "name": "Neon Basquiat Beast", "silo": "nursery-animals",
    "description": "Street art animals with Basquiat's crown and energy",
    "inspirationDNA": [
      { "sourceArtist": "Jean-Michel Basquiat", "influence": 60, "inheritedTraits": ["crown motifs", "graffiti energy", "text integration", "raw expression"] },
      { "sourceArtist": "Keith Haring", "influence": 30, "inheritedTraits": ["bold outlines", "energetic lines", "accessibility"] },
      { "sourceArtist": "KAWS", "influence": 10, "inheritedTraits": ["cartoon influence", "contemporary appeal"] }
    ],
    "styleCluster": "Hedge Fund Office Luxury",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} wearing three-pointed crown, basquiat neo-expressionist style, graffiti energy, raw gestural brushstrokes, {{color1}} and {{color2}} and black, text elements integrated, anatomical sketches, urban raw aesthetic, crown motif prominent, street art luxury, museum quality digital art",
    "negative_prompts": ["low quality", "blurry", "watermark", "polished corporate", "soft edges"],
    "marketPositioning": { "segment": "luxury_contemporary", "pricePoint": "premium", "targetBuyers": ["hedge fund offices", "luxury condos", "contemporary collectors"] },
    "culturalReferences": ["Billions office aesthetic", "Contemporary art galleries", "Street art legitimacy"]
  },
  {
    "id": 2, "name": "Pop Warhol Creatures", "silo": "botanical-prints",
    "description": "Animals in Warhol's iconic screen print style",
    "inspirationDNA": [
      { "sourceArtist": "Andy Warhol", "influence": 70, "inheritedTraits": ["screen print aesthetic", "bold flat colors", "grid repetition", "commercial polish"] },
      { "sourceArtist": "Roy Lichtenstein", "influence": 20, "inheritedTraits": ["ben-day dots", "comic book aesthetic", "bold outlines"] },
      { "sourceArtist": "Keith Haring", "influence": 10, "inheritedTraits": ["accessibility", "pop culture appeal"] }
    ],
    "styleCluster": "Pop Culture Rebellion",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} in andy warhol pop art style, screen print aesthetic, bold flat colors ({{color1}}, {{color2}}, {{color3}}), repeated 4-panel grid layout, high contrast, clean edges, no gradients, commercial polish, iconic pop art, celebrity poster style",
    "negative_prompts": ["realistic photo", "gradients", "soft edges", "amateur"],
    "marketPositioning": { "segment": "luxury_pop_art", "pricePoint": "high", "targetBuyers": ["corporate art buyers", "modern collectors", "pop culture enthusiasts"] },
    "culturalReferences": ["Campbell's soup can series", "Marilyn Monroe portraits", "Factory era NYC"]
  },
  {
    "id": 3, "name": "Rothko Mood Fields", "silo": "motivational-quotes",
    "description": "Color field abstracts inspired by Rothko's emotional depth",
    "inspirationDNA": [
      { "sourceArtist": "Mark Rothko", "influence": 80, "inheritedTraits": ["color field", "soft edges", "luminous quality", "emotional depth"] },
      { "sourceArtist": "Helen Frankenthaler", "influence": 15, "inheritedTraits": ["stain painting", "organic forms", "lyrical abstraction"] },
      { "sourceArtist": "Gerhard Richter", "influence": 5, "inheritedTraits": ["abstract beauty", "contemporary relevance"] }
    ],
    "styleCluster": "Luxury Condo Minimalism",
    "preferred_engine": "dalle3",
    "enhancedPromptTemplate": "rothko style color field painting, soft-edged horizontal bands of {{color1}} and {{color2}}, luminous transparent layers, blurred boundaries, meditative mood, emotional depth, floating rectangles, no hard edges, contemplative atmosphere, museum quality abstract art",
    "negative_prompts": ["busy", "cluttered", "literal", "figurative", "recognizable objects"],
    "marketPositioning": { "segment": "corporate_luxury", "pricePoint": "premium", "targetBuyers": ["corporate lobbies", "law firm offices", "luxury condos", "meditation spaces"] },
    "culturalReferences": ["Rothko Chapel", "Seagram murals", "Abstract Expressionism"]
  },
  {
    "id": 4, "name": "Banksy Urban Fauna", "silo": "minimalist-abstract",
    "description": "Animals in Banksy's stencil street art style",
    "inspirationDNA": [
      { "sourceArtist": "Banksy", "influence": 75, "inheritedTraits": ["stencil aesthetic", "political edge", "urban textures", "ironic messaging"] },
      { "sourceArtist": "Shepard Fairey", "influence": 15, "inheritedTraits": ["bold graphics", "propaganda style", "high contrast"] },
      { "sourceArtist": "Keith Haring", "influence": 10, "inheritedTraits": ["bold outlines", "accessibility", "social commentary"] }
    ],
    "styleCluster": "Pop Culture Rebellion",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} in banksy stencil style, black and white with {{accent_color}} accent, spray paint aesthetic, weathered brick wall background, urban street art, political satire mood, high contrast stencil, graffiti texture, contemporary street art",
    "negative_prompts": ["polished", "clean digital", "corporate", "soft colors"],
    "marketPositioning": { "segment": "contemporary_urban", "pricePoint": "mid_to_high", "targetBuyers": ["millennials", "urban collectors", "contemporary galleries"] },
    "culturalReferences": ["Girl with Balloon", "Flower Thrower", "Rats series"]
  },
  {
    "id": 5, "name": "Murakami Rainbow Kingdom", "silo": "bathroom-humor",
    "description": "Superflat kawaii animals with Murakami's joyful chaos",
    "inspirationDNA": [
      { "sourceArtist": "Takashi Murakami", "influence": 85, "inheritedTraits": ["superflat", "smiling flowers", "rainbow colors", "anime influence", "pattern repetition"] },
      { "sourceArtist": "KAWS", "influence": 10, "inheritedTraits": ["cartoon appropriation", "contemporary appeal"] },
      { "sourceArtist": "Yayoi Kusama", "influence": 5, "inheritedTraits": ["pattern obsession", "maximalism"] }
    ],
    "styleCluster": "Kawaii Maximalism",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} in takashi murakami superflat style, smiling flower motifs surrounding, rainbow explosion colors ({{color1}}, {{color2}}, {{color3}}, {{color4}}), anime eyes, flat digital aesthetic, no shadows, pattern repetition, kawaii maximalist, joyful chaos",
    "negative_prompts": ["realistic", "dark", "3d render", "shadows", "gradients"],
    "marketPositioning": { "segment": "luxury_pop_culture", "pricePoint": "high", "targetBuyers": ["fashion collectors", "pop culture fans", "luxury brand collaborators"] },
    "culturalReferences": ["Louis Vuitton collaboration", "Superflat movement", "Anime influence in fine art"]
  },
  {
    "id": 6, "name": "Kusama Dot Menagerie", "silo": "kitchen-food-art",
    "description": "Animals covered in Kusama's obsessive polka dots",
    "inspirationDNA": [
      { "sourceArtist": "Yayoi Kusama", "influence": 90, "inheritedTraits": ["polka dots everywhere", "infinite repetition", "obsessive pattern", "immersive quality"] },
      { "sourceArtist": "Takashi Murakami", "influence": 10, "inheritedTraits": ["pop culture accessibility", "vibrant colors"] }
    ],
    "styleCluster": "Kawaii Maximalism",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} completely covered in kusama polka dots, infinite dot pattern, {{color1}} dots on {{color2}} background, obsessive repetition, dots covering every surface, immersive pattern, infinity net aesthetic, maximalist dot art",
    "negative_prompts": ["plain", "no dots", "minimalist", "boring"],
    "marketPositioning": { "segment": "contemporary_maximalist", "pricePoint": "mid_to_high", "targetBuyers": ["Instagram collectors", "maximalist interiors", "contemporary enthusiasts"] },
    "culturalReferences": ["Infinity Rooms", "Pumpkin sculptures", "Obsessive pattern making"]
  },
  {
    "id": 7, "name": "Wiley Regal Beasts", "silo": "watercolor-landscapes",
    "description": "Animals as royalty with ornate Kehinde Wiley backgrounds",
    "inspirationDNA": [
      { "sourceArtist": "Kehinde Wiley", "influence": 80, "inheritedTraits": ["ornate floral backgrounds", "classical poses", "regal dignity", "photorealistic detail"] },
      { "sourceArtist": "Amy Sherald", "influence": 15, "inheritedTraits": ["contemporary portraiture", "cultural significance"] },
      { "sourceArtist": "Frida Kahlo", "influence": 5, "inheritedTraits": ["symbolic animal companions"] }
    ],
    "styleCluster": "Botanical Luxury",
    "preferred_engine": "midjourney",
    "enhancedPromptTemplate": "{{animal}} in regal classical pose, kehinde wiley ornate style, elaborate baroque floral background pattern in {{color1}} and {{color2}}, photorealistic animal portrait, luxurious decorative elements, gold accents, vibrant ornate patterns, contemporary classical fusion, dignified and majestic",
    "negative_prompts": ["cartoon", "simple background", "cheap", "low quality"],
    "marketPositioning": { "segment": "luxury_contemporary", "pricePoint": "premium", "targetBuyers": ["luxury pet owners", "contemporary collectors", "cultural institutions"] },
    "culturalReferences": ["Obama portrait", "Classical European portraiture", "Contemporary Black excellence"]
  }
]
```

*(Note: artists 8–50 follow the same DNA pattern — built programmatically in Task 1C using the inspiration database.)*

**Step 4: Commit all new config files**

```bash
git add atlas-art-factory/config/
git commit -m "feat(art-factory): artist DNA configs — inspirations (25+), style clusters (7), DNA-enhanced artists"
```

---

### Task 1C: DNA prompt builder module

**Files:**
- Create: `atlas-art-factory/engines/4-ai-artist/dna-prompt-builder.js`
- Create: `atlas-art-factory/tests/dna-prompt-builder.test.js`

**Step 1: Write failing test**

```javascript
// atlas-art-factory/tests/dna-prompt-builder.test.js
const DNAPromptBuilder = require('../engines/4-ai-artist/dna-prompt-builder');
const config = require('../core/config');

describe('DNAPromptBuilder', () => {
  let builder;

  beforeAll(() => {
    builder = new DNAPromptBuilder(config.artists, config.artistInspirations, config.styleClusters);
  });

  test('builds DNA-enhanced prompt from artist template', () => {
    const artist = config.artists[0]; // Neon Basquiat Beast
    const artwork = { subject: 'lion', style: 'street art' };
    const trendData = { keywords: ['bold wall art', 'contemporary', 'statement piece'] };

    const result = builder.build(artist, artwork, trendData);

    expect(result.prompt).toContain('lion');
    expect(result.prompt).toContain('basquiat');
    expect(result.negativePrompt).toBeDefined();
    expect(result.metadata.inspirationSource).toBe('Jean-Michel Basquiat');
    expect(result.metadata.styleCluster).toBe('Hedge Fund Office Luxury');
  });

  test('negative prompt excludes opposite style characteristics', () => {
    const artist = config.artists[0];
    const artwork = { subject: 'bear', style: 'urban' };
    const result = builder.build(artist, artwork, {});

    expect(result.negativePrompt).toContain('low quality');
    expect(result.negativePrompt).toContain('blurry');
  });

  test('generates listing description with DNA metadata', () => {
    const artist = config.artists[0];
    const artwork = { title: 'Crown Lion', description: 'a lion wearing a crown', maxPrintSize: '24x36', format: 'PNG' };
    const desc = builder.generateListingDescription(artwork, artist);

    expect(desc).toContain('Jean-Michel Basquiat');
    expect(desc).toContain('60%');
    expect(desc).toContain('Crown Lion');
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd atlas-art-factory && npm test -- tests/dna-prompt-builder.test.js
```

Expected: FAIL — `Cannot find module`

**Step 3: Create `engines/4-ai-artist/dna-prompt-builder.js`**

```javascript
// atlas-art-factory/engines/4-ai-artist/dna-prompt-builder.js

class DNAPromptBuilder {
  constructor(artists, inspirations, styleClusters) {
    this.artists = artists;
    this.inspirationMap = Object.fromEntries(
      (inspirations || []).map(i => [i.name, i])
    );
    this.clusterMap = Object.fromEntries(
      (styleClusters || []).map(c => [c.name, c])
    );
  }

  build(artist, artwork, trendData = {}) {
    const primaryInspiration = this._getPrimaryInspiration(artist);
    const styleCluster       = this.clusterMap[artist.styleCluster] || {};

    // Start from artist's DNA template
    let prompt = artist.enhancedPromptTemplate || '';

    // Inject subject + colors
    const colors = primaryInspiration?.colorSignatures?.primary || ['#000000', '#FFFFFF', '#FF0000'];
    prompt = prompt
      .replace(/\{\{animal\}\}/g, artwork.subject || 'animal')
      .replace(/\{\{color1\}\}/g, colors[0] || '#FF0000')
      .replace(/\{\{color2\}\}/g, colors[1] || '#000000')
      .replace(/\{\{color3\}\}/g, colors[2] || '#FFFFFF')
      .replace(/\{\{color4\}\}/g, colors[3] || '#FFFF00')
      .replace(/\{\{accent_color\}\}/g, colors[0] || '#FF0000');

    // Append cultural context from first DNA source
    const culturalContext = artist.culturalReferences?.[0];
    if (culturalContext) prompt += `, ${culturalContext} aesthetic`;

    // Append top trending keywords
    if (trendData.keywords?.length) {
      prompt += `, ${trendData.keywords.slice(0, 3).join(', ')}`;
    }

    // Append market segment
    if (styleCluster.marketSegment) {
      prompt += `, ${styleCluster.marketSegment} market`;
    }

    // Quality enforcement
    prompt += ', museum quality, 8k detail, professional art print';

    return {
      prompt,
      negativePrompt: this._buildNegative(artist, primaryInspiration),
      metadata: {
        inspirationSource:  primaryInspiration?.name || 'unknown',
        styleCluster:       artist.styleCluster || 'general',
        culturalContext:    culturalContext || '',
        marketSegment:      artist.marketPositioning?.segment || 'general',
        dnaComposition:     artist.inspirationDNA?.map(d => `${d.influence}% ${d.sourceArtist}`).join(', ') || '',
      },
    };
  }

  generateListingDescription(artwork, artist) {
    const primaryInspiration = this._getPrimaryInspiration(artist);
    const styleCluster       = this.clusterMap[artist.styleCluster] || {};
    const qualityTier        = (primaryInspiration?.culturalInfluence || 0) >= 95
      ? 'museum-quality' : 'gallery-quality';

    const dnaLines = (artist.inspirationDNA || [])
      .map(d => `✨ ${d.influence}% ${d.sourceArtist} influence`)
      .join('\n');

    const buyerLines = (artist.marketPositioning?.targetBuyers || []).join(' • ');
    const refLines   = (artist.culturalReferences || []).join(' • ');
    const clusters   = (styleCluster.culturalMarkers || []).join(', ');

    return `
${artwork.title}

Inspired by the iconic style of ${primaryInspiration?.name || 'contemporary masters'}, this piece features ${artwork.description || 'stunning digital art'}. 

Perfect for ${clusters || 'modern spaces'}, this piece brings ${qualityTier} contemporary art to your space.

STYLE DNA:
${dnaLines}

PERFECT FOR:
${buyerLines}

AS SEEN IN:
${refLines}

WHAT'S INCLUDED:
- High-resolution ${artwork.format || 'PNG'} file
- Multiple sizes (8x10, 11x14, 16x20, 24x36)
- Print-ready 300 DPI
- Instant digital download

#${(primaryInspiration?.name || '').replace(/\s+/g, '')} #DigitalArt #WallArt #PrintableArt
    `.trim();
  }

  _getPrimaryInspiration(artist) {
    const primaryDNA = artist.inspirationDNA?.[0];
    if (!primaryDNA) return null;
    return this.inspirationMap[primaryDNA.sourceArtist] || null;
  }

  _buildNegative(artist, inspiration) {
    const base = ['low quality', 'blurry', 'pixelated', 'amateur', 'watermark', 'signature', 'text overlay'];
    const artistNegs = artist.negative_prompts || [];
    const styleNegs  = this._oppositeStyleNegs(inspiration?.category);
    return [...new Set([...base, ...artistNegs, ...styleNegs])].join(', ');
  }

  _oppositeStyleNegs(category) {
    const map = {
      pop_art:    ['realistic photo', 'gradients', 'soft edges'],
      abstract:   ['literal', 'recognizable', 'figurative'],
      street_art: ['polished', 'clean corporate'],
      minimalism: ['busy', 'cluttered', 'maximalist'],
      contemporary: ['traditional', 'classical', 'old-fashioned'],
    };
    return map[category] || [];
  }
}

module.exports = DNAPromptBuilder;
```

**Step 4: Update `core/config.js` to load the new config files**

Add to `config.js`:
```javascript
const artistInspirations = loadJson('artist-inspirations.json');
const styleClusters      = loadJson('style-clusters.json');

module.exports = {
  silos,
  artists,
  aiEngines,
  platforms,
  artistInspirations,  // ADD
  styleClusters,       // ADD
  // ...rest unchanged
};
```

**Step 5: Run tests**

```bash
cd atlas-art-factory && npm test -- tests/dna-prompt-builder.test.js
```

Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add atlas-art-factory/engines/4-ai-artist/ atlas-art-factory/tests/dna-prompt-builder.test.js atlas-art-factory/core/config.js
git commit -m "feat(art-factory): DNA prompt builder — inspiration DNA, style clusters, listing descriptions"
```

---

### Task 1D: Seed artist inspirations + style clusters into PostgreSQL

**Files:**
- Modify: `atlas-art-factory/database/seed.js`
- Modify: `atlas-art-factory/tests/seed.test.js`

**Step 1: Add failing tests**

```javascript
// Add to tests/seed.test.js:
test('artist inspirations are seeded', async () => {
  const r = await query('SELECT COUNT(*) AS n FROM artist_inspirations');
  expect(parseInt(r.rows[0].n)).toBeGreaterThanOrEqual(8);
});

test('style clusters are seeded', async () => {
  const r = await query('SELECT COUNT(*) AS n FROM style_clusters');
  expect(parseInt(r.rows[0].n)).toBeGreaterThanOrEqual(5);
});

test('Warhol has cultural influence 100', async () => {
  const r = await query("SELECT cultural_influence FROM artist_inspirations WHERE name = 'Andy Warhol'");
  expect(r.rows[0]?.cultural_influence).toBe(100);
});
```

**Step 2: Update `database/seed.js`**

Add two new seed functions:

```javascript
const { artistInspirations, styleClusters } = require('../core/config');

async function seedArtistInspirations() {
  for (const inspiration of artistInspirations) {
    await query(`
      INSERT INTO artist_inspirations
        (name, category, era, style_characteristics, color_signatures,
         composition_patterns, market_value_tier, cultural_influence, atlas_application)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT DO NOTHING
    `, [
      inspiration.name,
      inspiration.category,
      inspiration.era || null,
      JSON.stringify(inspiration.styleCharacteristics || {}),
      JSON.stringify(inspiration.colorSignatures || {}),
      JSON.stringify(inspiration.compositionPatterns || {}),
      inspiration.marketValueTier || null,
      inspiration.culturalInfluence || null,
      JSON.stringify(inspiration.atlasApplication || {}),
    ]);
  }
  console.log(`✅ Seeded ${artistInspirations.length} artist inspirations`);
}

async function seedStyleClusters() {
  for (const cluster of styleClusters) {
    await query(`
      INSERT INTO style_clusters
        (cluster_name, description, market_segment, target_platforms,
         avg_price_point, cultural_markers, key_characteristics)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (cluster_name) DO NOTHING
    `, [
      cluster.name,
      cluster.description,
      cluster.marketSegment,
      cluster.targetPlatforms,
      cluster.avgPricePoint,
      JSON.stringify(cluster.culturalMarkers || []),
      JSON.stringify(cluster.keyCharacteristics || {}),
    ]);
  }
  console.log(`✅ Seeded ${styleClusters.length} style clusters`);
}

// Add to seed() function:
async function seed() {
  await seedSilos();
  await seedArtists();
  await seedArtistInspirations();  // NEW
  await seedStyleClusters();       // NEW
  await closePool();
}
```

**Step 3: Re-run seed**

```bash
cd atlas-art-factory && npm run seed
```

Expected:
```
✅ Seeded 50 silos
✅ Seeded 50 AI artists
✅ Seeded 25 artist inspirations
✅ Seeded 7 style clusters
```

**Step 4: Run all tests**

```bash
cd atlas-art-factory && npm test
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add atlas-art-factory/database/seed.js atlas-art-factory/tests/seed.test.js
git commit -m "feat(art-factory): seed artist inspirations + style clusters into postgres"
```
