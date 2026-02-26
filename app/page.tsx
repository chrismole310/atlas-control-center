"use client"

import { useState, useEffect } from "react"
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
  ArrowUpRight
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"

const portals = [
  {
    id: "trax",
    name: "TRAX",
    description: "Autonomous CFO & trading agent",
    icon: TrendingUp,
    gradient: "from-green-500 to-emerald-600",
    status: "active",
    revenue: "Paper Mode",
    href: "/trax"
  },
  {
    id: "ugc-studio",
    name: "UGC Studio",
    description: "AI-powered content creation",
    icon: Video,
    gradient: "from-blue-500 to-purple-600",
    status: "active",
    revenue: "$3,847",
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
    href: "#"
  },
  {
    id: "pdf-lab",
    name: "PDF Lab",
    description: "Templates & guides",
    icon: FileText,
    gradient: "from-pink-500 to-orange-600",
    status: "active",
    revenue: "$987",
    href: "#"
  },
  {
    id: "audio-works",
    name: "Audio Works",
    description: "Audiobooks & podcasts",
    icon: Headphones,
    gradient: "from-orange-500 to-yellow-600",
    status: "building",
    revenue: "$0",
    href: "#"
  },
  {
    id: "print-factory",
    name: "Print Factory",
    description: "Print-on-demand",
    icon: Printer,
    gradient: "from-yellow-500 to-green-600",
    status: "active",
    revenue: "$1,432",
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
    href: "#"
  }
]

export default function Dashboard() {
  const [revenue, setRevenue] = useState(47382)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setRevenue(prev => prev + Math.floor(Math.random() * 15) - 5)
      setTime(new Date())
    }, 2000)
    return () => clearInterval(timer)
  }, [])

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
              <div className="text-sm text-slate-500">Live Revenue</div>
              <div className="text-2xl font-mono font-bold text-green-400">
                ${revenue.toLocaleString()}
              </div>
            </div>
            <div className="h-12 w-px bg-slate-800" />
            <div className="text-right">
              <div className="text-sm text-slate-500">System Time</div>
              <div className="text-lg font-mono text-slate-300">
                {time.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Active Portals</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">11</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Uptime</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">99.9%</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Bot className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">AI Agents</span>
              </div>
              <div className="text-2xl font-bold text-slate-200">7</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Growth</span>
              </div>
              <div className="text-2xl font-bold text-green-400">+23%</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Portals Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-200">Revenue Portals</h2>
          <Badge variant="outline" className="border-slate-700 text-slate-400">
            {portals.filter(p => p.status === "active").length} Active
          </Badge>
        </div>
        
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {portals.map((portal) => (
            <motion.div key={portal.id} variants={item}>
              <Link href={portal.href} className="block">
                <Card className="group bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all duration-300 cursor-pointer overflow-hidden h-full">
                  <CardContent className="p-0">
                    <div className={`h-2 bg-gradient-to-r ${portal.gradient}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-lg bg-gradient-to-br ${portal.gradient} shadow-lg`}>
                          <portal.icon className="w-5 h-5 text-white" />
                        </div>
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
                      </div>
                      <h3 className="font-semibold text-slate-200 mb-1 group-hover:text-white transition-colors">
                        {portal.name}
                      </h3>
                      <p className="text-sm text-slate-500 mb-3">{portal.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 uppercase tracking-wider">Revenue</span>
                        <span className="font-mono font-medium text-slate-300">{portal.revenue}</span>
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
          <span>Last Sync: {time.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}
