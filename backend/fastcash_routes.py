"""FastCash API routes — imported and registered by main.py."""
import sys
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

# Add repo root to path so `import fastcash` works as a package
_REPO = Path(__file__).parent.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from fastcash.database import get_jobs, get_stats, get_conn, init_db
from fastcash.scraper import run_full_scrape, run_quick_scrape
from fastcash.atlas_worker import generate_proposal


class ApplyRequest(BaseModel):
    notes: Optional[str] = ""


def register_routes(app):
    """Mount all /api/v1/fastcash routes onto the FastAPI app."""

    @app.get("/api/v1/fastcash/stats")
    def fastcash_stats():
        init_db()
        return get_stats()

    @app.get("/api/v1/fastcash/jobs")
    def fastcash_jobs(
        tab: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        min_score: float = 0,
    ):
        init_db()
        jobs = get_jobs(tab=tab, limit=limit, offset=offset, min_score=min_score)
        return {"jobs": jobs, "count": len(jobs)}

    @app.get("/api/v1/fastcash/jobs/top")
    def fastcash_top_jobs(tab: Optional[str] = None, limit: int = 20):
        init_db()
        jobs = get_jobs(tab=tab, limit=limit, min_score=5.0)
        return {"jobs": jobs}

    @app.post("/api/v1/fastcash/scrape")
    async def fastcash_scrape(background_tasks: BackgroundTasks, quick: bool = True):
        fn = run_quick_scrape if quick else run_full_scrape
        background_tasks.add_task(fn)
        return {"status": "scraping started", "mode": "quick" if quick else "full"}

    @app.post("/api/v1/fastcash/apply/{job_id}")
    def fastcash_apply(job_id: int, req: ApplyRequest):
        init_db()
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM fastcash_jobs WHERE id=?", (job_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
            job = dict(row)
            if job.get("applied"):
                raise HTTPException(status_code=400, detail="Already applied to this job")

        try:
            proposal = generate_proposal(
                job["title"], job.get("description", ""), job["source"]
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Proposal generation failed: {e}")

        with get_conn() as conn:
            conn.execute(
                "UPDATE fastcash_jobs SET applied=1, applied_at=datetime('now'), status='applied' WHERE id=?",
                (job_id,)
            )
            conn.execute(
                "INSERT INTO fastcash_applications (job_id, cover_letter, notes) VALUES (?,?,?)",
                (job_id, proposal, req.notes or "")
            )
        return {"job_id": job_id, "proposal": proposal, "status": "applied"}

    @app.get("/api/v1/fastcash/tasks")
    def fastcash_tasks(status: Optional[str] = None, limit: int = 20):
        init_db()
        with get_conn() as conn:
            q = "SELECT * FROM fastcash_tasks"
            params: list = []
            if status:
                q += " WHERE status=?"
                params.append(status)
            q += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            tasks = [dict(r) for r in conn.execute(q, params).fetchall()]
        return {"tasks": tasks}

    @app.get("/api/v1/fastcash/earnings")
    def fastcash_earnings(limit: int = 50):
        init_db()
        with get_conn() as conn:
            rows = [dict(r) for r in conn.execute(
                "SELECT * FROM fastcash_earnings ORDER BY earned_at DESC LIMIT ?",
                (limit,)
            ).fetchall()]
            total = conn.execute(
                "SELECT COALESCE(SUM(amount),0) FROM fastcash_earnings"
            ).fetchone()[0]
        return {"earnings": rows, "total": round(total, 2)}
