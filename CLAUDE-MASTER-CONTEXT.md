# CLAUDE MASTER CONTEXT — ATLAS SYSTEMS
**Read this before doing ANYTHING. This is the single source of truth.**

---

## OWNER

- **Name:** Chris Mole (@chrismole310)
- **Company:** MoleHole Inc.
- **Background:** 14-time Emmy Award winner, 25 years in broadcast production
- **Current situation:** Finishing 3 edit jobs this week — needs autonomous building
- **GitHub:** github.com/chrismole310/atlas-control-center

---

## THE VISION

Atlas is an AI-Powered Wealth Operating System running 24/7 on a Mac Mini.
Goal: multiple autonomous revenue streams compounding over time.

**Revenue streams (in build order):**
1. **TRAX** — autonomous trading/CFO agent (CURRENT FOCUS)
2. **Digital Products** — atlas-core, AI-generated ebooks/templates on Gumroad
3. **Music** — Suno integration, royalty-free music sales
4. **Settlement Finder** — auto-file class action claims
5. **Housing Lottery** — NYC housing lottery auto-apply
6. **Website Flipping** — buy/improve/sell micro-SaaS

---

## PROJECT STRUCTURE

```
~/atlas-control-center/     ← MAIN PROJECT (active development)
  backend/
    main.py                 ← FastAPI app (auth, trades, capital, WebSocket)
    database.py             ← SQLAlchemy models (User, Capital, Trade, Transaction)
    auth.py                 ← JWT auth, role system (CEO/CFO/Trader/Viewer)
    coinbase_service.py     ← Coinbase Advanced API integration
    requirements.txt
    .env                    ← COINBASE_PRIVATE_KEY set, COINBASE_API_KEY = placeholder
    trax.db                 ← SQLite database

  frontend/
    src/app/
      login/page.tsx        ← Login page (complete)
      trax/                 ← Dashboard route (NEEDS TO BE BUILT)
    (Next.js 14, TypeScript, Tailwind, shadcn/ui)

  CLAUDE.md                 ← Points here
  CLAUDE-MASTER-CONTEXT.md  ← THIS FILE

~/atlas-core/               ← ORIGINAL POC (Phase 0, mostly done)
  run_atlas.py              ← Main entry, Flask at localhost:5000
  engines/product_factory.py
  decision_queue/
  templates/
```

---

## TECH STACK

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, asyncio |
| Database | SQLite (SQLAlchemy ORM) |
| Auth | JWT (python-jose), bcrypt (passlib), role-based |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| AI | Claude API (claude-sonnet-4-6 or claude-opus-4-6) |
| Trading | Coinbase Advanced API (coinbase-advanced-py) |
| Realtime | WebSocket (FastAPI native) |
| Hosting | Mac Mini (local), Vercel (frontend target) |

---

## TRAX — AUTONOMOUS CFO AGENT

### Current Capital
- **Real money:** $36.28 USD in Coinbase (7-year-old account)
- **Approach:** Paper trading first, then deploy real capital once proven

### What's Already Built (backend/main.py)
- ✅ JWT auth with CEO/CFO/Trader/Viewer roles
- ✅ Capital tracking (total/available/deployed)
- ✅ Trade request → CEO approval → execute workflow
- ✅ Transaction history
- ✅ WebSocket real-time broadcasts (every 5s)
- ✅ Coinbase API service skeleton
- ✅ Portfolio endpoint (mock data)
- ✅ Performance chart endpoint (random data — needs real data)

### What Needs to Be Built
- ❌ Real trading engine (currently simulated)
- ❌ Paper trading mode (virtual $1000 sandbox)
- ❌ Arbitrage strategy
- ❌ Congress trade tracker (copy Nancy Pelosi etc.)
- ❌ Gov contract tracker (trade on announcements)
- ❌ Settlement money finder
- ❌ NYC housing lottery auto-apply
- ❌ Full dashboard UI (frontend only has login page)
- ❌ Real portfolio data from Coinbase
- ❌ Real performance data

### Coinbase Credentials Status
- `COINBASE_PRIVATE_KEY`: ✅ Set in `.env` (EC private key)
- `COINBASE_API_KEY`: ❌ Still placeholder — Chris needs to copy the key ID from Coinbase Developer Portal
- **Action needed:** Go to Coinbase Developer Platform → API Keys → copy the key name/ID (looks like `organizations/xxx/apiKeys/xxx`)

### Safety Limits (coinbase_service.py)
- Max trade size: $10.00
- Daily loss limit: $5.00
- Minimum balance: $90.00 (will need adjusting for $36 account)
- Trading hours: 9 AM – 5 PM only
- Approved pairs: BTC-USD, ETH-USD, SOL-USD

---

## TRAX STRATEGIES (BUILD ORDER)

### Phase 1 — Core Trading (NOW)
1. **Paper Trading Engine** — virtual $1000, real market prices, zero risk
2. **Real Trading Engine** — actual Coinbase execution with safety limits
3. **Arbitrage** — price differences across exchanges/pairs
4. **Portfolio Rebalancing** — All-Weather allocation (Ray Dalio style)

