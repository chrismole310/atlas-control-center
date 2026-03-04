# Atlas Publishing Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build Portal #25 — end-to-end ebook and audiobook publishing automation for Brooks Hammer novels (RTF input → EPUB/MOBI/PDF + M4B audiobook → Gumroad listing + export package for manual platform uploads).

**Architecture:** New Python package `publishing/` following the same pattern as `fastcash/` — SQLite database, formatter module, audiobook module, Gumroad module, and FastAPI routes registered in `backend/main.py`. New frontend page at `frontend/app/publishing/page.tsx`.

**Tech Stack:** Python/FastAPI/SQLite (backend), Next.js 14/TypeScript/Tailwind (frontend), pandoc (RTF→EPUB/PDF), calibre/ebook-convert (EPUB→MOBI), piper-tts (TTS audio), ffmpeg (WAV→M4B), Pillow (cover art), python-slugify (slugs), Anthropic Claude (store descriptions).

---

### Task 1: System Dependencies + Publishing Package Foundation

**Files:**
- Create: `publishing/__init__.py`
- Create: `publishing/database.py`
- Create: `publishing/manuscripts/.gitkeep`
- Create: `publishing/output/.gitkeep`
- Create: `publishing/voices/.gitkeep`
- Modify: `backend/requirements.txt`

**Step 1: Install system tools**

```bash
brew install pandoc
brew install --cask calibre
brew install ffmpeg
```

Verify:
```bash
pandoc --version | head -1
ebook-convert --version 2>&1 | head -1
ffmpeg -version 2>&1 | head -1
```
Expected: version strings printed, no errors.

**Step 2: Install Python dependencies**

```bash
cd /Users/atlas/atlas-control-center/backend
source venv/bin/activate
pip install piper-tts Pillow python-slugify requests
```

Verify:
```bash
python3 -c "import piper; print('piper ok')"
python3 -c "from PIL import Image; print('pillow ok')"
python3 -c "from slugify import slugify; print(slugify('Hello World'))"
```
Expected: `piper ok`, `pillow ok`, `hello-world`

**Step 3: Download Piper voice model**

```bash
mkdir -p /Users/atlas/atlas-control-center/publishing/voices
cd /Users/atlas/atlas-control-center/publishing/voices
curl -L -o en_US-lessac-medium.onnx \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
curl -L -o en_US-lessac-medium.onnx.json \
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
ls -lh /Users/atlas/atlas-control-center/publishing/voices/
```
Expected: two files, the .onnx should be ~60-70MB.

**Step 4: Create directory structure**

```bash
mkdir -p /Users/atlas/atlas-control-center/publishing/manuscripts
mkdir -p /Users/atlas/atlas-control-center/publishing/output
touch /Users/atlas/atlas-control-center/publishing/__init__.py
touch /Users/atlas/atlas-control-center/publishing/manuscripts/.gitkeep
touch /Users/atlas/atlas-control-center/publishing/output/.gitkeep
```

**Step 5: Create `publishing/database.py`**

Create `/Users/atlas/atlas-control-center/publishing/database.py`:

```python
"""Atlas Publishing Engine — SQLite database."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

_DB = Path(__file__).parent / "publishing.db"


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(_DB))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
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


def get_book(book_id: int) -> dict | None:
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
```

**Step 6: Verify DB initializes**

```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, '.')
from publishing.database import init_db, get_stats
init_db()
print('DB ok:', get_stats())
"
```
Expected: `DB ok: {'total_books': 0, 'formatted': 0, 'audio_ready': 0, 'published': 0, 'total_revenue': 0.0}`

**Step 7: Update requirements.txt**

Add to `/Users/atlas/atlas-control-center/backend/requirements.txt`:
```
Pillow
python-slugify
requests
piper-tts
```

**Step 8: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add publishing/ backend/requirements.txt
git commit -m "feat(publishing): package foundation, DB schema, dependencies"
```

---

### Task 2: RTF Formatter (EPUB + MOBI + PDF)

**Files:**
- Create: `publishing/formatter.py`

**Step 1: Create `publishing/formatter.py`**

Create `/Users/atlas/atlas-control-center/publishing/formatter.py`:

```python
"""Atlas Publishing Engine — RTF → EPUB/MOBI/PDF formatter using pandoc + calibre."""
import re
import shutil
import subprocess
from pathlib import Path

from publishing.database import get_conn, init_db

_REPO = Path(__file__).parent.parent
_OUTPUT = _REPO / "publishing" / "output"


def _run(cmd: list, cwd: Path = None) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result


def _detect_chapters(md_text: str) -> list[str]:
    """Split markdown text into chapters by heading markers."""
    pattern = re.compile(r'^#{1,2}\s+(?:Chapter\s+\w+|CHAPTER\s+\w+|\w+\s+\w+)', re.MULTILINE)
    positions = [m.start() for m in pattern.finditer(md_text)]
    if not positions:
        return [md_text]
    chapters = []
    for i, pos in enumerate(positions):
        end = positions[i + 1] if i + 1 < len(positions) else len(md_text)
        chapters.append(md_text[pos:end].strip())
    return chapters


def _word_count(text: str) -> int:
    return len(re.findall(r'\w+', text))


