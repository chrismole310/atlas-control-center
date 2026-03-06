"""
book_packager.py — Generates marketing assets and quality ratings for a completed manuscript.
"""

import json
import sys
from pathlib import Path

import novel_engine


# ---------------------------------------------------------------------------
# Bar rendering helper
# ---------------------------------------------------------------------------

_BAR_FILLED = "\u2588"
_BAR_EMPTY = "\u2591"
_BAR_WIDTH = 10


def _score_bar(score: float) -> str:
    """Render a score (0–10) as a 10-character block bar."""
    filled = round(score)
    filled = max(0, min(_BAR_WIDTH, filled))
    empty = _BAR_WIDTH - filled
    return _BAR_FILLED * filled + _BAR_EMPTY * empty


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def print_quality_report(quality: dict) -> None:
    """
    Print a formatted quality scorecard to stdout.

    Args:
        quality: Dict with keys prose_quality, pacing, character_voice,
                 military_authenticity, plot_coherence, series_consistency.
                 Each value is an int 1–10.
    """
    scores = {
        "Prose Quality":      quality.get("prose_quality", 0),
        "Pacing":             quality.get("pacing", 0),
        "Character Voice":    quality.get("character_voice", 0),
        "Military Auth.":     quality.get("military_authenticity", 0),
        "Plot Coherence":     quality.get("plot_coherence", 0),
        "Series Consistency": quality.get("series_consistency", 0),
    }

    # Compute overall average
    values = list(scores.values())
    overall = round(sum(values) / len(values), 1) if values else 0.0

    border = "\u2500" * 35
    print(f"\u250c{border}\u2510")
    print(f"\u2502 {'QUALITY SCORECARD':<33}\u2502")
    print(f"\u251c{border}\u2524")
    for label, score in scores.items():
        bar = _score_bar(score)
        line = f"{label:<20} {bar} {score}"
        print(f"\u2502 {line:<33}\u2502")
    print(f"\u251c{border}\u2524")
    overall_bar = _score_bar(overall)
    overall_line = f"{'OVERALL':<20} {overall_bar} {overall}"
    print(f"\u2502 {overall_line:<33}\u2502")
    print(f"\u2514{border}\u2518")


def package_book(manuscript_folder: str, author_id: str = None) -> dict:
    """
    Orchestrate the full book packaging workflow.

    Delegates to novel_engine.package_book(), then saves results to
    {manuscript_folder}/package/ as individual files, and prints a quality
    scorecard to stdout.

    Args:
        manuscript_folder: Path to the manuscript folder.
        author_id:         Author ID to use; defaults to active author.

    Returns:
        The full package dict:
        {
            "blurb": str,
            "teaser": str,
            "cover_brief": str,
            "quality": dict,
            "total_words": int,
        }
    """
    result = novel_engine.package_book(
        manuscript_folder=manuscript_folder,
        author_id=author_id,
    )

    # Create output directory
    folder = Path(manuscript_folder).resolve()
    package_dir = folder / "package"
    package_dir.mkdir(parents=True, exist_ok=True)

    # Save individual asset files
    (package_dir / "blurb.txt").write_text(result.get("blurb", ""), encoding="utf-8")
    (package_dir / "teaser.txt").write_text(result.get("teaser", ""), encoding="utf-8")
    (package_dir / "cover_brief.txt").write_text(result.get("cover_brief", ""), encoding="utf-8")

    quality_path = package_dir / "quality_report.json"
    with open(quality_path, "w", encoding="utf-8") as f:
        json.dump(result.get("quality", {}), f, indent=2)
        f.write("\n")

    print(f"\n[book_packager] Package saved to: {package_dir}")
    print(f"  blurb.txt, teaser.txt, cover_brief.txt, quality_report.json")

    # Print formatted quality scorecard
    print()
    print_quality_report(result.get("quality", {}))

    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli() -> None:
    args = sys.argv[1:]

    if not args:
        print("Usage: python book_packager.py <manuscript_folder>")
        sys.exit(1)

    manuscript_folder = args[0]
    result = package_book(manuscript_folder=manuscript_folder)

    print(f"\n--- PACKAGE SUMMARY ---")
    print(f"Total words  : {result.get('total_words', 0):,}")
    print(f"\nBLURB:\n{result.get('blurb', '')}")
    print(f"\nTEASER:\n{result.get('teaser', '')}")
    print(f"\nCOVER BRIEF:\n{result.get('cover_brief', '')}")


if __name__ == "__main__":
    _cli()
