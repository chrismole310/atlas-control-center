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

import os

from fastcash.database import (
    get_jobs, get_stats, get_conn, init_db,
    get_trending_skills, get_market_opportunities,
    get_top_performers, get_market_demand,
)
from fastcash.scraper import run_full_scrape, run_quick_scrape
from fastcash.atlas_worker import generate_proposal
from fastcash.market_scraper import run_market_intelligence_scrape


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

    # ── Market Intelligence routes ──────────────────────────────────────────

    @app.get("/api/v1/fastcash/market/overview")
    def market_overview():
        init_db()
        with get_conn() as conn:
            total_jobs = conn.execute("SELECT COUNT(*) FROM fastcash_jobs").fetchone()[0]
            market_updated = conn.execute(
                "SELECT MAX(scraped_at) FROM trending_skills"
            ).fetchone()[0]
        return {
            "total_jobs": total_jobs,
            "last_scraped": market_updated,
            "has_data": market_updated is not None,
            "top_skills": get_trending_skills(5),
            "top_opportunities": get_market_opportunities(5),
        }

    @app.get("/api/v1/fastcash/market/demand")
    def market_demand_route(category: Optional[str] = None):
        init_db()
        try:
            return {"demand": get_market_demand(category=category)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    @app.get("/api/v1/fastcash/market/pricing")
    def market_pricing(category: Optional[str] = None):
        init_db()
        try:
            performers = get_top_performers(category=category)
            avg_market = (
                round(sum(p.get("rate_per_hour") or 0 for p in performers) / len(performers), 2)
                if performers else 0
            )
            return {
                "top_performers": performers,
                "market_avg_rate": avg_market,
                "your_rate": 150,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    @app.get("/api/v1/fastcash/market/skills")
    def market_skills():
        init_db()
        try:
            return {"skills": get_trending_skills(20)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    @app.get("/api/v1/fastcash/market/opportunities")
    def market_opportunities_route():
        init_db()
        try:
            return {"opportunities": get_market_opportunities(10)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    @app.get("/api/v1/fastcash/market/competitors")
    def market_competitors(category: Optional[str] = None, limit: int = 20):
        init_db()
        try:
            return {"competitors": get_top_performers(category=category, limit=limit)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {e}")

    @app.post("/api/v1/fastcash/market/analyze-me")
    def market_analyze_me():
        """Claude Haiku positioning analysis."""
        init_db()
        skills = get_trending_skills(8)
        opps = get_market_opportunities(5)
        if not skills:
            return {
                "analysis": "No market data yet. Click 'Analyze Market' first.",
                "top_skills": [],
                "top_opportunities": [],
            }
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            return {
                "analysis": "Set ANTHROPIC_API_KEY to enable AI analysis.",
                "top_skills": skills,
                "top_opportunities": opps,
            }
        try:
            import anthropic  # optional dependency — handled gracefully below if absent
            client = anthropic.Anthropic(api_key=api_key)
            skill_lines = "\n".join(
                f"- {s['skill_name']}: demand {s['demand_score']}/10, "
                f"opportunity {s['opportunity_score']}/10, pay +${s['avg_pay_premium']:+.0f}/hr"
                for s in skills
            )
            opp_lines = "\n".join(
                f"- {o['service_type']} ({o['opportunity_type']}): ${o['pay_potential']:.0f}/hr potential"
                for o in opps
            )
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=600,
                messages=[{"role": "user", "content": f"""Market data from live job postings:

Top skills by opportunity:
{skill_lines}

Top opportunities:
{opp_lines}

Profile: Christopher Mole, 14-time Emmy Award winner, 25 years broadcast production, ESPN/Netflix/HBO.

Give exactly 4 bullet points:
1. Rate recommendation ($XXX/hr based on Emmy credentials vs market data)
2. Best opportunity to pursue RIGHT NOW (specific service type, why)
3. One skill to add for highest pay premium ROI
4. One-sentence positioning statement for proposals

Be specific with numbers. 2 sentences max per bullet."""}],
            )
            analysis = msg.content[0].text if msg.content else "Analysis unavailable."
        except Exception as e:
            analysis = f"AI analysis error: {e}"
        return {"analysis": analysis, "top_skills": skills, "top_opportunities": opps}

    @app.post("/api/v1/fastcash/market/scrape")
    async def market_scrape(background_tasks: BackgroundTasks):
        background_tasks.add_task(run_market_intelligence_scrape)
        return {"status": "market intelligence scrape started"}
