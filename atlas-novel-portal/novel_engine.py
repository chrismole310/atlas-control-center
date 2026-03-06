"""
novel_engine.py — Atlas Novel Portal
AI-powered chapter rewriting and book pipeline operations.

Operations:
    rewrite_chapter(chapter_text, chapter_number, book_title, author_id=None) -> dict
    run_full_book_pipeline(manuscript_folder, author_id=None) -> dict
    package_book(manuscript_folder, author_id=None) -> dict
    consistency_check(manuscript_folder, author_id=None) -> dict

CLI:
    python novel_engine.py rewrite <chapter_file> <chapter_number> <book_title>
    python novel_engine.py pipeline <manuscript_folder>
    python novel_engine.py package <manuscript_folder>
    python novel_engine.py check <manuscript_folder>
"""

import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Environment setup — load ANTHROPIC_API_KEY if not already set
# ---------------------------------------------------------------------------

def _load_env() -> None:
    """Load ANTHROPIC_API_KEY from ../atlas-art-factory/.env if not in environment."""
    env_path = Path(__file__).parent.parent / "atlas-art-factory" / ".env"
    if env_path.exists() and not os.environ.get("ANTHROPIC_API_KEY"):
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ANTHROPIC_API_KEY="):
                value = line.split("=", 1)[1].strip()
                # Strip inline comments (anything after unquoted #)
                if ' #' in value:
                    value = value[:value.index(' #')].strip()
                value = value.strip("'\"")
                os.environ["ANTHROPIC_API_KEY"] = value
                break


_load_env()

# ---------------------------------------------------------------------------
# Imports after env setup
# ---------------------------------------------------------------------------

import anthropic  # noqa: E402 — must come after _load_env sets the key

from author_manager import load_author_files  # noqa: E402

# ---------------------------------------------------------------------------
# Anthropic client factory
# ---------------------------------------------------------------------------

def _get_client() -> anthropic.Anthropic:
    """Return a configured Anthropic client, raising clearly if key is missing."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to ../atlas-art-factory/.env or export it in your shell."
        )
    return anthropic.Anthropic(api_key=api_key)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _word_count(text: str) -> int:
    """Return word count of a text string."""
    return len(text.split()) if text.strip() else 0


def _format_style_rules(style_rules: dict) -> str:
    """Format style_rules dict into a readable bulleted section for prompts."""
    if not style_rules:
        return ""

    lines = []

    forbidden = style_rules.get("forbidden", [])
    if forbidden:
        lines.append("FORBIDDEN (never use these):")
        for item in forbidden:
            lines.append(f"  - {item.replace('_', ' ')}")

    required = style_rules.get("required", [])
    if required:
        lines.append("REQUIRED (always use these):")
        for item in required:
            lines.append(f"  - {item.replace('_', ' ')}")

    metaphor = style_rules.get("metaphor_pattern")
    if metaphor:
        lines.append(f"Core metaphor pattern: {metaphor.replace('_', ' ')}")

    opening = style_rules.get("chapter_opening_structure", [])
    if opening:
        lines.append(f"Chapter opening order: {' → '.join(opening)}")

    motifs = style_rules.get("recurring_motifs", [])
    if motifs:
        lines.append("Recurring motifs to weave in:")
        for m in motifs:
            lines.append(f"  - {m.replace('_', ' ')}")

    return "\n".join(lines)


def _target_word_range(author: dict) -> tuple[int, int]:
    """Extract (min_words, max_words) from author profile."""
    target = author.get("target_words_per_chapter", [3300, 3500])
    if isinstance(target, list) and len(target) >= 2:
        return int(target[0]), int(target[1])
    if isinstance(target, int):
        return target, target
    return 3300, 3500


def _strip_json_fences(text: str) -> str:
    """Strip ```json ... ``` fences from a Claude response."""
    # Match optional language tag after the opening fence
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # Fallback: try to find the first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return text[start : end + 1]
    return text


def _collect_chapter_files(folder: Path, subdir: str = None) -> list[Path]:
    """
    Return sorted list of .txt and .md files from folder (or folder/subdir).
    Excludes hidden files and the rewritten/ subdirectory when scanning raw.
    """
    target = folder / subdir if subdir else folder
    if not target.exists():
        return []
    # Exclude files that are clearly not chapter content
    NON_CHAPTER_NAMES = {"readme", "notes", "outline", "todo", "changelog"}
    files = sorted(
        f for f in target.iterdir()
        if f.is_file()
        and f.suffix.lower() in {".txt", ".md"}
        and not f.name.startswith(".")
        and f.stem.lower() not in NON_CHAPTER_NAMES
    )
    return files


# ---------------------------------------------------------------------------
# Operation 1 — rewrite_chapter
# ---------------------------------------------------------------------------

def _rewrite_chapter_internal(
    chapter_text: str,
    chapter_number: int,
    book_title: str,
    author: dict,
) -> dict:
    """
    Internal implementation: rewrite a chapter given an already-loaded author dict.
    Called by rewrite_chapter() and run_full_book_pipeline() to avoid redundant
    load_author_files() calls.

    Args:
        chapter_text:   Raw chapter text to rewrite.
        chapter_number: Chapter number (used for context, not formatting).
        book_title:     Title of the book being processed.
        author:         Already-loaded author dict from load_author_files().

    Returns:
        {
            "chapter_number": int,
            "original_words": int,
            "rewritten_words": int,
            "rewritten_text": str,
            "author_id": str,
        }
    """
    pen_name = author.get("pen_name", "Unknown Author")
    genre = author.get("genre", "fiction")
    voice_guide = author.get("voice_guide_content", "")
    chapter_formula = author.get("chapter_formula_content", "")
    style_rules_raw = author.get("style_rules", {})
    style_block = _format_style_rules(style_rules_raw)
    word_min, word_max = _target_word_range(author)
    resolved_author_id = author.get("author_id", "unknown")

    system_prompt = f"""You are a professional ghostwriter working in the voice of {pen_name}, a {genre.replace('_', ' ')} author.

