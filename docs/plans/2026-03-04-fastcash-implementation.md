# FastCash Job Finder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Portal #23 — a two-tab dashboard at `/fastcash` that finds automatable income jobs (Atlas does the work) and high-value video editing jobs (Chris applies with AI proposals).

**Architecture:** Standalone `fastcash/` module with its own DB + scraper + worker + scorer. Routes inline in `backend/main.py` following existing pattern. Frontend at `frontend/src/app/fastcash/page.tsx`.

**Tech Stack:** Python/FastAPI, SQLite, httpx, feedparser (RSS), openai (Whisper), anthropic (Claude), existing Apify client at `intelligence/apify_client.py`, Next.js 14/TypeScript/Tailwind.

---

## Setup: Install new dependencies

```bash
cd /Users/atlas/atlas-control-center/backend
source venv/bin/activate
pip install openai feedparser
echo "openai" >> requirements.txt
echo "feedparser" >> requirements.txt
```

---

### Task 1: FastCash Database

**Files:**
- Create: `fastcash/__init__.py`
- Create: `fastcash/database.py`

**Step 1: Create the fastcash module with database**

Create `fastcash/__init__.py` (empty):
```python
```

Create `fastcash/database.py`:
```python
"""FastCash — SQLite database models and helpers."""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent / "backend" / "trax.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS fastcash_jobs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            company       TEXT,
            source        TEXT NOT NULL,
            url           TEXT UNIQUE NOT NULL,
            pay_rate      TEXT,
            pay_min       REAL DEFAULT 0,
            pay_max       REAL DEFAULT 0,
            remote        INTEGER DEFAULT 1,
            start_date    TEXT,
            payment_speed TEXT,
            skills        TEXT DEFAULT '[]',
            description   TEXT,
            score         REAL DEFAULT 0,
            tab           TEXT NOT NULL DEFAULT 'chris',
            applied       INTEGER DEFAULT 0,
            applied_at    TEXT,
            status        TEXT DEFAULT 'new',
            scraped_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fastcash_applications (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id        INTEGER REFERENCES fastcash_jobs(id),
            applied_at    TEXT DEFAULT (datetime('now')),
            cover_letter  TEXT,
            status        TEXT DEFAULT 'pending',
            response_date TEXT,
            notes         TEXT
        );

        CREATE TABLE IF NOT EXISTS fastcash_tasks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            source        TEXT NOT NULL,
            task_type     TEXT NOT NULL,
            input_url     TEXT,
            input_text    TEXT,
            output_text   TEXT,
            status        TEXT DEFAULT 'queued',
            created_at    TEXT DEFAULT (datetime('now')),
            completed_at  TEXT,
            earnings      REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS fastcash_earnings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            source        TEXT NOT NULL,
            task_type     TEXT,
            amount        REAL NOT NULL,
            earned_at     TEXT DEFAULT (datetime('now')),
            notes         TEXT
        );
        """)
    print("[FastCash] DB initialized.")


def get_jobs(tab: str = None, limit: int = 50, offset: int = 0,
             status: str = None, min_score: float = 0) -> list:
    with get_conn() as conn:
        q = "SELECT * FROM fastcash_jobs WHERE score >= ?"
        params = [min_score]
        if tab:
            q += " AND tab = ?"
            params.append(tab)
        if status:
            q += " AND status = ?"
            params.append(status)
        q += " ORDER BY score DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def upsert_job(job: dict) -> bool:
    """Insert job if URL not seen before. Returns True if new."""
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM fastcash_jobs WHERE url = ?", (job["url"],)
        ).fetchone()
        if existing:
            return False
        conn.execute("""
            INSERT INTO fastcash_jobs
            (title, company, source, url, pay_rate, pay_min, pay_max,
             remote, start_date, payment_speed, skills, description, score, tab)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            job.get("title", ""),
            job.get("company", ""),
            job.get("source", ""),
            job["url"],
            job.get("pay_rate", ""),
            job.get("pay_min", 0),
            job.get("pay_max", 0),
            1 if job.get("remote", True) else 0,
            job.get("start_date", ""),
            job.get("payment_speed", ""),
            str(job.get("skills", [])),
            job.get("description", "")[:2000],
            job.get("score", 0),
            job.get("tab", "chris"),
        ))
        return True


def get_stats() -> dict:
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM fastcash_jobs").fetchone()[0]
        atlas = conn.execute("SELECT COUNT(*) FROM fastcash_jobs WHERE tab='atlas'").fetchone()[0]
        chris = conn.execute("SELECT COUNT(*) FROM fastcash_jobs WHERE tab='chris'").fetchone()[0]
        applied = conn.execute("SELECT COUNT(*) FROM fastcash_jobs WHERE applied=1").fetchone()[0]
        earned = conn.execute("SELECT COALESCE(SUM(amount),0) FROM fastcash_earnings").fetchone()[0]
        tasks_ready = conn.execute(
            "SELECT COUNT(*) FROM fastcash_tasks WHERE status='ready'"
        ).fetchone()[0]
        return {
            "total_jobs": total,
            "atlas_jobs": atlas,
            "chris_jobs": chris,
            "applied": applied,
            "total_earned": round(earned, 2),
            "tasks_ready": tasks_ready,
        }
```

