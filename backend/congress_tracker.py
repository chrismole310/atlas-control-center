"""
TRAX Congress Trade Tracker
Monitors Congressional financial disclosures via Quiver Quantitative API (free).
Strategy: notable politicians disclose trades up to 45 days late — buy on announcement.
Data: https://api.quiverquant.com/beta/live/congresstrading
"""

import httpx
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import CongressTrade, SessionLocal

# ─── Data Source ──────────────────────────────────────────────────────────────

QUIVERQUANT_URL = "https://api.quiverquant.com/beta/live/congresstrading"

# ─── VIP Traders (high signal value) ─────────────────────────────────────────

VIP_POLITICIANS = {
    "nancy pelosi":      {"note": "Speaker emeritus — tech/defense, LEAPS options"},
    "paul pelosi":       {"note": "Nancy's spouse — aggressive options trader"},
    "tommy tuberville":  {"note": "Senate Armed Services — very active, agriculture/defense"},
    "austin scott":      {"note": "House Armed Services Committee"},
    "dan crenshaw":      {"note": "House Intelligence Committee"},
    "michael mccaul":    {"note": "House Foreign Affairs Committee"},
    "brian mast":        {"note": "House Foreign Affairs"},
    "josh gottheimer":   {"note": "House Financial Services Committee"},
    "virginia foxx":     {"note": "House Education & Workforce Chair"},
    "kevin hern":        {"note": "House Budget Committee"},
    "pete sessions":     {"note": "House Rules Committee"},
    "mark warner":       {"note": "Senate Intelligence Committee — tech investor"},
    "ron johnson":       {"note": "Senate Finance Committee"},
    "sheldon whitehouse":{"note": "Senate Finance & Judiciary"},
    "michael waltz":     {"note": "House Armed Services — defense"},
    "greg gianforte":    {"note": "Governor turned House — tech/ag"},
    "cleo fields":       {"note": "House freshman — active trader"},
}

TECH_TICKERS  = {"AAPL","MSFT","GOOGL","GOOG","NVDA","AMD","META","AMZN","TSLA","NFLX","CRM","ORCL","INTC","QCOM","AVGO","LRCX","AMAT"}
DEFENSE_TICKERS = {"LMT","RTX","NOC","GD","BA","HII","L3H","CACI","SAIC","LDOS"}
CRYPTO_TICKERS  = {"MSTR","COIN","RIOT","MARA","SQ","PYPL","HOOD"}

SECTOR_MAP = (
    (TECH_TICKERS,    "tech",    "BUY BTC-USD or ETH-USD — risk-on signal"),
    (DEFENSE_TICKERS, "defense", "BUY LMT/RTX — defense sector"),
    (CRYPTO_TICKERS,  "crypto",  "BUY BTC-USD — direct crypto proxy"),
)


def classify_ticker(ticker: str) -> tuple[str, str]:
    """Return (sector, crypto_signal) for a ticker."""
    t = ticker.upper()
    for tickers, sector, signal in SECTOR_MAP:
        if t in tickers:
            return sector, signal
    return "other", ""


# ─── Fetch ────────────────────────────────────────────────────────────────────

async def fetch_quiverquant_trades(limit: int = 1000) -> list[dict]:
    """Fetch latest congressional trades from Quiver Quantitative (free API)."""
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": "Mozilla/5.0 TRAX-CongressTracker/1.0"},
            follow_redirects=True,
        ) as client:
            resp = await client.get(QUIVERQUANT_URL)
            data = resp.json()

        trades = []
        for item in data[:limit]:
            politician = (item.get("Representative") or "").strip()
            ticker = (item.get("Ticker") or "").strip().upper()

            if not ticker or ticker == "--":
                continue

            trade_type = item.get("Transaction", "").strip()   # "Purchase" or "Sale"
            report_date = item.get("ReportDate", "")
            tx_date = item.get("TransactionDate", "")
            amount_range = item.get("Range", "")
            amount_min_raw = item.get("Amount")
            chamber_raw = item.get("House", "")
            chamber = "House" if "rep" in chamber_raw.lower() else "Senate"
            party = item.get("Party", "")

            amount_min = float(amount_min_raw) if amount_min_raw else None
            amount_max = _parse_range_max(amount_range)

            # Disclosure lag
            lag = None
            try:
                t = datetime.strptime(tx_date, "%Y-%m-%d")
                d = datetime.strptime(report_date, "%Y-%m-%d")
                lag = max(0, (d - t).days)
            except ValueError:
                pass

            trades.append({
                "source": "quiverquant",
                "chamber": chamber,
                "politician": politician,
                "party": party,
                "ticker": ticker,
                "asset_description": item.get("Description") or ticker,
                "trade_type": trade_type,
                "amount_range": amount_range,
                "amount_min": amount_min,
                "amount_max": amount_max,
                "transaction_date": tx_date,
                "disclosure_date": report_date,
                "disclosure_lag_days": lag,
                "is_vip": 1 if politician.lower() in VIP_POLITICIANS else 0,
                "ptr_link": f"https://www.quiverquant.com/congresstrading/politician/{item.get('BioGuideID','')}",
            })

        return trades

    except Exception as e:
        print(f"[CongressTracker] QuiverQuant fetch error: {e}")
        return []


def _parse_range_max(range_str: str) -> Optional[float]:
    """'$15,001 - $50,000' → 50000.0"""
    import re
    nums = re.findall(r"[\d,]+", range_str.replace("$", ""))
    cleaned = [float(n.replace(",", "")) for n in nums if n]
    return cleaned[-1] if cleaned else None


# ─── Upsert ───────────────────────────────────────────────────────────────────

