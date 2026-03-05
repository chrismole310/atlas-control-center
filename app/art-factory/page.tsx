'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProductionTab from './components/ProductionTab'
import TrendsTab from './components/TrendsTab'
import AnalyticsTab from './components/AnalyticsTab'

const API_BASE = 'http://localhost:3001'

interface Silo {
  id: number
  name: string
  category: string
  description: string
  priority: number
  status: string
  target_daily_output: number
}

interface Artist {
  id: number
  name: string
  silo_name: string
  style_rules: Record<string, unknown> | null
  preferred_ai_engine: string | null
}

interface Stats {
  silos: number
  artists: number
  artworks: number
  listings: number
  ts: string
}

interface ApiHealth {
  status: string
  db: string
  ts: string
}

type TabId = 'overview' | 'production' | 'silos' | 'artists' | 'trends' | 'analytics' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'production', label: 'Production' },
  { id: 'silos', label: 'Silos' },
  { id: 'artists', label: 'Artists' },
  { id: 'trends', label: 'Trends' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
]

export default function ArtFactoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [silos, setSilos] = useState<Silo[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const [healthRes, statsRes, silosRes, artistsRes] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/api/stats`),
          fetch(`${API_BASE}/api/silos`),
          fetch(`${API_BASE}/api/artists`),
        ])

        if (!healthRes.ok) throw new Error('Art Factory API unreachable')

        const [healthData, statsData, silosData, artistsData] = await Promise.all([
          healthRes.json(),
          statsRes.json(),
          silosRes.json(),
          artistsRes.json(),
        ])

        setHealth(healthData)
        setStats(statsData)
        setSilos(silosData.silos || [])
        setArtists(artistsData.artists || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← Back</Link>
          <h1 className="text-xl font-bold text-white">ATLAS ART FACTORY</h1>
          {health && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              health.status === 'ok' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
            }`}>
              {health.status === 'ok' ? '● Online' : '● Offline'}
            </span>
          )}
        </div>
        {stats && (
          <div className="text-sm text-gray-400">
            {stats.artworks} artworks · {stats.listings} listings
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6 flex gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-400">
            Loading...
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 mb-6">
            <strong>Error:</strong> {error}
            <p className="text-sm mt-1 text-red-400">Make sure the Art Factory API is running on port 3001.</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {activeTab === 'overview' && <OverviewTab stats={stats} silos={silos} artists={artists} />}
            {activeTab === 'silos' && <SilosTab silos={silos} />}
            {activeTab === 'artists' && <ArtistsTab artists={artists} />}
            {activeTab === 'production' && <ProductionTab />}
            {activeTab === 'trends' && <TrendsTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
            {activeTab === 'settings' && <ComingSoonTab name="Settings" desc="Configuration management coming soon." />}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({ stats, silos, artists }: { stats: Stats | null; silos: Silo[]; artists: Artist[] }) {
  const topSilos = [...silos].sort((a, b) => b.priority - a.priority).slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Silos', value: stats?.silos ?? '—' },
          { label: 'Artists', value: stats?.artists ?? '—' },
          { label: 'Artworks', value: stats?.artworks ?? '—' },
          { label: 'Listings', value: stats?.listings ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Top silos */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Top Silos by Priority</h2>
        <div className="space-y-2">
          {topSilos.map(silo => (
            <div key={silo.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <span className="text-white text-sm font-medium">{silo.name}</span>
                <span className="text-gray-500 text-xs ml-2">{silo.category}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full"
                    style={{ width: `${silo.priority}%` }}
                  />
                </div>
                <span className="text-gray-400 text-xs w-8 text-right">{silo.priority}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Artists summary */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Artists ({artists.length})</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {artists.slice(0, 8).map(artist => (
            <div key={artist.id} className="text-xs text-gray-400 truncate">
              <span className="text-white">{artist.name}</span>
              <span className="text-gray-600 ml-1">· {artist.silo_name}</span>
            </div>
          ))}
          {artists.length > 8 && (
            <div className="text-xs text-gray-600">+{artists.length - 8} more</div>
          )}
        </div>
      </div>
    </div>
  )
}

function SilosTab({ silos }: { silos: Silo[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Art Category Silos</h2>
        <span className="text-sm text-gray-400">{silos.length} silos</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {silos.map(silo => (
          <div key={silo.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">{silo.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                silo.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
              }`}>
                {silo.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3 line-clamp-2">{silo.description}</p>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{silo.category}</span>
              <span>Priority: {silo.priority}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArtistsTab({ artists }: { artists: Artist[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">AI Artist Personas</h2>
        <span className="text-sm text-gray-400">{artists.length} artists</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {artists.map(artist => (
          <div key={artist.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors">
            <h3 className="text-sm font-semibold text-white mb-1">{artist.name}</h3>
            <p className="text-xs text-indigo-400 mb-2">{artist.silo_name}</p>
            {artist.preferred_ai_engine && (
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                {artist.preferred_ai_engine}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ComingSoonTab({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-4xl mb-4">🔧</div>
      <h2 className="text-xl font-semibold text-white mb-2">{name}</h2>
      <p className="text-gray-400 text-sm max-w-md">{desc}</p>
    </div>
  )
}