=== VOICE GUIDE ===
{voice_guide}

=== CHAPTER FORMULA ===
{chapter_formula}

=== STYLE RULES ===
{style_block}

=== TASK ===
Rewrite the provided chapter draft in {pen_name}'s authentic voice.

Requirements:
- Follow the chapter formula phases exactly (Opening → Rising Action → Midpoint Shift → Climax/Resolution → Hook)
- Target word count: {word_min}–{word_max} words
- Apply all REQUIRED style elements
- Remove all FORBIDDEN style elements
- Maintain military authenticity and technical precision
- Return ONLY the rewritten chapter text — no commentary, no preamble, no notes, no meta-text
- Do not include a chapter heading or number in your output"""

    user_prompt = f"""Book: {book_title}
Chapter: {chapter_number}

ORIGINAL CHAPTER DRAFT:
---
{chapter_text}
---

Rewrite this chapter in {pen_name}'s voice following all guidelines above. Output only the rewritten chapter text."""

    client = _get_client()
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    rewritten_text = response.content[0].text.strip()

    return {
        "chapter_number": chapter_number,
        "original_words": _word_count(chapter_text),
        "rewritten_words": _word_count(rewritten_text),
        "rewritten_text": rewritten_text,
        "author_id": resolved_author_id,
    }


def rewrite_chapter(
    chapter_text: str,
    chapter_number: int,
    book_title: str,
    author_id: str = None,
) -> dict:
    """
    Rewrite a single chapter in the active author's voice.

    Args:
        chapter_text:   Raw chapter text to rewrite.
        chapter_number: Chapter number (used for context, not formatting).
        book_title:     Title of the book being processed.
        author_id:      Author ID to use; defaults to active author.

    Returns:
        {
            "chapter_number": int,
            "original_words": int,
            "rewritten_words": int,
            "rewritten_text": str,
            "author_id": str,
        }
    """
    author = load_author_files(author_id)
    return _rewrite_chapter_internal(chapter_text, chapter_number, book_title, author)


# ---------------------------------------------------------------------------
# Operation 2 — run_full_book_pipeline
# ---------------------------------------------------------------------------