def upsert_trades(db: Session, trades: list[dict]) -> int:
    count = 0
    for t in trades:
        existing = db.query(CongressTrade).filter(
            CongressTrade.politician == t["politician"],
            CongressTrade.ticker == t["ticker"],
            CongressTrade.transaction_date == t["transaction_date"],
            CongressTrade.trade_type == t["trade_type"],
        ).first()
        if not existing:
            db.add(CongressTrade(**t))
            count += 1
    db.commit()
    return count


async def refresh_congress_data(db: Session) -> dict:
    trades = await fetch_quiverquant_trades(1000)
    new_count = upsert_trades(db, trades)
    return {
        "fetched": len(trades),
        "new": new_count,
        "source": "QuiverQuantitative",
        "refreshed_at": datetime.utcnow().isoformat(),
    }


# ─── Queries ──────────────────────────────────────────────────────────────────

def get_recent_trades(db: Session, limit: int = 100, vip_only: bool = False) -> list[CongressTrade]:
    q = db.query(CongressTrade)
    if vip_only:
        q = q.filter(CongressTrade.is_vip == 1)
    return q.order_by(desc(CongressTrade.transaction_date)).limit(limit).all()


def get_leaderboard(db: Session) -> list[dict]:
    trades = db.query(CongressTrade).filter(CongressTrade.is_vip == 1).all()
    counts: dict = {}
    for t in trades:
        name = t.politician
        if name not in counts:
            counts[name] = {
                "name": name,
                "chamber": t.chamber,
                "party": t.party or "?",
                "trades": 0,
                "purchases": 0,
                "sales": 0,
                "note": VIP_POLITICIANS.get(name.lower(), {}).get("note", ""),
            }
        counts[name]["trades"] += 1
        if t.trade_type == "Purchase":
            counts[name]["purchases"] += 1
        else:
            counts[name]["sales"] += 1

    return sorted(counts.values(), key=lambda x: x["trades"], reverse=True)[:15]


# ─── Signal Generation ────────────────────────────────────────────────────────

def generate_signals(trades: list[CongressTrade]) -> list[dict]:
    """Generate copy-trade signals from VIP congressional disclosures."""
    signals = []
    seen = set()

    for trade in trades:
        if not trade.is_vip:
            continue

        key = f"{trade.politician}-{trade.ticker}-{trade.trade_type}-{trade.transaction_date}"
        if key in seen:
            continue
        seen.add(key)

        vip_info = VIP_POLITICIANS.get(trade.politician.lower(), {})
        sector, crypto_signal = classify_ticker(trade.ticker)
        amount_label = trade.amount_range or "Unknown amount"

        # Crypto proxy buys
        if sector == "crypto" and trade.trade_type == "Purchase":
            signals.append({
                "type": "crypto_proxy",
                "politician": trade.politician,
                "chamber": trade.chamber,
                "party": trade.party or "?",
                "ticker": trade.ticker,
                "trade_type": trade.trade_type,
                "amount_range": amount_label,
                "transaction_date": trade.transaction_date,
                "disclosure_date": trade.disclosure_date,
                "lag_days": trade.disclosure_lag_days,
                "signal": f"BUY BTC-USD",
                "reason": f"{trade.politician} bought {trade.ticker} ({vip_info.get('note','VIP trader')}) — direct crypto exposure signal",
                "confidence": "high",
                "action": "BUY BTC-USD on paper account",
            })

        # Tech purchases → risk-on → BTC/ETH
        elif sector == "tech" and trade.trade_type == "Purchase":
            signals.append({
                "type": "tech_risk_on",
                "politician": trade.politician,
                "chamber": trade.chamber,
                "party": trade.party or "?",
                "ticker": trade.ticker,
                "trade_type": trade.trade_type,
                "amount_range": amount_label,
                "transaction_date": trade.transaction_date,
                "disclosure_date": trade.disclosure_date,
                "lag_days": trade.disclosure_lag_days,
                "signal": "BUY ETH-USD",
                "reason": f"{trade.politician} ({vip_info.get('note','VIP')}) bought {trade.ticker} — tech sector buying = risk-on",
                "confidence": "medium",
                "action": "Consider BUY ETH-USD or BTC-USD",
            })

        # Large purchases ($50k+) by any VIP
        elif (trade.amount_max or 0) >= 50_000 and trade.trade_type == "Purchase":
            signals.append({
                "type": "large_purchase",
                "politician": trade.politician,
                "chamber": trade.chamber,
                "party": trade.party or "?",
                "ticker": trade.ticker,
                "trade_type": trade.trade_type,
                "amount_range": amount_label,
                "transaction_date": trade.transaction_date,
                "disclosure_date": trade.disclosure_date,
                "lag_days": trade.disclosure_lag_days,
                "signal": f"WATCH {trade.ticker}",
                "reason": f"{trade.politician} made large {trade.ticker} purchase ({amount_label})",
                "confidence": "low",
                "action": f"Research {trade.ticker} — insider buying at scale",
            })

    # If no signals from VIPs, show most recent VIP trade
    if not signals and trades:
        t = trades[0]
        signals.append({
            "type": "info",
            "politician": t.politician,
            "chamber": t.chamber,
            "party": t.party or "?",
            "ticker": t.ticker,
            "trade_type": t.trade_type,
            "amount_range": t.amount_range or "",
            "transaction_date": t.transaction_date,
            "disclosure_date": t.disclosure_date,
            "lag_days": t.disclosure_lag_days,
            "signal": "HOLD",
            "reason": "No high-confidence signals from tracked VIP politicians",
            "confidence": "n/a",
            "action": "Monitor and wait for signal",
        })

    return signals[:10]
