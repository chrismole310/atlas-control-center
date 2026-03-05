'use client'

import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001'

interface DailyAnalytics {
  date: string
  artworks_created: number
  listings_published: number
  total_views: number
  total_sales: number
  gross_revenue: number | string
  net_revenue: number | string
  profit: number | string
  conversion_rate: number | string
}

interface TopArtwork {
  artwork_id: number
  title: string
  total_revenue: number | string
  total_sales: number
  avg_conversion: number | string
}

export default function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<DailyAnalytics[]>([])
  const [topArtworks, setTopArtworks] = useState<TopArtwork[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/analytics/daily?days=14`).then(r => r.json()),
      fetch(`${API_BASE}/api/analytics/top-artworks?limit=10`).then(r => r.json()),
    ])
      .then(([dailyData, topData]) => {
        setAnalytics(dailyData.analytics || [])
        setTopArtworks(topData.artworks || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-gray-400">Loading analytics...</div>

  const totals = analytics.reduce(
    (acc, d) => ({
      revenue: acc.revenue + Number(d.gross_revenue || 0),
      sales: acc.sales + (d.total_sales || 0),
      views: acc.views + (d.total_views || 0),
      artworks: acc.artworks + (d.artworks_created || 0),
    }),
    { revenue: 0, sales: 0, views: 0, artworks: 0 }
  )

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Analytics Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Revenue (14d)</p>
          <p className="text-2xl font-bold text-green-400">${totals.revenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Sales (14d)</p>
          <p className="text-2xl font-bold text-blue-400">{totals.sales}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Views (14d)</p>
          <p className="text-2xl font-bold text-purple-400">{totals.views.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Artworks Created (14d)</p>
          <p className="text-2xl font-bold text-yellow-400">{totals.artworks}</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Artworks</th>
                <th className="pb-2 pr-3">Listings</th>
                <th className="pb-2 pr-3">Views</th>
                <th className="pb-2 pr-3">Sales</th>
                <th className="pb-2 pr-3">Revenue</th>
                <th className="pb-2">CVR</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((d, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-2 pr-3 text-white">{d.date}</td>
                  <td className="py-2 pr-3 text-gray-300">{d.artworks_created}</td>
                  <td className="py-2 pr-3 text-gray-300">{d.listings_published}</td>
                  <td className="py-2 pr-3 text-gray-300">{d.total_views?.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-gray-300">{d.total_sales}</td>
                  <td className="py-2 pr-3 text-green-400">${Number(d.gross_revenue || 0).toFixed(2)}</td>
                  <td className="py-2 text-gray-300">{(Number(d.conversion_rate || 0) * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Top 10 Artworks</h3>
        <div className="space-y-2">
          {topArtworks.map((a, i) => (
            <div key={i} className="bg-gray-900 rounded-lg border border-gray-800 p-3 flex justify-between items-center">
              <div>
                <span className="text-gray-500 mr-2">#{i + 1}</span>
                <span className="text-white">{a.title || `Artwork #${a.artwork_id}`}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-green-400">${Number(a.total_revenue || 0).toFixed(2)}</span>
                <span className="text-gray-400">{a.total_sales} sales</span>
              </div>
            </div>
          ))}
          {topArtworks.length === 0 && <p className="text-gray-500">No sales data yet.</p>}
        </div>
      </div>
    </div>
  )
}
