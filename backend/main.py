from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio
import json
import random

from database import (
    init_db, get_db, User, Capital, Transaction, Trade,
    UserRole, TradeStatus, PaperBalance, PaperPosition, PaperTrade,
    CongressTrade, Settlement, HousingListing, GovContract
)
from paper_trading import (
    paper_buy, paper_sell, get_paper_portfolio,
    fetch_live_prices, detect_arbitrage, get_or_create_paper_balance
)
from congress_tracker import (
    refresh_congress_data, get_recent_trades, get_leaderboard, generate_signals
)
from settlement_finder import (
    refresh_settlements, get_open_settlements, get_settlement_stats
)
from housing_lottery import (
    refresh_listings, get_open_listings, mark_applied, get_housing_stats
)
from gov_contracts import (
    refresh_contracts, get_recent_contracts, get_contract_signals, get_contract_stats
)
from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_active_user, require_role, ACCESS_TOKEN_EXPIRE_MINUTES
)

# Initialize FastAPI
app = FastAPI(title="ATLAS CONTROL CENTER", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://atlas-control-center.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# Pydantic models
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "viewer"

class TradeRequest(BaseModel):
    symbol: str
    action: str
    quantity: float
    price: float

class TradeApproval(BaseModel):
    trade_id: int
    approve: bool

# Startup event
@app.on_event("startup")
async def startup_event():
    init_db()
    db = next(get_db())
    ceo = db.query(User).filter(User.username == "ceo").first()
    if not ceo:
        ceo = User(
            username="ceo",
            email="ceo@atlas.com",
            hashed_password=get_password_hash("atlas123"),
            role=UserRole.CEO,
            is_active=1
        )
        db.add(ceo)
        capital = Capital(total=1000.0, available=850.0, deployed=150.0)
        db.add(capital)
        db.commit()
        print("Created default CEO user: username='ceo', password='atlas123'")

# ============== AUTHENTICATION ENDPOINTS ==============

@app.post("/api/v1/auth/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    db_email = db.query(User).filter(User.email == user.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    role_map = {
        "ceo": UserRole.CEO,
        "cfo": UserRole.CFO,
        "trader": UserRole.TRADER,
        "viewer": UserRole.VIEWER
    }
    
    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        role=role_map.get(user.role.lower(), UserRole.VIEWER),
        is_active=1
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully", "username": new_user.username}

@app.post("/api/v1/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "email": user.email,
            "role": user.role.value
        }
    }

@app.get("/api/v1/auth/me")
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return {
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role.value
    }

# ============== CAPITAL & DASHBOARD ENDPOINTS ==============

@app.get("/api/v1/trax/capital")
async def get_capital(db: Session = Depends(get_db)):
    capital = db.query(Capital).first()
    if not capital:
        capital = Capital(total=1000.0, available=850.0, deployed=150.0)
        db.add(capital)
        db.commit()
        db.refresh(capital)
    
    return {
        "total": capital.total,
        "available": capital.available,
        "deployed": capital.deployed,
        "last_updated": capital.last_updated.isoformat()
    }

@app.get("/api/v1/trax/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    return {
        "holdings": [
            {"symbol": "AAPL", "quantity": 10, "avg_price": 150.0, "current_price": 175.0, "value": 1750.0},
            {"symbol": "TSLA", "quantity": 5, "avg_price": 200.0, "current_price": 250.0, "value": 1250.0},
            {"symbol": "BTC", "quantity": 0.05, "avg_price": 40000.0, "current_price": 45000.0, "value": 2250.0},
        ],
        "total_value": 5250.0,
        "total_return": 750.0,
        "return_percent": 16.67
    }

@app.get("/api/v1/trax/performance")
async def get_performance(days: int = 30, db: Session = Depends(get_db)):
    data = []
    base_value = 1000.0
    for i in range(days):
        date = datetime.now() - timedelta(days=days-i)
        change = random.uniform(-50, 80)
        base_value += change
        data.append({
            "date": date.strftime("%Y-%m-%d"),
            "value": round(base_value, 2),
            "change": round(change, 2)
        })
    
    return {
        "period": f"{days} days",
        "data": data,
        "start_value": 1000.0,
        "end_value": round(base_value, 2),
        "total_return": round(base_value - 1000.0, 2)
    }

# ============== TRADE EXECUTION ENDPOINTS ==============