### Phase 2 — Alpha Strategies
5. **Congress Trade Tracker** — monitor house.gov/senate.gov disclosures, copy trades
   - Data source: housestockwatcher.com API, senatestockwatcher.com API
   - Focus: Pelosi, Tuberville, key committee members
   - Lag: trades disclosed 45 days after execution — buy on announcement

6. **Gov Contract Tracker** — USASpending.gov API, trade sector ETFs on award announcements
   - Large DoD/HHS contracts → defense/healthcare ETFs
   - Pattern: contract announcement → sector moves within days

### Phase 3 — Passive Income
7. **Settlement Money Finder** — scrape PACER/ClassAction.org, auto-submit claims
   - Priority: tech settlements (Meta, Google, Apple class actions)
   - Auto-fill with stored personal info, track deadlines

8. **NYC Housing Lottery** — Housing Connect auto-apply
   - Monitor new listings, auto-submit applications
   - Track application status

9. **Yield Optimization** — stablecoin yield, T-bill ETFs, covered calls

---

## ATLAS-CORE (Original POC)

Phase 0 — proof of concept for digital product revenue:
- Generates ebook/template ideas every 10 seconds (demo mode)
- Decision queue at localhost:5000/queue (approve/reject products)
- Flask dashboard with stats
- Status: Working demo, needs Phase 1 (real Claude API + real Gumroad)

Phase roadmap:
- Phase 0 ✅: POC working
- Phase 1: Real Claude API + Gumroad publishing ($1 earned)
- Phase 2: Music engine (Suno), $20-50/day
- Phase 3: Trading + website flipping, $100+/day

---

## DATABASE MODELS

```python
User: id, username, email, hashed_password, role(CEO/CFO/Trader/Viewer), is_active
Capital: id, total, available, deployed, last_updated
Transaction: id, type, amount, description, timestamp
Trade: id, symbol, action, quantity, price, total_value, status, requested_by, approved_by, created_at, executed_at
```

Default CEO account: username=`ceo`, password=`atlas123`

---

## API ENDPOINTS (backend, port 8000)

```
POST /api/v1/auth/login          → JWT token
POST /api/v1/auth/register       → create user
GET  /api/v1/auth/me             → current user
GET  /api/v1/trax/capital        → capital overview
GET  /api/v1/trax/portfolio      → holdings (mock)
GET  /api/v1/trax/performance    → chart data (random)
GET  /api/v1/trax/trades/pending → pending approvals (CEO only)
POST /api/v1/trax/trade/request  → submit trade
POST /api/v1/trax/trade/approve  → approve/reject (CEO only)
GET  /api/v1/trax/transactions   → history
GET  /api/v1/trax/trades/history → trade history
WS   /ws                         → real-time updates
GET  /api/coinbase/connect       → connect Coinbase
GET  /api/coinbase/balance       → real balances
GET  /api/coinbase/prices        → real prices
POST /api/coinbase/trade         → execute trade
GET  /api/v1/health              → health check
```

---

## DEVELOPMENT APPROACH

- **Build autonomously** while Chris works/sleeps
- **Use agent teams** for parallel development when possible
- **Paper trade first**, never risk real money until strategy is proven
- **Test thoroughly** before any real execution
- **Commit working code frequently** (git commit after each component)
- **Update progress tracker** (atlas-progress.json in root) after each milestone

### Progress Tracker Format
```json
{
  "last_updated": "ISO timestamp",
  "components": {
    "paper_trading_engine": "complete|in_progress|not_started",
    "real_trading_engine": "...",
    "arbitrage_strategy": "...",
    "congress_tracker": "...",
    "dashboard_ui": "..."
  },
  "capital": {
    "paper_balance": 1000.00,
    "real_balance": 36.28
  },
  "notes": "..."
}
```

---

## IMMEDIATE BUILD PRIORITIES

1. **Trading engine** — real Coinbase execution + paper trading mode (TODAY)
2. **Arbitrage strategy** — detect and execute price spreads
3. **Dashboard UI** — full Next.js frontend for TRAX
4. **Test with $36.28** — after paper trading validates strategy
5. **Congress tracker** — next alpha strategy

---

## IMPORTANT NOTES

- Frontend routes to `/trax` after login — that page doesn't exist yet
- `ACCESS_TOKEN_EXPIRE_MINUTES = 30` in auth.py — may want to increase for long sessions
- The Coinbase SDK import in coinbase_service.py uses `coinbase.advanced_api` — verify this matches installed package
- Safety limits in coinbase_service.py need adjustment: MIN_BALANCE=$90 doesn't make sense with $36 account
- Backend CORS allows localhost:3000 and atlas-control-center.vercel.app
- Default CEO password `atlas123` should be changed before any real trading

---

*Last updated: 2026-02-26*
*Built for Chris Mole / MoleHole Inc.*
*Atlas Systems — Built to Build. Made to Scale.*
