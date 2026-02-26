from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import enum

Base = declarative_base()

class UserRole(enum.Enum):
    CEO = "ceo"
    CFO = "cfo"
    TRADER = "trader"
    VIEWER = "viewer"

class TradeStatus(enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(UserRole), default=UserRole.VIEWER)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

class Capital(Base):
    __tablename__ = "capital"
    id = Column(Integer, primary_key=True)
    total = Column(Float, default=1000.0)
    available = Column(Float, default=850.0)
    deployed = Column(Float, default=150.0)
    last_updated = Column(DateTime, default=datetime.utcnow)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String)
    amount = Column(Float)
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    total_value = Column(Float)
    status = Column(Enum(TradeStatus), default=TradeStatus.PENDING)
    requested_by = Column(String)
    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    executed_at = Column(DateTime, nullable=True)

class PaperBalance(Base):
    __tablename__ = "paper_balance"
    id = Column(Integer, primary_key=True)
    usd_balance = Column(Float, default=1000.0)
    total_pnl = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=datetime.utcnow)

class PaperPosition(Base):
    __tablename__ = "paper_positions"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String)
    quantity = Column(Float)
    avg_entry_price = Column(Float)
    opened_at = Column(DateTime, default=datetime.utcnow)

class PaperTrade(Base):
    __tablename__ = "paper_trades"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    total_value = Column(Float)
    pnl = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    note = Column(String, nullable=True)

engine = create_engine("sqlite:///./trax.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
