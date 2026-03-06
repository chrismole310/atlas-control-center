"""
pipeline_connector.py — Connects novel portal output to the Atlas publishing pipeline.
Converts rewritten manuscripts to RTF, then triggers EPUB/MOBI export.
"""

import shutil
import subprocess
import sys
import warnings
from pathlib import Path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _collect_rewritten_files(rewritten_dir: Path) -> list[Path]:
    """Return sorted list of text files from the rewritten/ directory."""
    if not rewritten_dir.exists():
        return []
    return sorted(
        f for f in rewritten_dir.iterdir()
        if f.is_file() and f.suffix.lower() in {".txt", ".md"}
        and not f.name.startswith(".")
    )


def _rtf_escape(text: str) -> str:
    """Escape special RTF characters in plain text."""
    text = text.replace("\\", "\\\\")
    text = text.replace("{", "\\{")
    text = text.replace("}", "\\}")
    # Replace non-ASCII characters with RTF unicode escapes
    result = []
    for ch in text:
        code = ord(ch)
        if code > 127:
            result.append(f"\\u{code}?")
        else:
            result.append(ch)
    return "".join(result)


def _chapter_title_from_filename(filename: str) -> str:
    """Derive a human-readable chapter title from a filename like 'chapter_01.txt'."""
    stem = Path(filename).stem
    # Normalize underscores/hyphens to spaces and title-case
    title = stem.replace("_", " ").replace("-", " ").title()
    return title


def _build_rtf_content(chapter_files: list[Path]) -> str:
    """
    Build a minimal valid RTF document from a list of chapter files.

    Format:
        RTF header
        For each chapter: bold heading, then paragraph-formatted body text
    """
    rtf_parts = []

    # Minimal RTF header
    rtf_parts.append(
        r"{\rtf1\ansi\deff0"
        r"{\fonttbl{\f0\froman\fcharset0 Times New Roman;}{\f1\fswiss\fcharset0 Arial;}}"
        r"{\colortbl ;}"
        r"\widowctrl\wpaper15840\wpapr12240\wleft1800\wright1800\wtop1440\wbottom1440"
        "\n"
    )

    for chapter_file in chapter_files:
        raw_text = chapter_file.read_text(encoding="utf-8")

        # Chapter heading (bold)
        chapter_title = _chapter_title_from_filename(chapter_file.name)
        escaped_title = _rtf_escape(chapter_title)
        rtf_parts.append(
            f"\\pard\\sb480\\sa120\\b\\f1\\fs28 {escaped_title}\\b0\\par\n"
        )

        # Body paragraphs
        paragraphs = [p.strip() for p in raw_text.split("\n\n") if p.strip()]
        for para in paragraphs:
            # Collapse internal newlines within a paragraph
            para_text = " ".join(para.split("\n"))
            escaped_para = _rtf_escape(para_text)
            rtf_parts.append(
                f"\\pard\\sb0\\sa120\\f0\\fs24 {escaped_para}\\par\n"
            )

        # Page break after each chapter (except potentially the last, but consistent is fine)
        rtf_parts.append("\\page\n")

    rtf_parts.append("}")
    return "".join(rtf_parts)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def manuscript_to_rtf(
    manuscript_folder: str,
    output_path: str = None,
) -> str:
    """
    Convert all rewritten chapter files to a single RTF document.

    Reads all files from {manuscript_folder}/rewritten/ (sorted), converts to
    basic RTF format with chapter titles as bold headings, and saves to
    output_path (defaults to {manuscript_folder}/output.rtf).

    Args:
        manuscript_folder: Path to the manuscript folder.
        output_path:       Where to save the RTF file. Defaults to
                           {manuscript_folder}/output.rtf.

    Returns:
        The absolute path to the saved RTF file.

    Raises:
        FileNotFoundError: If manuscript_folder does not exist.
        ValueError:        If no rewritten chapter files are found.
    """
    folder = Path(manuscript_folder).resolve()
    if not folder.exists():
        raise FileNotFoundError(f"Manuscript folder not found: {folder}")

    rewritten_dir = folder / "rewritten"
    chapter_files = _collect_rewritten_files(rewritten_dir)

    if not chapter_files:
        raise ValueError(
            f"No chapter files found in {rewritten_dir}. "
            "Run the full book pipeline first to generate rewritten chapters."
        )

    rtf_content = _build_rtf_content(chapter_files)

    if output_path is None:
        out = folder / "output.rtf"
    else:
        out = Path(output_path).resolve()

    out.write_text(rtf_content, encoding="utf-8")
    print(f"[pipeline_connector] RTF saved to: {out}")
    print(f"  Chapters included : {len(chapter_files)}")

    return str(out)


