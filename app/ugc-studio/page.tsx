"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { 
  Video, 
  Wand2, 
  Calendar, 
  BarChart3, 
  Sparkles,
  Play,
  Download,
  Share2,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default function UGCStudio() {
  const [script, setScript] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const generateScript = async () => {
    setIsGenerating(true)
    // TODO: Connect to Claude API
    setTimeout(() => {
      setScript("Here's your AI-generated script...\n\nHook: Stop scrolling! This AI tool saved me 10 hours this week...\n\nBody: Let me show you exactly how...")
      setIsGenerating(false)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">UGC Studio</h1>
            <p className="text-slate-400">AI-powered content creation pipeline</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Script Generator */}
        <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-400" />
              Script Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Enter topic or product..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <Button 
                onClick={generateScript}
                disabled={isGenerating}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                {isGenerating ? (
                  <Sparkles className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate
              </Button>
            </div>
            
            {script && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-800 rounded-lg p-4 font-mono text-sm text-slate-300 whitespace-pre-wrap"
              >
                {script}
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Videos Created</span>
              <Badge variant="secondary" className="bg-blue-500/20 text-blue-300">24</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Views</span>
              <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">142K</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Revenue</span>
              <Badge variant="secondary" className="bg-green-500/20 text-green-300">$3,847</Badge>
            </div>
            <Separator className="bg-slate-800" />
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Avg. CTR</span>
              <span className="text-slate-200 font-mono">4.2%</span>
            </div>
          </CardContent>
        </Card>

        {/* Video Pipeline */}
        <Card className="lg:col-span-3 bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-pink-400" />
              Video Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { step: "1", label: "Script", status: "ready", icon: Wand2 },
                { step: "2", label: "Visuals", status: "pending", icon: Video },
                { step: "3", label: "Voice", status: "pending", icon: Sparkles },
                { step: "4", label: "Publish", status: "pending", icon: Share2 },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    item.status === "ready" 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-slate-800 text-slate-500"
                  }`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Step {item.step}</div>
                    <div className="text-sm font-medium text-slate-200">{item.label}</div>
                  </div>
                  {i < 3 && (
                    <div className="hidden md:block flex-1 h-px bg-slate-800 mx-2" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Content Calendar */}
        <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-400" />
              Upcoming Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { title: "AI Tools Review", platform: "YouTube", date: "Today", time: "3:00 PM" },
                { title: "Productivity Hacks", platform: "TikTok", date: "Tomorrow", time: "10:00 AM" },
                { title: "Week in Review", platform: "Instagram", date: "Fri", time: "2:00 PM" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-200">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.platform}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {item.date} • {item.time}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start border-slate-700 hover:bg-slate-800">
              <Video className="w-4 h-4 mr-2 text-blue-400" />
              New Video Project
            </Button>
            <Button variant="outline" className="w-full justify-start border-slate-700 hover:bg-slate-800">
              <Download className="w-4 h-4 mr-2 text-green-400" />
              Export Analytics
            </Button>
            <Button variant="outline" className="w-full justify-start border-slate-700 hover:bg-slate-800">
              <Share2 className="w-4 h-4 mr-2 text-purple-400" />
              Connect Accounts
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