**Step 2: Test the DB init**
```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, 'fastcash')
from database import init_db, get_stats
init_db()
print(get_stats())
"
```
Expected: `[FastCash] DB initialized.` then `{'total_jobs': 0, ...}`

**Step 3: Commit**
```bash
git add fastcash/
git commit -m "feat(fastcash): database schema and helpers"
```

---

### Task 2: Job Scorer

**Files:**
- Create: `fastcash/job_scorer.py`

**Step 1: Create scorer**

Create `fastcash/job_scorer.py`:
```python
"""FastCash — Job scoring algorithm (1-10 composite score)."""

USER_SKILLS = [
    "video editing", "post-production", "documentary", "film", "tv production",
    "content editing", "broadcast", "espn", "netflix", "hbo", "emmy",
    "non-linear editing", "avid", "premiere", "final cut", "davinci",
]

SKILL_BOOSTS = {
    "video editing": 5, "post-production": 5, "documentary": 4,
    "film production": 4, "tv production": 4, "content editing": 3,
    "emmy": 2, "broadcast": 3, "avid": 2, "premiere": 2,
}

PAYMENT_SPEED_SCORES = {
    "same-day": 10, "daily": 10,
    "weekly": 8, "bi-weekly": 6,
    "monthly": 3, "net-30": 2, "net-60": 1,
    "unknown": 4,
}


def _speed_to_start_score(start_date: str) -> float:
    if not start_date:
        return 5.0
    s = start_date.lower()
    if any(w in s for w in ["immediately", "asap", "today", "now", "right away"]):
        return 10.0
    if any(w in s for w in ["this week", "week", "3 days", "5 days"]):
        return 8.0
    if any(w in s for w in ["2 weeks", "two weeks", "14 days"]):
        return 5.0
    if any(w in s for w in ["month", "30 days"]):
        return 2.0
    return 5.0


def _pay_score(pay_min: float, pay_max: float, pay_rate: str) -> float:
    effective = pay_max or pay_min
    if not effective:
        rate = (pay_rate or "").lower()
        if "$" in rate:
            import re
            nums = re.findall(r"\d+\.?\d*", rate)
            if nums:
                effective = float(nums[-1])
    if not effective:
        return 3.0
    if "hour" in (pay_rate or "").lower() or "/hr" in (pay_rate or "").lower():
        if effective >= 100: return 10.0
        if effective >= 75:  return 8.0
        if effective >= 50:  return 7.0
        if effective >= 25:  return 5.0
        return 3.0
    # Flat project rate
    if effective >= 1000: return 9.0
    if effective >= 500:  return 7.0
    if effective >= 200:  return 6.0
    if effective >= 50:   return 5.0
    return 3.0


def _skill_match_score(title: str, description: str, skills: list) -> float:
    text = f"{title} {description} {' '.join(skills)}".lower()
    base = 0
    for skill, boost in SKILL_BOOSTS.items():
        if skill in text:
            base += boost
    # Normalize to 1-10
    return min(10.0, max(1.0, base))


def _apply_difficulty_score(description: str, source: str) -> float:
    desc = (description or "").lower()
    if source in ("remoteok", "weworkremotely"):
        return 8.0
    if any(w in desc for w in ["one click", "quick apply", "easy apply"]):
        return 9.0
    if any(w in desc for w in ["portfolio required", "test task", "assessment"]):
        return 4.0
    return 6.0


def score_job(job: dict) -> float:
    """Return composite score 1-10."""
    s1 = _speed_to_start_score(job.get("start_date", ""))
    s2 = PAYMENT_SPEED_SCORES.get(
        (job.get("payment_speed") or "unknown").lower(), 4.0
    )
    s3 = _pay_score(
        job.get("pay_min", 0),
        job.get("pay_max", 0),
        job.get("pay_rate", ""),
    )
    s4 = _skill_match_score(
        job.get("title", ""),
        job.get("description", ""),
        job.get("skills", []),
    )
    s5 = _apply_difficulty_score(
        job.get("description", ""),
        job.get("source", ""),
    )
    composite = (s1 * 0.25) + (s2 * 0.25) + (s3 * 0.20) + (s4 * 0.20) + (s5 * 0.10)
    return round(min(10.0, max(1.0, composite)), 2)
```

