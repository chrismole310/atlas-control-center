'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = 'http://localhost:3001'

// ── Types ──────────────────────────────────────────────────────────────────

interface Silo {
  id: number
  name: string
  category: string
  description: string
  priority: number
  status: string
  target_daily_output: number
}

interface LibrarySiloMeta {
  count: number
  latestFolder: string | null
  latestDate: string | null
}

interface Piece {
  folderId: string
  date: string
  title: string
}

interface Listing {
  title: string
  price: string | number
  tags: string[]
  description: string
}

interface JobStatus {
  jobId: string
  step: string
  status: 'pending' | 'active' | 'done' | 'error'
  message: string
  progress: number
  error: string | null
  result: unknown
}

type View = 'grid' | 'silo' | 'detail'

// ── Hooks ──────────────────────────────────────────────────────────────────

function useLibrary() {
  const [librarySilos, setLibrarySilos] = useState<Map<string, LibrarySiloMeta>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLibrary() {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/api/library`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const map = new Map<string, LibrarySiloMeta>()
        for (const silo of (data.silos || [])) {
          map.set(silo.slug, {
            count: silo.count,
            latestFolder: silo.latestFolder ?? null,
            latestDate: silo.latestDate ?? null,
          })
        }
        setLibrarySilos(map)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch library')
      } finally {
        setLoading(false)
      }
    }
    fetchLibrary()
  }, [])

  return { librarySilos, loading, error }
}

function useSiloInventory(slug: string | null) {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchIndex, setFetchIndex] = useState(0)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    async function fetchInventory() {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/library/${encodeURIComponent(slug!)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setPieces(data.pieces || [])
        }
      } catch {
        if (!cancelled) setPieces([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInventory()
    return () => { cancelled = true }
  }, [slug, fetchIndex])

  const refresh = useCallback(() => setFetchIndex(i => i + 1), [])

  return { pieces, loading, refresh }
}

function useListing(silo: string | null, folderId: string | null) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!silo || !folderId) {
      setListing(null)
      return
    }
    let cancelled = false

    async function fetchListing() {
      setLoading(true)
      try {
        const res = await fetch(
          `${API_BASE}/api/library/${encodeURIComponent(silo!)}/${encodeURIComponent(folderId!)}/listing`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setListing(data)
      } catch {
        if (!cancelled) setListing(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchListing()
    return () => { cancelled = true }
  }, [silo, folderId])

  return { listing, loading }
}

function useGenerateForSilo(onComplete: () => void) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startJob = useCallback(async (siloId: number) => {
    stopPolling()
    setRunning(true)
    setProgress(0)
    setMessage('')
    setError(null)
    setDone(false)

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siloId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const { jobId } = await res.json()

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/generate/${jobId}/status`)
          const status: JobStatus = await statusRes.json()
          setProgress(status.progress ?? 0)
          setMessage(status.message ?? '')

          if (status.status === 'done') {
            stopPolling()
            setRunning(false)
            setDone(true)
            onComplete()
          } else if (status.status === 'error') {
            stopPolling()
            setRunning(false)
            setError(status.error ?? 'Generation failed')
          }
        } catch {
          // network hiccup — keep polling
        }
      }, 2000)
    } catch (err) {
      setRunning(false)
      setError(err instanceof Error ? err.message : 'Failed to start job')
      stopPolling()
    }
  }, [stopPolling, onComplete])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { startJob, running, progress, message, error, done }
}

