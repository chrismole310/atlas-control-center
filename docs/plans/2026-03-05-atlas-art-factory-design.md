# Atlas AI Art Factory — Design

**Date:** 2026-03-05
**Status:** Approved

---

## Overview

A fully automated, data-driven digital art empire built as a Node.js module inside `atlas-control-center`. Scrapes 7+ marketplaces for trend data, generates 200+ AI artworks daily using multiple AI engines (primarily free/local), creates professional mockups, and auto-publishes to 6 platforms with SEO optimization and adaptive learning.

**Target:** $10K–20K/month revenue within 12 months.

---

## Section 1: Architecture & Infrastructure

### Location
`atlas-art-factory/` — top-level directory inside `atlas-control-center`.
Dashboard — new Next.js page at `/art-factory` in the existing frontend.

### Tech Stack
- **Backend:** Node.js (CommonJS) — port 3001
- **Database:** PostgreSQL (new; SQLite used only by existing Atlas modules)
- **Queue:** Bull + Redis
- **Image processing:** Sharp + node-canvas (no Photoshop)
- **Scraping:** Playwright, Puppeteer, Apify, platform APIs
- **Scheduling:** node-cron
- **Storage:** Local filesystem (`atlas-art-factory/storage/`) — S3 optional later
- **Frontend:** New page in existing Next.js frontend at `/art-factory`

### Directory Structure
```
atlas-art-factory/
├── core/
│   ├── orchestrator.js       # Master control system
│   ├── scheduler.js          # node-cron job scheduling
│   ├── config.js             # All configuration
│   └── database.js           # PostgreSQL + Redis connections
├── engines/
│   ├── 1-trend-scraper/
│   ├── 2-market-intelligence/
│   ├── 3-category-silo/
│   ├── 4-ai-artist/
│   ├── 5-image-production/
│   ├── 6-mockup-generation/
│   ├── 7-distribution/
│   ├── 8-analytics/
│   └── 9-model-discovery/    # Auto-discovers + benchmarks new AI models
├── config/
│   ├── silos.json            # 50 art category definitions
│   ├── artists.json          # 50 AI artist personas
│   ├── platforms.json        # Platform API configs
│   └── ai-engines.json       # AI engine configs + routing rules
├── storage/
│   ├── artworks/             # Generated master images
│   ├── mockups/              # Mockup composites
│   └── packages/             # Export file bundles
├── database/
│   └── schema.sql            # PostgreSQL schema
└── api/
    └── index.js              # Express API consumed by Next.js dashboard
```

### Key Infrastructure Decisions

| Item | Decision | Reason |
|------|----------|--------|
| Midjourney | GoAPI.ai (~$0.04/img) | No official public API |
| Photoshop | Sharp + node-canvas | Can't run Photoshop headlessly |
| Storage | Local filesystem | Zero cost; S3 easy to add later |
| Config files | Generated in Phase 1 | Not provided; built as part of the plan |

---

## Section 2: Data Pipeline

### Scraping Strategy

| Platform | Method | Data Captured |
|----------|--------|---------------|
| Etsy | Official API v3 | Sales, favorites, price, tags, images |
| Pinterest | Official API v5 | Save count, clicks, engagement |
| Google Trends | `google-trends-api` npm | Search volume, trend direction |
| Gumroad | Playwright | Sales badges, price, category |
| Redbubble | Playwright | Bestseller rank, style, tags |
| Society6 | Playwright | Trending products, styles |
| Creative Market | Playwright | Sales count, category, price |

### Demand Score Formula
```
DemandScore = (SearchVolume × SalesVelocity × SocialEngagement) / CompetitionCount
```
Scores normalized 0–100. Only niches scoring **65+** enter the production queue.

### Daily Schedule
```
06:00 → Scrape all 7 platforms (parallel, ~90 min)
08:00 → Market intelligence: demand scores + opportunity rankings
09:00 → Silo priorities updated → production queue generated (200 slots)
```

### Market Intelligence Outputs (daily)
1. **Top 20 opportunities** — ranked niches with recommended price, style, keywords
2. **Silo priority update** — reallocates 200 daily slots across 50 silos by performance
3. **Trend alerts** — flags fast-rising keywords for immediate production boost

---

## Section 3: AI Production Pipeline

### AI Engine Roster

| Engine | Type | Cost/Image | Use Case |
|--------|------|-----------|----------|
| FLUX.1 schnell | Local (Apache 2.0) | Free | High-volume batch, speed priority |
| FLUX.1 dev | Local (open weights) | Free | Quality priority, painterly styles |
| Stable Diffusion XL | Local (open weights) | Free | Variety, fallback |
| DALL-E 3 | OpenAI API | ~$0.04 | Complex compositions |
| Ideogram v2 | API (free tier + paid) | Free tier | Typography in art |
| GoAPI (Midjourney) | 3rd party | ~$0.04 | Premium quality runs |
| **Auto-discovered** | Variable | Variable | New models added automatically |

**Target cost:** ~$1.60/day (local inference for ~160 images, paid APIs for ~40 premium pieces).

