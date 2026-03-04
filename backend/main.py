from dotenv import load_dotenv
load_dotenv()
import sqlite3
from pathlib import Path

# Social DB path (separate from main atlas.db)
_SOCIAL_DB = Path(__file__).parent.parent / "social" / "social.db"

def _social_conn():
    if not _SOCIAL_DB.exists():
        return None
    conn = sqlite3.connect(str(_SOCIAL_DB))
    conn.row_factory = sqlite3.Row
    return conn

# Receipts DB path
_RECEIPTS_DB = Path(__file__).parent.parent / "receipts" / "receipts.db"

def _receipts_conn():
    if not _RECEIPTS_DB.exists():
        return None
    conn = sqlite3.connect(str(_RECEIPTS_DB))
    conn.row_factory = sqlite3.Row
    return conn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import asyncio
import json
import random

from database import (
    init_db, get_db, User, Capital, Transaction, Trade,
    UserRole, TradeStatus, PaperBalance, PaperPosition, PaperTrade,
    CongressTrade, Settlement, HousingListing, GovContract, TradingSettings,
    AutoTradeSetting, AutoTradeLog, AutoPosition
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
    refresh_contracts, refresh_media_contracts, fetch_small_contracts,
    get_recent_contracts, count_contracts, get_contract_signals, get_contract_stats
)
from coinbase_real import (
    check_credentials, get_live_portfolio, live_buy, live_sell, LIVE_MAX_TRADE_USD
)
from autonomous_trader import trader as auto_trader
from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_active_user, require_role, ACCESS_TOKEN_EXPIRE_MINUTES
)
from fastcash_routes import register_routes
from publishing_routes import register_routes as register_publishing_routes
from audiobook_routes import register_audiobook_routes

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

register_routes(app)
register_publishing_routes(app)
register_audiobook_routes(app)

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

    # Migrate: add config_json column if missing (SQLite ALTER TABLE)
    from sqlalchemy import text
    try:
        db.execute(text("ALTER TABLE auto_trade_settings ADD COLUMN config_json TEXT DEFAULT '{}'"))
        db.commit()
        print("[DB] Added config_json column to auto_trade_settings")
    except Exception:
        pass  # Column already exists

    # Wire up autonomous trader
    auto_trader.set_broadcast(manager.broadcast)
    s = db.query(AutoTradeSetting).first()
    if s and s.enabled:
        auto_trader.start()
        print("[TRAX] Autonomous trader resumed from DB state")

    # Initialize FastCash DB
    from fastcash.database import init_db as fastcash_init_db
    fastcash_init_db()
    print("[FastCash] DB initialized.")

    # Initialize Publishing DB
    from publishing.database import init_db as publishing_init_db
    publishing_init_db()
    print("[Publishing] DB initialized.")

    # Schedule 2-hour scrape loop
    async def _fastcash_scrape_loop():
        from fastcash.scraper import run_quick_scrape
        while True:
            try:
                await asyncio.sleep(7200)  # 2 hours
                await asyncio.get_event_loop().run_in_executor(None, run_quick_scrape)
            except Exception as e:
                print(f"[FastCash] Scrape loop error: {e}")

    asyncio.create_task(_fastcash_scrape_loop())
    print("[FastCash] 2-hour scrape loop scheduled.")

    # Market intelligence: daily at 3am UTC
    from fastcash.market_scraper import run_market_intelligence_scrape as _market_scrape

    async def _market_intelligence_loop():
        while True:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            next_3am = now.replace(hour=3, minute=0, second=0, microsecond=0)
            if next_3am <= now:
                next_3am += timedelta(days=1)
            secs = (next_3am - now).total_seconds()
            print(f"[Market] Next analysis in {int(secs / 3600)}h {int((secs % 3600) / 60)}m")
            try:
                await asyncio.sleep(secs)
                await asyncio.get_running_loop().run_in_executor(None, _market_scrape)
            except asyncio.CancelledError:
                print("[Market] Intelligence loop cancelled.")
                raise
            except Exception as e:
                print(f"[Market] Daily scrape error: {e}")

    asyncio.create_task(_market_intelligence_loop())
    print("[Market] Daily 3am market intelligence scheduled.")

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


# ==================== AUTONOMOUS TRADER ENDPOINTS ====================

class AutoToggleRequest(BaseModel):
    enabled: bool
    mode: Optional[str] = None  # "paper" or "live"

@app.get("/api/v1/auto/status")
async def auto_status(db: Session = Depends(get_db)):
    """Current autonomous trader status."""
    return auto_trader.status()

@app.post("/api/v1/auto/toggle")
async def auto_toggle(req: AutoToggleRequest, db: Session = Depends(get_db)):
    """Enable or disable autonomous trading."""
    s = db.query(AutoTradeSetting).first()
    if not s:
        from datetime import date
        s = AutoTradeSetting(enabled=0, mode="paper",
            daily_spent=0.0, last_reset_date=str(date.today()))
        db.add(s)
        db.commit()
        db.refresh(s)

    if req.mode:
        s.mode = req.mode
    s.enabled = 1 if req.enabled else 0
    db.commit()

    if req.enabled:
        auto_trader.start()
    else:
        auto_trader.stop()

    await manager.broadcast({"type": "auto_mode", "data": {"enabled": req.enabled}})
    return {"enabled": req.enabled, "mode": s.mode}