**Step 2: Test scorer**
```bash
python3 -c "
import sys; sys.path.insert(0, 'fastcash')
from job_scorer import score_job

job = {
    'title': 'Video Editor — Documentary Post-Production',
    'source': 'remoteok',
    'start_date': 'immediately',
    'payment_speed': 'weekly',
    'pay_min': 75, 'pay_max': 100,
    'pay_rate': '\$75-100/hr',
    'description': 'emmy winning experience preferred, avid and premiere',
    'skills': ['video editing', 'avid'],
}
print('Score:', score_job(job))  # expect 8+
"
```

**Step 3: Commit**
```bash
git add fastcash/job_scorer.py
git commit -m "feat(fastcash): job scoring algorithm"
```

---

### Task 3: Free API Scrapers (RemoteOK + WeWorkRemotely)

**Files:**
- Create: `fastcash/scrapers_free.py`

**Step 1: Create free scrapers**

Create `fastcash/scrapers_free.py`:
```python
"""FastCash — Free API scrapers: RemoteOK (JSON) + WeWorkRemotely (RSS)."""
import httpx
import feedparser
from job_scorer import score_job

REMOTEOK_URL = "https://remoteok.com/api"
WWR_FEEDS = [
    "https://weworkremotely.com/remote-jobs.rss",
    "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "https://weworkremotely.com/categories/all-other-remote-jobs.rss",
]

VIDEO_KEYWORDS = [
    "video edit", "post-production", "documentary", "film", "broadcast",
    "content creat", "media produc", "motion graphic", "animation",
    "transcri", "caption", "subtitle",
]


def _is_relevant(title: str, desc: str = "") -> bool:
    text = f"{title} {desc}".lower()
    return any(kw in text for kw in VIDEO_KEYWORDS)


def scrape_remoteok() -> list:
    jobs = []
    try:
        headers = {"User-Agent": "Atlas-FastCash/1.0"}
        resp = httpx.get(REMOTEOK_URL, headers=headers, timeout=15)
        data = resp.json()
        for item in data:
            if not isinstance(item, dict) or not item.get("position"):
                continue
            title = item.get("position", "")
            desc = item.get("description", "")
            tags = item.get("tags", [])
            pay_min = float(item.get("salary_min") or 0)
            pay_max = float(item.get("salary_max") or 0)

            job = {
                "title": title,
                "company": item.get("company", ""),
                "source": "remoteok",
                "url": item.get("url") or f"https://remoteok.com/l/{item.get('id','')}",
                "pay_rate": f"${pay_min/1000:.0f}k-${pay_max/1000:.0f}k/yr" if pay_max else "",
                "pay_min": pay_min / 2080 if pay_min else 0,  # convert annual to hourly
                "pay_max": pay_max / 2080 if pay_max else 0,
                "remote": True,
                "start_date": "immediately",
                "payment_speed": "bi-weekly",
                "skills": tags,
                "description": desc[:1000],
                "tab": "chris",
            }
            job["score"] = score_job(job)
            jobs.append(job)
    except Exception as e:
        print(f"[FastCash] RemoteOK error: {e}")
    print(f"[FastCash] RemoteOK: {len(jobs)} jobs")
    return jobs


def scrape_weworkremotely() -> list:
    jobs = []
    for feed_url in WWR_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                title = entry.get("title", "")
                desc = entry.get("summary", "")
                link = entry.get("link", "")
                if not link:
                    continue
                job = {
                    "title": title,
                    "company": entry.get("author", ""),
                    "source": "weworkremotely",
                    "url": link,
                    "pay_rate": "",
                    "pay_min": 0,
                    "pay_max": 0,
                    "remote": True,
                    "start_date": "immediately",
                    "payment_speed": "bi-weekly",
                    "skills": [],
                    "description": desc[:1000],
                    "tab": "chris",
                }
                job["score"] = score_job(job)
                jobs.append(job)
        except Exception as e:
            print(f"[FastCash] WWR {feed_url} error: {e}")
    print(f"[FastCash] WeWorkRemotely: {len(jobs)} jobs")
    return jobs


def run_free_scrapers() -> list:
    jobs = []
    jobs.extend(scrape_remoteok())
    jobs.extend(scrape_weworkremotely())
    return jobs
```

**Step 2: Test free scrapers**
```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, 'fastcash')
from scrapers_free import run_free_scrapers
jobs = run_free_scrapers()
print(f'Total: {len(jobs)}')
if jobs:
    top = sorted(jobs, key=lambda j: j['score'], reverse=True)[0]
    print('Top job:', top['title'], '— score:', top['score'])
"
```
Expected: `RemoteOK: N jobs`, `WeWorkRemotely: N jobs`

**Step 3: Commit**
```bash
git add fastcash/scrapers_free.py
git commit -m "feat(fastcash): RemoteOK + WeWorkRemotely scrapers"
```

---

### Task 4: Apify Scrapers (Upwork, Indeed, LinkedIn)

**Files:**
- Create: `fastcash/scrapers_apify.py`

**Step 1: Create Apify scrapers**

