"""
TRAX NYC Housing Lottery Tracker
Monitors NYC Housing Connect for new affordable housing lottery listings.
Auto-tracks deadlines and application status.
Source: NYC Housing Connect public listing data
"""

import httpx
import re
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import HousingListing, SessionLocal

# ─── NYC Housing Connect API ──────────────────────────────────────────────────
# NYC Open Data has affordable housing data; Housing Connect also has a public search

NYC_HOUSING_CONNECT_URL = "https://housingconnect.nyc.gov/PublicWeb/api/lottery/search"
NYC_OPEN_DATA_URL = "https://data.cityofnewyork.us/resource/hg8x-zxpr.json"

BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]


async def fetch_housing_connect_listings() -> list[dict]:
    """
    Fetch open lottery listings from NYC Housing Connect.
    Uses the public search API (no auth required).
    """
    listings = []
    try:
        payload = {
            "pageIndex": 1,
            "pageSize": 50,
            "lotteryStatus": ["Open"],
        }
        async with httpx.AsyncClient(timeout=20.0,
                                     headers={"Content-Type": "application/json",
                                              "User-Agent": "Mozilla/5.0 TRAX/1.0"}) as client:
            resp = await client.post(NYC_HOUSING_CONNECT_URL, json=payload)

            if resp.status_code != 200:
                print(f"[HousingLottery] Housing Connect returned {resp.status_code}")
                return []

            data = resp.json()

        for item in data.get("lotteries", []):
            lottery_id = str(item.get("lotteryId", item.get("id", "")))
            building_name = item.get("buildingName", item.get("projectName", "Unknown"))
            address = item.get("address", "")
            borough = item.get("borough", "")
            deadline = item.get("lotteryDate", item.get("deadline", ""))
            lottery_url = f"https://housingconnect.nyc.gov/PublicWeb/details/{lottery_id}"

            units = item.get("totalUnits", None)
            rent_min = item.get("minRent", None)
            rent_max = item.get("maxRent", None)

            listings.append({
                "lottery_id": lottery_id,
                "building_name": building_name,
                "address": address,
                "borough": borough,
                "units_available": units,
                "income_min": item.get("minIncome"),
                "income_max": item.get("maxIncome"),
                "household_size": str(item.get("householdSize", "")),
                "rent_min": rent_min,
                "rent_max": rent_max,
                "deadline": str(deadline),
                "lottery_url": lottery_url,
                "status": "open",
            })

    except Exception as e:
        print(f"[HousingLottery] Housing Connect fetch error: {e}")

    # If Housing Connect API unavailable, try NYC Open Data fallback
    if not listings:
        listings = await fetch_open_data_listings()

    return listings


async def fetch_open_data_listings() -> list[dict]:
    """Fallback: NYC Open Data affordable housing units."""
    listings = []
    try:
        params = {
            "$limit": 50,
            "$order": "project_start_date DESC",
            "$where": "reporting_construction_type='New Construction'",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(NYC_OPEN_DATA_URL, params=params)
            data = resp.json()

        seen = set()
        for item in data:
            project_id = item.get("project_id", item.get("building_id", ""))
            if not project_id or project_id in seen:
                continue
            seen.add(project_id)

            borough = item.get("borough", item.get("community_district", ""))
            address = item.get("building_completion_date", "")
            name = item.get("project_name", item.get("building_name", f"NYC Project {project_id}"))

            listings.append({
                "lottery_id": str(project_id),
                "building_name": name,
                "address": address,
                "borough": borough,
                "units_available": _safe_int(item.get("total_units")),
                "income_min": None,
                "income_max": None,
                "household_size": None,
                "rent_min": _safe_int(item.get("extended_affordability_status")),
                "rent_max": None,
                "deadline": item.get("building_completion_date", "TBD"),
                "lottery_url": f"https://housingconnect.nyc.gov",
                "status": "open",
            })

    except Exception as e:
        print(f"[HousingLottery] Open Data fetch error: {e}")

    return listings


def _safe_int(val) -> Optional[int]:
    try:
        return int(float(str(val).replace(",", "")))
    except (ValueError, TypeError):
        return None


def upsert_listings(db: Session, listings: list[dict]) -> int:
    count = 0
    for listing in listings:
        existing = db.query(HousingListing).filter(
            HousingListing.lottery_id == listing["lottery_id"]
        ).first()
        if not existing:
            db.add(HousingListing(**listing))
            count += 1
        else:
            # Update deadline if changed
            if listing.get("deadline") and existing.deadline != listing["deadline"]:
                existing.deadline = listing["deadline"]
    db.commit()
    return count


async def refresh_listings(db: Session) -> dict:
    listings = await fetch_housing_connect_listings()
    new_count = upsert_listings(db, listings)
    return {
        "fetched": len(listings),
        "new": new_count,
        "refreshed_at": datetime.utcnow().isoformat(),
    }


def get_open_listings(db: Session, borough: Optional[str] = None) -> list[HousingListing]:
    q = db.query(HousingListing).filter(HousingListing.status == "open")
    if borough:
        q = q.filter(HousingListing.borough.ilike(f"%{borough}%"))
    return q.order_by(desc(HousingListing.fetched_at)).limit(50).all()


def mark_applied(db: Session, listing_id: int) -> HousingListing:
    listing = db.query(HousingListing).filter(HousingListing.id == listing_id).first()
    if listing:
        listing.status = "applied"
        listing.applied_at = datetime.utcnow()
        db.commit()
    return listing


def get_housing_stats(db: Session) -> dict:
    total = db.query(HousingListing).count()
    open_count = db.query(HousingListing).filter(HousingListing.status == "open").count()
    applied = db.query(HousingListing).filter(HousingListing.status == "applied").count()
    return {
        "total_tracked": total,
        "open": open_count,
        "applied": applied,
    }
