"""
TRAX Gov Contract Tracker
Monitors USASpending.gov for large federal contract awards.
Strategy: large DoD/HHS/DHS contracts → trade sector ETFs/stocks on announcement.
API: https://api.usaspending.gov (free, no key needed)
"""

import httpx
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import GovContract, SessionLocal

# ─── USASpending.gov API ───────────────────────────────────────────────────────

USA_SPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/"

# Minimum contract size to track ($10M+)
MIN_CONTRACT_SIZE = 10_000_000

# ─── Agency → Sector → Trading Signal Mapping ─────────────────────────────────

AGENCY_SECTOR_MAP = {
    # Defense
    "Department of Defense": ("defense", ["LMT", "RTX", "NOC", "GD", "BA", "HII"]),
    "Department of the Army": ("defense", ["LMT", "RTX", "NOC", "GD"]),
    "Department of the Navy": ("defense", ["HII", "GD", "LMT", "RTX"]),
    "Department of the Air Force": ("defense", ["LMT", "NOC", "RTX", "BA"]),
    # Health
    "Department of Health and Human Services": ("health", ["UNH", "CVS", "ABC", "MCK", "JNJ"]),
    "Department of Veterans Affairs": ("health", ["UNH", "HUM", "CVS"]),
    # Tech/IT
    "General Services Administration": ("tech", ["MSFT", "AMZN", "GOOGL", "IBM", "ORCL"]),
    "Department of Homeland Security": ("tech_defense", ["CACI", "SAIC", "LEIDOS", "MSFT"]),
    # Energy
    "Department of Energy": ("energy", ["NEE", "DUK", "SO", "XOM", "CVX"]),
    # Infrastructure
    "Department of Transportation": ("infrastructure", ["CAT", "VMC", "MLM", "PWR"]),
}

NAICS_SECTOR_MAP = {
    # Defense / Aerospace
    "336": "defense",     # Transportation Equipment (includes aircraft)
    "332": "defense",     # Fabricated Metal Products
    "334": "tech",        # Computer & Electronic Products
    "541": "tech",        # Professional Services (often IT)
    "518": "tech",        # Data Processing & Hosting
    "621": "health",      # Ambulatory Health Care
    "622": "health",      # Hospitals
    "237": "infrastructure",  # Heavy Construction
    "211": "energy",      # Oil & Gas Extraction
    "221": "energy",      # Utilities
}

# Crypto correlation: risk-on sectors = good for BTC/ETH
RISK_ON_SECTORS = {"tech"}
RISK_OFF_SECTORS = {"defense"}


def get_sector_for_agency(agency: str) -> tuple[str, list[str]]:
    for key, (sector, tickers) in AGENCY_SECTOR_MAP.items():
        if key.lower() in agency.lower():
            return sector, tickers
    return "other", []


def get_sector_for_naics(naics: str) -> str:
    if not naics:
        return "other"
    prefix = naics[:3]
    return NAICS_SECTOR_MAP.get(prefix, "other")


def build_trading_signal(sector: str, tickers: list[str], amount: float, trade_type: str = "Purchase") -> str:
    if not tickers:
        return f"WATCH {sector.upper()} sector"
    top = tickers[:3]
    if sector in RISK_ON_SECTORS:
        return f"BUY {'/'.join(top)} — large {sector} contract = risk-on → consider BTC-USD"
    elif sector in RISK_OFF_SECTORS:
        return f"BUY {'/'.join(top)} — large defense contract, risk-off"
    return f"WATCH {'/'.join(top)} — {sector} contract ${amount/1e6:.0f}M"


