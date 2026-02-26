"""
TRAX Settlement Money Finder
Finds open class action settlements you can file claims for.
Sources: topclassactions.com RSS feed + ClassAction.org scraped listings
Strategy: passive income — file claims, collect checks
"""

import httpx
import re
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from xml.etree import ElementTree as ET

from database import Settlement, SessionLocal

# ─── Sources ──────────────────────────────────────────────────────────────────

SOURCES = [
    {
        "name": "Top Class Actions",
        "rss": "https://topclassactions.com/feed/",
        "type": "rss",
    },
    {
        "name": "ClassAction.org",
        "rss": "https://www.classaction.org/news/feed",
        "type": "rss",
    },
]

# High-value keywords — these often have large settlements
PRIORITY_KEYWORDS = [
    "google", "meta", "facebook", "apple", "amazon", "microsoft", "tiktok",
    "data breach", "privacy", "biometric", "facebook", "instagram",
    "netflix", "spotify", "uber", "lyft", "doordash", "airbnb",
    "bank of america", "wells fargo", "chase", "capital one",
    "equifax", "experian", "transunion",
    "t-mobile", "verizon", "at&t",
    "settlement fund", "class action settlement",
]

TECH_KEYWORDS = ["google", "meta", "apple", "amazon", "microsoft", "tiktok", "netflix",
                 "spotify", "uber", "data breach", "privacy", "biometric"]
FINANCE_KEYWORDS = ["bank", "wells fargo", "chase", "credit", "equifax", "experian"]
TELECOM_KEYWORDS = ["t-mobile", "verizon", "at&t", "sprint", "comcast", "xfinity"]


def categorize(title: str, description: str) -> str:
    text = (title + " " + description).lower()
    if any(k in text for k in TECH_KEYWORDS):
        return "tech"
    if any(k in text for k in FINANCE_KEYWORDS):
        return "finance"
    if any(k in text for k in TELECOM_KEYWORDS):
        return "telecom"
    if any(k in ["insurance", "health", "medical", "hospital"] for k in text.split()):
        return "health"
    return "consumer"


def is_priority(title: str, description: str) -> bool:
    text = (title + " " + description).lower()
    return any(k in text for k in PRIORITY_KEYWORDS)


def extract_deadline(text: str) -> Optional[str]:
    """Try to pull a deadline date from text."""
    # Match patterns like "deadline: January 15, 2025" or "file by 01/15/2025"
    patterns = [
        r"deadline[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})",
        r"file by[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})",
        r"submit.*?by[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})",
        r"(\d{1,2}/\d{1,2}/\d{4})",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return "Check website"


def extract_amount(text: str) -> str:
    """Try to extract settlement amount."""
    patterns = [
        r"\$[\d,.]+\s*(?:million|billion)?",
        r"[\d,.]+\s*million\s*(?:dollar|settlement)",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(0).strip()
    return "Undisclosed"


async def fetch_rss_settlements(source: dict) -> list[dict]:
    """Parse RSS feed for settlement listings."""
    results = []
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 TRAX/1.0"}) as client:
            resp = await client.get(source["rss"])
            root = ET.fromstring(resp.text)

        channel = root.find("channel")
        if channel is None:
            return []

        items = channel.findall("item")
        for item in items[:30]:
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            desc_raw = item.findtext("description", "")
            # Strip HTML tags
            desc_clean = re.sub(r"<[^>]+>", " ", desc_raw).strip()
            pub_date = item.findtext("pubDate", "")

            # Filter — only include actual settlement claim posts
            if not any(kw in (title + desc_clean).lower()
                       for kw in ["settlement", "claim", "class action", "lawsuit"]):
                continue

            deadline = extract_deadline(desc_clean)
            amount = extract_amount(title + " " + desc_clean)
            category = categorize(title, desc_clean)

            results.append({
                "case_name": title,
                "company": _extract_company(title),
                "settlement_amount": amount,
                "deadline": deadline,
                "claim_url": link,
                "description": desc_clean[:500],
                "category": category,
                "estimated_payout": None,
                "status": "open",
                "source_url": source["name"],
            })

    except Exception as e:
        print(f"[SettlementFinder] RSS fetch error ({source['name']}): {e}")

    return results


def _extract_company(title: str) -> str:
    """Try to extract company name from title."""
    # Common pattern: "Company Name Class Action Settlement"
    m = re.match(r"^([A-Za-z0-9\s&\.,'-]+?)\s+(?:class action|settlement|lawsuit|data breach)", title, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # Fallback: first 3 words
    words = title.split()
    return " ".join(words[:3]) if len(words) >= 3 else title


def upsert_settlements(db: Session, settlements: list[dict]) -> int:
    """Insert new settlements, skip duplicates by URL."""
    count = 0
    for s in settlements:
        existing = db.query(Settlement).filter(
            Settlement.claim_url == s["claim_url"]
        ).first()
        if not existing:
            db.add(Settlement(**s))
            count += 1
    db.commit()
    return count


async def refresh_settlements(db: Session) -> dict:
    """Fetch all sources and store."""
    import asyncio
    all_results = await asyncio.gather(*[fetch_rss_settlements(src) for src in SOURCES])
    all_settlements = [s for batch in all_results for s in batch]
    new_count = upsert_settlements(db, all_settlements)
    return {
        "fetched": len(all_settlements),
        "new": new_count,
        "sources": len(SOURCES),
        "refreshed_at": datetime.utcnow().isoformat(),
    }


def get_open_settlements(db: Session, limit: int = 50, category: Optional[str] = None) -> list[Settlement]:
    q = db.query(Settlement).filter(Settlement.status == "open")
    if category:
        q = q.filter(Settlement.category == category)
    return q.order_by(desc(Settlement.fetched_at)).limit(limit).all()


def get_settlement_stats(db: Session) -> dict:
    total = db.query(Settlement).count()
    open_count = db.query(Settlement).filter(Settlement.status == "open").count()
    filed = db.query(Settlement).filter(Settlement.status == "filed").count()
    by_category: dict = {}
    for s in db.query(Settlement).filter(Settlement.status == "open").all():
        by_category[s.category] = by_category.get(s.category, 0) + 1
    return {
        "total": total,
        "open": open_count,
        "filed": filed,
        "by_category": by_category,
    }
