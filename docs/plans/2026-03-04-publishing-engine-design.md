# Atlas Publishing Engine — Design Document

**Date:** 2026-03-04
**Portal:** #25
**Goal:** End-to-end ebook and audiobook publishing automation for Brooks Hammer novels (6 books initially, 20 total).

---

## Decisions Made

| Question | Answer |
|---|---|
| Manuscript format | RTF files (Pandoc handles natively) |
| Manuscript location | User drops files in `publishing/manuscripts/` |
| Distribution strategy | Gumroad now (direct sales, 90% margin) + export package for manual KDP/D2D uploads |
| Audiobook voice | Single narrator, Piper TTS (free, local) — en_US-lessac-medium (female) |
| Platform APIs | KDP/D2D/Findaway have no accessible APIs yet; build export workflow first, add API integrations as accounts are approved |

---

## Architecture

New Python package `publishing/` wired into the existing FastAPI backend, following the same pattern as `fastcash/`. New frontend page at `/publishing`.

```
atlas-control-center/
  publishing/
    __init__.py
    database.py          -- SQLite tables + helpers
    formatter.py         -- RTF → EPUB/MOBI/PDF via pandoc + calibre
    audiobook.py         -- Piper TTS → chapter WAVs → M4B via ffmpeg
    gumroad.py           -- Gumroad listing automation
    scanner.py           -- Watches manuscripts/ folder for new RTF files
  publishing/manuscripts/  -- Drop RTF files here
  publishing/output/       -- Generated files per book
  publishing/voices/       -- Piper TTS voice model files
  backend/publishing_routes.py  -- FastAPI routes
  frontend/app/publishing/page.tsx  -- Dashboard UI
```

---

## Data Flow

```
RTF dropped in publishing/manuscripts/
  → SCAN: detect file, create book record
  → FORMAT: pandoc RTF→EPUB+PDF, calibre EPUB→MOBI, embed cover art
  → AUDIO: Piper TTS per chapter, ffmpeg assembles M4B with chapter markers
  → PUBLISH: Gumroad ebook bundle ($4.99) + audiobook ($14.99)
  → EXPORT: zip all formats + metadata sheet for manual platform uploads
```

**Output per book:**
```
publishing/output/{book-slug}/
  book.epub
  book.mobi
  book.pdf
  audiobook.m4b
  cover.jpg
  metadata.json
  platform-export.zip
```

---

## Database Schema (SQLite)

```sql
CREATE TABLE pub_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT 'Brooks Hammer',
    series TEXT,
    book_number INTEGER,
    genre TEXT DEFAULT 'Tech Thriller',
    word_count INTEGER,
    slug TEXT UNIQUE,
    manuscript_path TEXT,
    cover_art_path TEXT,
    blurb TEXT,
    keywords TEXT DEFAULT '[]',
    status TEXT DEFAULT 'uploaded',
    -- status: uploaded | formatting | formatted | generating_audio
    --         | audio_ready | publishing | published
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE pub_ebook_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES pub_books(id),
    format TEXT,  -- epub | mobi | pdf
    file_path TEXT,
    file_size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE pub_audiobook_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES pub_books(id),
    voice TEXT DEFAULT 'lessac',
    duration_minutes INTEGER,
    file_path TEXT,
    file_size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE pub_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES pub_books(id),
    platform TEXT,  -- gumroad | kdp | d2d | google | kobo | findaway
    format TEXT,    -- ebook | audiobook
    status TEXT DEFAULT 'pending',  -- pending | live | rejected
    store_url TEXT,
    price REAL,
    published_at TEXT
);

CREATE TABLE pub_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER REFERENCES pub_publications(id),
    date TEXT,
    units_sold INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0,
    royalty REAL DEFAULT 0
);
```

---

## Backend Routes

```
GET  /api/v1/publishing/books              -- list all books with status
POST /api/v1/publishing/books              -- register new book (from scan)
GET  /api/v1/publishing/books/{id}         -- book detail
POST /api/v1/publishing/books/{id}/format  -- trigger ebook formatting (background)
POST /api/v1/publishing/books/{id}/audio   -- trigger audiobook generation (background)
POST /api/v1/publishing/books/{id}/publish -- publish to Gumroad
POST /api/v1/publishing/books/{id}/export  -- generate platform-export.zip
POST /api/v1/publishing/scan               -- scan manuscripts/ folder for new RTF files
GET  /api/v1/publishing/stats              -- total books, formats, publications, revenue
POST /api/v1/publishing/process-all        -- format+audio+publish all ready books
```

---

## Dashboard UI (three tabs)

### 📚 Books Tab
- Card per book: cover thumbnail, title, word count, status badge
- Status pipeline visual: `Uploaded → Formatted → Audio Ready → Published`
- Per-book action buttons: `Format Ebook` | `Generate Audiobook` | `Publish to Gumroad` | `Export Package`
- Live progress indicator for in-progress jobs
- "📁 Scan for New Books" button — scans manuscripts/ folder

### 💰 Sales Tab
- Total revenue (ebook vs audiobook)
- Per-book revenue breakdown
- Platform breakdown
- Pulls from Gumroad API + manual pub_sales entries

### ⚙️ Settings Tab
- Default ebook price ($4.99)
- Default audiobook price ($14.99)
- Author bio (used in back matter + store descriptions)
- Narrator voice selection
- Gumroad API key

### Header
- "🚀 Process All Books" button — runs full pipeline on all books with `formatted` status

---

## System Dependencies

Install once:
```bash
brew install pandoc          # RTF/DOCX → EPUB/PDF conversion
brew install --cask calibre  # EPUB → MOBI conversion (ebook-convert CLI)
brew install ffmpeg           # Audio assembly → M4B
pip install piper-tts         # TTS engine
pip install Pillow            # Cover art processing
pip install python-slugify    # Book slug generation
```

Voice model download (one-time):
```bash
mkdir -p publishing/voices
cd publishing/voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

---

## Phase Breakdown for Implementation Plan

1. **Dependencies + DB** — Install tools, create `publishing/` package, SQLite tables
2. **Formatter** — RTF → EPUB/MOBI/PDF pipeline with chapter detection and cover embedding
3. **Audiobook Generator** — Piper TTS chapter splitting → WAV → M4B assembly
4. **Gumroad Integration** — Auto-list ebook bundle and audiobook with Claude-generated description
5. **Export Package** — Zip all formats + metadata.json for manual platform uploads
6. **API Routes** — All 9 FastAPI endpoints wired into main.py
7. **Frontend Dashboard** — Three-tab UI with status pipeline, action buttons, progress tracking
