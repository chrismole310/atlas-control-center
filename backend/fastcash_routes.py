"""FastCash API routes — imported and registered by main.py."""
import sys
import importlib.util
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Bootstrap fastcash imports without colliding with the backend's `database`
# module.  Each fastcash sub-module does `from database import ...` after
# inserting its own directory into sys.path.  We load them explicitly via
# importlib so that Python registers them under their canonical fastcash.*
# names and so the bare `database` name inside those files resolves to the
# fastcash copy (we temporarily shadow `sys.modules["database"]`).
# ---------------------------------------------------------------------------
_FC = Path(__file__).parent.parent / "fastcash"

def _load_fc_module(name: str, filepath: Path):
    """Load a fastcash module, briefly shadowing sys.modules['database']."""
    # Stash the backend database so we can restore it after the load.
    _orig = sys.modules.get("database")

    # Load fastcash.database first (if not already loaded) and shadow it.
    if "fastcash.database" not in sys.modules:
        spec = importlib.util.spec_from_file_location("fastcash.database", _FC / "database.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules["fastcash.database"] = mod
        spec.loader.exec_module(mod)
    sys.modules["database"] = sys.modules["fastcash.database"]

    # Also ensure sibling modules (job_scorer, scrapers_*) get loaded under
    # their fastcash.* names and shadowed as bare names during loading.
    for sibling in ("job_scorer", "scrapers_free", "scrapers_apify"):
        fc_key = f"fastcash.{sibling}"
        if fc_key not in sys.modules:
            sib_path = _FC / f"{sibling}.py"
            if sib_path.exists():
                sspec = importlib.util.spec_from_file_location(fc_key, sib_path)
                smod = importlib.util.module_from_spec(sspec)
                sys.modules[fc_key] = smod
                sys.modules[sibling] = smod  # shadow during exec
                sspec.loader.exec_module(smod)
            sys.modules[sibling] = sys.modules.get(fc_key, sys.modules.get(sibling))
        else:
            sys.modules[sibling] = sys.modules[fc_key]

    full_key = f"fastcash.{name}"
    if full_key not in sys.modules:
        spec = importlib.util.spec_from_file_location(full_key, filepath)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[full_key] = mod
        spec.loader.exec_module(mod)

    # Restore the backend database module.
    if _orig is not None:
        sys.modules["database"] = _orig
    elif "database" in sys.modules:
        del sys.modules["database"]

    return sys.modules[full_key]


_fc_db     = _load_fc_module("database",    _FC / "database.py")
_fc_scrape = _load_fc_module("scraper",     _FC / "scraper.py")
_fc_worker = _load_fc_module("atlas_worker", _FC / "atlas_worker.py")

get_jobs          = _fc_db.get_jobs
get_stats         = _fc_db.get_stats
get_conn          = _fc_db.get_conn
init_db           = _fc_db.init_db
run_full_scrape   = _fc_scrape.run_full_scrape
run_quick_scrape  = _fc_scrape.run_quick_scrape
generate_proposal = _fc_worker.generate_proposal


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
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM fastcash_jobs WHERE id=?", (job_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
            job = dict(row)

        proposal = generate_proposal(
            job["title"], job.get("description", ""), job["source"]
        )

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
