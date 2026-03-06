"""
Coinbase Integration Service for TRAX Autonomous CFO
Uses coinbase-advanced-py RESTClient with API key + EC private key auth.
"""

import os
from datetime import datetime
from typing import Optional

try:
    from coinbase.rest import RESTClient
    COINBASE_SDK_AVAILABLE = True
except ImportError:
    COINBASE_SDK_AVAILABLE = False
    print("⚠️  Coinbase SDK not installed. Run: pip install coinbase-advanced-py")

# Safety Limits — tuned for $36 real account
MAX_TRADE_SIZE = 5.00       # max $5 per trade
DAILY_LOSS_LIMIT = 3.00     # stop if down $3/day
MIN_BALANCE = 20.00         # never go below $20
TRADING_HOURS = (9, 17)     # 9 AM – 5 PM only
APPROVED_PAIRS = ["BTC-USD", "ETH-USD", "SOL-USD"]


class CoinbaseService:
    def __init__(self):
        self.client = None
        self.connected = False

    def connect(self):
        if not COINBASE_SDK_AVAILABLE:
            return False

        api_key = os.environ.get("COINBASE_API_KEY", "")
        private_key_raw = os.environ.get("COINBASE_PRIVATE_KEY", "")

        if not api_key or not private_key_raw:
            print("❌ COINBASE_API_KEY or COINBASE_PRIVATE_KEY not set")
            return False

        # .env stores literal \n — convert to real newlines for PEM parsing
        private_key = private_key_raw.replace("\\n", "\n")

        try:
            self.client = RESTClient(api_key=api_key, api_secret=private_key)
            # Verify connection by fetching accounts
            self.client.get_accounts()
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
            balance = {"USD": 0.0, "USDC": 0.0, "crypto": {}}
            for acct in accounts["accounts"]:
                bal = acct.available_balance or {}
                val = float(bal.get("value", 0))
                if val <= 0:
                    continue
                currency = acct.currency
                if currency == "USD":
                    balance["USD"] = val
                elif currency == "USDC":
                    balance["USDC"] = val
                else:
                    balance["crypto"][currency] = {"amount": val}
            return balance
        except Exception as e:
            return {"error": str(e)}

    def get_price(self, product_id="BTC-USD"):
        if not self.connected:
            return 0.0
        try:
            result = self.client.get_best_bid_ask(product_ids=[product_id])
            books = result["pricebooks"]
            if books and books[0].asks:
                return float(books[0].asks[0].price)
        except Exception:
            pass
        return 0.0

    def get_prices(self):
        if not self.connected:
            return {pair: 0.0 for pair in APPROVED_PAIRS}
        try:
            result = self.client.get_best_bid_ask(product_ids=APPROVED_PAIRS)
            prices = {}
            for book in result["pricebooks"]:
                pid = book.product_id
                if book.asks:
                    prices[pid] = float(book.asks[0].price)
                else:
                    prices[pid] = 0.0
            return prices
        except Exception as e:
            return {pair: 0.0 for pair in APPROVED_PAIRS}

    def execute_trade(self, product_id, side, amount_usd):
        """
        Execute a real market order on Coinbase.
        side: 'BUY' or 'SELL'
        amount_usd: quote currency amount in USD
        """
        current_hour = datetime.now().hour
        if current_hour < TRADING_HOURS[0] or current_hour >= TRADING_HOURS[1]:
            return {"error": "Outside trading hours (9 AM – 5 PM)"}

        if product_id not in APPROVED_PAIRS:
            return {"error": f"Pair not approved. Allowed: {APPROVED_PAIRS}"}

        if amount_usd > MAX_TRADE_SIZE:
            return {"error": f"Amount ${amount_usd:.2f} exceeds max ${MAX_TRADE_SIZE}"}

        balance = self.get_balance()
        if "error" in balance:
            return balance

        available_usd = balance.get("USD", 0) + balance.get("USDC", 0)
        if available_usd < MIN_BALANCE:
            return {"error": f"Balance ${available_usd:.2f} below minimum ${MIN_BALANCE}"}

        if not self.connected:
            return {"error": "Not connected"}

        try:
            import uuid
            client_order_id = str(uuid.uuid4())

            if side.upper() == "BUY":
                order = self.client.market_order_buy(
                    client_order_id=client_order_id,
                    product_id=product_id,
                    quote_size=str(round(amount_usd, 2)),
                )
            else:
                order = self.client.market_order_sell(
                    client_order_id=client_order_id,
                    product_id=product_id,
                    quote_size=str(round(amount_usd, 2)),
                )

            success = order.get("success", False)
            order_id = order.get("order_id", "")
            return {
                "success": success,
                "order_id": order_id,
                "product_id": product_id,
                "side": side,
                "amount_usd": amount_usd,
                "simulated": False,
            }

        except Exception as e:
            return {"error": f"Trade failed: {str(e)}"}


coinbase_service = CoinbaseService()