def format_book(book_id: int) -> dict:
    """
    Convert RTF manuscript to EPUB, MOBI, and PDF.
    Returns dict with file paths or raises on error.
    """
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)

        conn.execute("UPDATE pub_books SET status='formatting' WHERE id=?", (book_id,))

    manuscript = Path(book["manuscript_path"])
    if not manuscript.exists():
        raise FileNotFoundError(f"Manuscript not found: {manuscript}")

    # Output directory for this book
    out_dir = _OUTPUT / book["slug"]
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Publishing] Formatting '{book['title']}'...")

    # Step 1: RTF → clean Markdown
    md_path = out_dir / "manuscript.md"
    _run(["pandoc", str(manuscript), "-o", str(md_path), "--wrap=none"])
    md_text = md_path.read_text(encoding="utf-8", errors="replace")

    # Update word count
    wc = _word_count(md_text)
    with get_conn() as conn:
        conn.execute("UPDATE pub_books SET word_count=? WHERE id=?", (wc, book_id))

    # Build pandoc metadata args
    meta_args = [
        "--metadata", f"title={book['title']}",
        "--metadata", f"author={book['author']}",
        "--metadata", f"lang=en-US",
    ]
    if book.get("blurb"):
        meta_args += ["--metadata", f"description={book['blurb'][:500]}"]

    cover_args = []
    if book.get("cover_art_path") and Path(book["cover_art_path"]).exists():
        cover_args = ["--epub-cover-image", book["cover_art_path"]]

    # Step 2: Markdown → EPUB
    epub_path = out_dir / "book.epub"
    _run(["pandoc", str(md_path), "-o", str(epub_path),
          "--toc", "--toc-depth=2"] + meta_args + cover_args)
    print(f"[Publishing] EPUB created: {epub_path}")

    # Step 3: EPUB → MOBI (via calibre)
    mobi_path = out_dir / "book.mobi"
    try:
        _run(["ebook-convert", str(epub_path), str(mobi_path)])
        print(f"[Publishing] MOBI created: {mobi_path}")
    except RuntimeError as e:
        print(f"[Publishing] MOBI conversion failed (calibre required): {e}")
        mobi_path = None

    # Step 4: Markdown → PDF
    pdf_path = out_dir / "book.pdf"
    try:
        _run(["pandoc", str(md_path), "-o", str(pdf_path),
              "--pdf-engine=wkhtmltopdf"] + meta_args)
    except RuntimeError:
        # wkhtmltopdf not available — try without engine flag
        try:
            _run(["pandoc", str(md_path), "-o", str(pdf_path)] + meta_args)
        except RuntimeError as e:
            print(f"[Publishing] PDF conversion failed: {e}")
            pdf_path = None

    if pdf_path and pdf_path.exists():
        print(f"[Publishing] PDF created: {pdf_path}")

    # Save ebook version records
    with get_conn() as conn:
        for fmt, path in [("epub", epub_path), ("mobi", mobi_path), ("pdf", pdf_path)]:
            if path and Path(path).exists():
                existing = conn.execute(
                    "SELECT id FROM pub_ebook_versions WHERE book_id=? AND format=?",
                    (book_id, fmt)
                ).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE pub_ebook_versions SET file_path=?, file_size=? WHERE id=?",
                        (str(path), Path(path).stat().st_size, existing["id"])
                    )
                else:
                    conn.execute(
                        "INSERT INTO pub_ebook_versions (book_id, format, file_path, file_size) VALUES (?,?,?,?)",
                        (book_id, fmt, str(path), Path(path).stat().st_size)
                    )

        conn.execute("UPDATE pub_books SET status='formatted' WHERE id=?", (book_id,))

    return {
        "epub": str(epub_path) if epub_path.exists() else None,
        "mobi": str(mobi_path) if mobi_path and mobi_path.exists() else None,
        "pdf": str(pdf_path) if pdf_path and pdf_path.exists() else None,
        "word_count": wc,
    }
```

**Step 2: Drop a test RTF into manuscripts/ and run formatter**

```bash
# First place one of your RTF manuscripts in the manuscripts folder:
# cp /path/to/your/book.rtf /Users/atlas/atlas-control-center/publishing/manuscripts/

# Then register it and test formatting:
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, '.')
from publishing.database import init_db, get_conn

init_db()

# Register a test book manually
with get_conn() as conn:
    conn.execute('''
        INSERT OR IGNORE INTO pub_books (title, slug, manuscript_path)
        VALUES (?, ?, ?)
    ''', ('Test Book', 'test-book',
          'publishing/manuscripts/test-book.rtf'))
    book_id = conn.execute('SELECT id FROM pub_books WHERE slug=?', ('test-book',)).fetchone()[0]

from publishing.formatter import format_book
result = format_book(book_id)
print('Formatted:', result)
"
```
Expected: `Formatted: {'epub': '.../book.epub', 'mobi': '.../book.mobi', 'pdf': '...', 'word_count': NNNN}`

**Step 3: Verify output files exist**

```bash
ls -lh /Users/atlas/atlas-control-center/publishing/output/test-book/
```
Expected: `book.epub`, `book.mobi`, `book.pdf`, `manuscript.md` all present.

**Step 4: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add publishing/formatter.py
git commit -m "feat(publishing): RTF→EPUB/MOBI/PDF formatter via pandoc + calibre"
```

---

### Task 3: Audiobook Generator (Piper TTS → M4B)

**Files:**
- Create: `publishing/audiobook.py`

**Step 1: Create `publishing/audiobook.py`**

Create `/Users/atlas/atlas-control-center/publishing/audiobook.py`:

