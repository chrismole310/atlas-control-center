"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { FileText, RefreshCw, ArrowLeft, TrendingUp, Building2, AlertCircle, ExternalLink } from "lucide-react"
import Link from "next/link"

const API = "http://localhost:8000"

interface Contract {
  id: number
  award_id: string
  recipient: string
  awarding_agency: string
  award_amount: number
  award_amount_m: number
  description: string
  sector: string
  award_date: string
  period_of_performance: string
  place_of_performance: string
  naics_code: string
  usaspending_url: string
  trading_signal: string
}

interface Signal {
  signal: string
  sector: string
  trigger: string
  agency: string
  award_date: string
  amount: number
  is_crypto_signal: boolean
  confidence: string
}

interface Stats {
  total_contracts: number
  total_value_billions: number
  by_sector: Record<string, number>
}

const SECTOR_COLORS: Record<string, string> = {
  defense: "from-red-500 to-orange-600",
  tech: "from-blue-500 to-purple-600",
  health: "from-pink-500 to-red-600",
  energy: "from-yellow-500 to-orange-600",
  infrastructure: "from-green-500 to-teal-600",
  tech_defense: "from-purple-500 to-red-600",
  other: "from-slate-500 to-slate-600",
}

const SECTOR_BADGE: Record<string, string> = {
  defense: "bg-red-500/20 text-red-400 border-red-500/30",
  tech: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  health: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  energy: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  infrastructure: "bg-green-500/20 text-green-400 border-green-500/30",
  tech_defense: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  other: "bg-slate-700 text-slate-400 border-slate-600",
}

const fmtBig = (n: number) => {
  if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n/1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sectorFilter, setSectorFilter] = useState("")
  const [tab, setTab] = useState<"signals" | "contracts">("signals")
  const [msg, setMsg] = useState("")
  const [daysBack, setDaysBack] = useState(7)

  const load = useCallback(async () => {
    try {
      const [contractsRes, signalsRes] = await Promise.all([
        fetch(`${API}/api/v1/contracts?limit=50${sectorFilter ? `&sector=${sectorFilter}` : ""}`),
        fetch(`${API}/api/v1/contracts/signals`),
      ])
      if (contractsRes.ok) {
        const d = await contractsRes.json()
        setContracts(d.contracts)
        setStats(d.stats)
      }
      if (signalsRes.ok) {
        const d = await signalsRes.json()
        setSignals(d.signals)
      }
    } catch {}
    finally { setLoading(false) }
  }, [sectorFilter])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true); setMsg("")
    try {
      const res = await fetch(`${API}/api/v1/contracts/refresh?days_back=${daysBack}`, { method: "POST" })
      const d = await res.json()
      setMsg(d.new > 0 ? `+${d.new} new contracts imported ($${(d.new * 50).toFixed(0)}M+ in awards)` : d.fetched > 0 ? `${d.fetched} contracts scanned` : "USASpending API unavailable")
      await load()
    } catch { setMsg("Refresh failed") }
    setRefreshing(false)
  }

  const sectors = stats ? Object.keys(stats.by_sector) : []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-600 hover:text-slate-400"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Gov Contracts Tracker</h1>
            <p className="text-xs text-slate-500">USASpending.gov — trade sector ETFs on large contract announcements</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Contracts</div>
          <div className="text-2xl font-bold text-white">{stats?.total_contracts ?? 0}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Value</div>
          <div className="text-2xl font-bold text-orange-400">${stats?.total_value_billions ?? 0}B</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Signals</div>
          <div className="text-2xl font-bold text-yellow-400">{signals.length}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sectors</div>
          <div className="text-2xl font-bold text-purple-400">{sectors.length}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(["signals", "contracts"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm capitalize transition-colors ${
                  tab === t ? "bg-orange-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}>{t}</button>
            ))}
          </div>
          {tab === "contracts" && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSectorFilter("")}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${!sectorFilter ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>All</button>
              {sectors.map(s => (
                <button key={s} onClick={() => setSectorFilter(s === sectorFilter ? "" : s)}
                  className={`px-2.5 py-1 text-xs rounded border capitalize transition-colors ${
                    sectorFilter === s ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"
                  }`}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={daysBack} onChange={e => setDaysBack(+e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-2 py-1.5">
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Fetching..." : "Fetch Contracts"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <AlertCircle className="w-3.5 h-3.5" />{msg}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-600 mx-auto" /></div>
        ) : tab === "signals" ? (
          /* SIGNALS */
          signals.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No signals yet — click Fetch Contracts to load data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signals.map((sig, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`bg-slate-900/60 border rounded-xl p-5 ${
                    sig.is_crypto_signal ? "border-blue-500/30" :
                    sig.confidence === "medium" ? "border-yellow-500/30" : "border-slate-800"
                  }`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold font-mono ${
                        sig.signal.startsWith("BUY") ? "text-green-400" :
                        sig.signal.startsWith("WATCH") ? "text-yellow-400" : "text-slate-400"
                      }`}>{sig.signal}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${
                        sig.confidence === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-slate-700 text-slate-400 border-slate-600"
                      } uppercase`}>{sig.confidence}</span>
                      {sig.is_crypto_signal && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">crypto signal</span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-slate-500">{sig.award_date}</span>
                  </div>
                  <p className="text-sm text-slate-300 mb-1">{sig.trigger}</p>
                  <p className="text-xs text-slate-500">{sig.agency}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <span className={`px-1.5 py-0.5 rounded border capitalize ${SECTOR_BADGE[sig.sector] || SECTOR_BADGE.other}`}>{sig.sector}</span>
                    <span className="text-slate-600">{fmtBig(sig.amount)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        ) : (
          /* CONTRACTS */
          contracts.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No contracts imported yet — click Fetch Contracts</p>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-600 uppercase tracking-wider border-b border-slate-800 bg-slate-900/80">
                      <th className="text-left px-4 py-3">Recipient</th>
                      <th className="text-left px-4 py-3">Agency</th>
                      <th className="text-left px-4 py-3">Sector</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Signal</th>
                      <th className="text-right px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {contracts.map(c => (
                      <tr key={c.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200 text-sm">{c.recipient.slice(0,35)}{c.recipient.length > 35 ? "…" : ""}</div>
                          <div className="text-xs text-slate-600">{c.place_of_performance}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-48">
                          <div className="line-clamp-2">{c.awarding_agency}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${SECTOR_BADGE[c.sector] || SECTOR_BADGE.other}`}>{c.sector}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-200">{fmtBig(c.award_amount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-52">
                          <div className="line-clamp-2">{c.trading_signal}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">{c.award_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      <div className="max-w-7xl mx-auto mt-6 text-xs text-slate-700">
        Source: USASpending.gov — contracts $10M+ — not financial advice
      </div>
    </div>
  )
}