Create `fastcash/scrapers_apify.py`:
```python
"""FastCash — Apify-based scrapers for Upwork, Indeed, LinkedIn."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "intelligence"))

from apify_client import run_actor
from job_scorer import score_job

# Verified Apify actor IDs
ACTORS = {
    "upwork":   "upwork-vibe/upwork-scraper",
    "indeed":   "misceres/indeed-scraper",
    "linkedin": "bebity/linkedin-jobs-scraper",
}

VIDEO_QUERIES = [
    "video editor remote",
    "post production editor remote",
    "documentary editor freelance",
    "video editing freelance",
    "content editor video remote",
]

TRANSCRIPTION_QUERIES = [
    "transcription remote",
    "captioning remote",
    "subtitles freelance",
]


def _normalize_upwork(item: dict) -> dict:
    return {
        "title": item.get("title") or item.get("job_title", ""),
        "company": item.get("client_name", "Upwork Client"),
        "source": "upwork",
        "url": item.get("url") or item.get("job_url", ""),
        "pay_rate": item.get("budget") or item.get("hourly_rate", ""),
        "pay_min": float(item.get("budget_min") or 0),
        "pay_max": float(item.get("budget_max") or 0),
        "remote": True,
        "start_date": "immediately",
        "payment_speed": "weekly",
        "skills": item.get("skills") or [],
        "description": (item.get("description") or "")[:1000],
        "tab": "chris",
    }


def _normalize_indeed(item: dict) -> dict:
    return {
        "title": item.get("positionName") or item.get("title", ""),
        "company": item.get("company", ""),
        "source": "indeed",
        "url": item.get("url") or item.get("jobUrl", ""),
        "pay_rate": item.get("salary", ""),
        "pay_min": 0,
        "pay_max": 0,
        "remote": True,
        "start_date": item.get("postedAt", ""),
        "payment_speed": "bi-weekly",
        "skills": [],
        "description": (item.get("description") or item.get("summary", ""))[:1000],
        "tab": "chris",
    }


def _normalize_linkedin(item: dict) -> dict:
    return {
        "title": item.get("title", ""),
        "company": item.get("companyName") or item.get("company", ""),
        "source": "linkedin",
        "url": item.get("jobUrl") or item.get("url", ""),
        "pay_rate": item.get("salary", ""),
        "pay_min": 0,
        "pay_max": 0,
        "remote": True,
        "start_date": item.get("postedAt", ""),
        "payment_speed": "bi-weekly",
        "skills": item.get("skills") or [],
        "description": (item.get("description") or "")[:1000],
        "tab": "chris",
    }


NORMALIZERS = {
    "upwork": _normalize_upwork,
    "indeed": _normalize_indeed,
    "linkedin": _normalize_linkedin,
}


def scrape_platform(platform: str, queries: list = None, max_items: int = 25) -> list:
    actor_id = ACTORS.get(platform)
    if not actor_id:
        print(f"[FastCash] Unknown platform: {platform}")
        return []

    queries = queries or VIDEO_QUERIES[:2]
    jobs = []
    normalizer = NORMALIZERS[platform]

    for query in queries:
        try:
            print(f"[FastCash] {platform}: searching '{query}'")
            if platform == "upwork":
                input_data = {"searchQuery": query, "maxItems": max_items}
            elif platform == "indeed":
                input_data = {"position": query, "country": "US",
                              "location": "remote", "maxItems": max_items}
            elif platform == "linkedin":
                input_data = {"keywords": query, "location": "Remote",
                              "maxResults": max_items}
            else:
                input_data = {"query": query, "maxItems": max_items}

            items, _ = run_actor(actor_id, input_data, timeout_secs=120)
            for item in items:
                if not isinstance(item, dict):
                    continue
                job = normalizer(item)
                if not job.get("url") or not job.get("title"):
                    continue
                job["score"] = score_job(job)
                jobs.append(job)
        except Exception as e:
            print(f"[FastCash] {platform}/{query} error: {e}")

    print(f"[FastCash] {platform}: {len(jobs)} jobs")
    return jobs


def run_apify_scrapers(include_transcription: bool = True) -> list:
    jobs = []
    # Video editing jobs on all platforms
    for platform in ["upwork", "indeed", "linkedin"]:
        jobs.extend(scrape_platform(platform, VIDEO_QUERIES[:2]))
    # Transcription jobs — tab=atlas (Atlas can do these with Whisper)
    if include_transcription:
        transcription_jobs = scrape_platform("upwork", TRANSCRIPTION_QUERIES, max_items=15)
        for j in transcription_jobs:
            j["tab"] = "atlas"
        jobs.extend(transcription_jobs)
    return jobs
```

**Step 2: Quick sanity test (uses Apify credits — run once)**
```bash
python3 -c "
import sys; sys.path.insert(0, 'fastcash')
# Test normalizer only, no API call
from scrapers_apify import _normalize_upwork, score_job
fake = {'title': 'Video Editor', 'client_name': 'TestCo',
        'url': 'https://upwork.com/jobs/test', 'hourly_rate': '50-75/hr'}
job = _normalize_upwork(fake)
from job_scorer import score_job
job['score'] = score_job(job)
print(job)
"
```