def run_full_book_pipeline(
    manuscript_folder: str,
    author_id: str = None,
) -> dict:
    """
    Rewrite all chapter files in manuscript_folder and write to manuscript_folder/rewritten/.

    Args:
        manuscript_folder: Path to folder containing raw chapter .txt/.md files.
        author_id:         Author ID to use; defaults to active author.

    Returns:
        {
            "book_title": str,
            "total_chapters": int,
            "total_words": int,
            "output_folder": str,
            "chapters": [{"number": int, "words": int}],
        }
    """
    author = load_author_files(author_id)
    pen_name = author.get("pen_name", "Unknown Author")
    series_name = author.get("series_name", "Unknown Series")

    folder = Path(manuscript_folder).resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Manuscript folder not found: {folder}")

    # Use the folder name as the book title unless we find something better
    book_title = folder.name.replace("_", " ").replace("-", " ").title()

    chapter_files = _collect_chapter_files(folder)
    if not chapter_files:
        raise ValueError(
            f"No .txt or .md chapter files found in {folder}. "
            "Place your chapter files directly in the manuscript folder."
        )

    # Create output directory
    output_folder = folder / "rewritten"
    output_folder.mkdir(exist_ok=True)

    print(f"\n[novel_engine] Starting full book pipeline")
    print(f"  Author    : {pen_name}")
    print(f"  Series    : {series_name}")
    print(f"  Book      : {book_title}")
    print(f"  Chapters  : {len(chapter_files)}")
    print(f"  Output    : {output_folder}")
    print()

    chapters_meta = []
    total_words = 0

    for i, chapter_file in enumerate(chapter_files, start=1):
        chapter_text = chapter_file.read_text(encoding="utf-8")
        print(f"  [{i}/{len(chapter_files)}] Rewriting '{chapter_file.name}' "
              f"({_word_count(chapter_text)} words)...")

        result = _rewrite_chapter_internal(
            chapter_text=chapter_text,
            chapter_number=i,
            book_title=book_title,
            author=author,
        )

        out_file = output_folder / f"chapter_{i:02d}.txt"
        out_file.write_text(result["rewritten_text"], encoding="utf-8")

        words = result["rewritten_words"]
        total_words += words
        chapters_meta.append({"number": i, "words": words})

        print(f"         -> {words} words written to {out_file.name}")

    print(f"\n  Pipeline complete. Total: {total_words:,} words across {len(chapter_files)} chapters.")
    print()

    return {
        "book_title": book_title,
        "total_chapters": len(chapter_files),
        "total_words": total_words,
        "output_folder": str(output_folder),
        "chapters": chapters_meta,
    }


# ---------------------------------------------------------------------------
# Operation 3 — package_book
# ---------------------------------------------------------------------------

