"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import Link from "next/link"
import { Headphones, ChevronLeft, Trash2, RefreshCw } from "lucide-react"

const API = "http://localhost:8000"

interface Audiobook {
  id: number
  book_id: number
  title: string
  author: string
  voice: string
  duration_minutes: number
  file_size: number
  file_path: string
  qc_status: "pass" | "warn" | "fail"
  created_at?: string
}

interface Chapter {
  index: number
  title: string
  start_seconds: number
  end_seconds: number
  duration_seconds: number
  word_count: number
  text: string
}

interface Transcript {
  book_id: number
  book_title: string
  voice: string
  total_duration_seconds: number
  chapters: Chapter[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

const formatTRT = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const formatSize = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}MB`

const qcBadge = (status: string) => {
  if (status === "pass") return { label: "✅ QC Pass", cls: "bg-green-500/20 text-green-400" }
  if (status === "warn") return { label: "⚠️ QC Warn", cls: "bg-yellow-500/20 text-yellow-400" }
  return { label: "❌ QC Fail", cls: "bg-red-500/20 text-red-400" }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AudioWorksPage() {
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [regenLoading, setRegenLoading] = useState<number | null>(null)
  const [regenMsg, setRegenMsg] = useState<string | null>(null)

  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // ── Load audiobook list ──────────────────────────────────────────────────────
  const loadAudiobooks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/audiobooks`)
      if (res.ok) {
        const data = await res.json()
        setAudiobooks(data)
      }
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAudiobooks()
  }, [loadAudiobooks])

  // ── Load transcript when a book is selected ──────────────────────────────────
  useEffect(() => {
    if (selectedId == null) {
      setTranscript(null)
      return
    }
    setTranscript(null)
    fetch(`${API}/api/v1/audiobooks/${selectedId}/transcript`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTranscript(data) })
      .catch(() => {})
  }, [selectedId])

  // ── WaveSurfer setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!waveformRef.current || selectedId == null) return

    wavesurferRef.current?.destroy()
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#6366f1",
      progressColor: "#a78bfa",
      cursorColor: "#ffffff",
      barWidth: 2,
      barRadius: 2,
      height: 80,
      normalize: true,
    })

    ws.load(`${API}/api/v1/audiobooks/${selectedId}/stream`)

    ws.on("timeupdate", (t: number) => setCurrentTime(t))
    ws.on("ready", () => setDuration(ws.getDuration()))
    ws.on("play", () => setIsPlaying(true))
    ws.on("pause", () => setIsPlaying(false))

    wavesurferRef.current = ws
    return () => ws.destroy()
  }, [selectedId])

  // ── Karaoke sync ─────────────────────────────────────────────────────────────
  const currentChapter =
    transcript?.chapters.find(
      ch => currentTime >= ch.start_seconds && currentTime < ch.end_seconds
    ) ?? transcript?.chapters[transcript.chapters.length - 1] ?? null

  const paragraphs = currentChapter?.text.split(/\n\n+/).filter(p => p.trim()) ?? []

  const chapterProgress =
    currentChapter && currentChapter.duration_seconds > 0
      ? (currentTime - currentChapter.start_seconds) / currentChapter.duration_seconds
      : 0

  const currentParaIndex = Math.floor(chapterProgress * paragraphs.length)

  // ── Auto-scroll transcript ───────────────────────────────────────────────────
  useEffect(() => {
    if (transcriptRef.current) {
      const active = transcriptRef.current.querySelector("[data-active='true']")
      active?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [currentParaIndex])

  // ── Playback controls ────────────────────────────────────────────────────────
  const handlePlayPause = () => {
    wavesurferRef.current?.playPause()
  }

  const handleSkip = (delta: number) => {
    wavesurferRef.current?.skip(delta)
  }

  const seekToChapter = (ch: Chapter) => {
    if (!wavesurferRef.current || duration === 0) return
    wavesurferRef.current.seekTo(ch.start_seconds / duration)
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API}/api/v1/audiobooks/${id}`, { method: "DELETE" })
      if (selectedId === id) {
        setSelectedId(null)
        wavesurferRef.current?.destroy()
        wavesurferRef.current = null
      }
      setDeleteConfirm(null)
      loadAudiobooks()
    } catch {
      setDeleteConfirm(null)
    }
  }

  // ── Regenerate ───────────────────────────────────────────────────────────────
  const handleRegen = async (id: number) => {
    setRegenLoading(id)
    setRegenMsg("Regenerating...")
    try {
      await fetch(`${API}/api/v1/audiobooks/${id}/regenerate`, { method: "POST" })
    } catch {
      // ignore
    }
    setTimeout(() => {
      setRegenLoading(null)
      setRegenMsg(null)
    }, 2000)
    setTimeout(() => loadAudiobooks(), 5000)
  }

  // ── Selected audiobook object ────────────────────────────────────────────────
  const selected = audiobooks.find(a => a.id === selectedId) ?? null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <Headphones className="w-6 h-6 text-orange-400" />
          <h1 className="text-xl font-bold tracking-wide text-slate-100">AUDIO WORKS LIBRARY</h1>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Library sidebar ────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-y-auto">
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Library</p>
          </div>

          {loading && (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">Loading...</div>
          )}

          {!loading && audiobooks.length === 0 && (
            <div className="px-4 py-12 flex flex-col items-center gap-3 text-slate-500">
              <Headphones className="w-10 h-10 opacity-30" />
              <p className="text-sm text-center">No audiobooks yet. Generate one from the Publishing page.</p>
            </div>
          )}

          {audiobooks.map(book => {
            const badge = qcBadge(book.qc_status)
            const isSelected = book.id === selectedId
            const isDeleting = deleteConfirm === book.id

            return (
              <div
                key={book.id}
                onClick={() => { if (!isDeleting) setSelectedId(book.id) }}
                className={`mx-3 mb-2 rounded-lg border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                }`}
              >
                <p className="font-semibold text-slate-100 text-sm leading-snug mb-0.5 truncate">
                  {book.title}
                </p>
                <p className="text-xs text-slate-400 mb-1 truncate">{book.author}</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-500">{formatTRT(book.duration_minutes)}</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-xs text-slate-500">{formatSize(book.file_size)}</span>
                </div>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${badge.cls}`}>
                  {badge.label}
                </span>

                {isDeleting ? (
                  <div className="mt-1">
                    <p className="text-xs text-red-400 mb-1.5">Delete audiobook? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(null) }}
                        className="flex-1 text-xs py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(book.id) }}
                        className="flex-1 text-xs py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirm(book.id) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleRegen(book.id) }}
                      disabled={regenLoading === book.id}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${regenLoading === book.id ? "animate-spin" : ""}`} />
                      {regenLoading === book.id ? "..." : "Regen"}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── RIGHT: Player ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* No selection placeholder */}
          {!selected && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
              <Headphones className="w-16 h-16 opacity-20" />
              <p className="text-lg">Select an audiobook from the library</p>
            </div>
          )}

          {selected && (
            <>
              {/* Book header */}
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60">
                <h2 className="text-2xl font-bold text-slate-100 leading-tight">{selected.title}</h2>
                <p className="text-slate-400 text-sm mt-0.5">{selected.author}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {(() => {
                    const badge = qcBadge(selected.qc_status)
                    return (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )
                  })()}
                  <span className="text-xs text-slate-400">Voice: {selected.voice}</span>
                  <span className="text-xs text-slate-400">{formatSize(selected.file_size)}</span>
                  <span className="text-xs text-slate-400">{formatTRT(selected.duration_minutes)}</span>
                </div>

                {regenMsg && (
                  <div className="mt-2 text-xs text-indigo-400 animate-pulse">{regenMsg}</div>
                )}
              </div>

              {/* Waveform + controls */}
              <div className="px-6 py-4 border-b border-slate-800">
                <div
                  ref={waveformRef}
                  className="bg-slate-800 rounded-lg p-2 min-h-[80px] w-full"
                />

                {/* Playback controls */}
                <div className="flex items-center gap-4 mt-3">
                  <button
                    onClick={() => handleSkip(-10)}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
                    title="Rewind 10s"
                  >
                    &#9664;&#9664;
                  </button>
                  <button
                    onClick={handlePlayPause}
                    className="px-5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors min-w-[72px]"
                  >
                    {isPlaying ? "⏸ Pause" : "▶ Play"}
                  </button>
                  <button
                    onClick={() => handleSkip(10)}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
                    title="Forward 10s"
                  >
                    &#9654;&#9654;
                  </button>
                  <span className="text-sm font-mono text-slate-400 ml-2">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Chapters + Transcript */}
              <div className="flex-1 flex overflow-hidden">

                {/* Chapter list */}
                <div className="w-1/2 border-r border-slate-800 overflow-y-auto px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Chapters</p>
                  {transcript?.chapters.map(ch => {
                    const isActive = currentChapter?.index === ch.index
                    return (
                      <div
                        key={ch.index}
                        onClick={() => seekToChapter(ch)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg mb-1 cursor-pointer transition-colors ${
                          isActive
                            ? "bg-indigo-500/15 border border-indigo-500/40 text-indigo-300"
                            : "hover:bg-slate-800/60 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isActive && (
                            <span className="text-indigo-400 text-xs shrink-0">▶</span>
                          )}
                          <span className="text-sm truncate">{ch.title}</span>
                        </div>
                        <span className="text-xs text-slate-500 shrink-0 ml-2">
                          {Math.floor(ch.duration_seconds / 60)}m {Math.floor(ch.duration_seconds % 60)}s
                        </span>
                      </div>
                    )
                  })}
                  {!transcript && (
                    <p className="text-sm text-slate-500">No chapter data available.</p>
                  )}
                </div>

                {/* Transcript panel */}
                <div
                  ref={transcriptRef}
                  className="w-1/2 overflow-y-auto px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Transcript</p>
                  {paragraphs.length > 0 ? (
                    paragraphs.map((para, i) => (
                      <p
                        key={i}
                        data-active={i === currentParaIndex ? "true" : "false"}
                        className={`text-sm mb-3 leading-relaxed transition-colors ${
                          i === currentParaIndex
                            ? "text-white font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        {para}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      {transcript ? "No transcript text available for this chapter." : "Loading transcript..."}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
