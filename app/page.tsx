"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Video,
  BookOpen,
  FileText,
  Headphones,
  Printer,
  GraduationCap,
  BarChart3,
  Bot,
  Radio,
  ScanLine,
  Plus,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Brain,
  Zap,
  Receipt,
  Share2,
  Palette
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"

const API = "http://localhost:8000"

interface DashStats {
  trax: {
    paper_value: number
    paper_pnl: number
    paper_pnl_pct: number
    auto_enabled: boolean
    auto_running: boolean
    auto_trades_today: number
    auto_profit: number
    mode: string
  }
  congress_trades: number
  open_settlements: number
  housing_listings: number
  contracts: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [time, setTime] = useState<Date | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/dashboard/stats`)
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    loadStats()
    const statsInterval = setInterval(loadStats, 30000)
    setTime(new Date())
    const timeInterval = setInterval(() => setTime(new Date()), 1000)
    return () => { clearInterval(statsInterval); clearInterval(timeInterval) }
  }, [loadStats])

  const fmtUsd = (n: number) =>
    n?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "..."

  const portals = [
    {
      id: "trax",
      name: "TRAX",
      description: "Autonomous CFO & trading agent",
      icon: TrendingUp,
      gradient: "from-green-500 to-emerald-600",
      status: "active",
      revenue: stats
        ? `$${fmtUsd(stats.trax.paper_value)}`
        : "Loading...",
      badge: stats?.trax.auto_enabled
        ? { label: "AUTO", color: "bg-green-500/20 text-green-400 border-green-500/30" }
        : null,
      meta: stats
        ? `${stats.trax.paper_pnl >= 0 ? "+" : ""}${stats.trax.paper_pnl_pct.toFixed(2)}% · ${stats.trax.mode.toUpperCase()}`
        : null,
      href: "/trax"
    },
    {
      id: "congress",
      name: "Congress Tracker",
      description: "Copy insider political trades",
      icon: BarChart3,
      gradient: "from-blue-500 to-purple-600",
      status: "active",
      revenue: stats ? `${stats.congress_trades} trades` : "Loading...",
      badge: null,
      meta: "Live alpha signals",
      href: "/congress"
    },
    {
      id: "settlements",
      name: "Settlement Finder",
      description: "Auto-file class action claims",
      icon: ArrowUpRight,
      gradient: "from-green-500 to-teal-600",
      status: "active",
      revenue: stats ? `${stats.open_settlements} open` : "Loading...",
      badge: null,
      meta: "Passive income",
      href: "/settlements"
    },
    {
      id: "housing",
      name: "Housing Lottery",
      description: "NYC affordable housing tracker",
      icon: Clock,
      gradient: "from-teal-500 to-cyan-600",
      status: "active",
      revenue: stats ? `${stats.housing_listings} listings` : "Loading...",
      badge: null,
      meta: "Cost reduction",
      href: "/housing"
    },
    {
      id: "contracts",
      name: "Gov Contracts",
      description: "Trade on federal award announcements",
      icon: TrendingUp,
      gradient: "from-orange-500 to-red-600",
      status: "active",
      revenue: stats ? `${stats.contracts} awards` : "Loading...",
      badge: null,
      meta: "Trade signals",
      href: "/contracts"
    },
    {
      id: "social",
      name: "Social Scheduler",
      description: "Auto-post to Telegram, Reddit & Facebook",
      icon: Share2,
      gradient: "from-violet-500 to-blue-600",
      status: "active",
      revenue: "3 platforms",
      badge: { label: "AUTO", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
      meta: "Daily · AI-generated content",
      href: "/social"
    },
    {
      id: "pdf-art",
      name: "PDF Art Factory",
      description: "AI artwork → print-ready PDFs → Etsy + Gumroad",
      icon: Palette,
      gradient: "from-pink-500 to-purple-600",
      status: "active",
      revenue: "Etsy + Gumroad",
      badge: { label: "AUTO", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
      meta: "FLUX AI · 5 print sizes · SEO auto-written",
      href: "/pdf-art"
    },
    {
      id: "intelligence",
      name: "Atlas Intelligence",
      description: "Apify-powered market research — Etsy trends, IG leads, TikTok viral analysis",
      icon: Brain,
      gradient: "from-purple-600 to-indigo-700",
      status: "active",
      revenue: "Market Data",
      badge: { label: "LIVE", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
      meta: "Etsy · Instagram · TikTok · Auto-updated daily",
      href: "/intelligence"
    },
    {
      id: "yolo",
      name: "YOLO Mode",
      description: "Autonomous business builder — researches, builds & launches products while you sleep",
      icon: Zap,
      gradient: "from-violet-600 to-fuchsia-700",
      status: "active",
      revenue: "Autonomous",
      badge: { label: "AUTO", color: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30" },
      meta: "Midnight runs · AI validation · Etsy + Gumroad auto-launch",
      href: "/yolo"
    },
    {
      id: "receipts",
      name: "Atlas Receipts",
      description: "Telegram receipt harvesting — $0.02/receipt",
      icon: Receipt,
      gradient: "from-violet-500 to-purple-600",
      status: "active",
      revenue: "@AtlasReceiptsBot",
      badge: { label: "LIVE", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
      meta: "Earn $0.02 · Cash out $5",
      href: "/receipts"
    },
    {
      id: "ugc-studio",
      name: "UGC Studio",
      description: "AI-powered content creation",
      icon: Video,
      gradient: "from-blue-500 to-purple-600",
      status: "active",
      revenue: "$3,847",
      badge: null,
      meta: null,
      href: "/ugc-studio"
    },
    {
      id: "publishing",
      name: "Publishing",
      description: "Books & digital products",
      icon: BookOpen,
      gradient: "from-purple-500 to-pink-600",
      status: "active",
      revenue: "$2,156",
      badge: null,
      meta: null,
      href: "/publishing"
    },
    {
      id: "pdf-lab",
      name: "PDF Lab",
      description: "Templates & guides",
      icon: FileText,
      gradient: "from-pink-500 to-orange-600",
      status: "active",
      revenue: "$987",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "audio-works",
      name: "Audio Works",
      description: "Audiobooks & podcasts",
      icon: Headphones,
      gradient: "from-orange-500 to-yellow-600",
      status: "active",
      revenue: "$0",
      badge: null,
      meta: null,
      href: "/audio-works"
    },
    {
      id: "print-factory",
      name: "Print Factory",
      description: "Print-on-demand",
      icon: Printer,
      gradient: "from-yellow-500 to-green-600",
      status: "active",
      revenue: "$1,432",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "skills-market",
      name: "Skills Market",
      description: "Courses & coaching",
      icon: GraduationCap,
      gradient: "from-green-500 to-teal-600",
      status: "planning",
      revenue: "$0",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "market-intel",
      name: "Market Intel",
      description: "Trend analysis",
      icon: BarChart3,
      gradient: "from-teal-500 to-cyan-600",
      status: "active",
      revenue: "$2,890",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "ai-agents",
      name: "AI Agents",
      description: "Automation systems",
      icon: Bot,
      gradient: "from-cyan-500 to-blue-600",
      status: "building",
      revenue: "$0",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "lofi-radio",
      name: "Lofi Radio",
      description: "24/7 music stream",
      icon: Radio,
      gradient: "from-blue-500 to-indigo-600",
      status: "active",
      revenue: "$534",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "trend-scanner",
      name: "Trend Scanner",
      description: "Viral content finder",
      icon: ScanLine,
      gradient: "from-indigo-500 to-violet-600",
      status: "building",
      revenue: "$0",
      badge: null,
      meta: null,
      href: "#"
    },
    {
      id: "portal-creator",
      name: "Portal Creator",
      description: "New income streams",
      icon: Plus,
      gradient: "from-violet-500 to-purple-600",
      status: "planning",
      revenue: "$0",
      badge: null,
      meta: null,
      href: "#"
    }
  ]

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  }

  const trax = stats?.trax
  const activeCount = portals.filter(p => p.status === "active").length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              ATLAS CONTROL CENTER
            </h1>
            <p className="text-slate-400 mt-1">Unified command dashboard for automated revenue systems</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-slate-500">TRAX Portfolio</div>
              <div className={`text-2xl font-mono font-bold ${trax && trax.paper_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {trax ? `$${fmtUsd(trax.paper_value)}` : "..."}
              </div>
              {trax && (
                <div className={`text-xs font-mono ${trax.paper_pnl >= 0 ? "text-green-400/70" : "text-red-400/70"}`}>
                  {trax.paper_pnl >= 0 ? "+" : ""}{fmtUsd(trax.paper_pnl)} ({trax.paper_pnl_pct >= 0 ? "+" : ""}{trax.paper_pnl_pct.toFixed(2)}%)
                </div>
              )}
            </div>
            <div className="h-12 w-px bg-slate-800" />
            <div className="text-right">
              <div className="text-sm text-slate-500">System Time</div>
              <div className="text-lg font-mono text-slate-300">{time ? time.toLocaleTimeString() : "--:--:--"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto trader status bar */}
      {trax?.auto_enabled && (
        <div className="max-w-7xl mx-auto mb-6 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-500/8 border border-green-500/20 text-green-400 text-xs">
          <Brain className="w-3.5 h-3.5 animate-pulse shrink-0" />
          <span className="font-semibold tracking-wide">TRAX AUTONOMOUS MODE ACTIVE</span>
          <span className="text-green-400/60">·</span>
          <span className="text-green-400/70">{trax.auto_trades_today} trades today · P&amp;L: {trax.auto_profit >= 0 ? "+" : ""}{fmtUsd(trax.auto_profit)} · {trax.mode.toUpperCase()}</span>
          <Link href="/trax" className="ml-auto text-green-400/60 hover:text-green-400 underline underline-offset-2">View TRAX →</Link>
        </div>
      )}

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Active Portals</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">{activeCount}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Congress Trades</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">{stats?.congress_trades ?? "..."}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Bot className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Open Settlements</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">{stats?.open_settlements ?? "..."}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Gov Contracts</span>
              </div>
              <div className="text-2xl font-bold text-green-400">{stats?.contracts ?? "..."}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Portals Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-200">Revenue Portals</h2>
          <Badge variant="outline" className="border-slate-700 text-slate-400">
            {activeCount} Active
          </Badge>
        </div>

        <motion.div
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {portals.map((portal) => (
            <motion.div key={portal.id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
              <Link href={portal.href} className="block h-full">
                <Card className="group bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all duration-300 cursor-pointer overflow-hidden h-full">
                  <CardContent className="p-0 h-full">
                    <div className={`h-2 bg-gradient-to-r ${portal.gradient}`} />
                    <div className="p-5 flex flex-col h-[calc(100%-8px)]">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-lg bg-gradient-to-br ${portal.gradient} shadow-lg`}>
                          <portal.icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant="secondary"
                            className={
                              portal.status === "active" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                              portal.status === "building" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                              "bg-slate-700/50 text-slate-400 border-slate-600"
                            }
                          >
                            {portal.status}
                          </Badge>
                          {portal.badge && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold border ${portal.badge.color}`}>
                              {portal.badge.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <h3 className="font-semibold text-slate-200 mb-1 group-hover:text-white transition-colors">
                        {portal.name}
                      </h3>
                      <p className="text-sm text-slate-500 mb-3 flex-1">{portal.description}</p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-slate-600 uppercase tracking-wider">
                          {portal.meta ?? "Revenue"}
                        </span>
                        <span className="font-mono font-medium text-slate-300 text-sm">{portal.revenue}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <Separator className="max-w-7xl mx-auto my-8 bg-slate-800" />

      {/* Footer */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600">
        <div>ATLAS v1.0 • Automated Wealth Operating System</div>
        <div className="flex items-center gap-4">
          <span>System Status: <span className="text-green-500">Operational</span></span>
          <span>Last Sync: {time ? time.toLocaleTimeString() : "--:--:--"}</span>
        </div>
      </div>
    </div>
  )
}
