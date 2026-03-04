"""Atlas Publishing Engine — SQLite database."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

_DB = Path(__file__).parent / "publishing.db"


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(_DB))
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
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS pub_books (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            author        TEXT DEFAULT 'Brooks Hammer',
            series        TEXT,
            book_number   INTEGER,
            genre         TEXT DEFAULT 'Tech Thriller',
            word_count    INTEGER,
            slug          TEXT UNIQUE,
            manuscript_path TEXT,
            cover_art_path  TEXT,
            blurb           TEXT,
            keywords        TEXT DEFAULT '[]',
            status          TEXT DEFAULT 'uploaded',
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pub_ebook_versions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id     INTEGER REFERENCES pub_books(id),
            format      TEXT,
            file_path   TEXT,
            file_size   INTEGER,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pub_audiobook_versions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id          INTEGER REFERENCES pub_books(id),
            voice            TEXT DEFAULT 'lessac',
            duration_minutes INTEGER,
            file_path        TEXT,
            file_size        INTEGER,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pub_publications (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id      INTEGER REFERENCES pub_books(id),
            platform     TEXT,
            format       TEXT,
            status       TEXT DEFAULT 'pending',
            store_url    TEXT,
            price        REAL,
            published_at TEXT
        );

        CREATE TABLE IF NOT EXISTS pub_sales (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            publication_id INTEGER REFERENCES pub_publications(id),
            date           TEXT,
            units_sold     INTEGER DEFAULT 0,
            revenue        REAL DEFAULT 0,
            royalty        REAL DEFAULT 0
        );
        """)


def get_all_books() -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM pub_books ORDER BY created_at DESC"
        ).fetchall()]


def get_book(book_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM pub_books WHERE id=?", (book_id,)
        ).fetchone()
        return dict(row) if row else None


def get_book_ebooks(book_id: int) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM pub_ebook_versions WHERE book_id=?", (book_id,)
        ).fetchall()]


def get_book_audiobooks(book_id: int) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM pub_audiobook_versions WHERE book_id=?", (book_id,)
        ).fetchall()]


def get_book_publications(book_id: int) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM pub_publications WHERE book_id=?", (book_id,)
        ).fetchall()]


def get_stats() -> dict:
    with get_conn() as conn:
        total_books = conn.execute("SELECT COUNT(*) FROM pub_books").fetchone()[0]
        formatted = conn.execute(
            "SELECT COUNT(*) FROM pub_books WHERE status IN ('formatted','audio_ready','published')"
        ).fetchone()[0]
        audio_ready = conn.execute(
            "SELECT COUNT(*) FROM pub_books WHERE status IN ('audio_ready','published')"
        ).fetchone()[0]
        published = conn.execute(
            "SELECT COUNT(*) FROM pub_books WHERE status='published'"
        ).fetchone()[0]
        total_revenue = conn.execute(
            "SELECT COALESCE(SUM(revenue),0) FROM pub_sales"
        ).fetchone()[0]
    return {
        "total_books": total_books,
        "formatted": formatted,
        "audio_ready": audio_ready,
        "published": published,
        "total_revenue": round(float(total_revenue), 2),
    }