@app.get("/api/v1/auto/log")
async def auto_log(limit: int = 50, db: Session = Depends(get_db)):
    """Recent autonomous trading decisions."""
    logs = db.query(AutoTradeLog).order_by(AutoTradeLog.timestamp.desc()).limit(limit).all()
    return {
        "log": [
            {
                "id": l.id,
                "action": l.action,
                "symbol": l.symbol,
                "reasoning": l.reasoning,
                "message": l.message,
                "timestamp": l.timestamp.isoformat(),
            }
            for l in logs
        ]
    }

@app.get("/api/v1/auto/positions")
async def auto_positions(db: Session = Depends(get_db)):
    """Open auto-trade positions."""
    positions = db.query(AutoPosition).filter(AutoPosition.status == "open").all()
    return {
        "positions": [
            {
                "id": p.id,
                "symbol": p.symbol,
                "quantity": p.quantity,
                "entry_price": p.entry_price,
                "target_price": p.target_price,
                "stop_price": p.stop_price,
                "amount_usd": p.amount_usd,
                "mode": p.mode,
                "opened_at": p.opened_at.isoformat(),
            }
            for p in positions
        ]
    }

@app.post("/api/v1/auto/reset")
async def auto_reset(db: Session = Depends(get_db)):
    """Reset consecutive loss counter (manual override)."""
    s = db.query(AutoTradeSetting).first()
    if s:
        s.consecutive_losses = 0
        s.enabled = 0
        db.commit()
    auto_trader.stop()
    return {"message": "Reset complete. Re-enable auto mode to resume."}

class AutoConfigRequest(BaseModel):
    max_per_trade: Optional[float] = None
    max_per_24h: Optional[float] = None
    profit_target_pct: Optional[float] = None
    stop_loss_pct: Optional[float] = None

@app.post("/api/v1/auto/config")
async def auto_config(req: AutoConfigRequest, db: Session = Depends(get_db)):
    """Update autonomous trader safety limits."""
    from datetime import date as _date
    s = db.query(AutoTradeSetting).first()
    if not s:
        s = AutoTradeSetting(enabled=0, mode="paper", daily_spent=0.0,
                              last_reset_date=str(_date.today()))
        db.add(s)
        db.commit()
        db.refresh(s)

    try:
        cfg = json.loads(s.config_json or "{}")
    except Exception:
        cfg = {}

    if req.max_per_trade is not None:
        cfg["max_per_trade"] = max(0.5, min(req.max_per_trade, 100.0))
    if req.max_per_24h is not None:
        cfg["max_per_24h"] = max(1.0, min(req.max_per_24h, 500.0))
    if req.profit_target_pct is not None:
        cfg["profit_target_pct"] = max(0.1, min(req.profit_target_pct, 20.0))
    if req.stop_loss_pct is not None:
        cfg["stop_loss_pct"] = max(0.1, min(req.stop_loss_pct, 10.0))

    s.config_json = json.dumps(cfg)
    db.commit()
    return {"message": "Config updated", "config": cfg}

# ==================== TRAX MODE ENDPOINTS ====================

def get_trading_settings(db: Session) -> TradingSettings:
    """Get or create trading settings row."""
    settings = db.query(TradingSettings).first()
    if not settings:
        settings = TradingSettings(mode="paper", live_max_trade_usd=LIVE_MAX_TRADE_USD)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


class PaperTradeRequest(BaseModel):
    symbol: str
    action: str   # "buy" or "sell"
    usd_amount: Optional[float] = None
    quantity: Optional[float] = None
    sell_all: bool = False

class ModeRequest(BaseModel):
    mode: str  # "paper" or "live"

@app.get("/api/v1/trax/mode")
async def get_mode(db: Session = Depends(get_db)):
    """Get current trading mode and Coinbase credential status."""
    settings = get_trading_settings(db)
    creds = check_credentials()
    return {
        "mode": settings.mode,
        "live_max_trade_usd": settings.live_max_trade_usd,
        "coinbase_configured": creds.get("configured", False),
        "coinbase_valid": creds.get("valid", False),
        "coinbase_usd_available": creds.get("usd_available"),
        "coinbase_error": creds.get("error") if not creds.get("valid") else None,
        "updated_at": settings.updated_at.isoformat(),
    }

@app.post("/api/v1/trax/mode")
async def set_mode(req: ModeRequest, db: Session = Depends(get_db)):
    """Switch between paper and live trading."""
    if req.mode not in ("paper", "live"):
        raise HTTPException(status_code=400, detail="mode must be 'paper' or 'live'")

    if req.mode == "live":
        creds = check_credentials()
        if not creds.get("valid"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot enable live mode: {creds.get('error', 'Invalid Coinbase credentials')}"
            )

    settings = get_trading_settings(db)
    settings.mode = req.mode
    settings.updated_at = datetime.utcnow()
    db.commit()

    await manager.broadcast({"type": "mode_change", "data": {"mode": req.mode}})
    return {"mode": req.mode, "message": f"Switched to {req.mode.upper()} mode"}

