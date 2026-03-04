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