### AI Router Logic
```
Typography in image?  → Ideogram v2
Max quality/premium?  → DALL-E 3 or GoAPI (Midjourney)
High-volume batch?    → FLUX.1 schnell (local, free)
Fine art/painterly?   → FLUX.1 dev (local, free)
Fallback?             → Stable Diffusion XL (local, free)
New discovered model? → Eligible if benchmark score > threshold
```

### Per-Artwork Pipeline
- 1 master image (2400×3000px minimum)
- 3 variations (color shift, composition tweak, style variant)
- 5 mockups via Sharp + node-canvas (living room, bedroom, office, nursery, bathroom)
- 6 export sizes: 8×10, 11×14, 16×20, 24×36, square, A4
- Quality score via CLIP — below 80 → rejected + regenerated

### Daily Production Math
```
200 artworks × 3 variations  = 600 images generated
600 images   × 5 mockups     = 3,000 mockup composites
600 images   × 6 sizes       = 3,600 export files
~90% pass quality threshold  → ~180 artworks published daily
```

### Engine 9: Model Discovery (runs weekly)
1. Queries HuggingFace Hub `/api/models?filter=text-to-image&sort=trending`
2. Monitors Replicate + fal.ai new model feeds
3. Auto-benchmarks candidates with 5 test prompts across art styles
4. Scores: quality (CLIP), speed (ms/image), cost
5. Score > threshold → auto-registers in AI router pool
6. Dashboard shows "New Models Discovered" feed with benchmark scores

---

## Section 4: Distribution, SEO, Pricing, Analytics & Dashboard

### Publishing Targets

| Platform | Method | Listing Type | Daily Limit |
|----------|--------|-------------|-------------|
| Etsy | Official API v3 | Digital download | 50/day |
| Gumroad | Official API | Digital product | 50/day |
| Pinterest | Official API v5 | Pin to themed boards | 20 pins/day |
| Redbubble | Playwright automation | Print-on-demand | 30/day |
| Society6 | Playwright automation | Print-on-demand | 30/day |
| Creative Market | Playwright automation | Digital goods | 20/day |

### SEO Engine (Claude Haiku-powered)
- **Title:** top keyword front-loaded, max 140 chars, competitor pattern analysis
- **Description:** 300+ words, keyword-rich, benefit-focused, per-silo template
- **Tags:** 13 Etsy tags filled from demand score keyword list

### Dynamic Pricing
```
BasePrice   = median competitor price for niche
QualityMod  = ×1.15 if quality score > 90
DemandMod   = ×1.20 if demand > 85 | ×0.90 if demand < 50
BundleMod   = 3-pack at 2.2× single price
FinalPrice  = BasePrice × QualityMod × DemandMod
```

### Adaptive Learning (runs 22:00 daily)
- Pulls sales/views from all 6 platforms via API
- Calculates conversion rate per silo, per artist, per AI engine
- **Winners** (conversion > 2%): allocation +20% tomorrow, generate variations
- **Losers** (conversion < 0.3% after 7 days): allocation −50%, flagged for review
- Weekly report: revenue, costs, profit, top 10 artworks, trending niches

### Dashboard Layout (`/art-factory`)
```
┌─────────────────────────────────────────────────────────┐
│  ATLAS ART FACTORY              Today: 187/200 ✅        │
├──────────────┬──────────────────────────────────────────┤
│  Overview    │  $247 revenue today  |  1,240 listings   │
│  Production  │  [Production timeline / progress bar]    │
│  Silos       │  ─────────────────────────────────────   │
│  Artists     │  TOP SILOS    TOP ARTISTS    AI USAGE    │
│  Trends      │  Nursery 91  Maya $48       FLUX  62%   │
│  Analytics   │  Botanical 87 Sage $41      DALL-E 21%  │
│  Settings    │  Minimal 79  Nova $37       Ideogram 9% │
│              │  ─────────────────────────────────────   │
│              │  RECENT LISTINGS  [thumbnail grid]       │
└──────────────┴──────────────────────────────────────────┘
```

6 tabs: Overview, Production (live queue), Silos (performance), Artists (stats), Trends (market data), Analytics (revenue/ROI).

---

## Build Phases

| Phase | Week | Deliverable |
|-------|------|------------|
| 1 | 1 | PostgreSQL + Redis setup, orchestrator, job queue, basic dashboard shell |
| 2 | 2 | Trend scraper (all 7 platforms), image analyzer, scheduled runs |
| 3 | 3 | Market intelligence, demand scoring, opportunity ranking |
| 4 | 4 | AI artist engine, prompt builder, FLUX + DALL-E + SDXL generation, quality control |
| 5 | 5 | Mockup generation (Sharp + node-canvas, 5 scenes, 6 sizes) |
| 6 | 6 | Distribution engine (Etsy + Gumroad API, Redbubble + Society6 Playwright, SEO, pricing) |
| 7 | 7 | Analytics + adaptive learning + full dashboard |
| 8 | 8 | Model discovery engine, end-to-end testing, error resilience |

---

## Out of Scope

- AWS S3 (local filesystem first; S3 adapter added later)
- Mobile app / notifications
- Customer-facing storefront (use platform storefronts)
- Voice/video generation (Kling.ai — future phase)
