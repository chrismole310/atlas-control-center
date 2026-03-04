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


class BookUpdateRequest(BaseModel):
    title: Optional[str] = None
    blurb: Optional[str] = None
    series: Optional[str] = None
    book_number: Optional[int] = None
    cover_art_path: Optional[str] = None
    keywords: Optional[str] = None


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
    async def publishing_publish(book_id: int, req: PublishRequest, background_tasks: BackgroundTasks):
        init_db()
        book = get_book(book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")

        def _do_publish():
            from publishing.database import get_conn
            ebook_ok = False
            try:
                publish_ebook_to_gumroad(book_id, req.ebook_price)
                ebook_ok = True
            except Exception as e:
                print(f"[Publishing] Ebook publish failed for book {book_id}: {e}")
                with get_conn() as conn:
                    conn.execute("UPDATE pub_books SET status='failed' WHERE id=?", (book_id,))
            if ebook_ok:
                try:
                    publish_audiobook_to_gumroad(book_id, req.audiobook_price)
                except Exception as e:
                    print(f"[Publishing] Audiobook publish failed for book {book_id}: {e}")

        background_tasks.add_task(_do_publish)
        return {"status": "publishing started", "book_id": book_id}

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
                    elif book["status"] == "formatted":
                        generate_audiobook(book["id"])
                    elif book["status"] == "audio_ready":
                        publish_ebook_to_gumroad(book["id"])
                        publish_audiobook_to_gumroad(book["id"])
                except Exception as e:
                    print(f"[Publishing] Error processing book {book['id']}: {e}")

        background_tasks.add_task(_process_all)
        return {"status": "processing all books in background"}

    @app.patch("/api/v1/publishing/books/{book_id}")
    def publishing_update_book(book_id: int, data: BookUpdateRequest):
        """Update book metadata (title, blurb, cover_art_path, etc.)"""
        init_db()
        updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        set_clause = ", ".join(f"{k}=?" for k in updates)
        with get_conn() as conn:
            conn.execute(
                f"UPDATE pub_books SET {set_clause} WHERE id=?",
                list(updates.values()) + [book_id]
            )
        return {"status": "updated"}
