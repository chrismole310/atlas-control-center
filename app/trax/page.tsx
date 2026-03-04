"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrendingUp, TrendingDown, DollarSign, Activity, Zap,
  RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3,
  Target, AlertCircle, CheckCircle2, Clock, Bot,
  ChevronUp, ChevronDown, Minus
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

const API = "http://localhost:8000"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceData {
  price: number
  change_24h: number
}

interface Prices {
  "BTC-USD": PriceData
  "ETH-USD": PriceData
  "SOL-USD": PriceData
}

interface Holding {
  symbol: string
  quantity: number
  avg_entry_price: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  change_24h: number
}

interface Portfolio {
  usd_balance: number
  holdings_value: number
  total_value: number
  total_pnl: number
  unrealized_pnl: number
  total_return: number
  total_return_pct: number
  starting_balance: number
  holdings: Holding[]
  prices: Prices
}

interface PaperTradeHistory {
  id: number
  symbol: string
  action: string
  quantity: number
  price: number
  total_value: number
  pnl: number | null
  timestamp: string
  note: string
}

interface ArbitrageOpportunity {
  type: string
  signal: string
  reason: string
  spread: number
  confidence: string
  suggested_action: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 2) =>
  n?.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) ?? "..."

const fmtMoney = (n: number) => `$${fmt(n)}`

const PnlBadge = ({ value, pct }: { value: number; pct?: number }) => {
  const pos = value >= 0
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm font-semibold ${pos ? "text-green-400" : "text-red-400"}`}>
      {pos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {pos ? "+" : ""}{fmtMoney(value)}
      {pct !== undefined && <span className="text-xs opacity-70">({pos ? "+" : ""}{fmt(pct)}%)</span>}
    </span>
  )
}

const ChangeBadge = ({ pct }: { pct: number }) => {
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-mono ${pos ? "text-green-400" : "text-red-400"}`}>
      {pos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {pos ? "+" : ""}{fmt(pct)}%
    </span>
  )
}

// ─── Price Ticker ─────────────────────────────────────────────────────────────

