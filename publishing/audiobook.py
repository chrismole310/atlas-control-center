"""Atlas Publishing Engine — Piper TTS audiobook generator → M4B."""
import json
import re
import subprocess
import wave
from datetime import datetime
from pathlib import Path

from publishing.database import get_conn, init_db

_REPO = Path(__file__).parent.parent
_VOICES_DIR = _REPO / "publishing" / "voices"
_OUTPUT = _REPO / "publishing" / "output"

DEFAULT_VOICE = "en_US-lessac-medium"


def _detect_chapters_from_text(text: str) -> list[tuple[str, str]]:
    """
    Split plain text into (chapter_title, chapter_text) pairs.
    Detects patterns: 'Chapter 1', 'CHAPTER 8: LANDFALL', 'Part I', etc.
    Falls back to splitting into equal chunks if no chapters found.
    """
    pattern = re.compile(
        # Pattern 1: Chapter/Part followed by number/word and optional ": Title"
        r'^((?:Chapter|CHAPTER|Part|PART)\s+[^\n]+'
        # Pattern 2: ALL CAPS line (spaces only, not \s, to prevent cross-line matching)
        r'|[A-Z][A-Z ]{3,30})$',
        re.MULTILINE
    )
    matches = list(pattern.finditer(text))

    # Filter out front matter matches (body < 200 words = likely title/TOC/blurb)
    real_chapters = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if len(body.split()) >= 500:
            real_chapters.append((match, body))

    if not real_chapters:
        # No chapter headings found — split into 5000-word chunks
        words = text.split()
        chunk_size = 5000
        chunks = []
        for i in range(0, len(words), chunk_size):
            chunk_text = ' '.join(words[i:i + chunk_size])
            chunks.append((f"Chapter {i // chunk_size + 1}", chunk_text))
        return chunks

    chapters = []
    for match, body in real_chapters:
        title = match.group(0).strip()
        chapters.append((title, body))
    return chapters