**Step 3: Commit**
```bash
git add fastcash/scrapers_apify.py
git commit -m "feat(fastcash): Apify scrapers for Upwork, Indeed, LinkedIn"
```

---

### Task 5: Atlas Worker (Whisper + Claude)

**Files:**
- Create: `fastcash/atlas_worker.py`

**Step 1: Create Atlas worker**

Create `fastcash/atlas_worker.py`:
```python
"""FastCash — Atlas Worker: automated income engine.
Handles transcription (Whisper) and writing (Claude).
"""
import os
import sys
import json
import tempfile
from pathlib import Path
from datetime import datetime

import httpx

sys.path.insert(0, str(Path(__file__).parent))
from database import get_conn, init_db

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

USER_PROFILE = {
    "name": "Christopher Mole",
    "company": "MoleHole Inc.",
    "credentials": "14-time Emmy Award winner, 25 years broadcast production",
    "clients": "ESPN, Netflix, HBO",
    "specialties": "documentary editing, post-production, film/TV",
}


# ── Whisper Transcription ─────────────────────────────────────────────────────

def transcribe_audio(audio_url: str, task_id: int) -> str:
    """Download audio and transcribe with OpenAI Whisper. Returns transcript."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    # Download audio
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        resp = httpx.get(audio_url, follow_redirects=True, timeout=60)
        f.write(resp.content)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as audio_file:
            resp = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": ("audio.mp3", audio_file, "audio/mpeg")},
                data={"model": "whisper-1", "response_format": "text"},
                timeout=120,
            )
        transcript = resp.text.strip()

        with get_conn() as conn:
            conn.execute(
                "UPDATE fastcash_tasks SET status='ready', output_text=?, completed_at=? WHERE id=?",
                (transcript, datetime.utcnow().isoformat(), task_id)
            )
        return transcript
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ── Claude Writing ────────────────────────────────────────────────────────────

def write_article(brief: str, word_count: int, task_id: int) -> str:
    """Use Claude to write an article matching a Textbroker brief."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""Write a {word_count}-word article based on this brief:

{brief}

Requirements:
- Exactly {word_count} words (±10%)
- Professional, engaging tone
- SEO-friendly structure with subheadings
- No fluff, all substance
- Do not mention AI or that this was AI-generated

Return only the article text."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    article = msg.content[0].text.strip()

    with get_conn() as conn:
        conn.execute(
            "UPDATE fastcash_tasks SET status='ready', output_text=?, completed_at=? WHERE id=?",
            (article, datetime.utcnow().isoformat(), task_id)
        )
    return article


# ── Proposal Generator ────────────────────────────────────────────────────────

def generate_proposal(job_title: str, job_description: str, job_source: str) -> str:
    """Generate a tailored cover letter / proposal for Chris to review."""
    if not ANTHROPIC_API_KEY:
        return ""

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""Write a short, punchy cover letter / proposal for this job posting.

Job: {job_title}
Platform: {job_source}
Description: {job_description[:800]}

Applicant profile:
- Name: {USER_PROFILE['name']}
- Company: {USER_PROFILE['company']}
- Credentials: {USER_PROFILE['credentials']}
- Notable clients: {USER_PROFILE['clients']}
- Specialties: {USER_PROFILE['specialties']}

Requirements:
- 3-4 short paragraphs max
- Lead with Emmy credentials immediately
- Specific to THIS job's requirements
- Confident but not arrogant
- End with a clear call to action
- No generic filler phrases

Return only the proposal text."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text.strip()


# ── Task Queue ────────────────────────────────────────────────────────────────

def queue_task(source: str, task_type: str, input_url: str = "",
               input_text: str = "") -> int:
    """Add a task to the Atlas worker queue. Returns task ID."""
    init_db()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO fastcash_tasks (source, task_type, input_url, input_text) VALUES (?,?,?,?)",
            (source, task_type, input_url, input_text)
        )
        return cur.lastrowid


def get_pending_tasks(limit: int = 5) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM fastcash_tasks WHERE status='queued' ORDER BY created_at LIMIT ?",
            (limit,)
        ).fetchall()]


def log_earning(source: str, task_type: str, amount: float, notes: str = ""):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO fastcash_earnings (source, task_type, amount, notes) VALUES (?,?,?,?)",
            (source, task_type, amount, notes)
        )
```

**Step 2: Test proposal generator**
```bash
python3 -c "
import sys, os
sys.path.insert(0, 'fastcash')
from atlas_worker import generate_proposal
proposal = generate_proposal(
    'Senior Video Editor — Documentary Projects',
    'Looking for experienced documentary editor. 5+ years required. Remote ok.',
    'upwork'
)
print(proposal[:300])
"
```
Expected: Cover letter starting with Emmy credentials.

