"""Atlas Publishing Engine — Audiobook FastAPI routes."""
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

from fastapi import BackgroundTasks, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse

_REPO = Path(__file__).parent.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from publishing.database import get_conn, init_db
from publishing.audiobook import generate_audiobook

# ── Voice catalog ──────────────────────────────────────────────────────────────
_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
_VOICES_DIR = _REPO / "publishing" / "voices"

_VOICES = [
    {"name": "en_US-amy-medium",         "label": "Amy (US)",    "gender": "female", "hf_path": "en/en_US/amy/medium"},
    {"name": "en_US-arctic-medium",      "label": "Arctic (US)", "gender": "female", "hf_path": "en/en_US/arctic/medium"},
    {"name": "en_US-jenny_dioco-medium", "label": "Jenny (US)",  "gender": "female", "hf_path": "en/en_US/jenny_dioco/medium"},
    {"name": "en_GB-alba-medium",        "label": "Alba (GB)",   "gender": "female", "hf_path": "en/en_GB/alba/medium"},
    {"name": "en_US-lessac-medium",      "label": "Lessac (US)", "gender": "male",   "hf_path": "en/en_US/lessac/medium"},
    {"name": "en_US-ryan-medium",        "label": "Ryan (US)",   "gender": "male",   "hf_path": "en/en_US/ryan/medium"},
    {"name": "en_US-joe-medium",         "label": "Joe (US)",    "gender": "male",   "hf_path": "en/en_US/joe/medium"},
    {"name": "en_GB-alan-medium",        "label": "Alan (GB)",   "gender": "male",   "hf_path": "en/en_GB/alan/medium"},
]


def _is_voice_installed(name: str) -> bool:
    return (
        (_VOICES_DIR / f"{name}.onnx").exists()
        and (_VOICES_DIR / f"{name}.onnx.json").exists()
    )


def _download_voice(name: str, hf_path: str) -> None:
    """Download .onnx + .onnx.json for a Piper voice from HuggingFace."""
    _VOICES_DIR.mkdir(exist_ok=True)
    for ext in [".onnx", ".onnx.json"]:
        fname = f"{name}{ext}"
        dest = _VOICES_DIR / fname
        if dest.exists():
            continue
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        url = f"{_HF_BASE}/{hf_path}/{fname}"
        print(f"[Voices] Downloading {fname} from {url}")
        try:
            urllib.request.urlretrieve(url, str(tmp))
            tmp.rename(dest)
            print(f"[Voices] Saved {fname}")
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"Failed to download {fname}: {exc}") from exc


def _download_and_generate(book_id: int, voice: str, hf_path: str) -> None:
    """Download voice model then generate audiobook (for chaining in BackgroundTask)."""
    try:
        _download_voice(voice, hf_path)
    except Exception as exc:
        with get_conn() as conn:
            conn.execute("UPDATE pub_books SET status='failed' WHERE id=?", (book_id,))
        raise RuntimeError(f"Voice download failed for book {book_id}: {exc}") from exc
    generate_audiobook(book_id, voice)


