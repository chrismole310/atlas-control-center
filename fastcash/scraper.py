"""FastCash — Main scrape orchestrator."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from database import init_db, upsert_job, get_stats
from scrapers_free import run_free_scrapers
from scrapers_apify import run_apify_scrapers


def run_full_scrape(include_apify: bool = True) -> dict:
    """Run all scrapers and save results. Returns summary."""
    init_db()
    start = datetime.utcnow()
    all_jobs = []

    print("[FastCash] Starting free scrapers...")
    all_jobs.extend(run_free_scrapers())

    if include_apify:
        print("[FastCash] Starting Apify scrapers...")
        all_jobs.extend(run_apify_scrapers())

    new_count = sum(1 for job in all_jobs if upsert_job(job))

    elapsed = (datetime.utcnow() - start).seconds
    stats = get_stats()
    result = {
        "scraped": len(all_jobs),
        "new": new_count,
        "elapsed_secs": elapsed,
        "stats": stats,
        "ran_at": start.isoformat(),
    }
    print(f"[FastCash] Done. {len(all_jobs)} scraped, {new_count} new in {elapsed}s")
    return result


def run_quick_scrape() -> dict:
    """Free APIs only — no Apify credits used."""
    return run_full_scrape(include_apify=False)


if __name__ == "__main__":
    result = run_quick_scrape()
    print(result)