@app.post("/api/v1/live/trade")
async def execute_live_trade(
    trade: PaperTradeRequest,
    db: Session = Depends(get_db)
):
    """Execute a REAL trade on Coinbase. Safety cap: $10/trade."""
    settings = get_trading_settings(db)
    if settings.mode != "live":
        raise HTTPException(status_code=400, detail="Not in live mode. Switch to LIVE first.")

    if trade.action == "buy":
        if not trade.usd_amount:
            raise HTTPException(status_code=400, detail="usd_amount required for buy")
        result = live_buy(trade.symbol.upper(), trade.usd_amount)
    elif trade.action == "sell":
        if not trade.quantity:
            raise HTTPException(status_code=400, detail="quantity required for sell")
        result = live_sell(trade.symbol.upper(), trade.quantity)
    else:
        raise HTTPException(status_code=400, detail="action must be 'buy' or 'sell'")

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Live trade failed"))

    await manager.broadcast({"type": "live_trade", "data": result})
    return result

@app.get("/api/v1/live/portfolio")
async def live_portfolio_endpoint(db: Session = Depends(get_db)):
    """Get real Coinbase account balances."""
    return get_live_portfolio()

# ==================== PAPER TRADING ENDPOINTS ====================

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

@app.get("/api/v1/paper/analytics")
async def paper_analytics(db: Session = Depends(get_db)):
    """Trade analytics: equity curve, win rate, best/worst trades."""
    trades = db.query(PaperTrade).order_by(PaperTrade.timestamp.asc()).all()
    balance = get_or_create_paper_balance(db)

    sells = [t for t in trades if t.action == "sell" and t.pnl is not None]
    wins  = [t for t in sells if t.pnl >= 0]
    losses = [t for t in sells if t.pnl < 0]

    # Equity curve: running total value starting at 1000
    equity = []
    running = 1000.0
    for t in trades:
        if t.action == "buy":
            running -= t.total_value
        elif t.action == "sell":
            running += t.total_value
        equity.append({"t": t.timestamp.isoformat(), "v": round(running, 2)})

    return {
        "total_trades": len(trades),
        "sell_trades":  len(sells),
        "wins":         len(wins),
        "losses":       len(losses),
        "win_rate":     round(len(wins) / len(sells) * 100, 1) if sells else 0,
        "avg_win":      round(sum(t.pnl for t in wins) / len(wins), 3) if wins else 0,
        "avg_loss":     round(sum(t.pnl for t in losses) / len(losses), 3) if losses else 0,
        "best_trade":   max(({"symbol": t.symbol, "pnl": t.pnl} for t in sells), key=lambda x: x["pnl"], default=None),
        "worst_trade":  min(({"symbol": t.symbol, "pnl": t.pnl} for t in sells), key=lambda x: x["pnl"], default=None),
        "total_pnl":    round(balance.total_pnl, 2),
        "equity_curve": equity[-100:],  # last 100 points
    }

# ==================== MARKET DATA ENDPOINTS ====================

@app.get("/api/v1/market/overview")
async def market_overview():
    """All 20 coins with full stats for the market overview panel."""
    from autonomous_trader import trader as _at
    # Reuse the trader's price fetcher
    prices = await _at._fetch_prices()
    return {"prices": prices, "count": len(prices)}

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
    offset: int = 0,
    sector: Optional[str] = None,
    q: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort: str = "desc",
    db: Session = Depends(get_db)
):
    contracts = get_recent_contracts(db, limit=limit, offset=offset, sector=sector,
                                     search=q, min_amount=min_amount,
                                     max_amount=max_amount, sort=sort)
    total = count_contracts(db, sector=sector, search=q,
                            min_amount=min_amount, max_amount=max_amount)
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
        "total": total,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }

@app.post("/api/v1/contracts/refresh-small")
async def contracts_refresh_small(
    min_amount: float = 25_000,
    max_amount: float = 10_000_000,
    db: Session = Depends(get_db)
):
    """Fetch smaller contracts ($25K–$10M) from past 90 days."""
    contracts = await fetch_small_contracts(days_back=90, min_amount=min_amount, max_amount=max_amount)
    from gov_contracts import upsert_contracts
    new_count = upsert_contracts(db, contracts)
    return {"fetched": len(contracts), "new": new_count}

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

@app.post("/api/v1/contracts/refresh-media")
async def contracts_refresh_media(db: Session = Depends(get_db)):
    """Fetch small media/video/creative contracts ($10K–$5M) from past 90 days."""
    return await refresh_media_contracts(db)

# ==================== COINBASE INTEGRATION ====================

from coinbase_service import coinbase_service, APPROVED_PAIRS

@app.get("/api/v1/dashboard/stats")
async def dashboard_stats(db: Session = Depends(get_db)):
    """Real-time stats for the ATLAS home dashboard."""
    portfolio = await get_paper_portfolio(db)
    auto_stat = auto_trader.status()

    congress_count    = db.query(CongressTrade).count()
    settlements_count = db.query(Settlement).filter(Settlement.status == "open").count()
    housing_count     = db.query(HousingListing).filter(HousingListing.status == "open").count()
    contracts_count   = db.query(GovContract).count()

    return {
        "trax": {
            "paper_value":    round(portfolio["total_value"], 2),
            "paper_pnl":      round(portfolio["total_return"], 2),
            "paper_pnl_pct":  round(portfolio["total_return_pct"], 2),
            "auto_enabled":   auto_stat["enabled"],
            "auto_running":   auto_stat["running"],
            "auto_trades_today": auto_stat["trades_today"],
            "auto_profit":    round(auto_stat["total_profit"], 4),
            "mode":           auto_stat["mode"],
        },
        "congress_trades": congress_count,
        "open_settlements": settlements_count,
        "housing_listings": housing_count,
        "contracts": contracts_count,
    }