**Step 3: Commit**
```bash
git add fastcash/atlas_worker.py
git commit -m "feat(fastcash): Atlas worker - Whisper transcription + Claude writing + proposals"
```

---

### Task 6: Main Scraper Orchestrator

**Files:**
- Create: `fastcash/scraper.py`

**Step 1: Create orchestrator**

Create `fastcash/scraper.py`:
```python
"""FastCash — Main scrape orchestrator. Runs all scrapers, saves to DB."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from database import init_db, upsert_job, get_stats
from scrapers_free import run_free_scrapers
from scrapers_apify import run_apify_scrapers


def run_full_scrape(include_apify: bool = True) -> dict:
    """Run all scrapers and save results. Returns summary."""
    init_db()
    start = datetime.utcnow()
    all_jobs = []

    print("[FastCash] Starting free scrapers...")
    all_jobs.extend(run_free_scrapers())

    if include_apify:
        print("[FastCash] Starting Apify scrapers...")
        all_jobs.extend(run_apify_scrapers())

    new_count = 0
    for job in all_jobs:
        if upsert_job(job):
            new_count += 1

    elapsed = (datetime.utcnow() - start).seconds
    stats = get_stats()
    result = {
        "scraped": len(all_jobs),
        "new": new_count,
        "elapsed_secs": elapsed,
        "stats": stats,
        "ran_at": start.isoformat(),
    }
    print(f"[FastCash] Done. {len(all_jobs)} scraped, {new_count} new in {elapsed}s")
    return result


def run_quick_scrape() -> dict:
    """Free APIs only — no Apify credits used."""
    return run_full_scrape(include_apify=False)


if __name__ == "__main__":
    result = run_quick_scrape()
    print(result)
```

**Step 2: Run a quick scrape (free only)**
```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, 'fastcash')
from scraper import run_quick_scrape
result = run_quick_scrape()
print(result)
"
```
Expected: Jobs scraped and saved to DB.

**Step 3: Commit**
```bash
git add fastcash/scraper.py
git commit -m "feat(fastcash): scraper orchestrator"
```

---

### Task 7: FastAPI Routes

**Files:**
- Create: `backend/fastcash_routes.py`
- Modify: `backend/main.py` (add imports + routes)

**Step 1: Create routes file**

Create `backend/fastcash_routes.py`:
```python
"""FastCash API routes — imported by main.py."""
import sys
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent / "fastcash"))
from database import get_jobs, get_stats, get_conn, init_db
from scraper import run_full_scrape, run_quick_scrape
from atlas_worker import generate_proposal, queue_task


class ApplyRequest(BaseModel):
    job_id: int
    notes: Optional[str] = ""


def register_routes(app):
    """Mount all /api/v1/fastcash routes onto the FastAPI app."""

    @app.get("/api/v1/fastcash/stats")
    def fastcash_stats():
        init_db()
        return get_stats()

    @app.get("/api/v1/fastcash/jobs")
    def fastcash_jobs(
        tab: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        min_score: float = 0,
    ):
        init_db()
        jobs = get_jobs(tab=tab, limit=limit, offset=offset, min_score=min_score)
        return {"jobs": jobs, "count": len(jobs)}

    @app.get("/api/v1/fastcash/jobs/top")
    def fastcash_top_jobs(tab: Optional[str] = None, limit: int = 20):
        init_db()
        jobs = get_jobs(tab=tab, limit=limit, min_score=5.0)
        return {"jobs": jobs}

    @app.post("/api/v1/fastcash/scrape")
    async def fastcash_scrape(background_tasks: BackgroundTasks,
                               quick: bool = True):
        fn = run_quick_scrape if quick else run_full_scrape
        background_tasks.add_task(fn)
        return {"status": "scraping started", "mode": "quick" if quick else "full"}

    @app.post("/api/v1/fastcash/apply/{job_id}")
    def fastcash_apply(job_id: int, req: ApplyRequest):
        with get_conn() as conn:
            job = conn.execute(
                "SELECT * FROM fastcash_jobs WHERE id=?", (job_id,)
            ).fetchone()
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            job = dict(job)

        proposal = generate_proposal(
            job["title"], job.get("description", ""), job["source"]
        )

        with get_conn() as conn:
            conn.execute(
                "UPDATE fastcash_jobs SET applied=1, applied_at=datetime('now'), status='applied' WHERE id=?",
                (job_id,)
            )
            conn.execute(
                "INSERT INTO fastcash_applications (job_id, cover_letter, notes) VALUES (?,?,?)",
                (job_id, proposal, req.notes or "")
            )
        return {"job_id": job_id, "proposal": proposal, "status": "applied"}

    @app.get("/api/v1/fastcash/tasks")
    def fastcash_tasks(status: Optional[str] = None, limit: int = 20):
        with get_conn() as conn:
            q = "SELECT * FROM fastcash_tasks"
            params = []
            if status:
                q += " WHERE status=?"
                params.append(status)
            q += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            tasks = [dict(r) for r in conn.execute(q, params).fetchall()]
        return {"tasks": tasks}

    @app.get("/api/v1/fastcash/earnings")
    def fastcash_earnings(limit: int = 50):
        with get_conn() as conn:
            rows = [dict(r) for r in conn.execute(
                "SELECT * FROM fastcash_earnings ORDER BY earned_at DESC LIMIT ?",
                (limit,)
            ).fetchall()]
            total = conn.execute(
                "SELECT COALESCE(SUM(amount),0) FROM fastcash_earnings"
            ).fetchone()[0]
        return {"earnings": rows, "total": round(total, 2)}
```

