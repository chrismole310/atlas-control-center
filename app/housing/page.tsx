"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Home, RefreshCw, ExternalLink, CheckCircle2, Clock, ArrowLeft, MapPin, DollarSign, Users, AlertCircle } from "lucide-react"
import Link from "next/link"

const API = "http://localhost:8000"

interface Listing {
  id: number
  lottery_id: string
  building_name: string
  address: string
  borough: string
  units_available: number | null
  income_min: number | null
  income_max: number | null
  rent_min: number | null
  rent_max: number | null
  deadline: string
  lottery_url: string
  status: string
  applied_at: string | null
}

interface Stats {
  total_tracked: number
  open: number
  applied: number
}

const BOROUGH_COLORS: Record<string, string> = {
  Manhattan: "from-purple-500 to-blue-600",
  Brooklyn: "from-orange-500 to-pink-600",
  Queens: "from-green-500 to-teal-600",
  Bronx: "from-red-500 to-orange-600",
  "Staten Island": "from-blue-500 to-cyan-600",
}

export default function HousingPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)
  const [boroughFilter, setBoroughFilter] = useState("")
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    try {
      const url = boroughFilter
        ? `${API}/api/v1/housing/listings?borough=${boroughFilter}`
        : `${API}/api/v1/housing/listings`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        setListings(d.listings)
        setStats(d.stats)
      }
    } catch {}
    finally { setLoading(false) }
  }, [boroughFilter])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true); setMsg("")
    try {
      const res = await fetch(`${API}/api/v1/housing/refresh`, { method: "POST" })
      const d = await res.json()
      setMsg(d.new > 0 ? `+${d.new} new listings found!` : d.fetched > 0 ? `${d.fetched} listings checked` : "NYC Housing Connect API unavailable — check back later")
      await load()
    } catch { setMsg("Refresh failed") }
    setRefreshing(false)
  }

  const applyListing = async (id: number, url: string) => {
    setApplying(id)
    try {
      await fetch(`${API}/api/v1/housing/${id}/apply`, { method: "POST" })
      window.open(url, "_blank")
      await load()
    } catch {}
    setApplying(null)
  }

  const boroughs = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]
  const fmtMoney = (n: number) => `$${n.toLocaleString()}`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-600 hover:text-slate-400"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">NYC Housing Lottery</h1>
            <p className="text-xs text-slate-500">Track open lotteries — auto-apply before deadlines</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-3 gap-3">
        {[
          { label: "Open Lotteries", value: stats?.open ?? 0, color: "text-teal-400" },
          { label: "Applied", value: stats?.applied ?? 0, color: "text-green-400" },
          { label: "Total Tracked", value: stats?.total_tracked ?? 0, color: "text-white" },
        ].map(s => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setBoroughFilter("")}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!boroughFilter ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
            All Boroughs
          </button>
          {boroughs.map(b => (
            <button key={b} onClick={() => setBoroughFilter(b === boroughFilter ? "" : b)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                boroughFilter === b ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}>{b}</button>
          ))}
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Checking..." : "Check New Listings"}
        </button>
      </div>

      {msg && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <AlertCircle className="w-3.5 h-3.5" />{msg}
          </div>
        </div>
      )}

      {/* Listings */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-600 mx-auto" /></div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <Home className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No open lotteries tracked yet.</p>
            <p className="text-xs mt-1">Click "Check New Listings" to scan NYC Housing Connect.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {listings.map((l, i) => (
              <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-slate-900/60 border rounded-xl overflow-hidden transition-all group ${
                  l.status === "applied" ? "border-green-500/30 bg-green-500/3" : "border-slate-800 hover:border-slate-700"
                }`}>
                <div className={`h-1.5 bg-gradient-to-r ${BOROUGH_COLORS[l.borough] || "from-slate-500 to-slate-600"}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-slate-200 text-sm leading-snug">{l.building_name || "NYC Affordable Housing"}</h3>
                    {l.status === "applied" && (
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                    <MapPin className="w-3 h-3" />
                    {l.address || l.borough}
                    <span className="ml-1 px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">{l.borough}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    {l.rent_min && (
                      <div>
                        <div className="text-slate-600 mb-0.5 flex items-center gap-1"><DollarSign className="w-3 h-3" />Rent</div>
                        <div className="text-slate-200">
                          {fmtMoney(l.rent_min)}{l.rent_max && l.rent_max !== l.rent_min ? ` – ${fmtMoney(l.rent_max)}` : ""}/mo
                        </div>
                      </div>
                    )}
                    {l.units_available && (
                      <div>
                        <div className="text-slate-600 mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" />Units</div>
                        <div className="text-slate-200">{l.units_available} available</div>
                      </div>
                    )}
                    <div>
                      <div className="text-slate-600 mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />Deadline</div>
                      <div className="text-orange-400">{l.deadline || "Check site"}</div>
                    </div>
                    {l.income_max && (
                      <div>
                        <div className="text-slate-600 mb-0.5">Max Income</div>
                        <div className="text-slate-300">{fmtMoney(l.income_max)}/yr</div>
                      </div>
                    )}
                  </div>

                  {l.status === "applied" ? (
                    <div className="w-full py-2 text-sm text-center text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg">
                      ✓ Applied {l.applied_at ? new Date(l.applied_at).toLocaleDateString() : ""}
                    </div>
                  ) : (
                    <button onClick={() => applyListing(l.id, l.lottery_url)}
                      disabled={applying === l.id}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 transition-colors disabled:opacity-50">
                      {applying === l.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><ExternalLink className="w-4 h-4" />Apply Now</>}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto mt-6 text-xs text-slate-700">
        Source: NYC Housing Connect (housingconnect.nyc.gov) — "Apply Now" opens the official application
      </div>
    </div>
  )
}