@app.get("/api/coinbase/connect")
async def coinbase_connect():
    """Connect to Coinbase API"""
    success = coinbase_service.connect()
    return {"connected": success}

# ── Social Scheduler API ──────────────────────────────────────────────────────

@app.get("/api/v1/social/stats")
async def social_stats():
    conn = _social_conn()
    if not conn:
        return {"error": "Social scheduler not initialized", "total_posts": 0, "posted": 0, "scheduled": 0, "by_platform": {}}
    total     = conn.execute("SELECT COUNT(*) FROM scheduled_posts").fetchone()[0]
    posted    = conn.execute("SELECT COUNT(*) FROM scheduled_posts WHERE status='posted'").fetchone()[0]
    failed    = conn.execute("SELECT COUNT(*) FROM scheduled_posts WHERE status='failed'").fetchone()[0]
    scheduled = conn.execute("SELECT COUNT(*) FROM scheduled_posts WHERE status='scheduled'").fetchone()[0]
    week_ago  = (datetime.utcnow() - timedelta(days=7)).isoformat()
    week_posts = conn.execute(
        "SELECT COUNT(*) FROM scheduled_posts WHERE status='posted' AND posted_at >= ?", (week_ago,)
    ).fetchone()[0]
    rows = conn.execute(
        "SELECT platform, COUNT(*) as cnt FROM scheduled_posts WHERE status='posted' GROUP BY platform"
    ).fetchall()
    by_platform = {r["platform"]: {"posts": r["cnt"]} for r in rows}
    conn.close()
    return {
        "total_posts": total, "posted": posted, "failed": failed,
        "scheduled": scheduled, "posts_this_week": week_posts,
        "by_platform": by_platform,
    }

@app.get("/api/v1/social/scheduled")
async def social_scheduled(days: int = 7):
    conn = _social_conn()
    if not conn:
        return {"posts": []}
    now   = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    until = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    rows  = conn.execute(
        "SELECT * FROM scheduled_posts WHERE status='scheduled' AND scheduled_time BETWEEN ? AND ? ORDER BY scheduled_time ASC",
        (now, until),
    ).fetchall()
    conn.close()
    return {"posts": [dict(r) for r in rows]}

@app.post("/api/v1/social/schedule")
async def social_schedule_post(
    platform: str,
    content: str,
    scheduled_time: str,
    title: Optional[str] = None,
    subreddit: Optional[str] = None,
):
    conn = _social_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Social scheduler DB not found — run ./start.sh first")
    cur = conn.execute(
        """INSERT INTO scheduled_posts (platform, content, title, subreddit, scheduled_time, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'scheduled', ?)""",
        (platform, content, title, subreddit, scheduled_time, datetime.utcnow().isoformat()),
    )
    conn.commit()
    post_id = cur.lastrowid
    conn.close()
    return {"success": True, "post_id": post_id, "scheduled_time": scheduled_time, "platform": platform}

