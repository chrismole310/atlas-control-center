"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, RefreshCw, Zap, Users, ArrowLeft, ChevronUp, ChevronDown, AlertCircle } from "lucide-react"
import Link from "next/link"

const API = "http://localhost:8000"

interface CongressTrade {
  id: number
  politician: string
  chamber: string
  party: string
  ticker: string
  asset_description: string
  trade_type: string
  amount_range: string
  amount_min: number
  amount_max: number
  transaction_date: string
  disclosure_date: string
  disclosure_lag_days: number
  is_vip: boolean
  ptr_link: string
}

interface Signal {
  type: string
  politician: string
  chamber: string
  party: string
  ticker: string
  trade_type: string
  amount_range: string
  transaction_date: string
  disclosure_date: string
  lag_days: number
  signal: string
  reason: string
  confidence: string
  action: string
}

interface LeaderEntry {
  name: string
  chamber: string
  party: string
  trades: number
  purchases: number
  sales: number
  note: string
}

const PartyBadge = ({ party }: { party: string }) => (
  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
    party === "D" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"
  }`}>{party || "?"}</span>
)

const ChamberBadge = ({ chamber }: { chamber: string }) => (
  <span className={`text-xs px-1.5 py-0.5 rounded ${
    chamber === "House" ? "bg-slate-700 text-slate-300" : "bg-purple-500/20 text-purple-300"
  }`}>{chamber}</span>
)

const ConfidenceBadge = ({ conf }: { conf: string }) => (
  <span className={`text-xs px-1.5 py-0.5 rounded uppercase font-bold ${
    conf === "high" ? "bg-green-500/20 text-green-400" :
    conf === "medium" ? "bg-yellow-500/20 text-yellow-400" :
    conf === "low" ? "bg-blue-500/20 text-blue-400" :
    "bg-slate-700 text-slate-500"
  }`}>{conf}</span>
)

export default function CongressPage() {
  const [trades, setTrades] = useState<CongressTrade[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<"signals" | "trades" | "leaderboard">("signals")
  const [vipOnly, setVipOnly] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshMsg, setRefreshMsg] = useState("")

  const loadAll = useCallback(async () => {
    try {
      const [tradesRes, signalsRes, lbRes, statsRes] = await Promise.all([
        fetch(`${API}/api/v1/congress/trades?limit=100&vip_only=${vipOnly}`),
        fetch(`${API}/api/v1/congress/signals`),
        fetch(`${API}/api/v1/congress/leaderboard`),
        fetch(`${API}/api/v1/congress/stats`),
      ])
      if (tradesRes.ok) setTrades((await tradesRes.json()).trades)
      if (signalsRes.ok) setSignals((await signalsRes.json()).signals)
      if (lbRes.ok) setLeaderboard((await lbRes.json()).leaderboard)
      if (statsRes.ok) setStats(await statsRes.json())
      setLastUpdate(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [vipOnly])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshMsg("")
    try {
      const res = await fetch(`${API}/api/v1/congress/refresh`, { method: "POST" })
      const data = await res.json()
      if (data.new > 0) {
        setRefreshMsg(`+${data.new} new trades fetched`)
      } else if (data.fetched > 0) {
        setRefreshMsg(`${data.fetched} trades checked — no new records`)
      } else {
        setRefreshMsg("API rate limited — using cached data. Try again in a few minutes.")
      }
      await loadAll()
    } catch {
      setRefreshMsg("Fetch failed — using cached data")
    }
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-slate-600 hover:text-slate-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Congress Tracker</h1>
            <p className="text-xs text-slate-500 font-mono">Trades disclosed 45 days after execution — buy on announcement</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Trades", value: stats.total_trades ?? 0, color: "text-white" },
          { label: "VIP Trades", value: stats.vip_trades ?? 0, color: "text-yellow-400" },
          { label: "Purchases", value: stats.purchases ?? 0, color: "text-green-400" },
          { label: "Sales", value: stats.sales ?? 0, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(["signals", "trades", "leaderboard"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                tab === t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {tab === "trades" && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={vipOnly} onChange={e => setVipOnly(e.target.checked)}
                className="rounded" />
              VIP only
            </label>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Fetching..." : "Refresh"}
          </button>
        </div>
      </div>

      {refreshMsg && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {refreshMsg}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="max-w-7xl mx-auto">

        {/* SIGNALS TAB */}
        {tab === "signals" && (
          <div className="space-y-3">
            {signals.length === 0 ? (
              <div className="text-center py-12 text-slate-600">No signals generated yet — click Refresh to fetch data</div>
            ) : signals.map((sig, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-slate-900/60 border rounded-xl p-5 ${
                  sig.confidence === "high" ? "border-green-500/30" :
                  sig.confidence === "medium" ? "border-yellow-500/30" :
                  sig.type === "info" ? "border-slate-700" :
                  "border-blue-500/20"
                }`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold font-mono ${
                      sig.signal.startsWith("BUY") ? "text-green-400" :
                      sig.signal.startsWith("SELL") ? "text-red-400" :
                      sig.signal.startsWith("WATCH") ? "text-yellow-400" :
                      "text-slate-500"
                    }`}>{sig.signal}</span>
                    <ConfidenceBadge conf={sig.confidence} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{sig.transaction_date}</span>
                    {sig.lag_days && <span className="bg-slate-800 px-1.5 py-0.5 rounded">{sig.lag_days}d lag</span>}
                  </div>
                </div>

                <p className="text-sm text-slate-300 mb-2">{sig.reason}</p>
                <p className="text-xs text-slate-500 italic mb-3">{sig.action}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-200">{sig.politician}</span>
                  <PartyBadge party={sig.party} />
                  <ChamberBadge chamber={sig.chamber} />
                  <span className={`px-1.5 py-0.5 rounded font-mono ${
                    sig.trade_type === "Purchase" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>{sig.trade_type}</span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{sig.ticker}</span>
                  <span className="text-slate-600">{sig.amount_range}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* TRADES TAB */}
        {tab === "trades" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-600 uppercase tracking-wider border-b border-slate-800 bg-slate-900/80">
                    <th className="text-left px-4 py-3">Politician</th>
                    <th className="text-left px-4 py-3">Ticker</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-right px-4 py-3">Trade Date</th>
                    <th className="text-right px-4 py-3">Disclosed</th>
                    <th className="text-right px-4 py-3">Lag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {trades.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-600">No trades — click Refresh</td></tr>
                  ) : trades.map(t => (
                    <tr key={t.id} className={`hover:bg-slate-800/20 transition-colors ${t.is_vip ? "bg-yellow-500/3" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {t.is_vip && <span className="text-yellow-400 text-xs">★</span>}
                          <span className="font-medium text-slate-200 text-sm">{t.politician}</span>
                          <PartyBadge party={t.party} />
                          <ChamberBadge chamber={t.chamber} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-200">{t.ticker}</span>
                        <div className="text-xs text-slate-600 truncate max-w-32">{t.asset_description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          t.trade_type === "Purchase" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>{t.trade_type}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{t.amount_range}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400 text-xs">{t.transaction_date}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400 text-xs">{t.disclosure_date}</td>
                      <td className="px-4 py-3 text-right">
                        {t.disclosure_lag_days != null && (
                          <span className={`text-xs font-mono ${t.disclosure_lag_days > 30 ? "text-red-400" : t.disclosure_lag_days > 14 ? "text-yellow-400" : "text-slate-400"}`}>
                            {t.disclosure_lag_days}d
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {leaderboard.map((entry, i) => (
              <motion.div key={entry.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono text-sm w-5">#{i+1}</span>
                    <div>
                      <div className="font-semibold text-slate-200">{entry.name}</div>
                      <div className="text-xs text-slate-500">{entry.note}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PartyBadge party={entry.party} />
                    <ChamberBadge chamber={entry.chamber} />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{entry.trades}</div>
                    <div className="text-xs text-slate-600">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{entry.purchases}</div>
                    <div className="text-xs text-slate-600">Buys</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-400">{entry.sales}</div>
                    <div className="text-xs text-slate-600">Sells</div>
                  </div>
                  <div className="ml-auto">
                    <div className="text-xs text-slate-500 text-right">Buy ratio</div>
                    <div className="text-sm font-mono text-slate-300">
                      {entry.trades > 0 ? Math.round((entry.purchases / entry.trades) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto mt-6 flex items-center justify-between text-xs text-slate-700">
        <span>Data: QuiverQuantitative.com — trades disclosed under STOCK Act</span>
        {lastUpdate && <span>Updated: {lastUpdate.toLocaleTimeString()}</span>}
      </div>
    </div>
  )
}