def package_book(
    manuscript_folder: str,
    author_id: str = None,
) -> dict:
    """
    Generate marketing copy and quality ratings for a completed manuscript.

    Reads from manuscript_folder/rewritten/ (falls back to manuscript_folder if
    rewritten/ doesn't exist), concatenates all chapters, then asks Claude to
    produce: blurb, teaser, cover brief, and quality scores.

    Returns:
        {
            "blurb": str,
            "teaser": str,
            "cover_brief": str,
            "quality": {
                "prose_quality": int,
                "pacing": int,
                "character_voice": int,
                "military_authenticity": int,
                "plot_coherence": int,
                "series_consistency": int,
            },
            "total_words": int,
        }
    """
    author = load_author_files(author_id)
    pen_name = author.get("pen_name", "Unknown Author")
    genre = author.get("genre", "fiction")
    series_name = author.get("series_name", "Unknown Series")
    series_bible = author.get("series_bible_content", "")
    voice_guide = author.get("voice_guide_content", "")

    folder = Path(manuscript_folder).resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Manuscript folder not found: {folder}")

    book_title = folder.name.replace("_", " ").replace("-", " ").title()

    # Prefer rewritten/ subfolder; fall back to raw folder
    rewritten_dir = folder / "rewritten"
    if rewritten_dir.exists() and any(rewritten_dir.iterdir()):
        chapter_files = _collect_chapter_files(folder, subdir="rewritten")
        source_label = "rewritten"
    else:
        chapter_files = _collect_chapter_files(folder)
        source_label = "raw"

    if not chapter_files:
        raise ValueError(f"No chapter files found in {folder} (checked rewritten/ and raw).")

    print(f"\n[novel_engine] Packaging book: {book_title}")
    print(f"  Source    : {source_label} chapters ({len(chapter_files)} files)")

    # Build concatenated manuscript (truncated to avoid token overflows)
    manuscript_parts = []
    total_words = 0
    for i, f in enumerate(chapter_files, start=1):
        text = f.read_text(encoding="utf-8")
        total_words += _word_count(text)
        manuscript_parts.append(f"=== CHAPTER {i} ===\n{text}")

    full_manuscript = "\n\n".join(manuscript_parts)

    # For very long books, send only the first ~15k words of actual text to stay under limits
    MAX_MANUSCRIPT_WORDS = 15000
    manuscript_words = _word_count(full_manuscript)
    if manuscript_words > MAX_MANUSCRIPT_WORDS:
        paragraphs = full_manuscript.split("\n\n")
        words_seen = 0
        kept = []
        for para in paragraphs:
            w = len(para.split())
            if words_seen + w > MAX_MANUSCRIPT_WORDS:
                break
            kept.append(para)
            words_seen += w
        full_manuscript = "\n\n".join(kept)
        if len(kept) < len(paragraphs):
            full_manuscript += "\n\n[... manuscript continues ...]"
        print(f"  Note      : Manuscript truncated to {MAX_MANUSCRIPT_WORDS:,} words for packaging call")

    system_prompt = f"""You are a senior publishing editor specializing in {genre.replace('_', ' ')} fiction, working with author {pen_name}.

=== SERIES CONTEXT ===
Series: {series_name}

=== SERIES BIBLE ===
{series_bible[:3000] if series_bible else 'Not provided.'}

=== VOICE GUIDE SUMMARY ===
{voice_guide[:1500] if voice_guide else 'Not provided.'}

=== YOUR TASK ===
Analyze the provided manuscript and produce structured publishing materials in JSON format.
Return your entire response as a single JSON object wrapped in ```json ... ``` fences."""

    user_prompt = f"""Book: {book_title}
Author: {pen_name}

=== MANUSCRIPT ===
{full_manuscript}

=== REQUIRED OUTPUT ===
Return a single JSON object with exactly these keys:

{{
  "blurb": "Back-cover blurb, 150-200 words. Compelling, present-tense, third-person. Hook the reader. No spoilers for the ending. Military thriller tone.",
  "teaser": "End-page teaser for the next book in the series, ~100 words. Hint at the next threat. Leave the reader wanting more.",
  "cover_brief": "Cover art direction for a designer: describe the primary image, style (photorealistic/illustrated/etc.), color palette, mood, key visual elements, and any text placement notes. 100-150 words.",
  "quality": {{
    "prose_quality": 0,
    "pacing": 0,
    "character_voice": 0,
    "military_authenticity": 0,
    "plot_coherence": 0,
    "series_consistency": 0
  }}
}}

For quality scores: rate each dimension 1-10 (10 = exceptional). Be honest and critical.
Replace the 0 values with your actual integer scores.

Return only the JSON object, wrapped in ```json ... ``` fences."""

    client = _get_client()
    print("  Calling Claude claude-opus-4-6 for packaging analysis...")

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_response = response.content[0].text.strip()
    json_str = _strip_json_fences(raw_response)

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Claude returned invalid JSON for package_book.\n"
            f"JSON error: {e}\n"
            f"Raw response (first 500 chars): {raw_response[:500]}"
        ) from e

    quality = parsed.get("quality", {})
    # Ensure all 6 quality keys exist with integer values
    quality_keys = [
        "prose_quality", "pacing", "character_voice",
        "military_authenticity", "plot_coherence", "series_consistency",
    ]
    for k in quality_keys:
        quality.setdefault(k, 0)
        quality[k] = int(quality[k])

    result = {
        "blurb": parsed.get("blurb", ""),
        "teaser": parsed.get("teaser", ""),
        "cover_brief": parsed.get("cover_brief", ""),
        "quality": quality,
        "total_words": total_words,
    }

    print(f"  Done. Quality scores: {quality}")
    return result


# ---------------------------------------------------------------------------
# Operation 4 — consistency_check
# ---------------------------------------------------------------------------

