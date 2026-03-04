"""FastCash — Atlas Worker: automated income engine.
Handles transcription (Whisper) and writing (Claude).
"""
import os
import sys
import json
import tempfile
from pathlib import Path
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv(str(Path(__file__).parent.parent / "backend" / ".env"))

from .database import get_conn, init_db

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

USER_PROFILE = {
    "name": "Christopher Mole",
    "company": "MoleHole Inc.",
    "credentials": "14-time Emmy Award winner, 25 years broadcast production",
    "clients": "ESPN, Netflix, HBO",
    "specialties": "documentary editing, post-production, film/TV",
}


def transcribe_audio(audio_url: str, task_id: int) -> str:
    """Download audio and transcribe with OpenAI Whisper. Returns transcript."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            resp = httpx.get(audio_url, follow_redirects=True, timeout=60)
            resp.raise_for_status()
            f.write(resp.content)
            tmp_path = f.name
        with open(tmp_path, "rb") as audio_file:
            resp = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": ("audio.mp3", audio_file, "audio/mpeg")},
                data={"model": "whisper-1", "response_format": "text"},
                timeout=120,
            )
            resp.raise_for_status()
        transcript = resp.text.strip()
        with get_conn() as conn:
            conn.execute(
                "UPDATE fastcash_tasks SET status='ready', output_text=?, completed_at=? WHERE id=?",
                (transcript, datetime.utcnow().isoformat(), task_id)
            )
        return transcript
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


def write_article(brief: str, word_count: int, task_id: int) -> str:
    """Use Claude to write an article matching a Textbroker brief."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""Write a {word_count}-word article based on this brief:

{brief}

Requirements:
- Approximately {word_count} words
- Professional, engaging tone
- SEO-friendly structure with subheadings
- No fluff, all substance
- Do not mention AI or that this was AI-generated

Return only the article text."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    article = msg.content[0].text.strip() if msg.content else ""

    with get_conn() as conn:
        conn.execute(
            "UPDATE fastcash_tasks SET status='ready', output_text=?, completed_at=? WHERE id=?",
            (article, datetime.utcnow().isoformat(), task_id)
        )
    return article


def generate_proposal(job_title: str, job_description: str, job_source: str) -> str:
    """Generate a tailored cover letter/proposal for Chris to review."""
    if not ANTHROPIC_API_KEY:
        return _fallback_proposal(job_title, job_source)

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""Write a short, punchy cover letter / proposal for this job posting.

Job: {job_title}
Platform: {job_source}
Description: {(job_description or '')[:800]}

Applicant profile:
- Name: {USER_PROFILE['name']}
- Company: {USER_PROFILE['company']}
- Credentials: {USER_PROFILE['credentials']}
- Notable clients: {USER_PROFILE['clients']}
- Specialties: {USER_PROFILE['specialties']}

Requirements:
- 3-4 short paragraphs max
- Lead with Emmy credentials immediately
- Specific to THIS job's requirements
- Confident but not arrogant
- End with a clear call to action
- No generic filler phrases

Return only the proposal text."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text.strip() if msg.content else _fallback_proposal(job_title, job_source)


def _fallback_proposal(job_title: str, job_source: str) -> str:
    return (
        f"Hi, I'm Christopher Mole, a 14-time Emmy Award-winning editor with 25 years "
        f"of broadcast production experience at ESPN, Netflix, and HBO.\n\n"
        f"I'm very interested in the {job_title} position. My background in documentary "
        f"and post-production work makes me an excellent fit for this role.\n\n"
        f"I'd love to discuss how my experience can benefit your project. "
        f"Please feel free to reach out — I'm available immediately."
    )


def queue_task(source: str, task_type: str, input_url: str = "",
               input_text: str = "") -> int:
    """Add a task to the Atlas worker queue. Returns task ID."""
    init_db()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO fastcash_tasks (source, task_type, input_url, input_text) VALUES (?,?,?,?)",
            (source, task_type, input_url, input_text)
        )
        return cur.lastrowid


def get_pending_tasks(limit: int = 5) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM fastcash_tasks WHERE status='queued' ORDER BY created_at LIMIT ?",
            (limit,)
        ).fetchall()]


def log_earning(source: str, task_type: str, amount: float, notes: str = ""):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO fastcash_earnings (source, task_type, amount, notes) VALUES (?,?,?,?)",
            (source, task_type, amount, notes)
        )
