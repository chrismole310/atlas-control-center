"""
chapter_builder.py — Applies the active author's chapter formula to raw drafts.
Wraps novel_engine.rewrite_chapter with author-aware defaults.
"""

import sys
from pathlib import Path

import author_manager
import novel_engine


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_chapter_type(profile: dict, chapter_number: int) -> str:
    """Resolve chapter type from an already-loaded author profile dict."""
    chapter_types = profile.get("chapter_types", [])
    if not chapter_types:
        return "STANDARD"
    return chapter_types[(chapter_number - 1) % len(chapter_types)]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_chapter_type(chapter_number: int, author_id: str = None) -> str:
    """
    Return the chapter type for a given chapter number based on the author's rotation.

    No API calls — pure profile lookup.

    Args:
        chapter_number: 1-based chapter number.
        author_id:      Author ID to use; defaults to active author.

    Returns:
        The chapter type string from the author's chapter_types list.
    """
    if author_id is not None:
        profile = author_manager.get_author(author_id)
    else:
        profile = author_manager.get_active_author()

    return _resolve_chapter_type(profile, chapter_number)


def build_chapter(
    chapter_text: str,
    chapter_number: int,
    book_title: str,
    author_id: str = None,
) -> dict:
    """
    Rewrite a chapter using the active author's formula and voice.

    Loads the active author profile, validates the chapter number against
    target_chapters_per_book, determines the chapter type from the rotation,
    calls novel_engine.rewrite_chapter, and returns an enriched result dict.

    Args:
        chapter_text:   Raw chapter text to rewrite.
        chapter_number: 1-based chapter number.
        book_title:     Title of the book being processed.
        author_id:      Author ID to use; defaults to active author.

    Returns:
        {
            "chapter_number": int,
            "chapter_type": str,
            "original_words": int,
            "rewritten_words": int,
            "rewritten_text": str,
            "author_id": str,
        }
    """
    # Load profile for validation and chapter_type resolution
    if author_id is not None:
        profile = author_manager.get_author(author_id)
    else:
        profile = author_manager.get_active_author()

    # Validate chapter_number range
    target_chapters = profile.get("target_chapters_per_book", None)
    if target_chapters is not None:
        if chapter_number < 1 or chapter_number > target_chapters:
            raise ValueError(
                f"chapter_number {chapter_number} is out of range. "
                f"Author '{profile.get('author_id')}' targets 1–{target_chapters} chapters per book."
            )

    # Determine chapter type from rotation
    chapter_type = _resolve_chapter_type(profile, chapter_number)

    # Delegate to novel_engine for AI rewriting
    result = novel_engine.rewrite_chapter(
        chapter_text=chapter_text,
        chapter_number=chapter_number,
        book_title=book_title,
        author_id=author_id,
    )

    # Enrich result with chapter_type
    result["chapter_type"] = chapter_type

    return result


def build_chapter_from_file(
    filepath: str,
    chapter_number: int,
    book_title: str,
    author_id: str = None,
) -> dict:
    """
    Read a chapter file, rewrite it, and save the result alongside the original.

    Args:
        filepath:       Path to the raw chapter text file.
        chapter_number: 1-based chapter number.
        book_title:     Title of the book being processed.
        author_id:      Author ID to use; defaults to active author.

    Returns:
        Same enriched dict as build_chapter(), with rewritten text saved to
        {filepath}.rewritten.txt.
    """
    source = Path(filepath)
    if not source.exists():
        raise FileNotFoundError(f"Chapter file not found: {source}")

    chapter_text = source.read_text(encoding="utf-8")

    result = build_chapter(
        chapter_text=chapter_text,
        chapter_number=chapter_number,
        book_title=book_title,
        author_id=author_id,
    )

    # Save rewritten output alongside the source file
    output_path = source.with_name(source.name + ".rewritten.txt")
    output_path.write_text(result["rewritten_text"], encoding="utf-8")
    print(f"[chapter_builder] Rewritten chapter saved to: {output_path}")

    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli() -> None:
    args = sys.argv[1:]

    if len(args) < 3:
        print("Usage: python chapter_builder.py <chapter_file> <chapter_number> <book_title>")
        sys.exit(1)

    filepath = args[0]
    chapter_number = int(args[1])
    book_title = args[2]

    print(f"[chapter_builder] Processing: {filepath}")
    print(f"  Chapter   : {chapter_number}")
    print(f"  Book      : {book_title}")

    result = build_chapter_from_file(
        filepath=filepath,
        chapter_number=chapter_number,
        book_title=book_title,
    )

    print(f"\n--- RESULT ---")
    print(f"Chapter     : {result['chapter_number']}")
    print(f"Type        : {result['chapter_type']}")
    print(f"Author      : {result['author_id']}")
    print(f"Original    : {result['original_words']:,} words")
    print(f"Rewritten   : {result['rewritten_words']:,} words")


if __name__ == "__main__":
    _cli()
