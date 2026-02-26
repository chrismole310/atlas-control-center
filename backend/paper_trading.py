"""
TRAX Paper Trading Engine
Trades with virtual $1000 using real market prices from CoinGecko (free API).
Zero risk - proves strategy before real capital is deployed.
"""

import asyncio
import httpx
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from database import (
    PaperBalance, PaperPosition, PaperTrade, get_db, SessionLocal
)

PAPER_STARTING_BALANCE = 1000.0
MAX_PAPER_TRADE_SIZE = 200.0  # max $200 per trade
MIN_PAPER_TRADE_SIZE = 5.0    # min $5 per trade

SUPPORTED_SYMBOLS = {
    "BTC-USD": "bitcoin",
    "ETH-USD": "ethereum",
    "SOL-USD": "solana",
}

# In-memory cache for prices (refreshed every 30s)
_price_cache: dict = {}
_price_cache_ts: float = 0.0
CACHE_TTL = 30  # seconds


async def fetch_live_prices() -> dict:
    """Fetch current prices from CoinGecko (free, no API key needed)."""
    global _price_cache, _price_cache_ts

    now = datetime.utcnow().timestamp()
    if now - _price_cache_ts < CACHE_TTL and _price_cache:
        return _price_cache

    ids = ",".join(SUPPORTED_SYMBOLS.values())
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd&include_24hr_change=true"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            data = resp.json()

        prices = {}
        for symbol, cg_id in SUPPORTED_SYMBOLS.items():
            if cg_id in data:
                prices[symbol] = {
                    "price": data[cg_id]["usd"],
                    "change_24h": round(data[cg_id].get("usd_24h_change", 0), 2),
                }
        _price_cache = prices
        _price_cache_ts = now
        return prices
    except Exception as e:
        print(f"[PriceEngine] CoinGecko fetch failed: {e}")
        # Return stale cache or zeros
        return _price_cache or {s: {"price": 0.0, "change_24h": 0.0} for s in SUPPORTED_SYMBOLS}


def get_or_create_paper_balance(db: Session) -> PaperBalance:
    balance = db.query(PaperBalance).first()
    if not balance:
        balance = PaperBalance(
            usd_balance=PAPER_STARTING_BALANCE,
            total_pnl=0.0,
        )
        db.add(balance)
        db.commit()
        db.refresh(balance)
    return balance


def get_positions(db: Session) -> list[PaperPosition]:
    return db.query(PaperPosition).all()


def get_position(db: Session, symbol: str) -> Optional[PaperPosition]:
    return db.query(PaperPosition).filter(PaperPosition.symbol == symbol).first()


async def paper_buy(db: Session, symbol: str, usd_amount: float) -> dict:
    """Buy crypto with USD amount. Returns result dict."""
    if symbol not in SUPPORTED_SYMBOLS:
        return {"success": False, "error": f"Unsupported symbol. Supported: {list(SUPPORTED_SYMBOLS.keys())}"}

    if usd_amount < MIN_PAPER_TRADE_SIZE:
        return {"success": False, "error": f"Minimum trade size is ${MIN_PAPER_TRADE_SIZE}"}

    if usd_amount > MAX_PAPER_TRADE_SIZE:
        return {"success": False, "error": f"Maximum trade size is ${MAX_PAPER_TRADE_SIZE}"}

    prices = await fetch_live_prices()
    if symbol not in prices or prices[symbol]["price"] == 0:
        return {"success": False, "error": "Unable to fetch live price"}

    current_price = prices[symbol]["price"]
    quantity = usd_amount / current_price

    balance = get_or_create_paper_balance(db)
    if balance.usd_balance < usd_amount:
        return {"success": False, "error": f"Insufficient paper balance. Have ${balance.usd_balance:.2f}, need ${usd_amount:.2f}"}

    # Deduct USD
    balance.usd_balance -= usd_amount
    balance.last_updated = datetime.utcnow()

    # Update or create position
    position = get_position(db, symbol)
    if position:
        # Average down/up
        total_qty = position.quantity + quantity
        total_cost = (position.quantity * position.avg_entry_price) + usd_amount
        position.avg_entry_price = total_cost / total_qty
        position.quantity = total_qty
    else:
        position = PaperPosition(
            symbol=symbol,
            quantity=quantity,
            avg_entry_price=current_price,
        )
        db.add(position)

    # Record trade
    trade = PaperTrade(
        symbol=symbol,
        action="buy",
        quantity=quantity,
        price=current_price,
        total_value=usd_amount,
        pnl=None,
        note=f"Paper buy {quantity:.6f} {symbol.split('-')[0]} @ ${current_price:,.2f}",
    )
    db.add(trade)
    db.commit()

    return {
        "success": True,
        "action": "buy",
        "symbol": symbol,
        "quantity": round(quantity, 8),
        "price": current_price,
        "total_usd": usd_amount,
        "new_balance": round(balance.usd_balance, 2),
        "position_qty": round(position.quantity, 8),
    }


