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


def _make_ebook_bundle(book: dict, out_dir: Path) -> "Path | None":
    """Zip EPUB + MOBI + PDF into a single bundle for Gumroad."""
    if not out_dir.exists():
        return None
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
        if not book.get("slug"):
            raise ValueError(f"Book {book_id} has no slug set")

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
            "published": "true",
            "require_shipping": "false",
        })
        product_id = product["product"]["id"]
        store_url = product["product"].get("short_url", f"https://gumroad.com/l/{product_id}")
        try:
            _gumroad_upload_file(product_id, bundle_path, "application/zip")
        except Exception as upload_err:
            try:
                requests.delete(
                    f"{_BASE_URL}/products/{product_id}",
                    params={"access_token": _token()},
                    timeout=15,
                )
                print(f"[Publishing] Rolled back orphaned Gumroad product {product_id}")
            except Exception as delete_err:
                print(f"[Publishing] CRITICAL: orphaned Gumroad product {product_id} — delete manually. ({delete_err})")
            raise upload_err
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
        if not book.get("slug"):
            raise ValueError(f"Book {book_id} has no slug set")

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
    if audiobook_entry and audiobook_entry["duration_minutes"] is not None:
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
            "published": "true",
            "require_shipping": "false",
        })
        product_id = product["product"]["id"]
        store_url = product["product"].get("short_url", f"https://gumroad.com/l/{product_id}")
        try:
            _gumroad_upload_file(product_id, m4b_path, "audio/x-m4b")
        except Exception as upload_err:
            try:
                requests.delete(
                    f"{_BASE_URL}/products/{product_id}",
                    params={"access_token": _token()},
                    timeout=15,
                )
                print(f"[Publishing] Rolled back orphaned Gumroad product {product_id}")
            except Exception as delete_err:
                print(f"[Publishing] CRITICAL: orphaned Gumroad product {product_id} — delete manually. ({delete_err})")
            raise upload_err
        print(f"[Publishing] Audiobook listed on Gumroad: {store_url}")

    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO pub_publications (book_id, platform, format, status, store_url, price, published_at) VALUES (?,?,?,?,?,?,datetime('now'))",
            (book_id, "gumroad", "audiobook", "live", store_url, price)
        )
        conn.execute("UPDATE pub_books SET status='published' WHERE id=?", (book_id,))

    return {"store_url": store_url, "price": price}