@app.get("/api/v1/social/performance")
async def social_performance(limit: int = 20):
    conn = _social_conn()
    if not conn:
        return {"posts": []}
    rows = conn.execute(
        """SELECT * FROM scheduled_posts WHERE status='posted'
           ORDER BY (likes + comments*2 + shares*3) DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return {"posts": [dict(r) for r in rows]}

@app.post("/api/v1/social/generate")
async def social_generate(platform: str = "telegram", count: int = 5):
    """Generate AI content variations for a platform."""
    import sys, os
    sys.path.insert(0, str(Path(__file__).parent.parent / "social"))
    try:
        from content_generator import generate_variations
        variations = generate_variations(platform, count=min(count, 5))
        return {"platform": platform, "variations": variations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        sys.path.pop(0)


## ── Receipts Gallery ──────────────────────────────────────────────────────────

@app.get("/api/v1/receipts/stats")
async def receipts_stats():
    conn = _receipts_conn()
    if not conn:
        return {"users": 0, "total_receipts": 0, "approved": 0, "rejected": 0,
                "total_owed": 0.0, "total_paid_out": 0.0, "pending_payouts": 0}
    users = conn.execute("SELECT COUNT(*) FROM receipt_users").fetchone()[0]
    total_receipts = conn.execute("SELECT COUNT(*) FROM receipts").fetchone()[0]
    approved = conn.execute("SELECT COUNT(*) FROM receipts WHERE status IN ('uploaded','pending')").fetchone()[0]
    rejected = conn.execute("SELECT COUNT(*) FROM receipts WHERE status = 'rejected'").fetchone()[0]
    total_owed = conn.execute("SELECT COALESCE(SUM(balance),0) FROM receipt_users").fetchone()[0]
    total_paid = conn.execute("SELECT COALESCE(SUM(amount),0) FROM payouts WHERE status = 'completed'").fetchone()[0]
    pending_payouts = conn.execute("SELECT COUNT(*) FROM payouts WHERE status = 'pending'").fetchone()[0]
    conn.close()
    return {"users": users, "total_receipts": total_receipts, "approved": approved,
            "rejected": rejected, "total_owed": round(total_owed, 2),
            "total_paid_out": round(total_paid, 2), "pending_payouts": pending_payouts}

@app.get("/api/v1/receipts/gallery")
async def receipts_gallery(filter: str = "pending", limit: int = 200):
    conn = _receipts_conn()
    if not conn:
        return {"receipts": []}
    if filter == "pending":
        # Show receipts not yet uploaded to ALL three apps
        rows = conn.execute(
            """SELECT * FROM receipts WHERE status != 'rejected'
               AND (uploaded_to_fetch = 0 OR uploaded_to_coinout = 0 OR uploaded_to_receipthog = 0)
               ORDER BY created_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    elif filter == "uploaded":
        # All three apps done
        rows = conn.execute(
            """SELECT * FROM receipts WHERE uploaded_to_fetch = 1
               AND uploaded_to_coinout = 1 AND uploaded_to_receipthog = 1
               ORDER BY created_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM receipts WHERE status != 'rejected' ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return {"receipts": [dict(r) for r in rows]}

@app.get("/api/v1/receipts/image/{receipt_id}")
async def receipt_image(receipt_id: int):
    conn = _receipts_conn()
    if not conn:
        raise HTTPException(status_code=404, detail="DB not found")
    row = conn.execute("SELECT image_path FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    path = Path(row[0])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(str(path), media_type="image/jpeg")

@app.post("/api/v1/receipts/{receipt_id}/mark-uploaded")
async def mark_receipt_uploaded(receipt_id: int, app: str = "fetch"):
    conn = _receipts_conn()
    if not conn:
        raise HTTPException(status_code=404, detail="DB not found")
    now = datetime.utcnow().isoformat()
    col_map = {
        "fetch":      ("uploaded_to_fetch",     "uploaded_at"),
        "coinout":    ("uploaded_to_coinout",    "coinout_at"),
        "receipthog": ("uploaded_to_receipthog", "receipthog_at"),
    }
    if app not in col_map:
        raise HTTPException(status_code=400, detail=f"Unknown app: {app}")
    flag_col, time_col = col_map[app]
    conn.execute(
        f"UPDATE receipts SET {flag_col} = 1, {time_col} = ? WHERE id = ?",
        (now, receipt_id)
    )
    conn.commit()
    conn.close()
    return {"success": True, "app": app}

## ── PDF Art Factory ───────────────────────────────────────────────────────────

_ART_DB = Path(__file__).parent.parent / "pdf-factory" / "art_factory.db"

def _art_conn():
    if not _ART_DB.exists():
        return None
    conn = sqlite3.connect(str(_ART_DB))
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/v1/pdf-art/stats")
async def pdf_art_stats():
    conn = _art_conn()
    if not conn:
        return {"total_products": 0, "listed": 0, "total_sales": 0, "total_revenue": 0.0, "top_sellers": []}
    total    = conn.execute("SELECT COUNT(*) FROM art_products").fetchone()[0]
    listed   = conn.execute("SELECT COUNT(*) FROM art_products WHERE status = 'listed'").fetchone()[0]
    sales    = conn.execute("SELECT COALESCE(SUM(sales),0) FROM art_products").fetchone()[0]
    revenue  = conn.execute("SELECT COALESCE(SUM(revenue),0) FROM art_products").fetchone()[0]
    top      = conn.execute("SELECT title, sales, revenue FROM art_products ORDER BY revenue DESC LIMIT 5").fetchall()
    conn.close()
    return {"total_products": total, "listed": listed, "total_sales": sales,
            "total_revenue": round(revenue, 2), "top_sellers": [dict(r) for r in top]}

@app.get("/api/v1/pdf-art/catalog")
async def pdf_art_catalog(limit: int = 100, status: Optional[str] = None):
    conn = _art_conn()
    if not conn:
        return {"products": []}
    if status:
        rows = conn.execute(
            "SELECT * FROM art_products WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            (status, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM art_products ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return {"products": [dict(r) for r in rows]}

@app.post("/api/v1/pdf-art/generate")
async def pdf_art_generate(animal: str = "", activity: str = "", color_scheme: str = ""):
    """Trigger generation of one artwork (runs in background)."""
    import sys, asyncio
    sys.path.insert(0, str(Path(__file__).parent.parent / "pdf-factory"))
    try:
        from art_generator import generate_single
        from pdf_packager import package_image, make_bundle_zip
        from metadata_generator import generate_metadata
        from database import save_product, update_pdfs, update_metadata

        result = generate_single(
            animal=animal or None,
            activity=activity or None,
            color_scheme=color_scheme or None,
        )
        if not result.get("image_path"):
            raise HTTPException(status_code=500, detail="Image generation failed")

        pid = save_product(result["concept"], result["animal"], result["activity"],
                           result["color_scheme"], result["prompt"], result["image_path"])
        meta = generate_metadata(result["concept"], result["animal"], result["activity"])
        update_metadata(pid, meta["title"], meta["description"], meta["tags"])
        pdf_paths = package_image(result["image_path"], pid, meta["title"])
        update_pdfs(pid, pdf_paths)

        return {"product_id": pid, "concept": result["concept"],
                "title": meta["title"], "pdf_count": len(pdf_paths),
                "image_path": result["image_path"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if str(Path(__file__).parent.parent / "pdf-factory") in sys.path:
            sys.path.remove(str(Path(__file__).parent.parent / "pdf-factory"))

@app.get("/api/v1/pdf-art/trends")
async def pdf_art_trends():
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "pdf-factory"))
    try:
        from trend_scraper import get_trend_report
        return get_trend_report()
    except Exception as e:
        return {"error": str(e), "suggestions": []}
    finally:
        sys.path.remove(str(Path(__file__).parent.parent / "pdf-factory"))

@app.post("/api/v1/pdf-art/publish/{product_id}")
async def pdf_art_publish(product_id: int):
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "pdf-factory"))
    try:
        conn = _art_conn()
        if not conn:
            raise HTTPException(status_code=404, detail="DB not found")
        row = conn.execute("SELECT * FROM art_products WHERE id = ?", (product_id,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        product = dict(row)

        from etsy_connector import create_listing, is_configured as etsy_ok
        from gumroad_connector import create_product, is_configured as gumroad_ok
        from database import update_etsy, update_gumroad
        import json as _json

        results = {}
        tags = _json.loads(product.get("tags") or "[]")
        pdf_paths = _json.loads(product.get("pdf_paths") or "[]")
        zip_path = pdf_paths[0] if pdf_paths else ""

        if etsy_ok():
            r = create_listing(product["title"], product["description"], tags, 7.99, zip_path)
            if r:
                update_etsy(product_id, r["listing_id"], r["url"])
                results["etsy"] = r["url"]
        if gumroad_ok():
            r = create_product(product["title"], product["description"], 6.00, zip_path)
            if r:
                update_gumroad(product_id, r["product_id"], r["url"])
                results["gumroad"] = r["url"]
        return {"published": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        sys.path.remove(str(Path(__file__).parent.parent / "pdf-factory"))

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


# ── Atlas Intelligence ─────────────────────────────────────────────────────────
import sys as _sys
_INTEL_DIR = Path(__file__).parent.parent / "intelligence"
if str(_INTEL_DIR) not in _sys.path:
    _sys.path.insert(0, str(_INTEL_DIR))

_INTEL_DB = _INTEL_DIR / "intelligence.db"

def _intel_conn():
    if not _INTEL_DB.exists():
        return None
    import sqlite3 as _sq
    c = _sq.connect(str(_INTEL_DB))
    c.row_factory = _sq.Row
    return c

@app.get("/api/v1/intelligence/stats")
async def intelligence_stats():
    from intelligence_db import init_db
    init_db()
    c = _intel_conn()
    if not c:
        return {"etsy": {}, "instagram": {}, "tiktok": {}, "runs": []}
    etsy_total = c.execute("SELECT COUNT(*) FROM etsy_products").fetchone()[0]
    ig_total   = c.execute("SELECT COUNT(*) FROM instagram_leads").fetchone()[0]
    tt_total   = c.execute("SELECT COUNT(*) FROM tiktok_trends").fetchone()[0]
    runs       = c.execute("SELECT * FROM scrape_runs ORDER BY ran_at DESC LIMIT 10").fetchall()
    return {
        "etsy":      {"total_products": etsy_total},
        "instagram": {"total_leads": ig_total},
        "tiktok":    {"total_videos": tt_total},
        "recent_runs": [dict(r) for r in runs],
    }

@app.post("/api/v1/intelligence/etsy/run")
async def intelligence_etsy_run(background_tasks: BackgroundTasks, max_items: int = 20):
    from etsy_research import run_etsy_research
    background_tasks.add_task(run_etsy_research, None, max_items)
    return {"status": "started", "message": f"Etsy research started (max {max_items} per query)"}

@app.get("/api/v1/intelligence/etsy/products")
async def intelligence_etsy_products(limit: int = 50):
    from etsy_research import get_top_products
    return {"products": get_top_products(limit)}

@app.get("/api/v1/intelligence/etsy/stats")
async def intelligence_etsy_stats():
    from etsy_research import get_etsy_stats
    return get_etsy_stats()

@app.post("/api/v1/intelligence/instagram/run")
async def intelligence_instagram_run(background_tasks: BackgroundTasks, posts_per_tag: int = 100):
    from instagram_leads import run_instagram_leads
    background_tasks.add_task(run_instagram_leads, None, posts_per_tag)
    return {"status": "started", "message": f"Instagram lead gen started ({posts_per_tag} posts/tag)"}

@app.get("/api/v1/intelligence/instagram/leads")
async def intelligence_instagram_leads(hashtag: str = "", limit: int = 100, not_contacted: bool = False):
    from instagram_leads import get_leads
    return {"leads": get_leads(hashtag or None, limit, not_contacted)}

@app.get("/api/v1/intelligence/instagram/stats")
async def intelligence_instagram_stats():
    from instagram_leads import get_instagram_stats
    return get_instagram_stats()

@app.post("/api/v1/intelligence/tiktok/run")
async def intelligence_tiktok_run(background_tasks: BackgroundTasks, videos_per_tag: int = 50):
    from tiktok_trends import run_tiktok_trends
    background_tasks.add_task(run_tiktok_trends, None, videos_per_tag)
    return {"status": "started", "message": f"TikTok trend analysis started ({videos_per_tag} videos/tag)"}

@app.get("/api/v1/intelligence/tiktok/trends")
async def intelligence_tiktok_trends(limit: int = 20):
    from tiktok_trends import get_top_videos
    return {"videos": get_top_videos(limit)}

@app.get("/api/v1/intelligence/tiktok/stats")
async def intelligence_tiktok_stats():
    from tiktok_trends import get_tiktok_stats
    return get_tiktok_stats()

@app.get("/api/v1/intelligence/insights")
async def intelligence_insights(platform: str = ""):
    c = _intel_conn()
    if not c:
        return {"insights": []}
    query = "SELECT * FROM insights"
    params = []
    if platform:
        query += " WHERE platform=?"
        params.append(platform)
    query += " ORDER BY created_at DESC LIMIT 50"
    rows = c.execute(query, params).fetchall()
    return {"insights": [dict(r) for r in rows]}


# ── Atlas YOLO Mode ────────────────────────────────────────────────────────────
_YOLO_DIR = Path(__file__).parent.parent / "yolo"
_YOLO_DB  = _YOLO_DIR / "yolo.db"
if str(_YOLO_DIR) not in _sys.path:
    _sys.path.insert(0, str(_YOLO_DIR))

def _yolo_conn():
    if not _YOLO_DB.exists():
        return None
    import sqlite3 as _sq
    c = _sq.connect(str(_YOLO_DB))
    c.row_factory = _sq.Row
    return c

@app.get("/api/v1/yolo/stats")
async def yolo_stats():
    from yolo_db import init_db, get_stats
    init_db()
    return get_stats()

@app.get("/api/v1/yolo/projects")
async def yolo_projects(status: str = ""):
    from yolo_db import get_projects
    return {"projects": get_projects(status or None)}

@app.get("/api/v1/yolo/ideas")
async def yolo_ideas(limit: int = 20):
    c = _yolo_conn()
    if not c:
        return {"ideas": []}
    rows = c.execute("SELECT * FROM yolo_ideas ORDER BY overall_score DESC LIMIT ?", (limit,)).fetchall()
    return {"ideas": [dict(r) for r in rows]}

@app.get("/api/v1/yolo/runs")
async def yolo_runs(limit: int = 10):
    c = _yolo_conn()
    if not c:
        return {"runs": []}
    rows = c.execute("SELECT * FROM yolo_runs ORDER BY ran_at DESC LIMIT ?", (limit,)).fetchall()
    return {"runs": [dict(r) for r in rows]}

@app.post("/api/v1/yolo/run")
async def yolo_run_now(background_tasks: BackgroundTasks, mode: str = "conservative"):
    def _run():
        import subprocess, sys
        subprocess.Popen([
            sys.executable,
            str(_YOLO_DIR / "yolo_mode.py"),
            "--now", "--mode", mode
        ])
    background_tasks.add_task(_run)
    return {"status": "started", "mode": mode, "message": f"YOLO {mode} mode launched!"}

@app.post("/api/v1/yolo/schedule")
async def yolo_schedule(mode: str = "conservative", enabled: bool = True):
    # Write schedule config
    config_path = _YOLO_DIR / "schedule_config.json"
    import json as _json
    config = {"mode": mode, "enabled": enabled, "time": "00:00"}
    config_path.write_text(_json.dumps(config))
    return {"status": "saved", "config": config}






# ── Atlas Grants System ────────────────────────────────────────────────────────
from grants_finder import (
    fetch_all_grants, get_grants, get_grants_stats,
    get_applications, get_grant_by_id, save_grant, init_grants_db
)
from grant_writer import write_application, generate_pdf, mark_submitted, get_project_types, get_application_text

init_grants_db()

@app.get("/api/v1/grants/stats")
async def grants_stats():
    return get_grants_stats()

@app.post("/api/v1/grants/search")
async def grants_search_all(background_tasks: BackgroundTasks):
    background_tasks.add_task(lambda: __import__('asyncio').run(fetch_all_grants()))
    return {"status": "started", "message": "Searching all grant databases..."}

@app.get("/api/v1/grants/list")
async def grants_list(category: str = "", search: str = "", saved: bool = False, limit: int = 100):
    return {"grants": get_grants(category, search, saved, limit)}

@app.get("/api/v1/grants/recommendations")
async def grants_recommendations():
    """Use Claude to rank top 10 grants for Molehole Inc with reasoning and best project match."""
    import anthropic, os
    grants = get_grants(limit=200)
    if not grants:
        return {"recommendations": []}

    grant_list = "\n".join([
        f"ID:{g['id']} | {g['title']} | {g['agency']} | Category:{g['category']} | Deadline:{g['close_date'] or 'Open'} | Label:{g['search_label']}"
        for g in grants
    ])

    project_types_str = "\n".join([
        "digital_wellness_hub — Digital Wellness Hub for Underserved Youth",
        "local_history_tiktok — Preserving Local History Through Digital Storytelling",
        "urban_beekeeping — Sustainable Urban Beekeeping & Community Education Initiative",
        "community_media_lab — Community Digital Media Lab & Creative Hub",
        "minority_filmmaker_pipeline — Emerging Minority Filmmaker Development Pipeline",
    ])

    prompt = f"""You are an expert grant strategist. Analyze these grants and identify the TOP 10 best matches for Molehole Inc.

APPLICANT PROFILE:
- Organization: Molehole Inc
- Contact: Christopher Mole, Emmy Award-winning filmmaker & editor (20+ years)
- Mission: Amplify underrepresented voices through world-class digital media; foster community connection; democratize creative technology
- Strengths: Documentary production, digital storytelling, community media, youth education, minority business

AVAILABLE PROJECT TEMPLATES:
{project_types_str}

GRANTS TO EVALUATE:
{grant_list}

Return a JSON array of exactly 10 objects, ranked #1 (best match) to #10. Each object:
{{
  "rank": 1,
  "grant_id": <integer from ID: field>,
  "title": "<grant title>",
  "agency": "<agency>",
  "deadline": "<close_date>",
  "match_score": <integer 1-100>,
  "why_apply": "<2-3 sentence explanation of why this is a strong match for Molehole Inc>",
  "best_project": "<one of: digital_wellness_hub | local_history_tiktok | urban_beekeeping | community_media_lab | minority_filmmaker_pipeline>",
  "project_rationale": "<1 sentence on why this project fits this grant>",
  "urgency": "<high|medium|low based on deadline proximity>",
  "competition_tip": "<1 sentence tip for standing out>"
}}

Respond ONLY with the raw JSON array, no markdown, no extra text."""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    recommendations = json.loads(raw)
    return {"recommendations": recommendations}

@app.get("/api/v1/grants/{grant_id}")
async def grant_detail(grant_id: int):
    return get_grant_by_id(grant_id)

@app.post("/api/v1/grants/{grant_id}/save")
async def grant_save(grant_id: int, saved: bool = True):
    save_grant(grant_id, saved)
    return {"status": "ok"}

@app.get("/api/v1/grants/applications/list")
async def grants_applications(status: str = ""):
    return {"applications": get_applications(status)}

@app.get("/api/v1/grants/projects/types")
async def grant_project_types():
    return {"project_types": get_project_types()}

@app.post("/api/v1/grants/{grant_id}/apply")
async def grants_apply(grant_id: int, project_type: str, ein: str = "", notes: str = ""):
    result = await write_application(grant_id, project_type, ein, notes)
    return result

@app.get("/api/v1/grants/application/{app_id}/pdf")
async def grants_pdf(app_id: int):
    path = generate_pdf(app_id)
    return FileResponse(path, media_type="application/pdf",
                        filename=f"grant_application_{app_id}.pdf")

@app.get("/api/v1/grants/application/{app_id}/text")
async def grants_text(app_id: int):
    return {"text": get_application_text(app_id)}

@app.post("/api/v1/grants/application/{app_id}/submit")
async def grants_submit(app_id: int, notes: str = ""):
    mark_submitted(app_id, notes)
    return {"status": "submitted"}

@app.get("/api/v1/grants/application/{app_id}/cover-letter")
async def grants_cover_letter(app_id: int):
    """Generate a submission cover letter email for a grant application."""
    import anthropic, os, sqlite3 as _sq
    from grants_finder import GRANTS_DB
    from grant_writer import APPLICANT

    with _sq.connect(GRANTS_DB) as db:
        db.row_factory = _sq.Row
        row = db.execute("""SELECT a.*, g.title as grant_title, g.agency, g.close_date, g.url as grant_url, g.cfda
                            FROM grant_applications a LEFT JOIN grants g ON a.grant_id=g.id
                            WHERE a.id=?""", (app_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    app = dict(row)

    prompt = f"""Write a concise, professional grant submission cover letter EMAIL for the following:

GRANT: {app.get('grant_title')}
AGENCY: {app.get('agency')}
CFDA: {app.get('cfda', 'N/A')}
DEADLINE: {app.get('close_date', 'Open')}
GRANT PORTAL: {app.get('grant_url', '')}

APPLICANT:
Organization: {APPLICANT['org_name']}
Address: {APPLICANT['address']}
Contact: {APPLICANT['contact']}, {APPLICANT['title']}
Email: {APPLICANT['email']}
EIN: {APPLICANT['ein']}
Project: {app.get('project_title')}

Write a 3-paragraph cover letter email:
1. Opening: who we are, what we're applying for, amount requested
2. Middle: brief compelling case — Emmy credentials, community impact, why we're the right organization
3. Closing: confirm all materials are attached, invite follow-up, professional sign-off

Keep it under 250 words. Professional but warm tone.
Return ONLY the email body text, no subject line, no extra commentary."""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}]
    )
    letter = response.content[0].text.strip()

    # Build submission checklist
    checklist = [
        {"item": "SAM.gov registration complete (get your UEI number)", "url": "https://sam.gov", "required": True},
        {"item": "Grants.gov account created & org registered", "url": "https://grants.gov", "required": True},
        {"item": "SF-424 Application for Federal Assistance (cover form)", "url": "https://grants.gov/forms", "required": True},
        {"item": "SF-424A Budget Information form", "url": "https://grants.gov/forms", "required": True},
        {"item": "Project Narrative PDF (download from this app)", "url": None, "required": True},
        {"item": "Organizational Chart", "url": None, "required": False},
        {"item": "Key Personnel resumes / bios", "url": None, "required": True},
        {"item": "Letters of Support from partner organizations", "url": None, "required": False},
        {"item": "Most recent financial statements or audit", "url": None, "required": True},
        {"item": "IRS determination letter (501c3) or articles of incorporation", "url": None, "required": True},
    ]

    return {
        "cover_letter": letter,
        "checklist": checklist,
        "agency_email": f"grants@{app.get('agency','agency').lower().replace(' ','')}",
        "grant_portal_url": app.get("grant_url", "https://grants.gov"),
        "subject": f"Grant Application — {app.get('project_title')} — {APPLICANT['org_name']} — EIN {APPLICANT['ein']}",
    }
