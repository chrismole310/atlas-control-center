"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { DollarSign, RefreshCw, ExternalLink, CheckCircle2, Clock, ArrowLeft, AlertCircle } from "lucide-react"
import Link from "next/link"

const API = "http://localhost:8000"

interface Settlement {
  id: number
  case_name: string
  company: string
  settlement_amount: string
  deadline: string
  claim_url: string
  description: string
  category: string
  estimated_payout: string | null
  status: string
  filed_at: string | null
}

interface Stats {
  total: number
  open: number
  filed: number
  by_category: Record<string, number>
}

const CATEGORY_COLORS: Record<string, string> = {
  tech: "from-blue-500 to-purple-600",
  finance: "from-green-500 to-teal-600",
  telecom: "from-orange-500 to-yellow-600",
  health: "from-pink-500 to-red-600",
  consumer: "from-slate-500 to-slate-600",
}

const CATEGORY_BG: Record<string, string> = {
  tech: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  finance: "bg-green-500/10 border-green-500/20 text-green-400",
  telecom: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  health: "bg-pink-500/10 border-pink-500/20 text-pink-400",
  consumer: "bg-slate-700/50 border-slate-600 text-slate-400",
}

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filingId, setFilingId] = useState<number | null>(null)
  const [filterCat, setFilterCat] = useState<string>("")
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    try {
      const url = filterCat
        ? `${API}/api/v1/settlements?limit=50&category=${filterCat}`
        : `${API}/api/v1/settlements?limit=50`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        setSettlements(d.settlements)
        setStats(d.stats)
      }
    } catch {}
    finally { setLoading(false) }
  }, [filterCat])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true); setMsg("")
    try {
      const res = await fetch(`${API}/api/v1/settlements/refresh`, { method: "POST" })
      const d = await res.json()
      setMsg(d.new > 0 ? `+${d.new} new settlements found!` : d.fetched > 0 ? `Checked ${d.fetched} items — no new settlements` : "RSS feeds unavailable — check back later")
      await load()
    } catch { setMsg("Refresh failed") }
    setRefreshing(false)
  }

  const markFiled = async (id: number, url: string) => {
    setFilingId(id)
    try {
      await fetch(`${API}/api/v1/settlements/${id}/filed`, { method: "POST" })
      window.open(url, "_blank")
      await load()
    } catch {}
    setFilingId(null)
  }

  const categories = stats ? Object.keys(stats.by_category) : []
  const displayed = settlements.filter(s => s.status === "open")

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-600 hover:text-slate-400"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-teal-600">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Settlement Finder</h1>
            <p className="text-xs text-slate-500">File class action claims — passive income, no work required</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Open Claims</div>
          <div className="text-2xl font-bold text-green-400">{stats?.open ?? 0}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Filed</div>
          <div className="text-2xl font-bold text-blue-400">{stats?.filed ?? 0}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Tracked</div>
          <div className="text-2xl font-bold text-white">{stats?.total ?? 0}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Categories</div>
          <div className="text-2xl font-bold text-purple-400">{categories.length}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterCat("")}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!filterCat ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
            All
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat === filterCat ? "" : cat)}
              className={`px-3 py-1.5 text-xs rounded-lg border capitalize transition-colors ${
                filterCat === cat ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}>
              {cat} {stats?.by_category[cat] ? `(${stats.by_category[cat]})` : ""}
            </button>
          ))}
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Scanning..." : "Scan for New"}
        </button>
      </div>

      {msg && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <AlertCircle className="w-3.5 h-3.5" />{msg}
          </div>
        </div>
      )}

      {/* Settlement cards */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-600 mx-auto" /></div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No open settlements tracked yet.</p>
            <p className="text-xs mt-1">Click "Scan for New" to search RSS feeds.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayed.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all group">
                <div className={`h-1.5 bg-gradient-to-r ${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.consumer}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-slate-200 text-sm leading-snug group-hover:text-white transition-colors">
                      {s.case_name}
                    </h3>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border capitalize ${CATEGORY_BG[s.category] || CATEGORY_BG.consumer}`}>
                      {s.category}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div>
                      <div className="text-slate-600 mb-0.5">Settlement</div>
                      <div className="font-mono text-green-400 font-semibold">{s.settlement_amount}</div>
                    </div>
                    <div>
                      <div className="text-slate-600 mb-0.5">Deadline</div>
                      <div className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3 h-3 text-orange-400" />
                        {s.deadline}
                      </div>
                    </div>
                  </div>

                  {s.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4">{s.description}</p>
                  )}

                  <button onClick={() => markFiled(s.id, s.claim_url)}
                    disabled={filingId === s.id}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 transition-colors disabled:opacity-50">
                    {filingId === s.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        File Claim
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto mt-6 text-xs text-slate-700">
        Sources: TopClassActions.com · ClassAction.org — Filing opens a new tab to the claim website
      </div>
    </div>
  )
}
