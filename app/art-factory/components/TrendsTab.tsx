'use client'

import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001'

interface Trend {
  keyword: string
  demand_score: number
  trend_direction: string
  search_volume: number
  competition_count: number
  saturation_level: number
}

export default function TrendsTab() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/trends?limit=50`)
      .then(r => r.json())
      .then(data => setTrends(data.trends || []))
      .catch(() => setTrends([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-gray-400">Loading trends...</div>

  const directionIcon = (dir: string) => {
    if (dir === 'rising') return String.fromCharCode(8593)
    if (dir === 'falling') return String.fromCharCode(8595)
    return String.fromCharCode(8594)
  }

  const directionColor = (dir: string) => {
    if (dir === 'rising') return 'text-green-400'
    if (dir === 'falling') return 'text-red-400'
    return 'text-gray-400'
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Market Trends</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700">
              <th className="pb-2 pr-4">Keyword</th>
              <th className="pb-2 pr-4">Score</th>
              <th className="pb-2 pr-4">Trend</th>
              <th className="pb-2 pr-4">Volume</th>
              <th className="pb-2 pr-4">Competition</th>
              <th className="pb-2">Saturation</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t, i) => (
              <tr key={i} className="border-b border-gray-800 text-sm">
                <td className="py-2 pr-4 text-white font-medium">{t.keyword}</td>
                <td className="py-2 pr-4">
                  <span className={`font-bold ${t.demand_score > 80 ? 'text-green-400' : t.demand_score > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {Number(t.demand_score).toFixed(1)}
                  </span>
                </td>
                <td className={`py-2 pr-4 ${directionColor(t.trend_direction)}`}>
                  {directionIcon(t.trend_direction)} {t.trend_direction}
                </td>
                <td className="py-2 pr-4 text-gray-300">{t.search_volume?.toLocaleString() || '-'}</td>
                <td className="py-2 pr-4 text-gray-300">{t.competition_count?.toLocaleString() || '-'}</td>
                <td className="py-2 text-gray-300">{t.saturation_level ? `${(Number(t.saturation_level) * 100).toFixed(0)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trends.length === 0 && <p className="text-gray-500">No trend data available yet.</p>}
    </div>
  )
}
