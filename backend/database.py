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

class CongressTrade(Base):
    __tablename__ = "congress_trades"
    id = Column(Integer, primary_key=True, index=True)
    source = Column(String)              # "house" or "senate"
    politician = Column(String)          # full name
    party = Column(String, nullable=True)
    chamber = Column(String)             # "House" or "Senate"
    ticker = Column(String)
    asset_description = Column(String)
    trade_type = Column(String)          # "Purchase" or "Sale"
    amount_range = Column(String)        # "$1,001 - $15,000"
    amount_min = Column(Float, nullable=True)
    amount_max = Column(Float, nullable=True)
    transaction_date = Column(String)
    disclosure_date = Column(String)
    disclosure_lag_days = Column(Integer, nullable=True)
    is_vip = Column(Integer, default=0)  # 1 if notable trader
    ptr_link = Column(String, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)

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

class Settlement(Base):
    __tablename__ = "settlements"
    id = Column(Integer, primary_key=True, index=True)
    case_name = Column(String)
    company = Column(String)
    settlement_amount = Column(String)
    deadline = Column(String)
    claim_url = Column(String)
    description = Column(String)
    category = Column(String)        # "tech", "consumer", "finance", etc.
    estimated_payout = Column(String, nullable=True)
    status = Column(String, default="open")  # open / filed / closed
    filed_at = Column(DateTime, nullable=True)
    source_url = Column(String, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)

class HousingListing(Base):
    __tablename__ = "housing_listings"
    id = Column(Integer, primary_key=True, index=True)
    lottery_id = Column(String, unique=True)
    building_name = Column(String)
    address = Column(String)
    borough = Column(String)
    units_available = Column(Integer, nullable=True)
    income_min = Column(Integer, nullable=True)
    income_max = Column(Integer, nullable=True)
    household_size = Column(String, nullable=True)
    rent_min = Column(Integer, nullable=True)
    rent_max = Column(Integer, nullable=True)
    deadline = Column(String)
    lottery_url = Column(String)
    status = Column(String, default="open")  # open / applied / closed
    applied_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)

class GovContract(Base):
    __tablename__ = "gov_contracts"
    id = Column(Integer, primary_key=True, index=True)
    award_id = Column(String, unique=True)
    recipient = Column(String)
    awarding_agency = Column(String)
    award_amount = Column(Float)
    description = Column(String)
    sector = Column(String)       # "defense", "tech", "health", etc.
    award_date = Column(String)
    period_of_performance = Column(String, nullable=True)
    place_of_performance = Column(String, nullable=True)
    naics_code = Column(String, nullable=True)
    usaspending_url = Column(String, nullable=True)
    trading_signal = Column(String, nullable=True)  # suggested ticker/action
    fetched_at = Column(DateTime, default=datetime.utcnow)

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
