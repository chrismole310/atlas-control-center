'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Book, AuthorProfile } from '../api/novel-portal/data/route'

// ── Types ────────────────────────────────────────────────────────────────────

type BookStatus = Book['status']

interface Stats {
  totalBooks: number
  totalWords: number
  totalTarget: number
  completionPct: number
  existingDrafts: number
  needsDrafting: number
}

interface ApiData {
  activeAuthor: AuthorProfile
  books: Book[]
  stats: Stats
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WAVE_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
  1: { bg: 'bg-green-900/50', text: 'text-green-400', border: 'border-green-700', label: 'Wave 1' },
  2: { bg: 'bg-blue-900/50', text: 'text-blue-400', border: 'border-blue-700', label: 'Wave 2' },
  3: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', border: 'border-yellow-700', label: 'Wave 3' },
  4: { bg: 'bg-orange-900/50', text: 'text-orange-400', border: 'border-orange-700', label: 'Wave 4' },
  5: { bg: 'bg-gray-800', text: 'text-gray-400', border: 'border-gray-600', label: 'Wave 5' },
}

const STATUS_STYLES: Record<BookStatus, string> = {
  'EXISTING DRAFT': 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50',
  'NEEDS DRAFTING': 'bg-gray-800 text-gray-400 border border-gray-600',
  'IN PROGRESS':   'bg-blue-900/40 text-blue-400 border border-blue-700/50',
  'COMPLETE':      'bg-green-900/40 text-green-400 border border-green-700/50',
}

const STATUS_LABELS: Record<BookStatus, string> = {
  'EXISTING DRAFT': 'DRAFT',
  'NEEDS DRAFTING': 'NEEDS DRAFTING',
  'IN PROGRESS':   'IN PROGRESS',
  'COMPLETE':      'COMPLETE',
}

