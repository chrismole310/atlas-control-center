"""FastCash — SQLite database models and helpers."""
import sqlite3
import json
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent / "backend" / "trax.db"


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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

        CREATE TABLE IF NOT EXISTS market_demand (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            platform      TEXT,
            category      TEXT,
            service_type  TEXT,
            num_requests  INTEGER DEFAULT 0,
            avg_budget    REAL DEFAULT 0,
            min_budget    REAL DEFAULT 0,
            max_budget    REAL DEFAULT 0,
            avg_offers    INTEGER DEFAULT 0,
            week_start    TEXT,
            scraped_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS market_supply (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            platform           TEXT,
            category           TEXT,
            service_type       TEXT,
            num_sellers        INTEGER DEFAULT 0,
            avg_price          REAL DEFAULT 0,
            top_performer_rate REAL DEFAULT 0,
            competition_level  TEXT DEFAULT 'medium',
            week_start         TEXT,
            scraped_at         TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trending_skills (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_name        TEXT,
            category          TEXT DEFAULT 'video-production',
            mention_count     INTEGER DEFAULT 0,
            avg_pay_premium   REAL DEFAULT 0,
            growth_rate       REAL DEFAULT 0,
            demand_score      INTEGER DEFAULT 5,
            competition_score INTEGER DEFAULT 5,
            opportunity_score INTEGER DEFAULT 5,
            week_start        TEXT,
            scraped_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS top_performers (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            platform       TEXT,
            username       TEXT,
            category       TEXT,
            rate_per_hour  REAL DEFAULT 0,
            total_earned   REAL DEFAULT 0,
            jobs_completed INTEGER DEFAULT 0,
            success_rate   REAL DEFAULT 0,
            skills         TEXT DEFAULT '[]',
            scraped_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS market_opportunities (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            category         TEXT,
            service_type     TEXT,
            opportunity_type TEXT,
            description      TEXT,
            demand_score     INTEGER DEFAULT 5,
            competition_score INTEGER DEFAULT 5,
            pay_potential    REAL DEFAULT 0,
            barrier_to_entry TEXT DEFAULT 'medium',
            recommendation   TEXT,
            identified_at    TEXT DEFAULT (datetime('now'))
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
        cur = conn.execute("""
            INSERT OR IGNORE INTO fastcash_jobs
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
            json.dumps(job.get("skills", [])),
            job.get("description", "")[:2000],
            job.get("score", 0),
            job.get("tab", "chris"),
        ))
        return cur.rowcount == 1


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


def get_trending_skills(limit: int = 20) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM trending_skills ORDER BY opportunity_score DESC LIMIT ?",
            (limit,)
        ).fetchall()]


def get_market_opportunities(limit: int = 10) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM market_opportunities ORDER BY demand_score DESC LIMIT ?",
            (limit,)
        ).fetchall()]


def get_top_performers(category: str = None, limit: int = 20) -> list:
    with get_conn() as conn:
        q = "SELECT * FROM top_performers"
        params: list = []
        if category:
            q += " WHERE category = ?"
            params.append(category)
        q += " ORDER BY rate_per_hour DESC LIMIT ?"
        params.append(limit)
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def get_market_demand(category: str = None, limit: int = 20) -> list:
    with get_conn() as conn:
        q = "SELECT * FROM market_demand"
        params: list = []
        if category:
            q += " WHERE category = ?"
            params.append(category)
        q += " ORDER BY num_requests DESC LIMIT ?"
        params.append(limit)
        return [dict(r) for r in conn.execute(q, params).fetchall()]