def consistency_check(
    manuscript_folder: str,
    author_id: str = None,
) -> dict:
    """
    Check manuscript against series bible for continuity errors.

    Scans all chapters and reports character, location, technology, timeline,
    and voice guide violations.

    Returns:
        {
            "issues": [
                {
                    "type": str,       # "character" | "location" | "technology" | "timeline" | "voice"
                    "chapter": int,
                    "description": str,
                    "severity": "critical" | "warning" | "note",
                }
            ],
            "total_issues": int,
            "passed": bool,            # True only if zero critical issues
        }
    """
    author = load_author_files(author_id)
    pen_name = author.get("pen_name", "Unknown Author")
    genre = author.get("genre", "fiction")
    series_bible = author.get("series_bible_content", "")
    voice_guide = author.get("voice_guide_content", "")
    style_rules = author.get("style_rules", {})
    style_block = _format_style_rules(style_rules)

    folder = Path(manuscript_folder).resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Manuscript folder not found: {folder}")

    # Prefer rewritten/ subfolder; fall back to raw folder
    rewritten_dir = folder / "rewritten"
    if rewritten_dir.exists() and any(rewritten_dir.iterdir()):
        chapter_files = _collect_chapter_files(folder, subdir="rewritten")
    else:
        chapter_files = _collect_chapter_files(folder)

    if not chapter_files:
        raise ValueError(f"No chapter files found in {folder} for consistency check.")

    book_title = folder.name.replace("_", " ").replace("-", " ").title()
    print(f"\n[novel_engine] Consistency check: {book_title}")
    print(f"  Chapters  : {len(chapter_files)}")

    # Build per-chapter text index (numbered)
    chapter_blocks = []
    for i, f in enumerate(chapter_files, start=1):
        text = f.read_text(encoding="utf-8")
        chapter_blocks.append(f"=== CHAPTER {i} ===\n{text}")

    full_manuscript = "\n\n".join(chapter_blocks)

    # Truncate to keep within limits
    MAX_MANUSCRIPT_WORDS = 12000
    if _word_count(full_manuscript) > MAX_MANUSCRIPT_WORDS:
        paragraphs = full_manuscript.split("\n\n")
        words_seen = 0
        kept = []
        for para in paragraphs:
            w = len(para.split())
            if words_seen + w > MAX_MANUSCRIPT_WORDS:
                break
            kept.append(para)
            words_seen += w
        full_manuscript = "\n\n".join(kept)
        if len(kept) < len(paragraphs):
            full_manuscript += "\n\n[... manuscript truncated for analysis ...]"
        print(f"  Note      : Manuscript truncated to {MAX_MANUSCRIPT_WORDS:,} words for consistency check")

    system_prompt = f"""You are a professional continuity editor for {pen_name}, a {genre.replace('_', ' ')} author.

Your job is to find every inconsistency between this manuscript and the official series reference documents.
Be thorough, specific, and chapter-accurate. When in doubt, flag it.

=== SERIES BIBLE (canonical reference) ===
{series_bible if series_bible else 'Not provided — check internal consistency only.'}

=== VOICE GUIDE (style reference) ===
{voice_guide[:2000] if voice_guide else 'Not provided.'}

=== STYLE RULES ===
{style_block}

Return your findings as a JSON object wrapped in ```json ... ``` fences."""

    user_prompt = f"""Book: {book_title}

=== MANUSCRIPT ===
{full_manuscript}

=== CONSISTENCY CHECK INSTRUCTIONS ===
Review the manuscript against the series bible and voice guide. Identify ALL of these issue types:

1. CHARACTER issues: wrong first name, wrong last name, wrong rank, wrong traits, missing characters who should appear, characters behaving contrary to their established profiles
2. LOCATION issues: wrong base name, wrong city/country, non-existent location, location used inconsistently across chapters
3. TECHNOLOGY issues: wrong system names, capabilities that contradict the bible, technology that doesn't exist in-universe
4. TIMELINE issues: events out of order, impossible time gaps, contradictions with established series timeline
5. VOICE issues: exclamation marks found, forbidden patterns used, required patterns missing, prose style violations

For each issue, identify:
- The chapter number where it occurs
- The issue type
- A specific description (quote the offending text if possible)
- The severity: "critical" (breaks canon or plot), "warning" (noticeable error), "note" (minor style flag)

Return ONLY this JSON object:
{{
  "issues": [
    {{
      "type": "character|location|technology|timeline|voice",
      "chapter": 1,
      "description": "Specific description of the issue",
      "severity": "critical|warning|note"
    }}
  ]
}}

If no issues found for a category, omit those entries. Return empty issues array if the manuscript is clean.
Wrap in ```json ... ``` fences."""

    client = _get_client()
    print("  Calling Claude claude-opus-4-6 for consistency analysis...")

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_response = response.content[0].text.strip()
    json_str = _strip_json_fences(raw_response)

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Claude returned invalid JSON for consistency_check.\n"
            f"JSON error: {e}\n"
            f"Raw response (first 500 chars): {raw_response[:500]}"
        ) from e

    issues = parsed.get("issues", [])

    # Validate and normalise each issue entry
    valid_types = {"character", "location", "technology", "timeline", "voice"}
    valid_severities = {"critical", "warning", "note"}
    cleaned_issues = []
    for issue in issues:
        cleaned = {
            "type": issue.get("type", "note") if issue.get("type") in valid_types else "note",
            "chapter": int(issue.get("chapter", 0)),
            "description": str(issue.get("description", "")),
            "severity": issue.get("severity", "note") if issue.get("severity") in valid_severities else "note",
        }
        cleaned_issues.append(cleaned)

    # Sort: critical first, then warning, then note; then by chapter
    severity_order = {"critical": 0, "warning": 1, "note": 2}
    cleaned_issues.sort(key=lambda x: (severity_order.get(x["severity"], 2), x["chapter"]))

    critical_count = sum(1 for i in cleaned_issues if i["severity"] == "critical")
    passed = critical_count == 0

    print(f"  Found {len(cleaned_issues)} issue(s) — {critical_count} critical. Passed: {passed}")

    return {
        "issues": cleaned_issues,
        "total_issues": len(cleaned_issues),
        "passed": passed,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli() -> None:
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        sys.exit(0)

    command = args[0].lower()

    if command == "rewrite":
        if len(args) < 4:
            print("Usage: python novel_engine.py rewrite <chapter_file> <chapter_number> <book_title>")
            sys.exit(1)
        chapter_file = Path(args[1])
        chapter_number = int(args[2])
        book_title = args[3]

        if not chapter_file.exists():
            print(f"Error: Chapter file not found: {chapter_file}")
            sys.exit(1)

        chapter_text = chapter_file.read_text(encoding="utf-8")
        print(f"Rewriting chapter {chapter_number} from '{chapter_file.name}'...")

        result = rewrite_chapter(
            chapter_text=chapter_text,
            chapter_number=chapter_number,
            book_title=book_title,
        )

        print(f"\n--- RESULT ---")
        print(f"Chapter   : {result['chapter_number']}")
        print(f"Original  : {result['original_words']:,} words")
        print(f"Rewritten : {result['rewritten_words']:,} words")
        print(f"Author    : {result['author_id']}")
        print(f"\n--- REWRITTEN TEXT ---")
        print(result["rewritten_text"])

    elif command == "pipeline":
        if len(args) < 2:
            print("Usage: python novel_engine.py pipeline <manuscript_folder>")
            sys.exit(1)
        result = run_full_book_pipeline(manuscript_folder=args[1])
        print(json.dumps(result, indent=2))

    elif command == "package":
        if len(args) < 2:
            print("Usage: python novel_engine.py package <manuscript_folder>")
            sys.exit(1)
        result = package_book(manuscript_folder=args[1])
        print("\n--- PACKAGE RESULT ---")
        print(f"Total words  : {result['total_words']:,}")
        print(f"\nBLURB:\n{result['blurb']}")
        print(f"\nTEASER:\n{result['teaser']}")
        print(f"\nCOVER BRIEF:\n{result['cover_brief']}")
        print(f"\nQUALITY SCORES:")
        for k, v in result["quality"].items():
            print(f"  {k:<25} {v}/10")

    elif command == "check":
        if len(args) < 2:
            print("Usage: python novel_engine.py check <manuscript_folder>")
            sys.exit(1)
        result = consistency_check(manuscript_folder=args[1])
        print(f"\n--- CONSISTENCY CHECK ---")
        print(f"Total issues : {result['total_issues']}")
        print(f"Passed       : {result['passed']}")
        if result["issues"]:
            print("\nISSUES:")
            for issue in result["issues"]:
                print(f"  [{issue['severity'].upper():8}] Ch.{issue['chapter']:02d} [{issue['type']}] {issue['description']}")
        else:
            print("No issues found — manuscript is clean.")

    else:
        print(f"Unknown command: '{command}'")
        print("Available commands: rewrite, pipeline, package, check")
        sys.exit(1)


if __name__ == "__main__":
    _cli()
