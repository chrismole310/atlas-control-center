# Atlas Art Factory

Automated AI art production system — from trend discovery to marketplace listings.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                          │
│  (Bull queues + daily cycle scheduling)                 │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  Trend   │  Market  │   AI     │  Mockup  │Distribution │
│ Scraping │  Intel   │ Artist   │Generator │  Engine     │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│  Analytics Engine  │  Model Discovery  │  Queue Resil.  │
├────────────────────┴──────────────────┴────────────────┤
│              PostgreSQL  +  Redis                       │
└────────────────────────────────────────────────────────┘
```

## Engines

| Engine | Purpose | Queue |
|--------|---------|-------|
| **Trend Scraping** | Scrape trending keywords from marketplaces | `trend-scraping` |
| **Market Intelligence** | Compute demand scores + find opportunities | `market-intelligence` |
| **AI Artist** | Generate artwork via multi-engine AI router | `image-generation` |
| **Mockup Generator** | Create room scene mockups + print-ready packages | `mockup-generation` |
| **Distribution** | SEO optimization, pricing, multi-platform upload | `distribution` |
| **Analytics** | Pull platform stats, adaptive learning, daily reports | `analytics` |
| **Model Discovery** | Scan HuggingFace/Replicate, benchmark, auto-register | `model-discovery` |

## Setup

```bash
cp .env.example .env   # Configure database, Redis, API keys
npm install
npm run migrate        # Run database migrations
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + DB status |
| GET | `/api/silos` | List all art silos |
| GET | `/api/silos/:id` | Get silo details |
| GET | `/api/artists` | List AI artists |
| GET | `/api/artists/:id` | Get artist details |
| GET | `/api/stats` | System-wide counts |
| GET | `/api/intelligence` | Market opportunities + demand scores |
| GET | `/api/trends` | Top trending keywords |
| GET | `/api/production/status` | Today's production stats |
| GET | `/api/analytics/daily` | Daily analytics (last N days) |
| GET | `/api/analytics/top-artworks` | Top performing artworks |
| GET | `/api/models/discovered` | Discovered AI models |

## Daily Cycle

The orchestrator runs this sequence daily:
1. **Trend Scraping** — Gather trending keywords
2. **Market Intelligence** — Score demand, find opportunities
3. **Image Generation** — Create artwork across active silos
4. **Mockup Generation** — Generate room scenes + print formats
5. **Distribution** — SEO, pricing, upload to platforms
6. **Analytics** — Pull stats, learn, report

Model discovery runs weekly on a separate schedule.

## Testing

```bash
npm test               # Run all tests
npm test -- --watch    # Watch mode
```

## Tech Stack

- **Runtime:** Node.js
- **API:** Express
- **Queue:** Bull (Redis-backed)
- **Database:** PostgreSQL
- **AI Engines:** Replicate (Flux), OpenAI (DALL-E 3), Ideogram
- **Image Processing:** Sharp
- **Browser Automation:** Playwright (Redbubble, Society6)
- **SEO:** Claude Haiku via @anthropic-ai/sdk
