"""Atlas Publishing Engine — RTF → EPUB/MOBI/PDF formatter using pandoc + calibre."""
import re
import subprocess
from pathlib import Path

from publishing.database import get_conn, init_db

_REPO = Path(__file__).parent.parent
_OUTPUT = _REPO / "publishing" / "output"


def _run(cmd: list, cwd: Path = None) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(str(c) for c in cmd)}\n{result.stderr[:500]}")
    return result


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

    if not book.get("manuscript_path"):
        raise ValueError(f"Book {book_id} has no manuscript_path set")
    manuscript = Path(book["manuscript_path"])
    if not manuscript.exists():
        raise FileNotFoundError(f"Manuscript not found: {manuscript}")

    if not book.get("slug"):
        raise ValueError(f"Book {book_id} has no slug set")

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
        "--metadata", "lang=en-US",
    ]
    if book.get("blurb"):
        meta_args += ["--metadata", f"description={book['blurb'][:500]}"]

    cover_args = []
    if book.get("cover_art_path") and Path(book["cover_art_path"]).exists():
        cover_args = ["--epub-cover-image", book["cover_art_path"]]

    # Step 2: Markdown → EPUB
    epub_path = out_dir / "book.epub"
    try:
        _run(["pandoc", str(md_path), "-o", str(epub_path),
              "--toc", "--toc-depth=2"] + meta_args + cover_args)
    except RuntimeError as e:
        with get_conn() as conn:
            conn.execute("UPDATE pub_books SET status='failed' WHERE id=?", (book_id,))
        raise
    print(f"[Publishing] EPUB created: {epub_path}")

    # Step 3: EPUB → MOBI (via calibre)
    mobi_path = out_dir / "book.mobi"
    try:
        _run(["ebook-convert", str(epub_path), str(mobi_path)])
        print(f"[Publishing] MOBI created: {mobi_path}")
    except RuntimeError as e:
        print(f"[Publishing] MOBI skipped: {e}")
        mobi_path = None

    # Step 4: Markdown → PDF
    pdf_path = out_dir / "book.pdf"
    pdf_created = False
    for engine_args in [["--pdf-engine=wkhtmltopdf"], []]:
        try:
            _run(["pandoc", str(md_path), "-o", str(pdf_path)] + engine_args + meta_args)
            pdf_created = True
            break
        except RuntimeError:
            continue
    if not pdf_created:
        print(f"[Publishing] PDF skipped — no working PDF engine found")
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
        "epub": str(epub_path) if epub_path and epub_path.exists() else None,
        "mobi": str(mobi_path) if mobi_path and mobi_path.exists() else None,
        "pdf": str(pdf_path) if pdf_path and pdf_path.exists() else None,
        "word_count": wc,
    }