function PriceTicker({ prices }: { prices: Prices | null }) {
  const tickers = [
    { key: "BTC-USD" as const, label: "BTC", color: "text-orange-400" },
    { key: "ETH-USD" as const, label: "ETH", color: "text-blue-400" },
    { key: "SOL-USD" as const, label: "SOL", color: "text-purple-400" },
  ]

  return (
    <div className="flex gap-6">
      {tickers.map(({ key, label, color }) => {
        const data = prices?.[key]
        return (
          <div key={key} className="flex items-center gap-3">
            <span className={`text-xs font-bold tracking-widest ${color}`}>{label}</span>
            <span className="font-mono text-slate-200 text-sm font-semibold">
              {data ? fmtMoney(data.price) : "—"}
            </span>
            {data && <ChangeBadge pct={data.change_24h} />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Portfolio Value Chart (simulated from trade history) ─────────────────────

function PortfolioChart({ startValue, currentValue }: { startValue: number; currentValue: number }) {
  const points = 20
  const data = []
  let v = startValue
  for (let i = 0; i < points; i++) {
    const target = currentValue
    const progress = i / (points - 1)
    const noise = (Math.random() - 0.5) * (Math.abs(target - startValue) * 0.15)
    v = startValue + (target - startValue) * progress + noise
    data.push({
      t: i,
      value: Math.max(0, Math.round(v * 100) / 100),
    })
  }
  data[data.length - 1].value = currentValue

  const isUp = currentValue >= startValue
  const color = isUp ? "#4ade80" : "#f87171"

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis hide />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
          labelStyle={{ display: "none" }}
          formatter={(v: unknown) => [typeof v === "number" ? fmtMoney(v) : String(v), "Value"]}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Trade Form ───────────────────────────────────────────────────────────────

function TradeForm({ onTrade, prices }: { onTrade: () => void; prices: Prices | null }) {
  const [symbol, setSymbol] = useState("BTC-USD")
  const [action, setAction] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null)

  const presets = [10, 25, 50, 100]

  const currentPrice = prices?.[symbol as keyof Prices]?.price ?? 0
  const estimatedQty = amount && currentPrice ? parseFloat(amount) / currentPrice : 0

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setLoading(true)
    setResult(null)

    const headers: Record<string, string> = { "Content-Type": "application/json" }

    const body: Record<string, unknown> = { symbol, action }
    if (action === "buy") body.usd_amount = parseFloat(amount)
    else { body.usd_amount = parseFloat(amount); body.sell_all = false }

    try {
      const resp = await fetch(`${API}/api/v1/paper/trade`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ success: true, msg: `${action.toUpperCase()} executed! New balance: ${fmtMoney(data.new_balance)}` })
        setAmount("")
        onTrade()
      } else {
        setResult({ success: false, msg: data.detail ?? "Trade failed" })
      }
    } catch {
      setResult({ success: false, msg: "Connection error" })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Buy/Sell toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700">
        <button
          onClick={() => setAction("buy")}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            action === "buy" ? "bg-green-500/20 text-green-400 border-r border-green-500/30" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          BUY
        </button>
        <button
          onClick={() => setAction("sell")}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            action === "sell" ? "bg-red-500/20 text-red-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          SELL
        </button>
      </div>

      {/* Symbol selector */}
      <select
        value={symbol}
        onChange={e => setSymbol(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="BTC-USD">BTC-USD — Bitcoin</option>
        <option value="ETH-USD">ETH-USD — Ethereum</option>
        <option value="SOL-USD">SOL-USD — Solana</option>
      </select>

      {/* Amount input */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Preset amounts */}
      <div className="flex gap-2">
        {presets.map(p => (
          <button
            key={p}
            onClick={() => setAmount(p.toString())}
            className="flex-1 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 transition-colors"
          >
            ${p}
          </button>
        ))}
      </div>

      {/* Estimate */}
      {estimatedQty > 0 && currentPrice > 0 && (
        <div className="text-xs text-slate-500 text-center">
          ≈ {estimatedQty.toFixed(8)} {symbol.split("-")[0]} @ {fmtMoney(currentPrice)}
        </div>
      )}

      {/* Execute button */}
      <button
        onClick={handleTrade}
        disabled={loading || !amount}
        className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          action === "buy"
            ? "bg-green-500 hover:bg-green-400 text-black"
            : "bg-red-500 hover:bg-red-400 text-white"
        }`}
      >
        {loading ? (
          <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
        ) : (
          `${action === "buy" ? "PAPER BUY" : "PAPER SELL"} ${symbol.split("-")[0]}`
        )}
      </button>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-2 text-xs p-2 rounded-lg ${
              result.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
            }`}
          >
            {result.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            {result.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function TraxPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [prices, setPrices] = useState<Prices | null>(null)
  const [tradeHistory, setTradeHistory] = useState<PaperTradeHistory[]>([])
  const [arbitrage, setArbitrage] = useState<ArbitrageOpportunity[]>([])
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected")

  const loadAll = useCallback(async () => {
    try {
      const [portfolioRes, historyRes, arbitrageRes] = await Promise.all([
        fetch(`${API}/api/v1/paper/portfolio`),
        fetch(`${API}/api/v1/paper/history?limit=20`),
        fetch(`${API}/api/v1/market/arbitrage`),
      ])

      if (portfolioRes.ok) {
        const p = await portfolioRes.json()
        setPortfolio(p)
        setPrices(p.prices)
        setConnected(true)
      }
      if (historyRes.ok) {
        const h = await historyRes.json()
        setTradeHistory(h.trades)
      }
      if (arbitrageRes.ok) {
        const a = await arbitrageRes.json()
        setArbitrage(a.opportunities)
      }
      setLastUpdate(new Date())
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 30000)
    return () => clearInterval(interval)
  }, [loadAll])

  // WebSocket
  useEffect(() => {
    let ws: WebSocket
    let reconnectTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      setWsStatus("connecting")
      ws = new WebSocket(`ws://localhost:8000/ws`)

      ws.onopen = () => {
        setWsStatus("connected")
        ws.send(JSON.stringify({ type: "subscribe" }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === "paper_trade" || msg.type === "capital_update") {
            loadAll()
          }
        } catch {}
      }

      ws.onclose = () => {
        setWsStatus("disconnected")
        reconnectTimeout = setTimeout(connect, 5000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimeout)
      ws?.close()
    }
  }, [loadAll])

  const totalReturn = portfolio?.total_return ?? 0
  const totalReturnPct = portfolio?.total_return_pct ?? 0
  const isUp = totalReturn >= 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* ── Header ── */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
              <Bot className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">TRAX</h1>
              <p className="text-xs text-slate-500 font-mono">Autonomous CFO — Paper Trading Mode</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <PriceTicker prices={prices} />
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                wsStatus === "connected" ? "bg-green-400 animate-pulse" :
                wsStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"
              }`} />
              <span className="text-xs text-slate-500 capitalize">{wsStatus}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Left column: Stats + Trade Form ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Capital cards */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Paper Balance</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {portfolio ? fmtMoney(portfolio.usd_balance) : "..."}
              </div>
              <div className="text-xs text-slate-600 mt-1">Cash available</div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <BarChart3 className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Total Value</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {portfolio ? fmtMoney(portfolio.total_value) : "..."}
              </div>
              {portfolio && (
                <PnlBadge value={totalReturn} pct={totalReturnPct} />
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Activity className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Holdings Value</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {portfolio ? fmtMoney(portfolio.holdings_value) : "..."}
              </div>
              {portfolio && portfolio.unrealized_pnl !== 0 && (
                <PnlBadge value={portfolio.unrealized_pnl} />
              )}
            </div>
          </div>

          {/* Trade form */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-slate-200">Paper Trade</span>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full ml-auto">SIMULATED</span>
            </div>
            <TradeForm onTrade={loadAll} prices={prices} />
          </div>
        </div>

        {/* ── Right columns: Charts + Tables ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Portfolio chart */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Portfolio Performance</h2>
                <p className="text-xs text-slate-600">Starting: $1,000.00 paper capital</p>
              </div>
              <div className="flex items-center gap-2">
                {portfolio && (
                  <span className={`text-lg font-bold font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{fmt(totalReturnPct)}%
                  </span>
                )}
                <button onClick={loadAll} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
            <PortfolioChart
              startValue={portfolio?.starting_balance ?? 1000}
              currentValue={portfolio?.total_value ?? 1000}
            />
          </div>

          {/* Holdings table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-200">Open Positions</h2>
            </div>

            {portfolio?.holdings.length === 0 || !portfolio ? (
              <div className="text-center py-8 text-slate-600">
                <Minus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No open positions. Use the trade panel to open positions.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-600 uppercase tracking-wider border-b border-slate-800">
                      <th className="text-left pb-2">Symbol</th>
                      <th className="text-right pb-2">Qty</th>
                      <th className="text-right pb-2">Avg Entry</th>
                      <th className="text-right pb-2">Current</th>
                      <th className="text-right pb-2">Value</th>
                      <th className="text-right pb-2">P&L</th>
                      <th className="text-right pb-2">24h</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {portfolio.holdings.map(h => (
                      <tr key={h.symbol} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5 font-mono font-bold text-slate-200">{h.symbol.split("-")[0]}</td>
                        <td className="py-2.5 text-right font-mono text-slate-400 text-xs">{h.quantity.toFixed(6)}</td>
                        <td className="py-2.5 text-right font-mono text-slate-400">{fmtMoney(h.avg_entry_price)}</td>
                        <td className="py-2.5 text-right font-mono text-slate-300">{fmtMoney(h.current_price)}</td>
                        <td className="py-2.5 text-right font-mono text-slate-200">{fmtMoney(h.market_value)}</td>
                        <td className="py-2.5 text-right"><PnlBadge value={h.unrealized_pnl} pct={h.unrealized_pnl_pct} /></td>
                        <td className="py-2.5 text-right"><ChangeBadge pct={h.change_24h} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom row: Arbitrage + Trade History */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Arbitrage signals */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                <h2 className="text-sm font-semibold text-slate-200">TRAX Signals</h2>
              </div>
              <div className="space-y-2">
                {arbitrage.map((opp, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      opp.type === "no_signal"
                        ? "border-slate-800 bg-slate-800/30"
                        : opp.confidence === "medium"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-blue-500/30 bg-blue-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold font-mono ${
                        opp.signal === "HOLD" ? "text-slate-500" :
                        opp.signal.startsWith("BUY") ? "text-green-400" : "text-red-400"
                      }`}>{opp.signal}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs uppercase ${
                        opp.confidence === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                        opp.confidence === "low" ? "bg-blue-500/20 text-blue-400" :
                        "bg-slate-700 text-slate-500"
                      }`}>{opp.confidence}</span>
                    </div>
                    <p className="text-slate-400">{opp.reason}</p>
                    {opp.type !== "no_signal" && (
                      <p className="text-slate-500 italic">{opp.suggested_action}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Recent trade history */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-slate-200">Trade History</h2>
              </div>

              {tradeHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm">
                  No trades yet. Start paper trading!
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {tradeHistory.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                          t.action === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>{t.action.toUpperCase()}</span>
                        <span className="text-xs font-mono text-slate-300">{t.symbol.split("-")[0]}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-slate-300">{fmtMoney(t.total_value)}</div>
                        {t.pnl !== null && (
                          <div className={`text-xs font-mono ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.pnl >= 0 ? "+" : ""}{fmtMoney(t.pnl)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-7xl mx-auto mt-6 flex items-center justify-between text-xs text-slate-700">
        <span>TRAX v1.0 — Paper Trading Mode — No real capital at risk</span>
        {lastUpdate && <span>Last sync: {lastUpdate.toLocaleTimeString()}</span>}
      </div>
    </div>
  )
}
