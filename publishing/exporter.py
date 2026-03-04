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
        if not book.get("slug"):
            raise ValueError(f"Book {book_id} has no slug set")

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
    out_dir.mkdir(parents=True, exist_ok=True)
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

    files_added = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add ebook files
        for fmt in ["book.epub", "book.mobi", "book.pdf"]:
            f = out_dir / fmt
            if f.exists():
                zf.write(f, fmt)
                files_added += 1

        # Add audiobook
        m4b = out_dir / "audiobook.m4b"
        if m4b.exists():
            zf.write(m4b, "audiobook.m4b")
            files_added += 1

        # Add cover art
        cover = out_dir / "cover.jpg"
        if cover.exists():
            zf.write(cover, "cover.jpg")

        # Add metadata and instructions
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))
        zf.writestr("UPLOAD-INSTRUCTIONS.txt", PLATFORM_INSTRUCTIONS)

    if files_added == 0:
        print(f"[Publishing] WARNING: Export for '{book['title']}' has no format files — run format_book/generate_audiobook first")
    print(f"[Publishing] Export package: {zip_path} ({zip_path.stat().st_size // 1024}KB)")
    return str(zip_path)
