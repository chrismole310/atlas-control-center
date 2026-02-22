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
    UserRole, TradeStatus
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
