'use client'

import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001'

interface ProductionStatus {
  artworks_today: number
  listings_today: number
  pending_distribution: number
  ts: string
}

export default function ProductionTab() {
  const [status, setStatus] = useState<ProductionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/production/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-gray-400">Loading production status...</div>
  if (!status) return <div className="p-6 text-red-400">Failed to load production status</div>

  const cards = [
    { label: 'Artworks Today', value: status.artworks_today, target: 200, color: 'blue' },
    { label: 'Listings Today', value: status.listings_today, target: 50, color: 'green' },
    { label: 'Pending Distribution', value: status.pending_distribution, target: null, color: 'yellow' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Production Pipeline</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-gray-400 text-sm">{card.label}</p>
            <p className="text-3xl font-bold text-white mt-1">{card.value}</p>
            {card.target && (
              <div className="mt-2">
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (card.value / card.target) * 100)}%` }}
                  />
                </div>
                <p className="text-gray-500 text-xs mt-1">{card.value}/{card.target} target</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-gray-500 text-sm">Last updated: {new Date(status.ts).toLocaleTimeString()}</p>
    </div>
  )
}