async def paper_sell(db: Session, symbol: str, quantity: Optional[float] = None, sell_all: bool = False) -> dict:
    """Sell crypto position. quantity=None + sell_all=True sells entire position."""
    if symbol not in SUPPORTED_SYMBOLS:
        return {"success": False, "error": f"Unsupported symbol"}

    position = get_position(db, symbol)
    if not position or position.quantity <= 0:
        return {"success": False, "error": f"No open position in {symbol}"}

    prices = await fetch_live_prices()
    if symbol not in prices or prices[symbol]["price"] == 0:
        return {"success": False, "error": "Unable to fetch live price"}

    current_price = prices[symbol]["price"]

    if sell_all or quantity is None:
        sell_qty = position.quantity
    else:
        sell_qty = min(quantity, position.quantity)

    usd_received = sell_qty * current_price
    cost_basis = sell_qty * position.avg_entry_price
    pnl = usd_received - cost_basis

    # Update balance
    balance = get_or_create_paper_balance(db)
    balance.usd_balance += usd_received
    balance.total_pnl += pnl
    balance.last_updated = datetime.utcnow()

    # Update position
    if sell_qty >= position.quantity:
        db.delete(position)
    else:
        position.quantity -= sell_qty

    # Record trade
    trade = PaperTrade(
        symbol=symbol,
        action="sell",
        quantity=sell_qty,
        price=current_price,
        total_value=usd_received,
        pnl=round(pnl, 2),
        note=f"Paper sell {sell_qty:.6f} {symbol.split('-')[0]} @ ${current_price:,.2f} | PnL: ${pnl:+.2f}",
    )
    db.add(trade)
    db.commit()

    return {
        "success": True,
        "action": "sell",
        "symbol": symbol,
        "quantity": round(sell_qty, 8),
        "price": current_price,
        "total_usd": round(usd_received, 2),
        "pnl": round(pnl, 2),
        "pnl_pct": round((pnl / cost_basis) * 100, 2),
        "new_balance": round(balance.usd_balance, 2),
    }


async def get_paper_portfolio(db: Session) -> dict:
    """Get complete paper portfolio snapshot with live prices."""
    prices = await fetch_live_prices()
    balance = get_or_create_paper_balance(db)
    positions = get_positions(db)

    holdings = []
    total_holdings_value = 0.0

    for pos in positions:
        price_data = prices.get(pos.symbol, {"price": 0.0, "change_24h": 0.0})
        current_price = price_data["price"]
        market_value = pos.quantity * current_price
        cost_basis = pos.quantity * pos.avg_entry_price
        unrealized_pnl = market_value - cost_basis
        total_holdings_value += market_value

        holdings.append({
            "symbol": pos.symbol,
            "quantity": round(pos.quantity, 8),
            "avg_entry_price": round(pos.avg_entry_price, 2),
            "current_price": current_price,
            "market_value": round(market_value, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "unrealized_pnl_pct": round((unrealized_pnl / cost_basis) * 100, 2) if cost_basis > 0 else 0,
            "change_24h": price_data["change_24h"],
        })

    total_value = balance.usd_balance + total_holdings_value
    total_return = total_value - PAPER_STARTING_BALANCE
    total_return_pct = (total_return / PAPER_STARTING_BALANCE) * 100

    return {
        "usd_balance": round(balance.usd_balance, 2),
        "holdings_value": round(total_holdings_value, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(balance.total_pnl, 2),
        "unrealized_pnl": round(total_holdings_value - sum(p.quantity * p.avg_entry_price for p in positions), 2),
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "starting_balance": PAPER_STARTING_BALANCE,
        "holdings": holdings,
        "prices": prices,
    }


async def detect_arbitrage(prices: dict) -> list:
    """
    Simple arbitrage detection: look for significant spread between pairs.
    In reality this would compare across exchanges. For now, detects
    BTC/ETH ratio discrepancies and momentum signals.
    """
    opportunities = []

    btc_price = prices.get("BTC-USD", {}).get("price", 0)
    eth_price = prices.get("ETH-USD", {}).get("price", 0)
    sol_price = prices.get("SOL-USD", {}).get("price", 0)

    if btc_price and eth_price and sol_price:
        btc_change = prices["BTC-USD"]["change_24h"]
        eth_change = prices["ETH-USD"]["change_24h"]
        sol_change = prices["SOL-USD"]["change_24h"]

        # Momentum divergence: BTC pumping but ETH lagging (ETH usually follows)
        if btc_change > 2.0 and eth_change < btc_change - 1.5:
            spread = round(btc_change - eth_change, 2)
            opportunities.append({
                "type": "momentum_lag",
                "signal": "BUY ETH-USD",
                "reason": f"BTC up {btc_change:.1f}% but ETH only {eth_change:.1f}% — ETH historically catches up",
                "spread": spread,
                "confidence": "medium",
                "suggested_action": f"Buy ETH-USD, target +{round(spread * 0.5, 1)}%",
            })

        # SOL momentum divergence
        if btc_change > 2.0 and sol_change < btc_change - 2.0:
            spread = round(btc_change - sol_change, 2)
            opportunities.append({
                "type": "momentum_lag",
                "signal": "BUY SOL-USD",
                "reason": f"BTC up {btc_change:.1f}% but SOL only {sol_change:.1f}% — high beta asset lagging",
                "spread": spread,
                "confidence": "low",
                "suggested_action": f"Buy SOL-USD (high risk/reward)",
            })

        # Oversold bounce: if SOL dropped > 5% while BTC flat
        if sol_change < -5.0 and abs(btc_change) < 1.0:
            opportunities.append({
                "type": "oversold_bounce",
                "signal": "BUY SOL-USD",
                "reason": f"SOL down {sol_change:.1f}% while BTC flat — potential bounce",
                "spread": abs(sol_change),
                "confidence": "low",
                "suggested_action": "Small position, tight stop",
            })

    if not opportunities:
        opportunities.append({
            "type": "no_signal",
            "signal": "HOLD",
            "reason": "No significant arbitrage or momentum signals detected",
            "spread": 0,
            "confidence": "n/a",
            "suggested_action": "Monitor for opportunities",
        })

    return opportunities