def _text_to_wav(text: str, output_path: Path, voice: str = DEFAULT_VOICE) -> None:
    """Convert text to WAV using Piper TTS."""
    model_path = _VOICES_DIR / f"{voice}.onnx"
    if not model_path.exists():
        raise FileNotFoundError(f"Voice model not found: {model_path}")

    try:
        from piper import PiperVoice
    except ImportError:
        raise RuntimeError("piper-tts not installed: pip install piper-tts")

    piper_voice = PiperVoice.load(str(model_path))
    sample_rate = piper_voice.config.sample_rate

    with wave.open(str(output_path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for chunk in piper_voice.synthesize(text):
            wav_file.writeframes(chunk.audio_int16_bytes)


def _wav_to_m4b(wav_files: list[Path], output_path: Path,
                title: str, author: str, cover_path: Path = None,
                chapter_titles: list[str] = None) -> None:
    """Assemble multiple WAV files into a single M4B with chapter markers."""
    concat_file = output_path.parent / "concat.txt"
    combined_wav = output_path.parent / "combined.wav"
    ffmpeg_meta = output_path.parent / "chapters.txt"
    try:
        # Step 1: Write concat file
        with open(concat_file, "w") as f:
            for wav in wav_files:
                f.write(f"file '{wav.resolve()}'\n")

        # Step 2: Concatenate all WAVs
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_file), "-c", "copy", str(combined_wav)
        ], check=True, capture_output=True)

        # Step 3: Get durations for chapter markers
        chapter_markers = [";FFMETADATA1\n", f"title={title}\n", f"artist={author}\n\n"]

        if chapter_titles and len(chapter_titles) == len(wav_files):
            cursor_ms = 0
            for wav, ch_title in zip(wav_files, chapter_titles):
                result = subprocess.run([
                    "ffprobe", "-v", "quiet", "-print_format", "json",
                    "-show_streams", str(wav)
                ], capture_output=True, text=True, check=True)
                try:
                    info = json.loads(result.stdout)
                    duration_s = float(info["streams"][0]["duration"])
                except (json.JSONDecodeError, KeyError, IndexError, ValueError) as e:
                    raise RuntimeError(f"ffprobe failed to parse duration for {wav}: {e}") from e
                duration_ms = int(duration_s * 1000)

                chapter_markers.append("[CHAPTER]\n")
                chapter_markers.append("TIMEBASE=1/1000\n")
                chapter_markers.append(f"START={cursor_ms}\n")
                chapter_markers.append(f"END={cursor_ms + duration_ms}\n")
                chapter_markers.append(f"title={ch_title}\n\n")
                cursor_ms += duration_ms

        with open(ffmpeg_meta, "w") as f:
            f.writelines(chapter_markers)

        # Step 4: Build ffmpeg command for M4B
        cmd = [
            "ffmpeg", "-y",
            "-i", str(combined_wav),
            "-i", str(ffmpeg_meta),
            "-map_metadata", "1",
        ]
        if cover_path and cover_path.exists():
            cmd += ["-i", str(cover_path), "-map", "0:a", "-map", "2:v",
                    "-c:v", "copy", "-disposition:v", "attached_pic"]
        else:
            cmd += ["-map", "0:a"]

        cmd += [
            "-c:a", "aac", "-b:a", "64k", "-ar", "44100",
            "-metadata", f"title={title}",
            "-metadata", f"artist={author}",
            "-metadata", f"album={title}",
            "-metadata", "genre=Audiobook",
            str(output_path)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        concat_file.unlink(missing_ok=True)
        combined_wav.unlink(missing_ok=True)
        ffmpeg_meta.unlink(missing_ok=True)


def generate_audiobook(book_id: int, voice: str = DEFAULT_VOICE) -> dict:
    """
    Generate M4B audiobook from manuscript text using Piper TTS.
    Returns dict with file path and duration, or raises on error.
    """
    init_db()

    with get_conn() as conn:
        book = conn.execute("SELECT * FROM pub_books WHERE id=?", (book_id,)).fetchone()
        if not book:
            raise ValueError(f"Book {book_id} not found")
        book = dict(book)
        if not book.get("manuscript_path"):
            raise ValueError(f"Book {book_id} has no manuscript_path set")
        if not book.get("slug"):
            raise ValueError(f"Book {book_id} has no slug set")
        conn.execute("UPDATE pub_books SET status='generating_audio' WHERE id=?", (book_id,))

    try:
        manuscript = Path(book["manuscript_path"])
        if not manuscript.exists():
            raise FileNotFoundError(f"Manuscript not found: {manuscript}")

        out_dir = _OUTPUT / book["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        audio_dir = out_dir / "audio_chapters"
        audio_dir.mkdir(exist_ok=True)

        print(f"[Publishing] Generating audiobook for '{book['title']}'...")

        # Extract plain text from manuscript (via pandoc)
        txt_path = out_dir / "manuscript.txt"
        subprocess.run([
            "pandoc", str(manuscript), "-o", str(txt_path),
            "--to", "plain", "--wrap=none"
        ], check=True, capture_output=True)
        text = txt_path.read_text(encoding="utf-8", errors="replace")

        # Detect chapters
        chapters = _detect_chapters_from_text(text)
        if not chapters:
            raise ValueError(f"Book {book_id}: manuscript produced no speakable content after conversion")
        print(f"[Publishing] Found {len(chapters)} chapters")

        # Generate audio per chapter
        wav_files = []
        chapter_titles = []
        for i, (ch_title, ch_text) in enumerate(chapters):
            wav_path = audio_dir / f"chapter_{i+1:03d}.wav"
            print(f"[Publishing] TTS chapter {i+1}/{len(chapters)}: {ch_title[:40]}")
            _text_to_wav(ch_text, wav_path, voice=voice)
            wav_files.append(wav_path)
            chapter_titles.append(ch_title)

        # Build chapter timing data for transcript
        chapter_data = []
        cursor_s = 0.0
        for i, (wav_path, ch_title, (_, ch_text)) in enumerate(zip(wav_files, chapter_titles, chapters)):
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json",
                 "-show_streams", str(wav_path)],
                capture_output=True, text=True, check=True
            )
            info = json.loads(result.stdout)
            dur_s = float(info["streams"][0]["duration"])
            chapter_data.append({
                "index": i,
                "title": ch_title,
                "wav_file": f"audio_chapters/{wav_path.name}",
                "start_seconds": round(cursor_s, 3),
                "end_seconds": round(cursor_s + dur_s, 3),
                "duration_seconds": round(dur_s, 3),
                "word_count": len(ch_text.split()),
                "text": ch_text,
            })
            cursor_s += dur_s

        transcript = {
            "book_id": book_id,
            "book_title": book["title"],
            "voice": voice,
            "total_duration_seconds": round(cursor_s, 3),
            "generated_at": datetime.now().isoformat(),
            "chapters": chapter_data,
        }
        transcript_path = out_dir / "transcript.json"
        transcript_path.write_text(json.dumps(transcript, indent=2, ensure_ascii=False))
        print(f"[Publishing] Transcript saved: {transcript_path}")

        # Assemble M4B
        m4b_path = out_dir / "audiobook.m4b"
        cover_path = Path(book["cover_art_path"]) if book.get("cover_art_path") else None
        _wav_to_m4b(wav_files, m4b_path, book["title"], book["author"],
                    cover_path=cover_path, chapter_titles=chapter_titles)

        # Get duration
        result = subprocess.run([
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-print_format", "json", str(m4b_path)
        ], capture_output=True, text=True, check=True)
        try:
            duration_s = float(json.loads(result.stdout)["format"]["duration"])
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise RuntimeError(f"ffprobe failed to parse M4B duration: {e}") from e
        duration_min = int(duration_s / 60)

        file_size = m4b_path.stat().st_size

        with get_conn() as conn:
            conn.execute(
                "DELETE FROM pub_audiobook_versions WHERE book_id=?", (book_id,)
            )
            conn.execute(
                "INSERT INTO pub_audiobook_versions (book_id, voice, duration_minutes, file_path, file_size) VALUES (?,?,?,?,?)",
                (book_id, voice, duration_min, str(m4b_path), file_size)
            )
            conn.execute("UPDATE pub_books SET status='audio_ready' WHERE id=?", (book_id,))

        print(f"[Publishing] Audiobook complete: {m4b_path} ({duration_min} min)")
        return {"m4b": str(m4b_path), "duration_minutes": duration_min, "file_size": file_size}
    except Exception:
        with get_conn() as conn:
            conn.execute("UPDATE pub_books SET status='failed' WHERE id=?", (book_id,))
        raise