def export_epub(
    rtf_path: str,
    metadata: dict,
    output_path: str = None,
) -> str:
    """
    Convert an RTF file to EPUB using Calibre's ebook-convert, or fall back to TXT.

    Args:
        rtf_path:    Path to the source RTF file.
        metadata:    Dict with optional keys: title, author.
        output_path: Destination path for the EPUB. Defaults to RTF path with
                     .epub extension.

    Returns:
        Absolute path to the output file (EPUB if Calibre available, else .txt fallback).
    """
    rtf = Path(rtf_path).resolve()
    if not rtf.exists():
        raise FileNotFoundError(f"RTF file not found: {rtf}")

    if output_path is None:
        out = rtf.with_suffix(".epub")
    else:
        out = Path(output_path).resolve()

    calibre = shutil.which("ebook-convert")

    if calibre:
        cmd = [calibre, str(rtf), str(out)]

        title = metadata.get("title")
        author = metadata.get("author")
        if title:
            cmd += ["--title", title]
        if author:
            cmd += ["--authors", author]

        print(f"[pipeline_connector] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(
                f"ebook-convert failed (exit {result.returncode}):\n"
                f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
            )

        print(f"[pipeline_connector] EPUB saved to: {out}")
        return str(out)

    else:
        # Fallback: copy RTF content as plain text .txt file
        fallback_path = out.with_suffix(".txt")
        warnings.warn(
            "Calibre (ebook-convert) is not installed. "
            f"Writing plain-text fallback to: {fallback_path}",
            UserWarning,
            stacklevel=2,
        )
        rtf_text = rtf.read_text(encoding="utf-8")
        fallback_path.write_text(rtf_text, encoding="utf-8")
        print(f"[pipeline_connector] Warning: Calibre not found. Fallback TXT saved to: {fallback_path}")
        return str(fallback_path)


def get_pipeline_status(manuscript_folder: str) -> dict:
    """
    Check what pipeline artifacts exist for a manuscript folder.

    Args:
        manuscript_folder: Path to the manuscript folder.

    Returns:
        {
            "has_raw_chapters": bool,
            "has_rewritten": bool,
            "has_package": bool,
            "has_rtf": bool,
            "has_epub": bool,
            "rewritten_word_count": int,
        }
    """
    folder = Path(manuscript_folder).resolve()

    # Check raw chapters (top-level .txt/.md files, excluding system files)
    NON_CHAPTER_NAMES = {"readme", "notes", "outline", "todo", "changelog"}
    raw_files = [
        f for f in folder.iterdir()
        if f.is_file()
        and f.suffix.lower() in {".txt", ".md"}
        and not f.name.startswith(".")
        and f.stem.lower() not in NON_CHAPTER_NAMES
    ] if folder.exists() else []
    has_raw_chapters = len(raw_files) > 0

    # Check rewritten/ subdirectory
    rewritten_dir = folder / "rewritten"
    rewritten_files = _collect_rewritten_files(rewritten_dir)
    has_rewritten = len(rewritten_files) > 0

    # Count words in rewritten files
    rewritten_word_count = 0
    for f in rewritten_files:
        text = f.read_text(encoding="utf-8")
        rewritten_word_count += len(text.split()) if text.strip() else 0

    # Check package/ subdirectory
    package_dir = folder / "package"
    has_package = (
        package_dir.exists()
        and (package_dir / "blurb.txt").exists()
        and (package_dir / "quality_report.json").exists()
    )

    # Check for RTF output
    rtf_path = folder / "output.rtf"
    has_rtf = rtf_path.exists()

    # Check for EPUB output (or fallback TXT)
    epub_path = folder / "output.epub"
    epub_fallback_path = folder / "output.txt"
    has_epub = epub_path.exists() or epub_fallback_path.exists()

    return {
        "has_raw_chapters": has_raw_chapters,
        "has_rewritten": has_rewritten,
        "has_package": has_package,
        "has_rtf": has_rtf,
        "has_epub": has_epub,
        "rewritten_word_count": rewritten_word_count,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli() -> None:
    args = sys.argv[1:]

    if not args:
        print("Usage: python pipeline_connector.py status <manuscript_folder>")
        print("       python pipeline_connector.py rtf <manuscript_folder> [output_path]")
        print("       python pipeline_connector.py epub <rtf_path> [output_path]")
        sys.exit(1)

    command = args[0].lower()

    if command == "status":
        if len(args) < 2:
            print("Usage: python pipeline_connector.py status <manuscript_folder>")
            sys.exit(1)
        manuscript_folder = args[1]
        status = get_pipeline_status(manuscript_folder)
        print(f"\n--- PIPELINE STATUS: {manuscript_folder} ---")
        print(f"  Raw chapters    : {'YES' if status['has_raw_chapters'] else 'NO'}")
        print(f"  Rewritten       : {'YES' if status['has_rewritten'] else 'NO'}")
        print(f"  Package         : {'YES' if status['has_package'] else 'NO'}")
        print(f"  RTF             : {'YES' if status['has_rtf'] else 'NO'}")
        print(f"  EPUB            : {'YES' if status['has_epub'] else 'NO'}")
        print(f"  Rewritten words : {status['rewritten_word_count']:,}")

    elif command == "rtf":
        if len(args) < 2:
            print("Usage: python pipeline_connector.py rtf <manuscript_folder> [output_path]")
            sys.exit(1)
        manuscript_folder = args[1]
        output_path = args[2] if len(args) > 2 else None
        rtf_path = manuscript_to_rtf(manuscript_folder, output_path)
        print(f"RTF output: {rtf_path}")

    elif command == "epub":
        if len(args) < 2:
            print("Usage: python pipeline_connector.py epub <rtf_path> [output_path]")
            sys.exit(1)
        rtf_path = args[1]
        output_path = args[2] if len(args) > 2 else None
        epub_path = export_epub(rtf_path, metadata={}, output_path=output_path)
        print(f"EPUB output: {epub_path}")

    else:
        print(f"Unknown command: '{command}'")
        print("Available commands: status, rtf, epub")
        sys.exit(1)


if __name__ == "__main__":
    _cli()