```python
"""Atlas Publishing Engine — Piper TTS audiobook generator → M4B."""
import json
import re
import subprocess
import wave
from pathlib import Path

from publishing.database import get_conn, init_db

_REPO = Path(__file__).parent.parent
_VOICES_DIR = _REPO / "publishing" / "voices"
_OUTPUT = _REPO / "publishing" / "output"

DEFAULT_VOICE = "en_US-lessac-medium"


def _detect_chapters_from_text(text: str) -> list[tuple[str, str]]:
    """
    Split plain text into (chapter_title, chapter_text) pairs.
    Detects patterns: 'Chapter 1', 'CHAPTER ONE', 'Part I', etc.
    Falls back to splitting into equal chunks if no chapters found.
    """
    pattern = re.compile(
        r'^((?:Chapter|CHAPTER|Part|PART)\s+[\w\s]+|[A-Z][A-Z\s]{3,30})$',
        re.MULTILINE
    )
    matches = list(pattern.finditer(text))

    if not matches:
        # No chapter headings — split into 5000-word chunks
        words = text.split()
        chunk_size = 5000
        chunks = []
        for i in range(0, len(words), chunk_size):
            chunk_text = ' '.join(words[i:i + chunk_size])
            chunks.append((f"Chapter {i // chunk_size + 1}", chunk_text))
        return chunks

    chapters = []
    for i, match in enumerate(matches):
        title = match.group(0).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if body:
            chapters.append((title, body))
    return chapters


def _text_to_wav(text: str, output_path: Path, voice: str = DEFAULT_VOICE) -> None:
    """Convert text to WAV using Piper TTS."""
    model_path = _VOICES_DIR / f"{voice}.onnx"
    if not model_path.exists():
        raise FileNotFoundError(f"Voice model not found: {model_path}")

    try:
        from piper import PiperVoice
        piper_voice = PiperVoice.load(str(model_path))
        with wave.open(str(output_path), "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(piper_voice.config.sample_rate)
            piper_voice.synthesize(text, wav_file)
    except ImportError:
        raise RuntimeError("piper-tts not installed: pip install piper-tts")


def _wav_to_m4b(wav_files: list[Path], output_path: Path,
                title: str, author: str, cover_path: Path = None,
                chapter_titles: list[str] = None) -> None:
    """Assemble multiple WAV files into a single M4B with chapter markers."""
    # Step 1: Write concat file
    concat_file = output_path.parent / "concat.txt"
    with open(concat_file, "w") as f:
        for wav in wav_files:
            f.write(f"file '{wav.resolve()}'\n")

    # Step 2: Concatenate all WAVs
    combined_wav = output_path.parent / "combined.wav"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_file), "-c", "copy", str(combined_wav)
    ], check=True, capture_output=True)

    # Step 3: Get durations for chapter markers
    ffmpeg_meta = output_path.parent / "chapters.txt"
    chapter_markers = [";FFMETADATA1\n", f"title={title}\n", f"artist={author}\n\n"]

    if chapter_titles and len(chapter_titles) == len(wav_files):
        # Get duration of each WAV for accurate chapter markers
        cursor_ms = 0
        for i, (wav, ch_title) in enumerate(zip(wav_files, chapter_titles)):
            result = subprocess.run([
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", str(wav)
            ], capture_output=True, text=True)
            info = json.loads(result.stdout)
            duration_s = float(info["streams"][0]["duration"])
            duration_ms = int(duration_s * 1000)
            chapter_markers.append("[CHAPTER]\n")
            chapter_markers.append("TIMEBASE=1/1000\n")
            chapter_markers.append(f"START={cursor_ms}\n")
            chapter_markers.append(f"END={cursor_ms + duration_ms}\n")
            chapter_markers.append(f"title={ch_title}\n\n")
            cursor_ms += duration_ms

    with open(ffmpeg_meta, "w") as f:
        f.writelines(chapter_markers)

    # Step 4: Build ffmpeg command for M4B
    cmd = [
        "ffmpeg", "-y",
        "-i", str(combined_wav),
        "-i", str(ffmpeg_meta),
        "-map_metadata", "1",
    ]
    if cover_path and cover_path.exists():
        cmd += ["-i", str(cover_path), "-map", "0:a", "-map", "2:v",
                "-c:v", "copy", "-disposition:v", "attached_pic"]
    else:
        cmd += ["-map", "0:a"]

    cmd += [
        "-c:a", "aac", "-b:a", "64k", "-ar", "44100",
        "-metadata", f"title={title}",
        "-metadata", f"artist={author}",
        "-metadata", f"album={title}",
        "-metadata", "genre=Audiobook",
        str(output_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    # Cleanup temp files
    concat_file.unlink(missing_ok=True)
    combined_wav.unlink(missing_ok=True)
    ffmpeg_meta.unlink(missing_ok=True)


def generate_audiobook(book_id: int, voice: str = DEFAULT_VOICE) -> dict:
    """
    Generate M4B audiobook from manuscript text using Piper TTS.
    Returns dict with file path and duration, or raises on error.
    """
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)
        conn.execute("UPDATE pub_books SET status='generating_audio' WHERE id=?", (book_id,))

    manuscript = Path(book["manuscript_path"])
    if not manuscript.exists():
        raise FileNotFoundError(f"Manuscript not found: {manuscript}")

    out_dir = _OUTPUT / book["slug"]
    out_dir.mkdir(parents=True, exist_ok=True)
    audio_dir = out_dir / "audio_chapters"
    audio_dir.mkdir(exist_ok=True)

    print(f"[Publishing] Generating audiobook for '{book['title']}'...")

    # Extract plain text from manuscript (via pandoc)
    txt_path = out_dir / "manuscript.txt"
    subprocess.run([
        "pandoc", str(manuscript), "-o", str(txt_path),
        "--to", "plain", "--wrap=none"
    ], check=True, capture_output=True)
    text = txt_path.read_text(encoding="utf-8", errors="replace")

    # Detect chapters
    chapters = _detect_chapters_from_text(text)
    print(f"[Publishing] Found {len(chapters)} chapters")

    # Generate audio per chapter
    wav_files = []
    chapter_titles = []
    for i, (ch_title, ch_text) in enumerate(chapters):
        wav_path = audio_dir / f"chapter_{i+1:03d}.wav"
        print(f"[Publishing] TTS chapter {i+1}/{len(chapters)}: {ch_title[:40]}")
        _text_to_wav(ch_text, wav_path, voice=voice)
        wav_files.append(wav_path)
        chapter_titles.append(ch_title)

    # Assemble M4B
    m4b_path = out_dir / "audiobook.m4b"
    cover_path = Path(book["cover_art_path"]) if book.get("cover_art_path") else None
    _wav_to_m4b(wav_files, m4b_path, book["title"], book["author"],
                cover_path=cover_path, chapter_titles=chapter_titles)

    # Get duration
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-print_format", "json", str(m4b_path)
    ], capture_output=True, text=True)
    duration_s = float(json.loads(result.stdout)["format"]["duration"])
    duration_min = int(duration_s / 60)

    file_size = m4b_path.stat().st_size

    with get_conn() as conn:
        conn.execute(
            "DELETE FROM pub_audiobook_versions WHERE book_id=?", (book_id,)
        )
        conn.execute(
            "INSERT INTO pub_audiobook_versions (book_id, voice, duration_minutes, file_path, file_size) VALUES (?,?,?,?,?)",
            (book_id, voice, duration_min, str(m4b_path), file_size)
        )
        conn.execute("UPDATE pub_books SET status='audio_ready' WHERE id=?", (book_id,))

    print(f"[Publishing] Audiobook complete: {m4b_path} ({duration_min} min)")
    return {"m4b": str(m4b_path), "duration_minutes": duration_min, "file_size": file_size}
```

**Step 2: Test with a short text sample (not a full book — TTS is slow)**

```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, '.')
from publishing.audiobook import _text_to_wav, _detect_chapters_from_text
from pathlib import Path
import wave

# Test chapter detection
sample = '''Chapter 1
This is the first chapter of the book. It has some content here.

Chapter 2
This is the second chapter with more content.'''

chapters = _detect_chapters_from_text(sample)
print('Chapters detected:', [(t, len(body)) for t, body in chapters])

# Test TTS with a short sample
output = Path('/tmp/test_tts.wav')
_text_to_wav('Hello, this is a test of the Atlas Publishing Engine audiobook system.', output)
with wave.open(str(output)) as w:
    duration = w.getnframes() / w.getframerate()
    print(f'WAV generated: {output}, duration: {duration:.1f}s')
"
```
Expected: chapters detected, WAV file created with ~2-3 second duration.

**Step 3: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add publishing/audiobook.py
git commit -m "feat(publishing): Piper TTS audiobook generator, M4B assembly with chapter markers"
```

---

### Task 4: Gumroad Publisher + Claude Descriptions

**Files:**
- Create: `publishing/gumroad.py`

**Step 1: Create `publishing/gumroad.py`**

Create `/Users/atlas/atlas-control-center/publishing/gumroad.py`:

```python
"""Atlas Publishing Engine — Gumroad listing automation."""
import os
import zipfile
from pathlib import Path

