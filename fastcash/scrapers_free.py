"""FastCash — Free API scrapers: RemoteOK (JSON) + WeWorkRemotely (RSS)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import httpx
import feedparser
from job_scorer import score_job

REMOTEOK_URL = "https://remoteok.com/api"
WWR_FEEDS = [
    "https://weworkremotely.com/remote-jobs.rss",
    "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "https://weworkremotely.com/categories/all-other-remote-jobs.rss",
]


def scrape_remoteok() -> list:
    jobs = []
    try:
        headers = {"User-Agent": "Atlas-FastCash/1.0"}
        resp = httpx.get(REMOTEOK_URL, headers=headers, timeout=15)
        data = resp.json()
        for item in data:
            if not isinstance(item, dict) or not item.get("position"):
                continue
            title = item.get("position", "")
            desc = item.get("description", "")
            tags = item.get("tags") or []
            pay_min = float(item.get("salary_min") or 0)
            pay_max = float(item.get("salary_max") or 0)
            job = {
                "title": title,
                "company": item.get("company", ""),
                "source": "remoteok",
                "url": item.get("url") or f"https://remoteok.com/l/{item.get('id','')}",
                "pay_rate": f"${pay_min/1000:.0f}k-${pay_max/1000:.0f}k/yr" if pay_max else "",
                "pay_min": pay_min / 2080 if pay_min else 0,
                "pay_max": pay_max / 2080 if pay_max else 0,
                "remote": True,
                "start_date": "immediately",
                "payment_speed": "bi-weekly",
                "skills": tags,
                "description": (desc or "")[:1000],
                "tab": "chris",
            }
            job["score"] = score_job(job)
            jobs.append(job)
    except Exception as e:
        print(f"[FastCash] RemoteOK error: {e}")
    print(f"[FastCash] RemoteOK: {len(jobs)} jobs")
    return jobs


def scrape_weworkremotely() -> list:
    jobs = []
    for feed_url in WWR_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                title = entry.get("title", "")
                desc = entry.get("summary", "")
                link = entry.get("link", "")
                if not link:
                    continue
                job = {
                    "title": title,
                    "company": entry.get("author", ""),
                    "source": "weworkremotely",
                    "url": link,
                    "pay_rate": "",
                    "pay_min": 0,
                    "pay_max": 0,
                    "remote": True,
                    "start_date": "immediately",
                    "payment_speed": "bi-weekly",
                    "skills": [],
                    "description": (desc or "")[:1000],
                    "tab": "chris",
                }
                job["score"] = score_job(job)
                jobs.append(job)
        except Exception as e:
            print(f"[FastCash] WWR {feed_url} error: {e}")
    print(f"[FastCash] WeWorkRemotely: {len(jobs)} jobs")
    return jobs


def run_free_scrapers() -> list:
    jobs = []
    jobs.extend(scrape_remoteok())
    jobs.extend(scrape_weworkremotely())
    return jobs
