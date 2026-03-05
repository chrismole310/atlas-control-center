"use client"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

const FACTORY_API = "http://localhost:3001"

interface FactoryStats {
  artworks_today: number
  listings_total: number
  revenue_today: number
  opportunities: number
  target: number
  timestamp: string
}

interface Silo {
  id: number
  name: string
  category: string
  priority: number
  performance_score: number | null
  total_artworks: number
  total_sales: number
  total_revenue: string
  status: string
}

type Tab = "overview" | "silos" | "artists" | "trends" | "analytics"

export default function ArtFactory() {
  const [tab, setTab] = useState<Tab>("overview")
  const [stats, setStats] = useState<FactoryStats | null>(null)
  const [silos, setSilos] = useState<Silo[]>([])
  const [loading, setLoading] = useState(true)
  const [apiOnline, setApiOnline] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const [statsRes, silosRes] = await Promise.all([
        fetch(`${FACTORY_API}/api/stats`),
        fetch(`${FACTORY_API}/api/silos`),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (silosRes.ok) setSilos(await silosRes.json())
      setApiOnline(true)
    } catch {
      setApiOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [loadStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",  label: "Overview"   },
    { id: "silos",     label: "Silos"      },
    { id: "artists",   label: "Artists"    },
    { id: "trends",    label: "Trends"     },
    { id: "analytics", label: "Analytics"  },
  ]

  const progressPct = stats ? Math.min(100, (stats.artworks_today / stats.target) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-mono">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white/40 hover:text-white text-sm">← Back</Link>
          <h1 className="text-lg font-bold tracking-widest">ATLAS ART FACTORY</h1>
          <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
            apiOnline ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${apiOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {apiOnline ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
        {stats && (
          <div className="text-right text-xs text-white/40">
            Today: {stats.artworks_today}/{stats.target} artworks
          </div>
        )}
      </div>

      {!apiOnline && !loading && (
        <div className="mx-6 mt-4 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded text-yellow-400 text-sm">
          Art Factory API offline — start with: <code className="bg-white/10 px-1 rounded">cd atlas-art-factory && npm start</code>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/10 px-6">
        <div className="flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? "border-indigo-400 text-white"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Artworks Today",    value: stats?.artworks_today ?? "—",              unit: `/ ${stats?.target ?? 200}` },
                { label: "Total Listings",    value: stats?.listings_total?.toLocaleString() ?? "—", unit: "listings" },
                { label: "Revenue Today",     value: stats ? `$${stats.revenue_today.toFixed(2)}` : "—", unit: "" },
                { label: "Opportunities",     value: stats?.opportunities ?? "—",                unit: "niches" },
              ].map(s => (
                <div key={s.label} className="border border-white/10 rounded-lg p-4 bg-white/5">
                  <div className="text-xs text-white/40 mb-1">{s.label}</div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  {s.unit && <div className="text-xs text-white/30 mt-0.5">{s.unit}</div>}
                </div>
              ))}
            </div>

            {/* Daily progress */}
            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <div className="flex justify-between text-xs text-white/40 mb-2">
                <span>Daily Production Progress</span>
                <span>{progressPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>06:00 Scrape</span>
                <span>08:00 Intel</span>
                <span>09:30 Generate</span>
                <span>18:00 Publish</span>
                <span>22:00 Analytics</span>
              </div>
            </div>

            {/* Top silos preview */}
            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <div className="text-xs text-white/40 mb-3 uppercase tracking-wider">Top Silos by Priority</div>
              <div className="space-y-2">
                {silos.slice(0, 8).map(silo => (
                  <div key={silo.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/70 capitalize">{silo.name.replace(/-/g, ' ')}</span>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span>{silo.total_artworks} artworks</span>
                      <span className="text-green-400">${parseFloat(silo.total_revenue || '0').toFixed(0)}</span>
                      <span className="text-white/20">{silo.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SILOS TAB */}
        {tab === "silos" && (
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Silo</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Priority</th>
                  <th className="text-right p-3">Artworks</th>
                  <th className="text-right p-3">Sales</th>
                  <th className="text-right p-3">Revenue</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {silos.map((silo, i) => (
                  <tr key={silo.id} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                    <td className="p-3 capitalize">{silo.name.replace(/-/g, ' ')}</td>
                    <td className="p-3 text-white/40">{silo.category}</td>
                    <td className="p-3 text-right">{silo.priority}</td>
                    <td className="p-3 text-right">{silo.total_artworks}</td>
                    <td className="p-3 text-right">{silo.total_sales}</td>
                    <td className="p-3 text-right text-green-400">${parseFloat(silo.total_revenue || '0').toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        silo.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'
                      }`}>{silo.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* COMING SOON TABS */}
        {["artists", "trends", "analytics"].includes(tab) && (
          <div className="flex items-center justify-center h-64 text-white/20 text-sm border border-white/10 rounded-lg">
            <div className="text-center">
              <div className="text-2xl mb-2">&#x1f6a7;</div>
              <div className="capitalize">{tab} — built in Phase {tab === "artists" ? "4" : tab === "trends" ? "2" : "7"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