def _run_qc(audiobook_id: int) -> dict:
    """Run quality-control checks on an audiobook record.

    Returns a dict with keys ``status`` ("pass" | "warn" | "fail") and
    ``checks`` (list of individual check results).
    """
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
        ).fetchone()

    if not row:
        raise ValueError(f"Audiobook {audiobook_id} not found")

    file_path = Path(row["file_path"])
    transcript_path = file_path.parent / "transcript.json"
    chapters_dir = file_path.parent / "audio_chapters"

    checks = []
    critical_failed = False
    warn_only_failed = False

    # --- Critical check 1: file exists on disk ---
    file_exists = file_path.exists()
    checks.append({
        "name": "file_exists",
        "passed": file_exists,
        "detail": str(file_path) if file_exists else f"File not found: {file_path}",
    })
    if not file_exists:
        critical_failed = True

    # --- Critical check 2: file size > 1 MB ---
    if file_exists:
        file_size = file_path.stat().st_size
        size_ok = file_size > 1_000_000
        checks.append({
            "name": "file_size",
            "passed": size_ok,
            "detail": f"{file_size:,} bytes" if size_ok else f"File too small: {file_size:,} bytes (< 1 MB)",
        })
        if not size_ok:
            critical_failed = True
    else:
        checks.append({
            "name": "file_size",
            "passed": False,
            "detail": "Skipped — file does not exist",
        })
        critical_failed = True

    # --- Critical check 3: duration_minutes > 0 ---
    duration = row["duration_minutes"] or 0
    duration_ok = duration > 0
    checks.append({
        "name": "duration_minutes",
        "passed": duration_ok,
        "detail": f"{duration} minutes" if duration_ok else f"Invalid duration: {duration}",
    })
    if not duration_ok:
        critical_failed = True

    # --- Optional check 4: transcript.json exists ---
    transcript_exists = transcript_path.exists()
    checks.append({
        "name": "transcript_json",
        "passed": transcript_exists,
        "detail": str(transcript_path) if transcript_exists else f"Not found: {transcript_path}",
    })
    if not transcript_exists:
        warn_only_failed = True

    # --- Optional check 5: audio_chapters/ directory and WAV files exist ---
    if chapters_dir.exists():
        wav_files = list(chapters_dir.glob("*.wav"))
        chapters_ok = len(wav_files) > 0
        checks.append({
            "name": "audio_chapters",
            "passed": chapters_ok,
            "detail": f"{len(wav_files)} WAV file(s) found" if chapters_ok else "audio_chapters/ dir is empty",
        })
        if not chapters_ok:
            warn_only_failed = True
    else:
        checks.append({
            "name": "audio_chapters",
            "passed": False,
            "detail": f"Directory not found: {chapters_dir}",
        })
        warn_only_failed = True

    if critical_failed:
        status = "fail"
    elif warn_only_failed:
        status = "warn"
    else:
        status = "pass"

    return {"status": status, "checks": checks}


def _quick_qc_status(file_path_str: str) -> str:
    """Return a quick QC status string for the list endpoint (file exists + size > 1 MB)."""
    path = Path(file_path_str)
    if not path.exists():
        return "fail"
    if path.stat().st_size <= 1_000_000:
        return "warn"
    return "pass"


