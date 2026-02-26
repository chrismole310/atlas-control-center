"""
Coinbase Integration Service for TRAX Autonomous CFO
"""

import os
from datetime import datetime
from typing import Optional

# Coinbase CDP SDK
try:
    from coinbase.advanced_api import CoinbaseAdvancedApiClient
    COINBASE_SDK_AVAILABLE = True
except ImportError:
    COINBASE_SDK_AVAILABLE = False
    print("⚠️ Coinbase SDK not installed. Run: pip install coinbase-advanced-py")

# Safety Limits
MAX_TRADE_SIZE = 10.00
DAILY_LOSS_LIMIT = 5.00
MIN_BALANCE = 90.00
TRADING_HOURS = (9, 17)
APPROVED_PAIRS = ["BTC-USD", "ETH-USD", "SOL-USD"]

class CoinbaseService:
    def __init__(self):
        self.client = None
        self.connected = False
        
    def connect(self):
        if not COINBASE_SDK_AVAILABLE:
            return False
        private_key = os.environ.get("COINBASE_PRIVATE_KEY")
        if not private_key:
            print("❌ COINBASE_PRIVATE_KEY not set")
            return False
        try:
            self.client = CoinbaseAdvancedApiClient(private_key)
            self.connected = True
            print("✅ Connected to Coinbase!")
            return True
        except Exception as e:
            print(f"❌ Coinbase connection failed: {e}")
            return False
    
    def get_balance(self):
        if not self.connected:
            return {"error": "Not connected"}
        try:
            accounts = self.client.get_accounts()
            balance = {"USD": 0, "crypto": {}}
            for account in accounts.data:
                if account.available_balance.value:
                    if account.currency == "USD":
                        balance["USD"] = float(account.available_balance.value)
                    else:
                        balance["crypto"][account.currency] = {"amount": float(account.available_balance.value)}
            return balance
        except Exception as e:
            return {"error": str(e)}
    
    def get_price(self, product_id="BTC-USD"):
        if not self.connected:
            return 0.0
        try:
            ticker = self.client.get_product_ticker(product_id=product_id)
            return float(ticker.price)
        except:
            return 0.0
    
    def get_prices(self):
        prices = {}
        for pair in APPROVED_PAIRS:
            prices[pair] = self.get_price(pair)
        return prices
    
    def execute_trade(self, product_id, side, amount):
        current_hour = datetime.now().hour
        if current_hour < TRADING_HOURS[0] or current_hour >= TRADING_HOURS[1]:
            return {"error": "Outside trading hours (9 AM - 5 PM)"}
        if product_id not in APPROVED_PAIRS:
            return {"error": f"Pair not approved. Allowed: {APPROVED_PAIRS}"}
        if amount > MAX_TRADE_SIZE:
            return {"error": f"Amount ${amount} exceeds max ${MAX_TRADE_SIZE}"}
        balance = self.get_balance()
        if "error" in balance:
            return balance
        if balance.get("USD", 0) < MIN_BALANCE:
            return {"error": f"Balance ${balance['USD']} below minimum ${MIN_BALANCE}"}
        return {"success": True, "product_id": product_id, "side": side, "amount": amount, "simulated": True}

coinbase_service = CoinbaseService()