**Step 2: Wire into main.py**

Add to `backend/main.py` after the existing imports section (around line 65):
```python
from fastcash_routes import register_routes
```

Add after the `app = FastAPI(...)` and middleware setup (around line 100):
```python
register_routes(app)
```

**Step 3: Restart backend and test routes**
```bash
# Kill existing and restart
pkill -f "uvicorn main:app" 2>/dev/null; sleep 2
cd /Users/atlas/atlas-control-center/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/api/v1/fastcash/stats | python3 -m json.tool
```
Expected: JSON with `total_jobs`, `atlas_jobs`, `chris_jobs`, `total_earned`

**Step 4: Commit**
```bash
git add backend/fastcash_routes.py backend/main.py
git commit -m "feat(fastcash): FastAPI routes wired into main.py"
```

---

### Task 8: Frontend Dashboard

**Files:**
- Create: `frontend/src/app/fastcash/page.tsx`

**Step 1: Create the FastCash dashboard page**

Create `frontend/src/app/fastcash/page.tsx`:
```typescript
"use client";
import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000/api/v1/fastcash";

interface Job {
  id: number;
  title: string;
  company: string;
  source: string;
  url: string;
  pay_rate: string;
  score: number;
  tab: string;
  status: string;
  applied: number;
  description: string;
  start_date: string;
  payment_speed: string;
}

interface Stats {
  total_jobs: number;
  atlas_jobs: number;
  chris_jobs: number;
  applied: number;
  total_earned: number;
  tasks_ready: number;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-gray-500";
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
      {score.toFixed(1)}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    upwork: "bg-green-700",
    linkedin: "bg-blue-700",
    indeed: "bg-purple-700",
    remoteok: "bg-red-700",
    weworkremotely: "bg-orange-700",
  };
  return (
    <span className={`${colors[source] || "bg-gray-700"} text-white text-xs px-2 py-0.5 rounded`}>
      {source}
    </span>
  );
}

export default function FastCashPage() {
  const [activeTab, setActiveTab] = useState<"atlas" | "chris">("chris");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [proposal, setProposal] = useState("");
  const [generatingProposal, setGeneratingProposal] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/jobs/top?tab=${activeTab}&limit=20`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchStats();
  }, [fetchJobs, fetchStats]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch(`${API}/scrape`, { method: "POST" });
      setTimeout(() => {
        fetchJobs();
        fetchStats();
        setScraping(false);
      }, 5000);
    } catch (e) {
      setScraping(false);
    }
  };

  const handleApply = async (job: Job) => {
    setSelectedJob(job);
    setGeneratingProposal(true);
    setProposal("");
    try {
      const res = await fetch(`${API}/apply/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });
      const data = await res.json();
      setProposal(data.proposal || "");
      fetchJobs();
      fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingProposal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">⚡ FastCash</h1>
          <p className="text-gray-400 text-sm mt-1">
            Fastest path to income — automated and manual
          </p>
        </div>
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
        >
          {scraping ? "Scanning..." : "⟳ Scan Now"}
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Jobs", value: stats.total_jobs },
            { label: "Atlas Jobs", value: stats.atlas_jobs },
            { label: "Chris Jobs", value: stats.chris_jobs },
            { label: "Applied", value: stats.applied },
            { label: "Earned", value: `$${stats.total_earned.toFixed(2)}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-yellow-400">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("chris")}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "chris"
              ? "bg-yellow-500 text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          👤 Chris Works
        </button>
        <button
          onClick={() => setActiveTab("atlas")}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "atlas"
              ? "bg-purple-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          🤖 Atlas Works
        </button>
      </div>

      {/* Tab Description */}
      <p className="text-gray-400 text-sm mb-4">
        {activeTab === "chris"
          ? "High-value jobs matching your Emmy credentials. Atlas drafts the proposal — you click Apply."
          : "Jobs Atlas can complete autonomously using Whisper (transcription) and Claude (writing)."}
      </p>

      {/* Job List */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Scanning job boards...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No jobs yet. Hit <strong>Scan Now</strong> to fetch the latest.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`bg-gray-900 border rounded-lg p-4 ${
                job.applied ? "border-gray-700 opacity-60" : "border-gray-700 hover:border-yellow-600"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <ScoreBadge score={job.score} />
                    <SourceBadge source={job.source} />
                    {job.applied === 1 && (
                      <span className="text-xs text-green-400 font-medium">✓ Applied</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-white text-sm truncate">{job.title}</h3>
                  <p className="text-gray-400 text-xs">{job.company}</p>
                  {job.pay_rate && (
                    <p className="text-yellow-400 text-xs mt-1">{job.pay_rate}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1 line-clamp-2">{job.description}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded text-center"
                  >
                    View
                  </a>
                  {!job.applied && (
                    <button
                      onClick={() => handleApply(job)}
                      className={`text-xs px-3 py-1.5 rounded font-semibold ${
                        activeTab === "chris"
                          ? "bg-yellow-500 hover:bg-yellow-400 text-black"
                          : "bg-purple-600 hover:bg-purple-500 text-white"
                      }`}
                    >
                      {activeTab === "chris" ? "Apply" : "Queue"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proposal Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-yellow-400">
                  {activeTab === "chris" ? "AI-Drafted Proposal" : "Task Queued"}
                </h2>
                <p className="text-gray-400 text-sm">{selectedJob.title}</p>
              </div>
              <button
                onClick={() => { setSelectedJob(null); setProposal(""); }}
                className="text-gray-500 hover:text-white text-xl"
              >×</button>
            </div>
            {generatingProposal ? (
              <div className="text-center text-gray-400 py-8">
                ✍️ Writing your proposal...
              </div>
            ) : (
              <>
                <textarea
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg p-4 text-sm min-h-[300px] border border-gray-700 focus:outline-none focus:border-yellow-500"
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => navigator.clipboard.writeText(proposal)}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-2 rounded-lg text-sm"
                  >
                    Copy to Clipboard
                  </button>
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Open Job →
                  </a>
                  <button
                    onClick={() => { setSelectedJob(null); setProposal(""); }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Build and verify**
```bash
cd /Users/atlas/atlas-control-center/frontend
npm run build 2>&1 | tail -20
```
Expected: Build succeeds with `/fastcash` in route list.

**Step 3: Commit**
```bash
git add frontend/src/app/fastcash/
git commit -m "feat(fastcash): two-tab dashboard UI (Chris Works + Atlas Works)"
```

---

### Task 9: Wire Up Scheduler + Final Integration

**Files:**
- Modify: `backend/main.py` (add startup scrape)

**Step 1: Add scheduled scraping to startup**

In `backend/main.py`, find the existing `@app.on_event("startup")` block (around line 131) and add FastCash initialization:

```python
# Add to the startup event handler:
@app.on_event("startup")
async def startup_fastcash():
    """Initialize FastCash DB and schedule periodic scraping."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent / "fastcash"))
    from database import init_db as fastcash_init_db
    fastcash_init_db()
    print("[FastCash] Initialized.")

    async def scrape_loop():
        import asyncio
        from scraper import run_quick_scrape
        while True:
            try:
                await asyncio.sleep(7200)  # every 2 hours
                run_quick_scrape()
            except Exception as e:
                print(f"[FastCash] Scrape loop error: {e}")

    asyncio.create_task(scrape_loop())
```

**Step 2: Restart backend and run initial scrape**
```bash
pkill -f "uvicorn main:app" 2>/dev/null; sleep 2
cd /Users/atlas/atlas-control-center/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3

# Trigger initial scrape
curl -s -X POST "http://localhost:8000/api/v1/fastcash/scrape?quick=true"
sleep 8

# Check results
curl -s http://localhost:8000/api/v1/fastcash/stats | python3 -m json.tool
curl -s "http://localhost:8000/api/v1/fastcash/jobs/top?tab=chris&limit=5" | python3 -m json.tool
```

**Step 3: Rebuild frontend and verify full flow**
```bash
cd /Users/atlas/atlas-control-center/frontend
npm run build
# Restart frontend
pkill -f "npm start" 2>/dev/null; sleep 2
npm start -- --port 3000 &
sleep 4
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/fastcash
```
Expected: `200`

**Step 4: Final commit**
```bash
cd /Users/atlas/atlas-control-center
git add backend/main.py
git commit -m "feat(fastcash): startup scheduler + full integration complete"
```

---

## Quick Verification Checklist
- [ ] `GET /api/v1/fastcash/stats` returns valid JSON
- [ ] `POST /api/v1/fastcash/scrape` triggers background scrape
- [ ] `GET /api/v1/fastcash/jobs/top?tab=chris` returns scored jobs
- [ ] `POST /api/v1/fastcash/apply/:id` returns AI proposal
- [ ] `http://localhost:3000/fastcash` loads two-tab dashboard
- [ ] Tab toggle switches between Chris Works and Atlas Works
- [ ] Scan Now button triggers scrape
- [ ] Apply button opens proposal modal with copyable text