// ── Helper: slug from silo name ────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ArtworkThumb({
  src,
  alt,
  className,
  onClick,
}: {
  src: string
  alt: string
  className?: string
  onClick?: () => void
}) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div
        className={`bg-gray-800 flex items-center justify-center text-gray-600 text-xs ${className ?? ''}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      >
        No image
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setErrored(true)}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    />
  )
}

// ── View 1: Silo Grid ──────────────────────────────────────────────────────

function SiloGrid({
  silos,
  librarySilos,
  onSelectSilo,
}: {
  silos: Silo[]
  librarySilos: Map<string, LibrarySiloMeta>
  onSelectSilo: (silo: Silo) => void
}) {
  const sorted = [...silos].sort((a, b) => b.priority - a.priority)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Warehouse Gallery</h2>
        <span className="text-sm text-gray-400">{silos.length} silos</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map(silo => {
          const slug = toSlug(silo.name)
          const meta = librarySilos.get(slug)
          const count = meta?.count ?? 0
          const latestFolder = meta?.latestFolder ?? null

          return (
            <div
              key={silo.id}
              onClick={() => onSelectSilo(silo)}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden cursor-pointer hover:border-gray-600 hover:bg-gray-800 transition-colors"
            >
              {/* Thumbnail */}
              <div className="aspect-square w-full bg-gray-800 overflow-hidden">
                {latestFolder ? (
                  <ArtworkThumb
                    src={`${API_BASE}/api/library/${slug}/${latestFolder}/artwork`}
                    alt={silo.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">
                    No artwork
                  </div>
                )}
              </div>

              {/* Card info */}
              <div className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-white text-sm font-medium leading-tight line-clamp-2">{silo.name}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                    {silo.category}
                  </span>
                  {count > 0 ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400 border border-green-800/50">
                      {count} piece{count !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">
                      Empty
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── View 2: Silo Inventory ─────────────────────────────────────────────────

function SiloInventory({
  silo,
  onBack,
  onSelectPiece,
}: {
  silo: Silo
  onBack: () => void
  onSelectPiece: (folderId: string) => void
}) {
  const slug = toSlug(silo.name)
  const { pieces, loading, refresh } = useSiloInventory(slug)
  const onComplete = useCallback(() => refresh(), [refresh])
  const gen = useGenerateForSilo(onComplete)

  const handleGenerate = () => {
    gen.startJob(silo.id)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-white">{silo.name}</h2>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
            {silo.category}
          </span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={gen.running}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {gen.running ? (
            <>
              <span className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse" />
              Generating...
            </>
          ) : (
            '⚡ Generate Now'
          )}
        </button>
      </div>

      {/* Progress bar */}
      {gen.running && (
        <div className="space-y-1">
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${gen.progress}%` }}
            />
          </div>
          {gen.message && (
            <p className="text-xs text-indigo-300">{gen.message}</p>
          )}
        </div>
      )}

      {/* Done banner */}
      {gen.done && !gen.running && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-2 text-green-300 text-sm">
          Generation complete. Inventory updated.
        </div>
      )}

      {/* Error */}
      {gen.error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
          {gen.error}
        </div>
      )}

      {/* Pieces grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          Loading inventory...
        </div>
      ) : pieces.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
          <p className="text-gray-400 text-sm">No pieces yet for this silo.</p>
          <p className="text-gray-600 text-xs">Click &ldquo;Generate Now&rdquo; to create the first artwork.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {pieces.map(piece => (
            <div
              key={piece.folderId}
              onClick={() => onSelectPiece(piece.folderId)}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden cursor-pointer hover:border-gray-600 hover:bg-gray-800 transition-colors"
            >
              <div className="aspect-square w-full bg-gray-800 overflow-hidden">
                <ArtworkThumb
                  src={`${API_BASE}/api/library/${slug}/${piece.folderId}/artwork`}
                  alt={piece.title || piece.folderId}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-2">
                <p className="text-gray-300 text-xs truncate">{piece.title || piece.folderId}</p>
                {piece.date && (
                  <p className="text-gray-600 text-xs mt-0.5">
                    {new Date(piece.date).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── View 3: Piece Detail ───────────────────────────────────────────────────

const MOCKUP_ROOMS = ['living-room', 'bedroom', 'office', 'nursery', 'bathroom'] as const
type MockupRoom = (typeof MOCKUP_ROOMS)[number]

function PieceDetail({
  silo,
  folderId,
  onBack,
}: {
  silo: Silo
  folderId: string
  onBack: () => void
}) {
  const slug = toSlug(silo.name)
  const { listing, loading: listingLoading } = useListing(slug, folderId)
  const [mainImage, setMainImage] = useState<string>(
    `${API_BASE}/api/library/${slug}/${folderId}/artwork`
  )
  const [copied, setCopied] = useState(false)

  const artworkUrl = `${API_BASE}/api/library/${slug}/${folderId}/artwork`
  const mockupUrl = (room: MockupRoom) =>
    `${API_BASE}/api/library/${slug}/${folderId}/mockup/${room}`

  const handleOpenFolder = async () => {
    try {
      await fetch(`${API_BASE}/api/library/${encodeURIComponent(slug)}/${encodeURIComponent(folderId)}/open-folder`, {
        method: 'POST',
      })
    } catch {
      // ignore — best effort
    }
  }

  const handleCopyListing = async () => {
    if (!listing) return
    const text = [
      listing.title,
      '',
      `Price: $${listing.price}`,
      '',
      `Tags: ${Array.isArray(listing.tags) ? listing.tags.join(', ') : listing.tags}`,
      '',
      listing.description,
    ].join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-white truncate max-w-xs">
            {listing?.title || folderId}
          </h2>
        </div>
        <button
          onClick={handleOpenFolder}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
        >
          Open Folder
        </button>
      </div>

      {/* Split layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: Artwork + mockups */}
        <div className="flex-shrink-0 space-y-3" style={{ width: '100%', maxWidth: '480px' }}>
          {/* Main image */}
          <div className="aspect-square w-full bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <ArtworkThumb
              src={mainImage}
              alt="Main artwork"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Mockup thumbnails */}
          <div className="flex gap-2">
            {/* Artwork thumbnail (reset to original) */}
            <button
              onClick={() => setMainImage(artworkUrl)}
              className={`flex-1 aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                mainImage === artworkUrl ? 'border-indigo-500' : 'border-gray-800 hover:border-gray-600'
              }`}
            >
              <ArtworkThumb
                src={artworkUrl}
                alt="Original artwork"
                className="w-full h-full object-cover"
              />
            </button>

            {MOCKUP_ROOMS.map(room => {
              const url = mockupUrl(room)
              return (
                <button
                  key={room}
                  onClick={() => setMainImage(url)}
                  className={`flex-1 aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    mainImage === url ? 'border-indigo-500' : 'border-gray-800 hover:border-gray-600'
                  }`}
                  title={room}
                >
                  <ArtworkThumb
                    src={url}
                    alt={room}
                    className="w-full h-full object-cover"
                  />
                </button>
              )
            })}
          </div>

          {/* Room labels */}
          <div className="flex gap-2 text-center">
            <div className="flex-1 text-xs text-gray-600">orig</div>
            {MOCKUP_ROOMS.map(room => (
              <div key={room} className="flex-1 text-xs text-gray-600 truncate">{room.split('-')[0]}</div>
            ))}
          </div>
        </div>

        {/* RIGHT: Listing info */}
        <div className="flex-1 min-w-0 space-y-4">
          {listingLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Loading listing...
            </div>
          ) : listing ? (
            <>
              {/* Title */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Title</p>
                <p className="text-white text-lg font-semibold leading-tight">{listing.title}</p>
              </div>

              {/* Price */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Price</p>
                <p className="text-green-400 text-xl font-bold">
                  ${typeof listing.price === 'number' ? listing.price.toFixed(2) : listing.price}
                </p>
              </div>

              {/* Tags */}
              {Array.isArray(listing.tags) && listing.tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {listing.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Description</p>
                <div
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 overflow-y-auto text-gray-300 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ maxHeight: '300px' }}
                >
                  {listing.description}
                </div>
              </div>

              {/* Copy Listing button */}
              <button
                onClick={handleCopyListing}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Listing'}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
              <p className="text-gray-400 text-sm">No listing data found.</p>
              <p className="text-gray-600 text-xs">listing.txt may not have been generated yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── WarehouseTab (main) ────────────────────────────────────────────────────

export default function WarehouseTab({ silos }: { silos: Silo[] }) {
  const [view, setView] = useState<View>('grid')
  const [selectedSilo, setSelectedSilo] = useState<Silo | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  const { librarySilos, loading: libraryLoading, error: libraryError } = useLibrary()

  const handleSelectSilo = useCallback((silo: Silo) => {
    setSelectedSilo(silo)
    setSelectedFolder(null)
    setView('silo')
  }, [])

  const handleSelectPiece = useCallback((folderId: string) => {
    setSelectedFolder(folderId)
    setView('detail')
  }, [])

  const handleBackToGrid = useCallback(() => {
    setView('grid')
    setSelectedSilo(null)
    setSelectedFolder(null)
  }, [])

  const handleBackToSilo = useCallback(() => {
    setView('silo')
    setSelectedFolder(null)
  }, [])

  if (libraryLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading warehouse...
      </div>
    )
  }

  if (libraryError) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
        <strong>Error loading library:</strong> {libraryError}
        <p className="text-red-400 text-xs mt-1">Make sure the Art Factory API is running on port 3001.</p>
      </div>
    )
  }

  if (view === 'detail' && selectedSilo && selectedFolder) {
    return (
      <PieceDetail
        silo={selectedSilo}
        folderId={selectedFolder}
        onBack={handleBackToSilo}
      />
    )
  }

  if (view === 'silo' && selectedSilo) {
    return (
      <SiloInventory
        silo={selectedSilo}
        onBack={handleBackToGrid}
        onSelectPiece={handleSelectPiece}
      />
    )
  }

  return (
    <SiloGrid
      silos={silos}
      librarySilos={librarySilos}
      onSelectSilo={handleSelectSilo}
    />
  )
}
