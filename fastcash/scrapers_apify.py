"""FastCash — Apify-based scrapers for Upwork, Indeed, LinkedIn."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "intelligence"))

from apify_client import run_actor
from job_scorer import score_job

ACTORS = {
    "upwork":   "upwork-vibe/upwork-scraper",
    "indeed":   "misceres/indeed-scraper",
    "linkedin": "bebity/linkedin-jobs-scraper",
}

VIDEO_QUERIES = [
    "video editor remote",
    "post production editor remote",
    "documentary editor freelance",
    "video editing freelance",
]

TRANSCRIPTION_QUERIES = [
    "transcription remote",
    "captioning remote",
]


def _normalize_upwork(item: dict) -> dict:
    return {
        "title": item.get("title") or item.get("job_title", ""),
        "company": item.get("client_name", "Upwork Client"),
        "source": "upwork",
        "url": item.get("url") or item.get("job_url", ""),
        "pay_rate": item.get("budget") or item.get("hourly_rate", ""),
        "pay_min": float(item.get("budget_min") or 0),
        "pay_max": float(item.get("budget_max") or 0),
        "remote": True,
        "start_date": "immediately",
        "payment_speed": "weekly",
        "skills": item.get("skills") or [],
        "description": (item.get("description") or "")[:1000],
        "tab": "chris",
    }


def _normalize_indeed(item: dict) -> dict:
    return {
        "title": item.get("positionName") or item.get("title", ""),
        "company": item.get("company", ""),
        "source": "indeed",
        "url": item.get("url") or item.get("jobUrl", ""),
        "pay_rate": item.get("salary", ""),
        "pay_min": 0,
        "pay_max": 0,
        "remote": True,
        "start_date": item.get("postedAt", ""),
        "payment_speed": "bi-weekly",
        "skills": [],
        "description": (item.get("description") or item.get("summary", ""))[:1000],
        "tab": "chris",
    }


def _normalize_linkedin(item: dict) -> dict:
    return {
        "title": item.get("title", ""),
        "company": item.get("companyName") or item.get("company", ""),
        "source": "linkedin",
        "url": item.get("jobUrl") or item.get("url", ""),
        "pay_rate": item.get("salary", ""),
        "pay_min": 0,
        "pay_max": 0,
        "remote": True,
        "start_date": item.get("postedAt", ""),
        "payment_speed": "bi-weekly",
        "skills": item.get("skills") or [],
        "description": (item.get("description") or "")[:1000],
        "tab": "chris",
    }


NORMALIZERS = {
    "upwork": _normalize_upwork,
    "indeed": _normalize_indeed,
    "linkedin": _normalize_linkedin,
}


def scrape_platform(platform: str, queries: list = None, max_items: int = 25) -> list:
    actor_id = ACTORS.get(platform)
    if not actor_id:
        print(f"[FastCash] Unknown platform: {platform}")
        return []

    queries = queries or VIDEO_QUERIES[:2]
    jobs = []
    normalizer = NORMALIZERS[platform]

    for query in queries:
        try:
            print(f"[FastCash] {platform}: searching '{query}'")
            if platform == "upwork":
                input_data = {"searchQuery": query, "maxItems": max_items}
            elif platform == "indeed":
                input_data = {"position": query, "country": "US",
                              "location": "remote", "maxItems": max_items}
            elif platform == "linkedin":
                input_data = {"keywords": query, "location": "Remote",
                              "maxResults": max_items}
            else:
                input_data = {"query": query, "maxItems": max_items}

            items, _ = run_actor(actor_id, input_data, timeout_secs=120)
            for item in items:
                if not isinstance(item, dict):
                    continue
                job = normalizer(item)
                if not job.get("url") or not job.get("title"):
                    continue
                job["score"] = score_job(job)
                jobs.append(job)
        except Exception as e:
            print(f"[FastCash] {platform}/{query} error: {e}")

    print(f"[FastCash] {platform}: {len(jobs)} jobs")
    return jobs


def run_apify_scrapers(include_transcription: bool = True) -> list:
    jobs = []
    for platform in ["upwork", "indeed", "linkedin"]:
        jobs.extend(scrape_platform(platform, VIDEO_QUERIES[:2]))
    if include_transcription:
        transcription_jobs = scrape_platform("upwork", TRANSCRIPTION_QUERIES, max_items=15)
        for j in transcription_jobs:
            j["tab"] = "atlas"
        jobs.extend(transcription_jobs)
    return jobs
