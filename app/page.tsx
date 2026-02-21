"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Video, BookOpen, FileText, Mic, Globe, Package, TrendingUp, Bot, Music, Sparkles, Plus, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const portals = [
  { id: "ugc-studio", name: "UGC Studio", icon: Video, metric: "$12,450/mo", gradient: "from-blue-500 to-purple-600" },
  { id: "books-empire", name: "Books Empire", icon: BookOpen, metric: "$4,280/mo", gradient: "from-purple-500 to-pink-500" },
  { id: "pdf-factory", name: "PDF Factory", icon: FileText, metric: "$8,940/mo", gradient: "from-pink-500 to-orange-500" },
  { id: "audio-studio", name: "Audio Studio", icon: Mic, metric: "$1,850/mo", gradient: "from-orange-500 to-yellow-500" },
  { id: "omni-publisher", name: "Omni-Publisher", icon: Globe, metric: "67 uploads today", gradient: "from-yellow-500 to-green-500" },
  { id: "skills-store", name: "Skills Store", icon: Package, metric: "$2,450/mo", gradient: "from-green-500 to-teal-500" },
  { id: "market-intel", name: "Market Intel", icon: TrendingUp, metric: "3 trends detected", gradient: "from-teal-500 to-cyan-500" },
  { id: "ai-agents", name: "AI Agents", icon: Bot, metric: "8 agents active", gradient: "from-cyan-500 to-blue-500" },
  { id: "lofi-radio", name: "Lofi Radio", icon: Music, metric: "$3,431/mo", gradient: "from-blue-500 to-indigo-600" },
  { id: "trend-scanner", name: "Trend Scanner", icon: Sparkles, metric: "12 opportunities", gradient: "from-indigo-500 to-violet-600" },
  { id: "portal-creator", name: "Portal Creator", icon: Plus, metric: "Ready to build", gradient: "from-violet-500 to-purple-600" },
];

function AnimatedRevenue() {
  const [revenue, setRevenue] = useState(47382);
  useEffect(() => {
    const interval = setInterval(() => setRevenue((prev) => prev + Math.floor(Math.random() * 10) - 3), 2000);
    return () => clearInterval(interval);
  }, []);
  return <span className="font-mono text-2xl font-bold text-emerald-400">${revenue.toLocaleString()}</span>;
}

function CurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <span className="text-sm text-slate-400">{time.toLocaleDateString()} {time.toLocaleTimeString()}</span>;
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-xl font-bold text-transparent">ATLAS CONTROL CENTER</h1>
            <Badge variant="secondary" className="bg-slate-800 text-slate-300">v1.0</Badge>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end"><span className="text-xs text-slate-500">Live Revenue</span><AnimatedRevenue /></div>
            <CurrentTime />
            <Avatar className="h-9 w-9 border border-slate-700"><AvatarFallback className="bg-slate-800 text-slate-300"><User className="h-4 w-4" /></AvatarFallback></Avatar>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {portals.map((portal, index) => {
            const Icon = portal.icon;
            return (
              <motion.div key={portal.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
                <Card onClick={() => console.log(`Portal: ${portal.id}`)} className="group relative cursor-pointer overflow-hidden border-0 bg-slate-900 p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className={`absolute inset-0 bg-gradient-to-br ${portal.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`} />
                  <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${portal.gradient} opacity-20 blur-2xl transition-all duration-300 group-hover:scale-150`} />
                  <div className="relative z-10">
                    <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${portal.gradient} p-3`}><Icon className="h-6 w-6 text-white" /></div>
                    <h3 className="mb-1 text-lg font-semibold text-slate-100">{portal.name}</h3>
                    <p className="text-sm text-slate-400">{portal.metric}</p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </main>
    </div>
  );
}
