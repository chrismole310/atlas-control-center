# Atlas FastCash Job Finder — Design Doc
**Date:** 2026-03-04
**Portal:** #23 — FastCash
**Status:** Approved, ready to build

---

## Overview

Two-tab dashboard at `/fastcash` that surfaces fast-cash opportunities in two modes:
- **Tab 1 "Atlas Works"** — Atlas does the work autonomously (transcription via Whisper, writing via Claude), earns passively
- **Tab 2 "Chris Works"** — Atlas scrapes and scores high-value jobs matching Chris's Emmy-winning production background; Chris applies with AI-drafted proposals

---

## Architecture

### Module Location
```
fastcash/
  __init__.py
  job_scraper.py        — scrapes all sources (Apify actors + free APIs)
  job_scorer.py         — scores jobs 1-10 by speed/pay/skill match
  atlas_worker.py       — automated work engine (Whisper + Claude)
  rev_connector.py      — Rev.com transcription job monitor + submitter
  earnings_tracker.py   — logs all earnings, projects weekly/monthly

backend/
  fastcash_routes.py    — FastAPI routes, mounted in main.py at /api/v1/fastcash

frontend/
  src/app/fastcash/
    page.tsx            — main dashboard with two-tab toggle
```

### Database (SQLite — matching existing Atlas stack)
```sql
CREATE TABLE fastcash_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT,
    company      TEXT,
    source       TEXT,       -- remoteok, upwork, linkedin, etc.
    url          TEXT UNIQUE,
    pay_rate     TEXT,
    pay_min      REAL,
    pay_max      REAL,
    remote       INTEGER DEFAULT 1,
    start_date   TEXT,
    payment_speed TEXT,      -- same-day, weekly, bi-weekly, monthly
    skills_required TEXT,    -- JSON array stored as text
    description  TEXT,
    score        REAL,       -- 1-10 composite score
    tab          TEXT,       -- 'atlas' or 'chris'
    applied      INTEGER DEFAULT 0,
    applied_at   TEXT,
    status       TEXT DEFAULT 'new',  -- new, applied, interview, rejected, hired
    scraped_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE fastcash_applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       INTEGER REFERENCES fastcash_jobs(id),
    applied_at   TEXT DEFAULT (datetime('now')),
    cover_letter TEXT,
    status       TEXT DEFAULT 'pending',
    response_date TEXT,
    notes        TEXT
);

CREATE TABLE fastcash_earnings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT,       -- rev, mturk, textbroker, etc.
    task_type    TEXT,       -- transcription, writing, annotation
    amount       REAL,
    earned_at    TEXT DEFAULT (datetime('now')),
    notes        TEXT
);

CREATE TABLE fastcash_tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT,
    task_type    TEXT,
    input_url    TEXT,
    output_text  TEXT,
    status       TEXT DEFAULT 'queued',  -- queued, processing, ready, submitted
    created_at   TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    earnings     REAL DEFAULT 0
);
```

---

## Tab 1 — Atlas Works (Automated Income)

### Sources
| Platform | Work Type | Engine | Est. Rate |
|---|---|---|---|
| Rev.com | Transcription | OpenAI Whisper | $0.45–$1.50/audio min |
| Rev.com | Closed captions | OpenAI Whisper → SRT | $0.75–$1.25/min |
| Textbroker | Article writing | Claude Sonnet | $5–$25/piece |

### Automation Flow
1. Monitor source for available work (every 30 min)
2. Download input (audio file or writing brief)
3. Process: Whisper for audio → transcript; Claude for writing → article
4. Format to platform spec
5. Surface in dashboard as "Ready to Submit"
6. One-click submission + earnings log

### Worker Loop
- Runs every 30 minutes via FastAPI background task
- Max 3 concurrent tasks
- Logs all earnings to `fastcash_earnings`

---

## Tab 2 — Chris Works (High-Value Human Jobs)

### Scraping Sources
| Source | Method | Actor/URL |
|---|---|---|
| RemoteOK | Free JSON API | https://remoteok.com/api |
| WeWorkRemotely | Free RSS | https://weworkremotely.com/remote-jobs.rss |
| Upwork | Apify actor | `upwork-vibe/upwork-scraper` |
| Indeed | Apify actor | `misceres/indeed-scraper` |
| LinkedIn | Apify actor | `bebity/linkedin-jobs-scraper` |
| Mandy.com | Apify generic | `apify/web-scraper` |

### Scoring Algorithm (1–10)
```
speed_to_start    × 0.25   (10 = today, 1 = 30+ days)
payment_speed     × 0.25   (10 = weekly, 1 = monthly+)
pay_rate          × 0.20   (10 = $100+/hr, 1 = min wage)
skill_match       × 0.20   (video editing +5, production +4, Emmy mention +2)
apply_difficulty  × 0.10   (10 = one-click, 1 = complex multi-step)
```

### AI Proposal Generation
- For each job: Claude drafts a cover letter/proposal leading with Emmy credentials
- Templates for: video editing, production, documentary, content creation
- Stored in `fastcash_applications`, editable before sending

### User Profile (used for scoring + proposals)
```python
USER_PROFILE = {
    "name": "Christopher Mole",
    "company": "MoleHole Inc.",
    "credentials": ["14-time Emmy Award winner", "25 years broadcast production"],
    "experience": ["ESPN", "Netflix", "HBO"],
    "specialties": ["documentary editing", "post-production", "film/TV"],
    "skills": ["video editing", "post-production", "documentary", "content creation"],
}
```

---

## Scrape Schedule
- Free APIs (RemoteOK, WeWorkRemotely): every 2 hours
- Apify actors (Upwork, Indeed, LinkedIn): every 4 hours (to manage Apify credits)
- Atlas worker check (Rev.com, Textbroker): every 30 minutes

---

## API Routes
```
GET  /api/v1/fastcash/jobs           — all jobs (tab=atlas|chris, limit, offset)
GET  /api/v1/fastcash/jobs/top       — top 20 scored jobs per tab
POST /api/v1/fastcash/scrape         — trigger manual scrape
GET  /api/v1/fastcash/tasks          — Atlas automated task queue
POST /api/v1/fastcash/apply/:job_id  — mark applied + generate cover letter
GET  /api/v1/fastcash/earnings       — earnings log + projections
GET  /api/v1/fastcash/stats          — summary stats for dashboard
```

---

## Not in v1
- SMS notifications (Twilio — add later)
- DataAnnotation.tech (no API)
- FlexJobs (paid subscription, ToS risk)
- Fully automated application submission (ban risk)
- Rev.com worker API (no worker-side API exists; semi-manual)