import requests

from publishing.database import get_conn, init_db

_REPO = Path(__file__).parent.parent
_OUTPUT = _REPO / "publishing" / "output"
_BASE_URL = "https://api.gumroad.com/v2"


def _token() -> str:
    return os.getenv("GUMROAD_ACCESS_TOKEN", "")


def _gumroad_post(endpoint: str, data: dict) -> dict:
    r = requests.post(
        f"{_BASE_URL}/{endpoint}",
        params={"access_token": _token()},
        data=data,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def _gumroad_upload_file(product_id: str, file_path: Path, mime: str = "application/octet-stream") -> bool:
    with open(file_path, "rb") as f:
        r = requests.put(
            f"{_BASE_URL}/products/{product_id}/files",
            params={"access_token": _token()},
            files={"file": (file_path.name, f, mime)},
            timeout=300,
        )
    r.raise_for_status()
    return True


def _generate_description(book: dict) -> str:
    """Use Claude to write a Gumroad store description from the book blurb."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or not book.get("blurb"):
        return book.get("blurb") or f"{book['title']} by {book['author']}."

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": f"""Write a compelling Gumroad product description for this tech thriller novel.

Title: {book['title']}
Author: {book['author']}
Genre: {book.get('genre', 'Tech Thriller')}
Blurb: {book['blurb']}

Write 3-4 punchy paragraphs. Hook the reader immediately. End with a clear call to action.
Keep it under 350 words. No markdown headers."""}],
        )
        return msg.content[0].text
    except Exception as e:
        print(f"[Publishing] Claude description failed: {e}")
        return book.get("blurb", "")


def _make_ebook_bundle(book: dict, out_dir: Path) -> Path | None:
    """Zip EPUB + MOBI + PDF into a single bundle for Gumroad."""
    bundle_path = out_dir / "ebook-bundle.zip"
    formats_added = 0
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fmt in ["book.epub", "book.mobi", "book.pdf"]:
            f = out_dir / fmt
            if f.exists():
                zf.write(f, fmt)
                formats_added += 1
    if formats_added == 0:
        bundle_path.unlink(missing_ok=True)
        return None
    return bundle_path


def publish_ebook_to_gumroad(book_id: int, price: float = 4.99) -> dict:
    """Create Gumroad product for ebook bundle and upload the zip."""
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)

        # Check if already published
        existing = conn.execute(
            "SELECT * FROM pub_publications WHERE book_id=? AND platform='gumroad' AND format='ebook'",
            (book_id,)
        ).fetchone()
        if existing and existing["status"] == "live":
            return {"already_published": True, "store_url": existing["store_url"]}

    out_dir = _OUTPUT / book["slug"]
    description = _generate_description(book)
    bundle_path = _make_ebook_bundle(book, out_dir)

    if not bundle_path:
        raise FileNotFoundError("No ebook files found. Run format_book first.")

    if not _token():
        # Mock response for testing without Gumroad credentials
        print("[Publishing] No GUMROAD_ACCESS_TOKEN — mock publish")
        store_url = f"https://gumroad.com/l/mock-{book['slug']}"
    else:
        product = _gumroad_post("products", {
            "name": f"{book['title']} — Ebook Bundle (EPUB + MOBI + PDF)",
            "description": description,
            "price": int(price * 100),
            "published": True,
            "require_shipping": False,
        })
        product_id = product["product"]["id"]
        store_url = product["product"].get("short_url", f"https://gumroad.com/l/{product_id}")
        _gumroad_upload_file(product_id, bundle_path, "application/zip")
        print(f"[Publishing] Ebook listed on Gumroad: {store_url}")

    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO pub_publications (book_id, platform, format, status, store_url, price, published_at) VALUES (?,?,?,?,?,?,datetime('now'))",
            (book_id, "gumroad", "ebook", "live", store_url, price)
        )
        conn.execute("UPDATE pub_books SET status='published' WHERE id=?", (book_id,))

    return {"store_url": store_url, "price": price, "bundle": str(bundle_path)}


def publish_audiobook_to_gumroad(book_id: int, price: float = 14.99) -> dict:
    """Create Gumroad product for the M4B audiobook and upload it."""
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)

        existing = conn.execute(
            "SELECT * FROM pub_publications WHERE book_id=? AND platform='gumroad' AND format='audiobook'",
            (book_id,)
        ).fetchone()
        if existing and existing["status"] == "live":
            return {"already_published": True, "store_url": existing["store_url"]}

    m4b_path = _OUTPUT / book["slug"] / "audiobook.m4b"
    if not m4b_path.exists():
        raise FileNotFoundError("Audiobook M4B not found. Run generate_audiobook first.")

    audiobook_entry = None
    with get_conn() as conn:
        audiobook_entry = conn.execute(
            "SELECT duration_minutes FROM pub_audiobook_versions WHERE book_id=?", (book_id,)
        ).fetchone()

    duration_str = ""
    if audiobook_entry:
        hrs = audiobook_entry["duration_minutes"] // 60
        mins = audiobook_entry["duration_minutes"] % 60
        duration_str = f" | Runtime: {hrs}h {mins}m"

    description = _generate_description(book)
    description += f"\n\n**Format:** M4B audiobook (compatible with all audiobook players){duration_str}"

    if not _token():
        print("[Publishing] No GUMROAD_ACCESS_TOKEN — mock publish")
        store_url = f"https://gumroad.com/l/mock-{book['slug']}-audio"
    else:
        product = _gumroad_post("products", {
            "name": f"{book['title']} — Audiobook (M4B)",
            "description": description,
            "price": int(price * 100),
            "published": True,
            "require_shipping": False,
        })
        product_id = product["product"]["id"]
        store_url = product["product"].get("short_url", f"https://gumroad.com/l/{product_id}")
        _gumroad_upload_file(product_id, m4b_path, "audio/x-m4b")
        print(f"[Publishing] Audiobook listed on Gumroad: {store_url}")

    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO pub_publications (book_id, platform, format, status, store_url, price, published_at) VALUES (?,?,?,?,?,?,datetime('now'))",
            (book_id, "gumroad", "audiobook", "live", store_url, price)
        )

    return {"store_url": store_url, "price": price}
```

**Step 2: Verify Gumroad module imports cleanly**

```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, '.')
from publishing.gumroad import _generate_description, _make_ebook_bundle
print('Gumroad module ok')
"
```
Expected: `Gumroad module ok`

**Step 3: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add publishing/gumroad.py
git commit -m "feat(publishing): Gumroad publisher with Claude-generated descriptions"
```

---

### Task 5: Scanner + Export Package

**Files:**
- Create: `publishing/scanner.py`
- Create: `publishing/exporter.py`

**Step 1: Create `publishing/scanner.py`**

Create `/Users/atlas/atlas-control-center/publishing/scanner.py`:

```python
"""Atlas Publishing Engine — Scans manuscripts/ folder for new RTF files."""
import re
from pathlib import Path

from slugify import slugify

from publishing.database import get_conn, init_db

_MANUSCRIPTS = Path(__file__).parent / "manuscripts"


def _title_from_filename(filename: str) -> str:
    """Convert filename like 'the-iron-protocol.rtf' to 'The Iron Protocol'."""
    name = Path(filename).stem
    name = re.sub(r'[-_]', ' ', name)
    return name.title()


def scan_manuscripts() -> list[dict]:
    """
    Scan publishing/manuscripts/ for RTF files not yet in the database.
    Creates a pub_books record for each new file found.
    Returns list of newly registered books.
    """
    init_db()
    _MANUSCRIPTS.mkdir(exist_ok=True)

    rtf_files = list(_MANUSCRIPTS.glob("*.rtf")) + list(_MANUSCRIPTS.glob("*.RTF"))
    if not rtf_files:
        print("[Publishing] No RTF files found in manuscripts/")
        return []

    new_books = []
    with get_conn() as conn:
        for rtf_path in rtf_files:
            slug = slugify(rtf_path.stem)
            existing = conn.execute(
                "SELECT id FROM pub_books WHERE slug=?", (slug,)
            ).fetchone()
            if existing:
                continue

            title = _title_from_filename(rtf_path.name)
            conn.execute(
                "INSERT INTO pub_books (title, slug, manuscript_path, status) VALUES (?,?,?,?)",
                (title, slug, str(rtf_path.resolve()), "uploaded")
            )
            book_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            new_books.append({"id": book_id, "title": title, "slug": slug, "path": str(rtf_path)})
            print(f"[Publishing] Registered: '{title}' (id={book_id})")

    return new_books
```

**Step 2: Create `publishing/exporter.py`**

Create `/Users/atlas/atlas-control-center/publishing/exporter.py`:

```python
"""Atlas Publishing Engine — Export package for manual platform uploads."""
import json
import zipfile
from pathlib import Path

from publishing.database import get_conn, init_db

_OUTPUT = Path(__file__).parent / "output"

PLATFORM_INSTRUCTIONS = """
PLATFORM UPLOAD GUIDE — Brooks Hammer Publishing
=================================================

FILES IN THIS PACKAGE:
- book.epub    → Universal ebook (Apple Books, B&N, Kobo, Google Play)
- book.mobi    → Kindle/Amazon KDP
- book.pdf     → Print-on-demand, direct sales
- audiobook.m4b → All audiobook platforms

UPLOAD INSTRUCTIONS:

1. AMAZON KDP (ebook)
   URL: https://kdp.amazon.com
   - Sign in → Add new title → Kindle ebook
   - Upload book.mobi (or book.epub)
   - Price: $4.99 recommended (70% royalty at this price)
   - Categories: Fiction > Thrillers > Technothrillers

2. DRAFT2DIGITAL (ebook — distributes to 50+ stores)
   URL: https://www.draft2digital.com
   - Upload book.epub
   - They handle Apple Books, B&N, Kobo, Scribd, etc.
   - Price: $4.99

3. GOOGLE PLAY BOOKS
   URL: https://play.google.com/books/publish
   - Upload book.epub
   - Price: $4.99

4. FINDAWAY VOICES (audiobook — distributes to Audible, Spotify, etc.)
   URL: https://findawayvoices.com
   - Upload audiobook.m4b
   - Cover image: cover.jpg
   - Price: $14.99
   - Note: AI-generated voices require checking current TOS

5. GUMROAD (already done — direct sales)
   - See dashboard for your Gumroad listing

TIPS:
- Use metadata.json for all title/description/keyword fields
- Cover image: cover.jpg (also include this on every platform)
- Allow 24-72 hours for platform review/approval
"""


def generate_export_package(book_id: int) -> str:
    """
    Generate a platform-export.zip containing all formats, metadata,
    and upload instructions. Returns path to the zip file.
    """
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)

        ebooks = conn.execute(
            "SELECT * FROM pub_ebook_versions WHERE book_id=?", (book_id,)
        ).fetchall()
        audiobooks = conn.execute(
            "SELECT * FROM pub_audiobook_versions WHERE book_id=?", (book_id,)
        ).fetchall()
        pubs = conn.execute(
            "SELECT * FROM pub_publications WHERE book_id=?", (book_id,)
        ).fetchall()

    out_dir = _OUTPUT / book["slug"]
    zip_path = out_dir / "platform-export.zip"

    # Build metadata JSON
    metadata = {
        "title": book["title"],
        "author": book["author"],
        "genre": book["genre"],
        "series": book.get("series"),
        "book_number": book.get("book_number"),
        "blurb": book.get("blurb", ""),
        "keywords": json.loads(book.get("keywords") or "[]"),
        "word_count": book.get("word_count"),
        "ebook_formats": [e["format"] for e in ebooks],
        "audiobook_formats": ["m4b"] if audiobooks else [],
        "gumroad_listings": [
            {"format": p["format"], "url": p["store_url"], "price": p["price"]}
            for p in pubs if p["platform"] == "gumroad"
        ],
    }

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add ebook files
        for fmt in ["book.epub", "book.mobi", "book.pdf"]:
            f = out_dir / fmt
            if f.exists():
                zf.write(f, fmt)

        # Add audiobook
        m4b = out_dir / "audiobook.m4b"
        if m4b.exists():
            zf.write(m4b, "audiobook.m4b")

        # Add cover art
        cover = out_dir / "cover.jpg"
        if cover.exists():
            zf.write(cover, "cover.jpg")

        # Add metadata and instructions
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))
        zf.writestr("UPLOAD-INSTRUCTIONS.txt", PLATFORM_INSTRUCTIONS)

    print(f"[Publishing] Export package: {zip_path} ({zip_path.stat().st_size // 1024}KB)")
    return str(zip_path)
```

**Step 3: Test scanner**

```bash
cd /Users/atlas/atlas-control-center
python3 -c "
import sys; sys.path.insert(0, '.')
from publishing.scanner import scan_manuscripts
books = scan_manuscripts()
print('New books found:', books)
"
```
Expected: Either lists new books if RTF files are present, or `No RTF files found`.

**Step 4: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add publishing/scanner.py publishing/exporter.py
git commit -m "feat(publishing): manuscript scanner + platform export package generator"
```

---

### Task 6: FastAPI Routes

**Files:**
- Create: `backend/publishing_routes.py`
- Modify: `backend/main.py`
- Modify: `backend/requirements.txt`

**Step 1: Create `backend/publishing_routes.py`**

Create `/Users/atlas/atlas-control-center/backend/publishing_routes.py`:

```python
"""Atlas Publishing Engine — FastAPI routes."""
import sys
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

_REPO = Path(__file__).parent.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from publishing.database import (
    init_db, get_all_books, get_book, get_book_ebooks,
    get_book_audiobooks, get_book_publications, get_stats, get_conn,
)
from publishing.scanner import scan_manuscripts
from publishing.formatter import format_book
from publishing.audiobook import generate_audiobook
from publishing.gumroad import publish_ebook_to_gumroad, publish_audiobook_to_gumroad
from publishing.exporter import generate_export_package


class PublishRequest(BaseModel):
    ebook_price: Optional[float] = 4.99
    audiobook_price: Optional[float] = 14.99


def register_routes(app):
    """Mount all /api/v1/publishing routes onto the FastAPI app."""

    @app.get("/api/v1/publishing/stats")
    def publishing_stats():
        init_db()
        return get_stats()

    @app.get("/api/v1/publishing/books")
    def publishing_books():
        init_db()
        books = get_all_books()
        # Enrich with ebook/audiobook/publication counts
        enriched = []
        for b in books:
            b["ebooks"] = get_book_ebooks(b["id"])
            b["audiobooks"] = get_book_audiobooks(b["id"])
            b["publications"] = get_book_publications(b["id"])
            enriched.append(b)
        return {"books": enriched}

    @app.get("/api/v1/publishing/books/{book_id}")
    def publishing_book_detail(book_id: int):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        book["ebooks"] = get_book_ebooks(book_id)
        book["audiobooks"] = get_book_audiobooks(book_id)
        book["publications"] = get_book_publications(book_id)
        return book

    @app.post("/api/v1/publishing/scan")
    def publishing_scan():
        init_db()
        try:
            new_books = scan_manuscripts()
            return {"new_books": new_books, "count": len(new_books)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/v1/publishing/books/{book_id}/format")
    async def publishing_format(book_id: int, background_tasks: BackgroundTasks):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        background_tasks.add_task(format_book, book_id)
        return {"status": "formatting started", "book_id": book_id}

    @app.post("/api/v1/publishing/books/{book_id}/audio")
    async def publishing_audio(book_id: int, background_tasks: BackgroundTasks):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        background_tasks.add_task(generate_audiobook, book_id)
        return {"status": "audiobook generation started", "book_id": book_id}

    @app.post("/api/v1/publishing/books/{book_id}/publish")
    def publishing_publish(book_id: int, req: PublishRequest):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        results = {}
        try:
            results["ebook"] = publish_ebook_to_gumroad(book_id, req.ebook_price)
        except Exception as e:
            results["ebook_error"] = str(e)
        try:
            results["audiobook"] = publish_audiobook_to_gumroad(book_id, req.audiobook_price)
        except Exception as e:
            results["audiobook_error"] = str(e)
        return results

    @app.post("/api/v1/publishing/books/{book_id}/export")
    def publishing_export(book_id: int):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        try:
            zip_path = generate_export_package(book_id)
            return {"zip_path": zip_path, "status": "export ready"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/v1/publishing/process-all")
    async def publishing_process_all(background_tasks: BackgroundTasks):
        """Format + generate audio + publish all books that are ready for next step."""
        init_db()

        def _process_all():
            books = get_all_books()
            for book in books:
                try:
                    if book["status"] == "uploaded":
                        format_book(book["id"])
                    if book["status"] == "formatted":
                        generate_audiobook(book["id"])
                    if book["status"] == "audio_ready":
                        publish_ebook_to_gumroad(book["id"])
                        publish_audiobook_to_gumroad(book["id"])
                except Exception as e:
                    print(f"[Publishing] Error processing book {book['id']}: {e}")

        background_tasks.add_task(_process_all)
        return {"status": "processing all books in background"}

    @app.patch("/api/v1/publishing/books/{book_id}")
    def publishing_update_book(book_id: int, data: dict):
        """Update book metadata (title, blurb, cover_art_path, etc.)"""
        init_db()
        allowed = {"title", "blurb", "series", "book_number", "cover_art_path", "keywords"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        set_clause = ", ".join(f"{k}=?" for k in updates)
        with get_conn() as conn:
            conn.execute(
                f"UPDATE pub_books SET {set_clause} WHERE id=?",
                list(updates.values()) + [book_id]
            )
        return {"status": "updated"}
```

**Step 2: Wire into `backend/main.py`**

Find the startup_event in `backend/main.py`. It contains a block that initializes FastCash:
```python
from fastcash.database import init_db as fastcash_init_db
fastcash_init_db()
```

After that block, add:
```python
    from publishing.database import init_db as publishing_init_db
    publishing_init_db()
    print("[Publishing] Database initialized.")
```

Also find where `fastcash_routes` is registered (look for `from backend.fastcash_routes import register_routes` or similar import near the top of main.py). Add alongside it:
```python
from publishing_routes import register_routes as register_publishing_routes
register_publishing_routes(app)
```

**Step 3: Read main.py to find exact injection points**

Read `/Users/atlas/atlas-control-center/backend/main.py` lines 1-60 to find where fastcash_routes is imported and registered, then add the publishing routes in the same pattern.

**Step 4: Restart backend and test routes**

```bash
pkill -f "uvicorn main:app" 2>/dev/null; sleep 2
cd /Users/atlas/atlas-control-center/backend && source venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > /Users/atlas/atlas-control-center/logs/backend.log 2>&1 &
sleep 4

# Test routes
curl -s http://localhost:8000/api/v1/publishing/stats | python3 -m json.tool
curl -s http://localhost:8000/api/v1/publishing/books | python3 -m json.tool | head -20
curl -s -X POST http://localhost:8000/api/v1/publishing/scan | python3 -m json.tool
```
Expected: stats returns counts, books returns list, scan detects any RTF files.

**Step 5: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add backend/publishing_routes.py backend/main.py backend/requirements.txt
git commit -m "feat(publishing): FastAPI routes wired into main.py"
```

---

### Task 7: Frontend Dashboard

**Files:**
- Create: `frontend/app/publishing/page.tsx`

**Step 1: Create `frontend/app/publishing/page.tsx`**

Create `/Users/atlas/atlas-control-center/frontend/app/publishing/page.tsx`:

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000/api/v1/publishing";

interface Ebook {
  format: string;
  file_path: string;
  file_size: number;
}

interface Audiobook {
  voice: string;
  duration_minutes: number;
  file_path: string;
}

interface Publication {
  platform: string;
  format: string;
  status: string;
  store_url: string;
  price: number;
}

interface Book {
  id: number;
  title: string;
  author: string;
  series: string | null;
  genre: string;
  word_count: number | null;
  slug: string;
  blurb: string | null;
  cover_art_path: string | null;
  status: string;
  created_at: string;
  ebooks: Ebook[];
  audiobooks: Audiobook[];
  publications: Publication[];
}

interface Stats {
  total_books: number;
  formatted: number;
  audio_ready: number;
  published: number;
  total_revenue: number;
}

const STATUS_STEPS = ["uploaded", "formatted", "audio_ready", "published"];
const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  formatting: "Formatting...",
  formatted: "Formatted",
  generating_audio: "Generating Audio...",
  audio_ready: "Audio Ready",
  publishing: "Publishing...",
  published: "Published",
};
const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-600",
  formatting: "bg-yellow-500 animate-pulse",
  formatted: "bg-blue-500",
  generating_audio: "bg-purple-500 animate-pulse",
  audio_ready: "bg-purple-500",
  publishing: "bg-green-500 animate-pulse",
  published: "bg-green-500",
};

function StatusPipeline({ status }: { status: string }) {
  const activeIdx = STATUS_STEPS.indexOf(
    status.replace("formatting", "uploaded").replace("generating_audio", "formatted").replace("publishing", "audio_ready")
  );
  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${i <= activeIdx ? STATUS_COLORS[status] || "bg-gray-600" : "bg-gray-700"}`} />
          <span className={`text-xs ${i <= activeIdx ? "text-gray-300" : "text-gray-600"}`}>
            {STATUS_LABELS[step]}
          </span>
          {i < STATUS_STEPS.length - 1 && <div className="w-3 h-px bg-gray-700" />}
        </div>
      ))}
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    epub: "bg-blue-700", mobi: "bg-orange-700", pdf: "bg-red-700", m4b: "bg-purple-700",
  };
  return (
    <span className={`${colors[format] || "bg-gray-700"} text-white text-xs px-1.5 py-0.5 rounded`}>
      {format.toUpperCase()}
    </span>
  );
}

export default function PublishingPage() {
  const [activeTab, setActiveTab] = useState<"books" | "sales" | "settings">("books");
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const [booksRes, statsRes] = await Promise.all([
        fetch(`${API}/books`),
        fetch(`${API}/stats`),
      ]);
      if (booksRes.ok) setBooks((await booksRes.json()).books || []);
      if (statsRes.ok) setStats(await statsRes.json());
      setError(null);
    } catch (e) {
      setError("Failed to load. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/scan`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.count > 0) await fetchBooks();
        else setError(`No new RTF files found in publishing/manuscripts/`);
      }
    } catch { setError("Scan failed."); }
    finally { setScanning(false); }
  };

  const handleAction = async (bookId: number, action: string, label: string) => {
    setActionLoading(prev => ({ ...prev, [bookId]: label }));
    try {
      const res = await fetch(`${API}/books/${bookId}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
      setTimeout(fetchBooks, 2000);
    } catch (e) {
      setError(`${label} failed for book ${bookId}.`);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[bookId]; return n; });
    }
  };

  const handleProcessAll = async () => {
    setProcessingAll(true);
    try {
      await fetch(`${API}/process-all`, { method: "POST" });
      setTimeout(() => { fetchBooks(); setProcessingAll(false); }, 3000);
    } catch { setProcessingAll(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400">📚 Atlas Publishing</h1>
          <p className="text-gray-400 text-sm mt-1">
            Ebook + Audiobook automation for Brooks Hammer novels
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {scanning ? "Scanning..." : "📁 Scan for Books"}
          </button>
          <button
            onClick={handleProcessAll}
            disabled={processingAll}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
          >
            {processingAll ? "Processing..." : "🚀 Process All Books"}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Books", value: stats.total_books },
            { label: "Formatted", value: stats.formatted },
            { label: "Audio Ready", value: stats.audio_ready },
            { label: "Published", value: stats.published },
            { label: "Revenue", value: `$${stats.total_revenue.toFixed(2)}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["books", "sales", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors capitalize ${
              activeTab === tab
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {tab === "books" ? "📚 Books" : tab === "sales" ? "💰 Sales" : "⚙️ Settings"}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Books Tab */}
      {activeTab === "books" && (
        <>
          {loading ? (
            <div className="text-center text-gray-500 py-12">Loading books...</div>
          ) : books.length === 0 ? (
            <div className="text-center text-gray-500 py-16">
              <div className="text-5xl mb-4">📚</div>
              <div className="font-semibold text-gray-300 mb-2 text-lg">No Books Yet</div>
              <p className="text-sm max-w-sm mx-auto">
                Drop your RTF manuscripts into{" "}
                <code className="text-emerald-400">publishing/manuscripts/</code>{" "}
                then click <strong className="text-white">Scan for Books</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {books.map((book) => {
                const busy = actionLoading[book.id];
                const gumroadEbook = book.publications.find(p => p.platform === "gumroad" && p.format === "ebook");
                const gumroadAudio = book.publications.find(p => p.platform === "gumroad" && p.format === "audiobook");
                return (
                  <div key={book.id} className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[book.status] || "bg-gray-700"} text-white`}>
                            {STATUS_LABELS[book.status] || book.status}
                          </span>
                          {book.series && (
                            <span className="text-xs text-gray-400">{book.series}</span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-base">{book.title}</h3>
                        <p className="text-gray-400 text-xs">{book.author} · {book.genre}</p>
                        {book.word_count && (
                          <p className="text-gray-500 text-xs mt-0.5">
                            {book.word_count.toLocaleString()} words
                          </p>
                        )}
                        {/* Format badges */}
                        {(book.ebooks.length > 0 || book.audiobooks.length > 0) && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {book.ebooks.map(e => <FormatBadge key={e.format} format={e.format} />)}
                            {book.audiobooks.map(a => <FormatBadge key="m4b" format="m4b" />)}
                          </div>
                        )}
                        <StatusPipeline status={book.status} />
                        {/* Gumroad links */}
                        <div className="flex gap-3 mt-2">
                          {gumroadEbook && (
                            <a href={gumroadEbook.store_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-emerald-400 hover:text-emerald-300">
                              📖 Ebook on Gumroad →
                            </a>
                          )}
                          {gumroadAudio && (
                            <a href={gumroadAudio.store_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:text-purple-300">
                              🎧 Audiobook on Gumroad →
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
                        {book.status === "uploaded" && (
                          <button
                            onClick={() => handleAction(book.id, "format", "Format")}
                            disabled={!!busy}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Format" ? "Formatting..." : "📄 Format Ebook"}
                          </button>
                        )}
                        {book.status === "formatted" && (
                          <button
                            onClick={() => handleAction(book.id, "audio", "Audio")}
                            disabled={!!busy}
                            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Audio" ? "Generating..." : "🎧 Generate Audio"}
                          </button>
                        )}
                        {book.status === "audio_ready" && !gumroadEbook && (
                          <button
                            onClick={() => handleAction(book.id, "publish", "Publish")}
                            disabled={!!busy}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Publish" ? "Publishing..." : "🚀 Publish to Gumroad"}
                          </button>
                        )}
                        {(book.ebooks.length > 0 || book.audiobooks.length > 0) && (
                          <button
                            onClick={() => handleAction(book.id, "export", "Export")}
                            disabled={!!busy}
                            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded"
                          >
                            {busy === "Export" ? "Exporting..." : "📦 Export Package"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Sales Tab */}
      {activeTab === "sales" && (
        <div className="text-center text-gray-500 py-16">
          <div className="text-5xl mb-4">💰</div>
          <div className="font-semibold text-gray-300 mb-2 text-lg">Sales Dashboard</div>
          <p className="text-sm">Revenue tracking will appear here once books are published.</p>
          {stats && stats.total_revenue > 0 && (
            <div className="mt-6 text-3xl font-bold text-emerald-400">
              ${stats.total_revenue.toFixed(2)} total earned
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="max-w-lg space-y-6">
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">📁 Manuscript Folder</h3>
            <p className="text-gray-400 text-sm">
              Drop your RTF files into:
            </p>
            <code className="block mt-2 text-emerald-400 text-sm bg-gray-800 rounded p-2">
              publishing/manuscripts/
            </code>
            <p className="text-gray-500 text-xs mt-2">
              Then click "Scan for Books" to register them.
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">🎙️ Narrator Voice</h3>
            <p className="text-gray-400 text-sm">Currently: en_US-lessac-medium (female)</p>
            <p className="text-gray-500 text-xs mt-1">
              Additional voices can be downloaded to publishing/voices/
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">🛒 Platform Accounts</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>✅ Gumroad — set GUMROAD_ACCESS_TOKEN in backend/.env</p>
              <p>⏳ Amazon KDP — create account at kdp.amazon.com</p>
              <p>⏳ Draft2Digital — create account at draft2digital.com</p>
              <p>⏳ Findaway Voices — create account at findawayvoices.com</p>
              <p className="text-gray-500 text-xs mt-2">
                Export Package includes all files + instructions for manual uploads.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Build frontend**

```bash
cd /Users/atlas/atlas-control-center/frontend
npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`, `/publishing` in route list.

**Step 3: Restart Next.js server**

```bash
pkill -f "next start" 2>/dev/null; sleep 2
nohup npm exec next start -- -p 3000 > /Users/atlas/atlas-control-center/logs/frontend.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/publishing
```
Expected: `200`

**Step 4: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add frontend/app/publishing/page.tsx
git commit -m "feat(publishing): Portal #25 dashboard — Books, Sales, Settings tabs"
```

---

### Task 8: End-to-End Test with Real Book

**Step 1: Place a manuscript**

```bash
# Copy one of your RTF manuscripts to the manuscripts folder
# Replace the path below with the actual iCloud Drive path to your RTF file
cp ~/Library/Mobile\ Documents/com~apple~CloudDocs/[your-manuscript].rtf \
   /Users/atlas/atlas-control-center/publishing/manuscripts/

ls /Users/atlas/atlas-control-center/publishing/manuscripts/
```

**Step 2: Scan for the book**

```bash
curl -s -X POST http://localhost:8000/api/v1/publishing/scan | python3 -m json.tool
```
Expected: `{"new_books": [{"id": 1, "title": "...", "slug": "..."}], "count": 1}`

**Step 3: Format the ebook**

```bash
curl -s -X POST http://localhost:8000/api/v1/publishing/books/1/format | python3 -m json.tool
sleep 30  # formatting takes 10-60 seconds depending on book size
curl -s http://localhost:8000/api/v1/publishing/books/1 | python3 -m json.tool | grep status
```
Expected: status shows `"formatted"`, ebook files visible in output folder.

**Step 4: Verify output files**

```bash
ls -lh /Users/atlas/atlas-control-center/publishing/output/*/
```
Expected: `book.epub`, `book.pdf` (and `book.mobi` if calibre is installed).

**Step 5: Generate export package**

```bash
curl -s -X POST http://localhost:8000/api/v1/publishing/books/1/export | python3 -m json.tool
ls -lh /Users/atlas/atlas-control-center/publishing/output/*/platform-export.zip
```
Expected: zip file created with all formats + metadata.json + instructions.

**Step 6: (Optional) Test audiobook generation on first 2 chapters only**

Note: Full audiobook generation for an 80K-word book takes 8-10 hours. Test with the dashboard's "Generate Audio" button and let it run overnight.

**Step 7: Final commit**

```bash
cd /Users/atlas/atlas-control-center
git add .
git commit -m "feat(publishing): Portal #25 complete — ebook + audiobook + Gumroad + export pipeline"
```

---

## Quick Verification Checklist

- [ ] `GET /api/v1/publishing/stats` returns book counts
- [ ] `POST /api/v1/publishing/scan` detects RTF files in manuscripts/
- [ ] `POST /api/v1/publishing/books/1/format` creates EPUB/MOBI/PDF
- [ ] `POST /api/v1/publishing/books/1/export` creates platform-export.zip with metadata.json
- [ ] `http://localhost:3000/publishing` loads with empty state showing manuscript folder instructions
- [ ] After scan: Books tab shows book cards with status pipeline
- [ ] Format button triggers formatting job, status updates to "formatted"
- [ ] Generate Audio button queues audiobook generation
- [ ] Publish button lists on Gumroad (requires GUMROAD_ACCESS_TOKEN in .env)
- [ ] Export Package button creates downloadable zip

## Where to Drop Your RTF Files

```
/Users/atlas/atlas-control-center/publishing/manuscripts/
```

Copy your 6 Brooks Hammer RTF files from iCloud Drive to that folder, then click "Scan for Books" in the dashboard.