async def fetch_recent_contracts(days_back: int = 7, min_amount: float = MIN_CONTRACT_SIZE) -> list[dict]:
    """Fetch recent large contract awards from USASpending.gov."""
    contracts = []
    end_date = datetime.utcnow().strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")

    payload = {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],  # contract types
            "date_type": "action_date",
            "date_range": {"start_date": start_date, "end_date": end_date},
            "award_amounts": [{"lower_bound": min_amount}],
        },
        "fields": [
            "Award ID", "Recipient Name", "Awarding Agency", "Award Amount",
            "Description", "Place of Performance State Code",
            "Period of Performance Start Date", "Period of Performance Current End Date",
            "NAICS Code", "NAICS Description", "Award Date",
        ],
        "sort": "Award Amount",
        "order": "desc",
        "limit": 100,
        "page": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(USA_SPENDING_URL, json=payload)
            data = resp.json()

        results = data.get("results", [])
        for item in results:
            amount = float(item.get("Award Amount") or 0)
            if amount < min_amount:
                continue

            agency = item.get("Awarding Agency", "")
            naics = str(item.get("NAICS Code", ""))
            award_id = str(item.get("Award ID", ""))

            sector, tickers = get_sector_for_agency(agency)
            if sector == "other":
                sector = get_sector_for_naics(naics)

            trading_signal = build_trading_signal(sector, tickers, amount)
            pop_start = item.get("Period of Performance Start Date", "")
            pop_end = item.get("Period of Performance Current End Date", "")
            pop = f"{pop_start} – {pop_end}" if pop_start and pop_end else pop_start or ""

            contracts.append({
                "award_id": award_id or f"USG-{len(contracts)}",
                "recipient": item.get("Recipient Name", ""),
                "awarding_agency": agency,
                "award_amount": amount,
                "description": (item.get("Description") or item.get("NAICS Description") or "")[:300],
                "sector": sector,
                "award_date": item.get("Award Date", end_date),
                "period_of_performance": pop,
                "place_of_performance": item.get("Place of Performance State Code", ""),
                "naics_code": naics,
                "usaspending_url": f"https://www.usaspending.gov/award/{award_id}/",
                "trading_signal": trading_signal,
            })

    except Exception as e:
        print(f"[GovContracts] USASpending fetch error: {e}")

    return contracts


def upsert_contracts(db: Session, contracts: list[dict]) -> int:
    count = 0
    for c in contracts:
        existing = db.query(GovContract).filter(
            GovContract.award_id == c["award_id"]
        ).first()
        if not existing:
            db.add(GovContract(**c))
            count += 1
    db.commit()
    return count


async def refresh_contracts(db: Session, days_back: int = 7) -> dict:
    contracts = await fetch_recent_contracts(days_back=days_back)
    new_count = upsert_contracts(db, contracts)
    return {
        "fetched": len(contracts),
        "new": new_count,
        "period_days": days_back,
        "refreshed_at": datetime.utcnow().isoformat(),
    }


def get_recent_contracts(db: Session, limit: int = 50, sector: Optional[str] = None) -> list[GovContract]:
    q = db.query(GovContract)
    if sector:
        q = q.filter(GovContract.sector == sector)
    return q.order_by(desc(GovContract.award_amount)).limit(limit).all()


def get_contract_signals(db: Session) -> list[dict]:
    """Return actionable trading signals from recent contracts."""
    contracts = db.query(GovContract).order_by(desc(GovContract.fetched_at)).limit(200).all()
    signals = []
    seen_signals = set()

    for c in contracts:
        if not c.trading_signal or c.trading_signal in seen_signals:
            continue
        seen_signals.add(c.trading_signal)

        is_crypto_signal = "BTC" in c.trading_signal or "ETH" in c.trading_signal
        signals.append({
            "signal": c.trading_signal,
            "sector": c.sector,
            "trigger": f"${c.award_amount/1e6:.0f}M contract — {c.recipient[:40]}",
            "agency": c.awarding_agency,
            "award_date": c.award_date,
            "amount": c.award_amount,
            "is_crypto_signal": is_crypto_signal,
            "confidence": "medium" if c.award_amount >= 100_000_000 else "low",
        })

    return signals[:20]


def get_contract_stats(db: Session) -> dict:
    contracts = db.query(GovContract).all()
    total_value = sum(c.award_amount for c in contracts if c.award_amount)
    by_sector: dict = {}
    for c in contracts:
        by_sector[c.sector] = by_sector.get(c.sector, 0) + 1
    return {
        "total_contracts": len(contracts),
        "total_value_billions": round(total_value / 1e9, 2),
        "by_sector": by_sector,
    }