def register_audiobook_routes(app):
    """Mount all /api/v1/audiobooks routes onto the FastAPI app."""
    init_db()

    @app.get("/api/v1/audiobooks")
    def list_audiobooks():
        with get_conn() as conn:
            rows = conn.execute(
                """
                SELECT
                    av.id, av.book_id, av.voice, av.duration_minutes,
                    av.file_path, av.file_size,
                    b.title, b.author, b.slug,
                    b.status AS book_status, b.cover_art_path
                FROM pub_audiobook_versions av
                JOIN pub_books b ON b.id = av.book_id
                ORDER BY av.id DESC
                """
            ).fetchall()
            generating = conn.execute(
                """
                SELECT id, title, author, slug, status
                FROM pub_books
                WHERE status IN ('generating_audio', 'failed')
                AND id NOT IN (SELECT book_id FROM pub_audiobook_versions)
                ORDER BY id DESC
                """
            ).fetchall()

        result = []
        for row in rows:
            record = dict(row)
            record["qc_status"] = _quick_qc_status(record["file_path"])
            result.append(record)

        return {"audiobooks": result, "generating": [dict(r) for r in generating]}

    @app.get("/api/v1/audiobooks/{audiobook_id}/stream")
    def audiobook_stream(audiobook_id: int, request: Request):
        """Stream the M4B file with Range request support (required for WaveSurfer.js seeking)."""
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            ).fetchone()
        if not row:
            raise HTTPException(404, "Audiobook not found")
        path = Path(row["file_path"])
        if not path.exists():
            raise HTTPException(404, "Audio file not found on disk")

        file_size = path.stat().st_size
        range_header = request.headers.get("range")
        if range_header:
            try:
                if not range_header.startswith("bytes="):
                    raise ValueError("bad unit")
                range_spec = range_header[6:]
                if "," in range_spec:
                    # Multi-range not supported — return 416 with required Content-Range
                    return Response(
                        status_code=416,
                        headers={"Content-Range": f"bytes */{file_size}"},
                    )
                start_str, end_str = range_spec.split("-", 1)
                start = int(start_str)
                end = int(end_str) if end_str else file_size - 1
            except (ValueError, TypeError):
                return Response(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            if start >= file_size or end >= file_size or start > end:
                return Response(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            chunk_size = end - start + 1
            with open(path, "rb") as f:
                f.seek(start)
                data = f.read(chunk_size)
            return Response(
                content=data,
                status_code=206,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                    "Content-Type": "audio/mp4",
                },
            )
        # Full file fallback
        return FileResponse(
            str(path), media_type="audio/mp4", filename=path.name,
            headers={"Accept-Ranges": "bytes"},
        )

    @app.get("/api/v1/audiobooks/{audiobook_id}/transcript")
    def audiobook_transcript(audiobook_id: int):
        """Return the transcript.json content for an audiobook."""
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Audiobook not found")

        transcript_path = Path(row["file_path"]).parent / "transcript.json"
        if not transcript_path.exists():
            raise HTTPException(status_code=404, detail="transcript.json not found on disk")

        try:
            with open(transcript_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to read transcript: {exc}")

        return {"audiobook_id": audiobook_id, "transcript": data}

    @app.get("/api/v1/audiobooks/{audiobook_id}/qc")
    def audiobook_qc(audiobook_id: int):
        """Run a full QC check on an audiobook and return the report."""
        try:
            report = _run_qc(audiobook_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        return {"audiobook_id": audiobook_id, **report}

    @app.delete("/api/v1/audiobooks/{audiobook_id}")
    def delete_audiobook(audiobook_id: int):
        """Delete the audiobook record, M4B file, and audio_chapters directory."""
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Audiobook not found")

            book_id = row["book_id"]
            file_path = Path(row["file_path"])
            chapters_dir = file_path.parent / "audio_chapters"

            # 1. Remove DB record
            conn.execute(
                "DELETE FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            )
            # 2. Reset book status to 'formatted'
            conn.execute(
                "UPDATE pub_books SET status='formatted' WHERE id=?", (book_id,)
            )

        # 3. Delete M4B file
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as exc:
                print(f"[Audiobook] Warning: could not delete {file_path}: {exc}")

        # 4. Delete audio_chapters/ directory
        if chapters_dir.exists():
            try:
                shutil.rmtree(chapters_dir)
            except Exception as exc:
                print(f"[Audiobook] Warning: could not delete {chapters_dir}: {exc}")

        # Step 5: Delete transcript.json if present
        transcript_path = file_path.parent / "transcript.json"
        if transcript_path.exists():
            try:
                transcript_path.unlink()
            except Exception as exc:
                print(f"[Audiobook] Warning: could not delete {transcript_path}: {exc}")

        return {
            "status": "deleted",
            "audiobook_id": audiobook_id,
            "book_id": book_id,
        }

    # ── ROUTE: List available voices ──────────────────────────────────────────
    @app.get("/api/v1/voices")
    def list_voices():
        return {
            "voices": [
                {**v, "installed": _is_voice_installed(v["name"])}
                for v in _VOICES
            ]
        }

    # ── ROUTE: Download a voice model ─────────────────────────────────────────
    @app.post("/api/v1/voices/{voice_name}/download")
    def download_voice(voice_name: str, background_tasks: BackgroundTasks):
        voice_info = next((v for v in _VOICES if v["name"] == voice_name), None)
        if not voice_info:
            raise HTTPException(404, f"Unknown voice: {voice_name}")
        if _is_voice_installed(voice_name):
            return {"status": "already_installed"}
        background_tasks.add_task(_download_voice, voice_name, voice_info["hf_path"])
        return {"status": "downloading"}

    # ── ROUTE: Generate new audiobook from uploaded file ──────────────────────
    @app.post("/api/v1/audiobooks/generate")
    async def generate_new_audiobook(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        voice: str = Form("en_US-lessac-medium"),
    ):
        uploads_dir = _REPO / "publishing" / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        stem = Path(file.filename or "untitled").stem
        safe_stem = re.sub(r"[^\w\s-]", "", stem).strip()
        title = re.sub(r"[\s_-]+", " ", safe_stem).title()
        base_slug = re.sub(r"[\s_]+", "-", safe_stem.lower())
        base_slug = re.sub(r"-+", "-", base_slug).strip("-")
        if not base_slug:
            base_slug = "untitled"
        if not title:
            title = "Untitled"

        # Ensure unique slug
        slug = base_slug
        suffix = Path(file.filename or "file.txt").suffix.lower() or ".txt"
        with get_conn() as conn:
            n = 1
            while conn.execute("SELECT 1 FROM pub_books WHERE slug=?", (slug,)).fetchone():
                slug = f"{base_slug}-{n}"
                n += 1

        save_path = uploads_dir / f"{slug}{suffix}"
        content = await file.read()
        save_path.write_bytes(content)

        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO pub_books (title, slug, manuscript_path, status) VALUES (?,?,?,?)",
                (title, slug, str(save_path), "generating_audio"),
            )
            book_id = cur.lastrowid

        voice_info = next((v for v in _VOICES if v["name"] == voice), None)
        if voice_info and not _is_voice_installed(voice):
            background_tasks.add_task(
                _download_and_generate, book_id, voice, voice_info["hf_path"]
            )
            return {"book_id": book_id, "title": title, "status": "downloading_voice"}

        background_tasks.add_task(generate_audiobook, book_id, voice)
        return {"book_id": book_id, "title": title, "status": "generating"}

    # ── ROUTE: Download M4B as attachment ─────────────────────────────────────
    @app.get("/api/v1/audiobooks/{audiobook_id}/download")
    def audiobook_download(audiobook_id: int):
        with get_conn() as conn:
            row = conn.execute(
                """
                SELECT av.*, b.title FROM pub_audiobook_versions av
                JOIN pub_books b ON b.id = av.book_id
                WHERE av.id=?
                """,
                (audiobook_id,),
            ).fetchone()
        if not row:
            raise HTTPException(404, "Audiobook not found")
        path = Path(row["file_path"])
        if not path.exists():
            raise HTTPException(404, "Audio file not found on disk")
        safe_title = re.sub(r'[<>:"/\\|?*]', "", row["title"]) or "audiobook"
        filename = f"{safe_title}.m4b"
        return FileResponse(
            str(path),
            media_type="audio/mp4",
            filename=filename,
            headers={"Accept-Ranges": "bytes"},
        )

    @app.post("/api/v1/audiobooks/{audiobook_id}/regenerate")
    async def regenerate_audiobook(audiobook_id: int, background_tasks: BackgroundTasks):
        """Reset book to 'generating_audio' status and re-trigger audiobook generation."""
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Audiobook not found")

            book_id = row["book_id"]
            original_voice = row["voice"]

            # 1. Delete old audiobook version record
            conn.execute(
                "DELETE FROM pub_audiobook_versions WHERE id=?", (audiobook_id,)
            )
            # 2. Set book status to 'generating_audio' before kicking off background task
            conn.execute(
                "UPDATE pub_books SET status='generating_audio' WHERE id=?", (book_id,)
            )

        # 3. Trigger generate_audiobook as a background task
        background_tasks.add_task(generate_audiobook, book_id, original_voice)

        return {
            "status": "regeneration started",
            "audiobook_id": audiobook_id,
            "book_id": book_id,
        }