const GENRE_LABELS: Record<string, string> = {
  military_thriller: 'Military Thriller',
  thriller: 'Thriller',
  romance: 'Romance',
  fantasy: 'Fantasy',
  sci_fi: 'Sci-Fi',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtWords(n: number) {
  if (n === 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

function progressPct(current: number, target: number) {
  if (target === 0) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

function waveBar(wave: number) {
  const c = WAVE_COLORS[wave] ?? WAVE_COLORS[5]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
      {c.label}
    </span>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, wave }: { pct: number; wave: number }) {
  const fillColors: Record<number, string> = {
    1: 'bg-green-500',
    2: 'bg-blue-500',
    3: 'bg-yellow-500',
    4: 'bg-orange-500',
    5: 'bg-gray-500',
  }
  const fill = fillColors[wave] ?? 'bg-indigo-500'
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div
        className={`${fill} h-1.5 rounded-full transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-indigo-900 border border-indigo-600 text-indigo-200 px-5 py-3 rounded-lg shadow-lg text-sm">
      {message}
    </div>
  )
}

// ── Wave Section (collapsible) ────────────────────────────────────────────────

function WaveSection({ wave, books }: { wave: number; books: Book[] }) {
  const [open, setOpen] = useState(wave <= 2)
  const c = WAVE_COLORS[wave] ?? WAVE_COLORS[5]

  const waveBooks = books.filter(b => b.wave === wave)
  if (waveBooks.length === 0) return null

  const totalWaveWords = waveBooks.reduce((s, b) => s + b.wordCount, 0)
  const totalWaveTarget = waveBooks.reduce((s, b) => s + b.targetWords, 0)
  const wavePct = progressPct(totalWaveWords, totalWaveTarget)

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      {/* Wave header — toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          {waveBar(wave)}
          <span className="text-sm font-medium text-gray-300">
            {waveBooks.length} book{waveBooks.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-500">{fmtWords(totalWaveWords)} / {fmtWords(totalWaveTarget)} words</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 bg-gray-800 rounded-full h-1">
            <div
              className={`${c.text.replace('text-', 'bg-').replace('-4', '-5')} h-1 rounded-full`}
              style={{ width: `${wavePct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{wavePct}%</span>
          <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Wave cards */}
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {waveBooks.map(book => {
            const pct = progressPct(book.wordCount, book.targetWords)
            return (
              <div
                key={book.number}
                className="bg-gray-800 rounded-lg border border-gray-700 p-3 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs text-gray-500">#{book.number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[book.status]}`}>
                    {STATUS_LABELS[book.status]}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-0.5 truncate">{book.title}</h4>
                <p className="text-xs text-gray-500 mb-3 truncate">{book.leadCharacter}</p>
                <div className="space-y-1">
                  <ProgressBar pct={pct} wave={wave} />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{fmtWords(book.wordCount)} words</span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NovelPortalPage() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'table' | 'waves'>('table')

  useEffect(() => {
    fetch('/api/novel-portal/data')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: ApiData) => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  function showToast(msg: string) {
    setToast(msg)
  }

  const profile = data?.activeAuthor
  const books = data?.books ?? []
  const stats = data?.stats

  const waves = [1, 2, 3, 4, 5]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white text-sm transition-colors">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-white tracking-wide">ATLAS NOVEL PORTAL</h1>
          {profile && (
            <span className="text-xs px-2 py-1 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700">
              Active
            </span>
          )}
        </div>

        {/* Author info */}
        {profile && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{profile.pen_name}</div>
              <div className="text-xs text-gray-500">{profile.publishing_imprint}</div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-violet-900/50 text-violet-300 border border-violet-700 font-medium uppercase tracking-wide">
              {GENRE_LABELS[profile.genre] ?? profile.genre}
            </span>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="p-6 max-w-screen-2xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Loading novel data...
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 mb-6 text-sm">
            <strong>Error:</strong> {error}
            <p className="text-red-400 mt-1 text-xs">
              Make sure the atlas-novel-portal data files exist at the expected path.
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="flex gap-6">
            {/* ── Main column ── */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total Books',
                    value: stats?.totalBooks ?? 0,
                    sub: `${stats?.existingDrafts ?? 0} drafted`,
                    color: 'text-white',
                  },
                  {
                    label: 'Total Words',
                    value: stats ? `${(stats.totalWords / 1000).toFixed(1)}k` : '—',
                    sub: `of ${stats ? (stats.totalTarget / 1000000).toFixed(1) + 'M' : '—'} target`,
                    color: 'text-indigo-400',
                  },
                  {
                    label: 'Completion',
                    value: `${stats?.completionPct ?? 0}%`,
                    sub: `${stats?.needsDrafting ?? 0} need drafting`,
                    color: 'text-green-400',
                  },
                  {
                    label: 'Series',
                    value: profile?.series_name?.replace(' Series', '') ?? '—',
                    sub: `${profile?.total_books_planned ?? 0} books planned`,
                    color: 'text-violet-400',
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">{label}</div>
                    <div className="text-xs text-gray-600 mt-1">{sub}</div>
                  </div>
                ))}
              </div>

              {/* View switcher */}
              <div className="flex items-center gap-1 border-b border-gray-800 pb-0">
                {(['table', 'waves'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setActiveView(v)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeView === v
                        ? 'text-white border-b-2 border-indigo-500'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {v === 'table' ? 'Book Inventory' : 'Wave Priority'}
                  </button>
                ))}
              </div>

              {/* ── Table view ── */}
              {activeView === 'table' && (
                <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Wave</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Title</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Lead Character</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-36">Status</th>
                        <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-28 text-right">Words</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-40 hidden md:table-cell">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {books.map(book => {
                        const pct = progressPct(book.wordCount, book.targetWords)
                        return (
                          <tr
                            key={book.number}
                            className="hover:bg-gray-800/50 transition-colors group"
                          >
                            <td className="px-4 py-3">{waveBar(book.wave)}</td>
                            <td className="px-3 py-3 text-gray-500 font-mono text-xs">{book.number}</td>
                            <td className="px-3 py-3">
                              <span className="text-white font-medium group-hover:text-indigo-300 transition-colors">
                                {book.title}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-400 text-xs hidden lg:table-cell">{book.leadCharacter}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[book.status]}`}>
                                {STATUS_LABELS[book.status]}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-xs text-gray-300">
                              {book.wordCount > 0 ? book.wordCount.toLocaleString() : '—'}
                              <span className="text-gray-600"> / 100k</span>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <ProgressBar pct={pct} wave={book.wave} />
                                </div>
                                <span className="text-xs text-gray-500 w-9 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Waves view ── */}
              {activeView === 'waves' && (
                <div className="space-y-3">
                  {waves.map(wave => (
                    <WaveSection key={wave} wave={wave} books={books} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Sidebar: Quick Actions ── */}
            <div className="w-64 shrink-0 space-y-4">
              {/* Quick Actions */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Quick Actions
                </h3>
                <div className="space-y-2">
                  {[
                    { icon: '⚡', label: 'Rewrite Chapter', action: 'Rewrite Chapter — coming soon' },
                    { icon: '📋', label: 'Consistency Check', action: 'Consistency Check — coming soon' },
                    { icon: '📦', label: 'Package Book', action: 'Package Book — coming soon' },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={() => showToast(action)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 hover:text-white transition-colors text-left"
                    >
                      <span className="text-base leading-none">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Series Stats */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <span>📊</span> Series Stats
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Series completion</span>
                      <span className="text-white font-medium">{stats?.completionPct ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${stats?.completionPct ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {[
                    { label: 'Total words written', value: stats ? stats.totalWords.toLocaleString() : '—' },
                    { label: 'Words remaining', value: stats ? (stats.totalTarget - stats.totalWords).toLocaleString() : '—' },
                    { label: 'Books drafted', value: `${stats?.existingDrafts ?? 0} / ${stats?.totalBooks ?? 0}` },
                    { label: 'Target per book', value: '100,000 words' },
                    { label: 'Platforms', value: profile?.distribution_platforms?.join(', ') ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="border-t border-gray-800 pt-2.5">
                      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                      <div className="text-sm text-white font-medium">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wave Legend */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Wave Legend
                </h3>
                <div className="space-y-2">
                  {[
                    { wave: 1, desc: 'Highest Priority' },
                    { wave: 2, desc: 'Strong Drafts' },
                    { wave: 3, desc: 'Mid Drafts' },
                    { wave: 4, desc: 'Early Drafts' },
                    { wave: 5, desc: 'Needs Drafting' },
                  ].map(({ wave, desc }) => {
                    const c = WAVE_COLORS[wave]
                    return (
                      <div key={wave} className="flex items-center gap-2.5">
                        <span className={`inline-flex w-14 justify-center px-1.5 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
                          {c.label}
                        </span>
                        <span className="text-xs text-gray-500">{desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <Toast message={toast} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