@app.post("/api/v1/trax/trade/request")
async def request_trade(
    trade: TradeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    total_value = trade.quantity * trade.price
    
    if current_user.role not in [UserRole.CEO, UserRole.CFO, UserRole.TRADER]:
        raise HTTPException(status_code=403, detail="Insufficient permissions to request trades")
    
    if trade.action == "buy":
        capital = db.query(Capital).first()
        if capital.available < total_value:
            raise HTTPException(status_code=400, detail="Insufficient available capital")
    
    new_trade = Trade(
        symbol=trade.symbol.upper(),
        action=trade.action,
        quantity=trade.quantity,
        price=trade.price,
        total_value=total_value,
        status=TradeStatus.PENDING,
        requested_by=current_user.username
    )
    db.add(new_trade)
    db.commit()
    db.refresh(new_trade)
    
    await manager.broadcast({
        "type": "trade_request",
        "data": {
            "id": new_trade.id,
            "symbol": new_trade.symbol,
            "action": new_trade.action,
            "quantity": new_trade.quantity,
            "total_value": new_trade.total_value,
            "requested_by": new_trade.requested_by,
            "status": new_trade.status.value
        }
    })
    
    return {
        "message": "Trade request submitted for CEO approval",
        "trade_id": new_trade.id,
        "status": "pending"
    }

@app.get("/api/v1/trax/trades/pending")
async def get_pending_trades(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.CEO:
        raise HTTPException(status_code=403, detail="Only CEO can view pending approvals")
    
    trades = db.query(Trade).filter(Trade.status == TradeStatus.PENDING).all()
    return {
        "trades": [
            {
                "id": t.id,
                "symbol": t.symbol,
                "action": t.action,
                "quantity": t.quantity,
                "price": t.price,
                "total_value": t.total_value,
                "requested_by": t.requested_by,
                "created_at": t.created_at.isoformat()
            }
            for t in trades
        ]
    }

@app.post("/api/v1/trax/trade/approve")
async def approve_trade(
    approval: TradeApproval,
    current_user: User = Depends(require_role(UserRole.CEO)),
    db: Session = Depends(get_db)
):
    trade = db.query(Trade).filter(Trade.id == approval.trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(status_code=400, detail="Trade is not pending approval")
    
    capital = db.query(Capital).first()
    
    if approval.approve:
        trade.status = TradeStatus.EXECUTED
        trade.approved_by = current_user.username
        trade.executed_at = datetime.utcnow()
        
        if trade.action == "buy":
            capital.available -= trade.total_value
            capital.deployed += trade.total_value
        else:
            capital.available += trade.total_value
            capital.deployed -= trade.total_value
        
        transaction = Transaction(
            type=f"trade_{trade.action}",
            amount=trade.total_value,
            description=f"{trade.action.upper()} {trade.quantity} {trade.symbol} @ ${trade.price}"
        )
        db.add(transaction)
        message = "Trade approved and executed"
    else:
        trade.status = TradeStatus.REJECTED
        trade.approved_by = current_user.username
        message = "Trade rejected"
    
    db.commit()
    
    await manager.broadcast({
        "type": "trade_update",
        "data": {
            "trade_id": trade.id,
            "status": trade.status.value,
            "approved_by": current_user.username
        }
    })
    
    return {"message": message, "trade_id": trade.id}

# ============== TRANSACTION HISTORY ENDPOINTS ==============

@app.get("/api/v1/trax/transactions")
async def get_transactions(
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    transactions = db.query(Transaction).order_by(Transaction.timestamp.desc()).limit(limit).all()
    return {
        "transactions": [
            {
                "id": t.id,
                "type": t.type,
                "amount": t.amount,
                "description": t.description,
                "timestamp": t.timestamp.isoformat()
            }
            for t in transactions
        ],
        "total_count": db.query(Transaction).count()
    }

@app.get("/api/v1/trax/trades/history")
async def get_trade_history(
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    trades = db.query(Trade).order_by(Trade.created_at.desc()).limit(limit).all()
    return {
        "trades": [
            {
                "id": t.id,
                "symbol": t.symbol,
                "action": t.action,
                "quantity": t.quantity,
                "price": t.price,
                "total_value": t.total_value,
                "status": t.status.value,
                "requested_by": t.requested_by,
                "approved_by": t.approved_by,
                "created_at": t.created_at.isoformat(),
                "executed_at": t.executed_at.isoformat() if t.executed_at else None
            }
            for t in trades
        ]
    }

# ============== WEBSOCKET ENDPOINT ==============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "subscribe":
                await websocket.send_json({
                    "type": "connected",
                    "message": "Subscribed to real-time updates"
                })
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Background task for capital updates
async def broadcast_capital_updates():
    while True:
        await asyncio.sleep(5)
        try:
            db = next(get_db())
            capital = db.query(Capital).first()
            if capital:
                await manager.broadcast({
                    "type": "capital_update",
                    "data": {
                        "total": capital.total,
                        "available": capital.available,
                        "deployed": capital.deployed,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                })
        except Exception as e:
            print(f"Broadcast error: {e}")

@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(broadcast_capital_updates())

# Health check
@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0", "features": ["auth", "websocket", "trading", "transactions"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ==================== PAPER TRADING ENDPOINTS ====================

class PaperTradeRequest(BaseModel):
    symbol: str
    action: str   # "buy" or "sell"
    usd_amount: Optional[float] = None
    quantity: Optional[float] = None
    sell_all: bool = False

@app.get("/api/v1/paper/portfolio")
async def paper_portfolio(db: Session = Depends(get_db)):
    return await get_paper_portfolio(db)

@app.post("/api/v1/paper/trade")
async def execute_paper_trade(
    trade: PaperTradeRequest,
    db: Session = Depends(get_db)
):
    if trade.action == "buy":
        if not trade.usd_amount:
            raise HTTPException(status_code=400, detail="usd_amount required for buy")
        result = await paper_buy(db, trade.symbol.upper(), trade.usd_amount)
    elif trade.action == "sell":
        result = await paper_sell(db, trade.symbol.upper(), trade.quantity, trade.sell_all)
    else:
        raise HTTPException(status_code=400, detail="action must be 'buy' or 'sell'")

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Trade failed"))

    await manager.broadcast({
        "type": "paper_trade",
        "data": result
    })
    return result

@app.get("/api/v1/paper/history")
async def paper_trade_history(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    trades = db.query(PaperTrade).order_by(PaperTrade.timestamp.desc()).limit(limit).all()
    return {
        "trades": [
            {
                "id": t.id,
                "symbol": t.symbol,
                "action": t.action,
                "quantity": t.quantity,
                "price": t.price,
                "total_value": t.total_value,
                "pnl": t.pnl,
                "timestamp": t.timestamp.isoformat(),
                "note": t.note,
            }
            for t in trades
        ]
    }

@app.get("/api/v1/paper/reset")
async def reset_paper_balance(
    current_user: User = Depends(require_role(UserRole.CEO)),
    db: Session = Depends(get_db)
):
    """Reset paper trading to $1000 starting balance (CEO only)."""
    db.query(PaperTrade).delete()
    db.query(PaperPosition).delete()
    db.query(PaperBalance).delete()
    db.commit()
    balance = get_or_create_paper_balance(db)
    return {"message": "Paper account reset to $1,000", "balance": balance.usd_balance}

# ==================== MARKET DATA ENDPOINTS ====================

@app.get("/api/v1/market/prices")
async def market_prices():
    """Live prices for BTC, ETH, SOL via CoinGecko."""
    return await fetch_live_prices()

@app.get("/api/v1/market/arbitrage")
async def market_arbitrage():
    """Detect arbitrage and momentum opportunities."""
    prices = await fetch_live_prices()
    opportunities = await detect_arbitrage(prices)
    return {
        "prices": prices,
        "opportunities": opportunities,
        "scanned_at": datetime.utcnow().isoformat(),
    }

# ==================== CONGRESS TRACKER ENDPOINTS ====================

@app.get("/api/v1/congress/trades")
async def congress_trades(
    limit: int = 100,
    vip_only: bool = False,
    db: Session = Depends(get_db)
):
    trades = get_recent_trades(db, limit=limit, vip_only=vip_only)
    return {
        "trades": [
            {
                "id": t.id,
                "politician": t.politician,
                "chamber": t.chamber,
                "party": t.party,
                "ticker": t.ticker,
                "asset_description": t.asset_description,
                "trade_type": t.trade_type,
                "amount_range": t.amount_range,
                "amount_min": t.amount_min,
                "amount_max": t.amount_max,
                "transaction_date": t.transaction_date,
                "disclosure_date": t.disclosure_date,
                "disclosure_lag_days": t.disclosure_lag_days,
                "is_vip": bool(t.is_vip),
                "ptr_link": t.ptr_link,
            }
            for t in trades
        ],
        "count": len(trades),
    }

@app.get("/api/v1/congress/signals")
async def congress_signals(db: Session = Depends(get_db)):
    trades = get_recent_trades(db, limit=200, vip_only=True)
    signals = generate_signals(trades)
    return {"signals": signals, "count": len(signals)}

@app.get("/api/v1/congress/leaderboard")
async def congress_leaderboard(db: Session = Depends(get_db)):
    return {"leaderboard": get_leaderboard(db)}

@app.post("/api/v1/congress/refresh")
async def congress_refresh(db: Session = Depends(get_db)):
    result = await refresh_congress_data(db)
    return result

@app.get("/api/v1/congress/stats")
async def congress_stats(db: Session = Depends(get_db)):
    total = db.query(CongressTrade).count()
    vip = db.query(CongressTrade).filter(CongressTrade.is_vip == 1).count()
    purchases = db.query(CongressTrade).filter(CongressTrade.trade_type == "Purchase").count()
    sales = db.query(CongressTrade).filter(CongressTrade.trade_type == "Sale").count()
    return {
        "total_trades": total,
        "vip_trades": vip,
        "purchases": purchases,
        "sales": sales,
        "last_fetch": db.query(CongressTrade).order_by(CongressTrade.fetched_at.desc()).first().fetched_at.isoformat() if total else None,
    }

# ==================== SETTLEMENT FINDER ENDPOINTS ====================

@app.get("/api/v1/settlements")
async def list_settlements(
    limit: int = 50,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    settlements = get_open_settlements(db, limit=limit, category=category)
    return {
        "settlements": [
            {
                "id": s.id,
                "case_name": s.case_name,
                "company": s.company,
                "settlement_amount": s.settlement_amount,
                "deadline": s.deadline,
                "claim_url": s.claim_url,
                "description": s.description,
                "category": s.category,
                "estimated_payout": s.estimated_payout,
                "status": s.status,
                "filed_at": s.filed_at.isoformat() if s.filed_at else None,
            }
            for s in settlements
        ],
        "stats": get_settlement_stats(db),
    }

@app.post("/api/v1/settlements/refresh")
async def settlements_refresh(db: Session = Depends(get_db)):
    return await refresh_settlements(db)

@app.post("/api/v1/settlements/{settlement_id}/filed")
async def mark_settlement_filed(settlement_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")
    s.status = "filed"
    s.filed_at = datetime.utcnow()
    db.commit()
    return {"message": "Marked as filed", "id": settlement_id}

# ==================== HOUSING LOTTERY ENDPOINTS ====================

@app.get("/api/v1/housing/listings")
async def housing_listings(
    borough: Optional[str] = None,
    db: Session = Depends(get_db)
):
    listings = get_open_listings(db, borough=borough)
    return {
        "listings": [
            {
                "id": l.id,
                "lottery_id": l.lottery_id,
                "building_name": l.building_name,
                "address": l.address,
                "borough": l.borough,
                "units_available": l.units_available,
                "income_min": l.income_min,
                "income_max": l.income_max,
                "rent_min": l.rent_min,
                "rent_max": l.rent_max,
                "deadline": l.deadline,
                "lottery_url": l.lottery_url,
                "status": l.status,
                "applied_at": l.applied_at.isoformat() if l.applied_at else None,
            }
            for l in listings
        ],
        "stats": get_housing_stats(db),
    }

@app.post("/api/v1/housing/refresh")
async def housing_refresh(db: Session = Depends(get_db)):
    return await refresh_listings(db)

@app.post("/api/v1/housing/{listing_id}/apply")
async def housing_apply(listing_id: int, db: Session = Depends(get_db)):
    listing = mark_applied(db, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"message": "Marked as applied", "id": listing_id, "lottery_url": listing.lottery_url}

# ==================== GOV CONTRACTS ENDPOINTS ====================

@app.get("/api/v1/contracts")
async def list_contracts(
    limit: int = 50,
    sector: Optional[str] = None,
    db: Session = Depends(get_db)
):
    contracts = get_recent_contracts(db, limit=limit, sector=sector)
    return {
        "contracts": [
            {
                "id": c.id,
                "award_id": c.award_id,
                "recipient": c.recipient,
                "awarding_agency": c.awarding_agency,
                "award_amount": c.award_amount,
                "award_amount_m": round(c.award_amount / 1e6, 1),
                "description": c.description,
                "sector": c.sector,
                "award_date": c.award_date,
                "period_of_performance": c.period_of_performance,
                "place_of_performance": c.place_of_performance,
                "naics_code": c.naics_code,
                "usaspending_url": c.usaspending_url,
                "trading_signal": c.trading_signal,
            }
            for c in contracts
        ],
        "stats": get_contract_stats(db),
    }

@app.get("/api/v1/contracts/signals")
async def contract_signals(db: Session = Depends(get_db)):
    signals = get_contract_signals(db)
    return {"signals": signals, "count": len(signals)}

@app.post("/api/v1/contracts/refresh")
async def contracts_refresh(
    days_back: int = 7,
    db: Session = Depends(get_db)
):
    return await refresh_contracts(db, days_back=days_back)

# ==================== COINBASE INTEGRATION ====================

from coinbase_service import coinbase_service, APPROVED_PAIRS

@app.get("/api/coinbase/connect")
async def coinbase_connect():
    """Connect to Coinbase API"""
    success = coinbase_service.connect()
    return {"connected": success}

@app.get("/api/coinbase/balance")
async def coinbase_balance():
    """Get Coinbase balances"""
    return coinbase_service.get_balance()

@app.get("/api/coinbase/prices")
async def coinbase_prices():
    """Get current prices"""
    return coinbase_service.get_prices()

@app.post("/api/coinbase/trade")
async def coinbase_trade(product_id: str, side: str, amount: float):
    """Execute trade (requires CEO approval)"""
    return coinbase_service.execute_trade(product_id, side, amount)




