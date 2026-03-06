"""
author_manager.py — Atlas Novel Portal
Manages author profiles: list, switch, create, inspect.

Usage:
    python author_manager.py list
    python author_manager.py active
    python author_manager.py switch <author_id>
    python author_manager.py create
    python author_manager.py attr <key> [author_id]
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Base directory — always relative to this file, not cwd
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
AUTHOR_PROFILES_DIR = BASE_DIR / "author_profiles"
ACTIVE_AUTHOR_FILE = BASE_DIR / "active_author.json"


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class AuthorNotFoundError(ValueError):
    """Raised when a requested author_id does not exist in author_profiles/."""

    def __init__(self, author_id: str):
        self.author_id = author_id
        super().__init__(
            f"Author '{author_id}' not found in {AUTHOR_PROFILES_DIR}. "
            f"Run 'python author_manager.py list' to see available authors."
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_profile(author_id: str) -> dict:
    """Load profile.json for the given author_id. Raises AuthorNotFoundError if missing."""
    profile_path = AUTHOR_PROFILES_DIR / author_id / "profile.json"
    if not profile_path.exists():
        raise AuthorNotFoundError(author_id)
    with open(profile_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_active_author_id() -> str:
    """Read active_author.json and return the active_author_id string."""
    if not ACTIVE_AUTHOR_FILE.exists():
        raise FileNotFoundError(
            f"active_author.json not found at {ACTIVE_AUTHOR_FILE}. "
            f"Run 'python author_manager.py switch <author_id>' to set an active author."
        )
    with open(ACTIVE_AUTHOR_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["active_author_id"]


def _resolve_nested_key(data: dict, key: str):
    """
    Traverse `data` using dot-notation `key`.
    Returns the value or None if any segment is missing.
    Example: 'style_rules.forbidden' → data['style_rules']['forbidden']
    """
    parts = key.split(".")
    current = data
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_authors() -> list:
    """
    Scan author_profiles/ for subdirectories, load each profile.json.

    Returns a list of dicts:
        author_id, pen_name, genre, status, total_books_planned, is_active
    """
    if not AUTHOR_PROFILES_DIR.exists():
        return []

    try:
        active_id = _load_active_author_id()
    except FileNotFoundError:
        active_id = None

    authors = []
    for entry in sorted(AUTHOR_PROFILES_DIR.iterdir()):
        if not entry.is_dir():
            continue
        profile_path = entry / "profile.json"
        if not profile_path.exists():
            continue
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        authors.append({
            "author_id": profile.get("author_id", entry.name),
            "pen_name": profile.get("pen_name", "Unknown"),
            "genre": profile.get("genre", "Unknown"),
            "status": profile.get("status", "unknown"),
            "total_books_planned": profile.get("total_books_planned", 0),
            "is_active": profile.get("author_id", entry.name) == active_id,
        })

    return authors


def switch_author(author_id: str) -> dict:
    """
    Set `author_id` as the active author.

    Validates the author exists, writes active_author.json with current
    timestamp, and returns the author's full profile dict.

    Raises AuthorNotFoundError if the author does not exist.
    """
    author_dir = AUTHOR_PROFILES_DIR / author_id
    if not author_dir.is_dir():
        raise AuthorNotFoundError(author_id)

    profile = _load_profile(author_id)

    active_data = {
        "active_author_id": author_id,
        "switched_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(ACTIVE_AUTHOR_FILE, "w", encoding="utf-8") as f:
        json.dump(active_data, f, indent=2)
        f.write("\n")

    return profile


def get_active_author() -> dict:
    """
    Return the full profile.json for the currently active author.

    Raises FileNotFoundError if active_author.json is missing.
    Raises AuthorNotFoundError if the stored author_id no longer exists.
    """
    active_id = _load_active_author_id()
    return _load_profile(active_id)


def create_author(profile_data: dict) -> dict:
    """
    Create a new author profile directory with scaffolded files.

    Required fields in profile_data: author_id, pen_name, genre
    Raises ValueError if any required field is missing.
    Raises FileExistsError if the author directory already exists.

    Returns the created profile dict.
    """
    # Validate required fields
    required = ["author_id", "pen_name", "genre"]
    missing = [f for f in required if not profile_data.get(f)]
    if missing:
        raise ValueError(
            f"Missing required field(s) in profile_data: {', '.join(missing)}. "
            f"Required: {required}"
        )

    author_id = profile_data["author_id"]
    pen_name = profile_data["pen_name"]
    target_words = profile_data.get("target_words_per_chapter", [3300, 3500])

    author_dir = AUTHOR_PROFILES_DIR / author_id
    if author_dir.exists():
        raise FileExistsError(
            f"Author directory already exists: {author_dir}. "
            f"Use switch_author('{author_id}') to activate an existing author."
        )

    # Create directories
    outlines_dir = author_dir / "book_outlines"
    outlines_dir.mkdir(parents=True, exist_ok=True)

    # Write profile.json
    profile_path = author_dir / "profile.json"
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2)
        f.write("\n")

    # Scaffold markdown files
    series_bible_content = (
        f"# {pen_name} Series Bible\n\n"
        f"## Protagonists\n\n"
        f"## Technology Systems\n\n"
        f"## Locations\n\n"
        f"## Timeline\n"
    )
    with open(author_dir / "series_bible.md", "w", encoding="utf-8") as f:
        f.write(series_bible_content)

    voice_guide_content = (
        f"# {pen_name} Voice Guide\n\n"
        f"## NEVER USE\n\n"
        f"## ALWAYS USE\n\n"
        f"## Chapter Opening Structure\n\n"
        f"## Recurring Motifs\n"
    )
    with open(author_dir / "voice_guide.md", "w", encoding="utf-8") as f:
        f.write(voice_guide_content)

    chapter_formula_content = (
        f"# {pen_name} Chapter Formula\n\n"
        f"## Target: {target_words} words per chapter\n\n"
        f"## Phase 1 — Opening\n\n"
        f"## Phase 2 — Rising Action\n\n"
        f"## Phase 3 — Midpoint Shift\n\n"
        f"## Phase 4 — Climax/Resolution\n\n"
        f"## Phase 5 — Hook\n"
    )
    with open(author_dir / "chapter_formula.md", "w", encoding="utf-8") as f:
        f.write(chapter_formula_content)

    reading_order_content = (
        f"# {pen_name} Series — Reading Order\n\n"
        f"| # | Title | Lead Character | Status | Word Count |\n"
        f"|---|-------|---------------|--------|------------|\n"
    )
    with open(author_dir / "series_reading_order.md", "w", encoding="utf-8") as f:
        f.write(reading_order_content)

    # Empty .gitkeep so the outlines dir is tracked by git
    (outlines_dir / ".gitkeep").touch()

    return profile_data


def get_author_attribute(key: str, author_id: str = None):
    """
    Return a single attribute from the author's profile.json.

    Supports dot notation for nested keys (e.g. 'style_rules.forbidden').
    If author_id is None, uses the active author.
    Returns None if the key is not found (does not raise).
    """
    if author_id is None:
        profile = get_active_author()
    else:
        profile = _load_profile(author_id)

    return _resolve_nested_key(profile, key)


def load_author_files(author_id: str = None) -> dict:
    """
    Load the author's profile.json PLUS all four companion markdown files.

    If author_id is None, uses the active author.

    Returns the profile dict merged with:
        series_bible_content, voice_guide_content,
        chapter_formula_content, reading_order_content
    """
    if author_id is None:
        profile = get_active_author()
        author_id = profile["author_id"]
    else:
        profile = _load_profile(author_id)

    author_dir = AUTHOR_PROFILES_DIR / author_id

    def _read_md(filename: str) -> str:
        path = author_dir / filename
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    result = dict(profile)
    result["series_bible_content"] = _read_md("series_bible.md")
    result["voice_guide_content"] = _read_md("voice_guide.md")
    result["chapter_formula_content"] = _read_md("chapter_formula.md")
    result["reading_order_content"] = _read_md("series_reading_order.md")

    return result


# ---------------------------------------------------------------------------
# CLI formatting helpers
# ---------------------------------------------------------------------------

def _print_authors_table(authors: list) -> None:
    if not authors:
        print("No authors found in author_profiles/.")
        return

    col_widths = {
        "author_id": max(len("AUTHOR ID"), max(len(a["author_id"]) for a in authors)),
        "pen_name": max(len("PEN NAME"), max(len(a["pen_name"]) for a in authors)),
        "genre": max(len("GENRE"), max(len(a["genre"]) for a in authors)),
        "status": max(len("STATUS"), max(len(a["status"]) for a in authors)),
        "books": len("BOOKS"),
        "active": len("ACTIVE"),
    }

    def row(aid, pen, genre, status, books, active):
        return (
            f"  {aid:<{col_widths['author_id']}}  "
            f"{pen:<{col_widths['pen_name']}}  "
            f"{genre:<{col_widths['genre']}}  "
            f"{status:<{col_widths['status']}}  "
            f"{str(books):<{col_widths['books']}}  "
            f"{active}"
        )

    header = row("AUTHOR ID", "PEN NAME", "GENRE", "STATUS", "BOOKS", "ACTIVE")
    separator = "  " + "-" * (len(header) - 2)

    print()
    print(header)
    print(separator)
    for a in authors:
        active_marker = "* YES *" if a["is_active"] else ""
        print(row(
            a["author_id"],
            a["pen_name"],
            a["genre"],
            a["status"],
            a["total_books_planned"],
            active_marker,
        ))
    print()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli():
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        sys.exit(0)

    command = args[0].lower()

    if command == "list":
        authors = list_authors()
        _print_authors_table(authors)

    elif command == "switch":
        if len(args) < 2:
            print("Usage: python author_manager.py switch <author_id>")
            sys.exit(1)
        author_id = args[1]
        try:
            profile = switch_author(author_id)
            print(f"Switched active author to: {profile['pen_name']} ({author_id})")
            print(f"Genre: {profile.get('genre', 'N/A')}")
            print(f"Series: {profile.get('series_name', 'N/A')}")
        except AuthorNotFoundError as e:
            print(f"Error: {e}")
            sys.exit(1)

    elif command == "active":
        try:
            profile = get_active_author()
            print(f"Active author: {profile['pen_name']}")
            print(f"  author_id : {profile['author_id']}")
            print(f"  genre     : {profile.get('genre', 'N/A')}")
            print(f"  series    : {profile.get('series_name', 'N/A')}")
            print(f"  status    : {profile.get('status', 'N/A')}")
        except (FileNotFoundError, AuthorNotFoundError) as e:
            print(f"Error: {e}")
            sys.exit(1)

    elif command == "create":
        print("To create a new author, call create_author() from Python:")
        print()
        print("    from author_manager import create_author")
        print("    profile = create_author({")
        print('        "author_id": "jane_steel",')
        print('        "pen_name": "Jane Steel",')
        print('        "genre": "spy_thriller",')
        print('        "status": "active",')
        print('        "total_books_planned": 10,')
        print('        "target_words_per_book": 90000,')
        print('        "target_chapters_per_book": 28,')
        print('        "target_words_per_chapter": [3200, 3400],')
        print('        # ... additional fields ...')
        print("    })")

    elif command == "attr":
        if len(args) < 2:
            print("Usage: python author_manager.py attr <key> [author_id]")
            print("Example: python author_manager.py attr style_rules.forbidden")
            sys.exit(1)
        key = args[1]
        author_id = args[2] if len(args) > 2 else None
        try:
            value = get_author_attribute(key, author_id)
            if value is None:
                print(f"Key '{key}' not found in profile.")
            elif isinstance(value, (list, dict)):
                print(json.dumps(value, indent=2))
            else:
                print(value)
        except (FileNotFoundError, AuthorNotFoundError) as e:
            print(f"Error: {e}")
            sys.exit(1)

    else:
        print(f"Unknown command: '{command}'")
        print("Available commands: list, switch, active, create, attr")
        sys.exit(1)


if __name__ == "__main__":
    _cli()
