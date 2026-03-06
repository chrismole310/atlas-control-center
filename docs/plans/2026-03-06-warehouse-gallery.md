# Warehouse Gallery — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 🏭 Warehouse tab to the Art Factory page that browses all generated art organized by silo, with inline generation from any silo view.

**Architecture:** Backend reads `/Volumes/Atlas_2TB/ArtFactory/library/` (Desktop fallback) by scanning folder names — no DB needed. Four new API endpoints serve inventory data and images. Frontend adds `WarehouseTab.tsx` with three drill-down views: silo grid → silo inventory → split-screen piece detail. Inline generate in silo view reuses the existing `/api/generate` endpoint.

**Tech Stack:** Node.js/Express (backend), Next.js 14/TypeScript/Tailwind/framer-motion (frontend)

---

## Task 1: Create backend library routes

**Files:**
- Create: `atlas-art-factory/api/routes/library.js`

The library folder path comes from `LIBRARY_ROOT` exported by `generate-pipeline.js`. Folder names follow the pattern `{YYYY-MM-DD}-{silo-slug}-{6-char-id}` — e.g. `2026-03-06-botanical-prints-342359`.

**Step 1: Create `atlas-art-factory/api/routes/library.js`**

```javascript
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { LIBRARY_ROOT } = require('../generate-pipeline');
const { createLogger } = require('../../core/logger');

const router = express.Router();
const logger = createLogger('api:library');
const LIBRARY_RESOLVED = path.resolve(LIBRARY_ROOT);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a library folder name into its parts.
 * "2026-03-06-botanical-prints-342359"
 *   → { date: "2026-03-06", slug: "botanical-prints", id: "342359", folderId: "..." }
 */
function parseFolder(folderName) {
  const parts = folderName.split('-');
  if (parts.length < 5) return null; // need at least YYYY + MM + DD + slug + id
  const date = parts.slice(0, 3).join('-');
  const id = parts[parts.length - 1];
  const slug = parts.slice(3, -1).join('-');
  if (!slug) return null;
  return { date, slug, id, folderId: folderName };
}

/** Read title from listing.txt — returns folder name as fallback */
function readTitle(folderId) {
  try {
    const listingPath = path.join(LIBRARY_ROOT, folderId, 'listing.txt');
    const content = fs.readFileSync(listingPath, 'utf8');
    const line = content.split('\n').find(l => l.startsWith('TITLE:'));
    if (line) return line.replace('TITLE:', '').trim();
  } catch { /* listing.txt missing — use fallback */ }
  return folderId;
}

/** Scan library and return parsed entries, skipping anything that doesn't match */
function scanLibrary() {
  if (!fs.existsSync(LIBRARY_ROOT)) return [];
  return fs.readdirSync(LIBRARY_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => parseFolder(e.name))
    .filter(Boolean);
}

/** Verify path stays within LIBRARY_ROOT */
function safePath(...parts) {
  const resolved = path.resolve(LIBRARY_ROOT, ...parts);
  if (!resolved.startsWith(LIBRARY_RESOLVED + path.sep) && resolved !== LIBRARY_RESOLVED) {
    return null;
  }
  return resolved;
}

// ── GET /api/library ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const entries = scanLibrary();

    // Group by silo slug
    const bySlug = {};
    for (const entry of entries) {
      if (!bySlug[entry.slug]) bySlug[entry.slug] = [];
      bySlug[entry.slug].push(entry);
    }

    const silos = Object.entries(bySlug).map(([slug, pieces]) => {
      const sorted = [...pieces].sort((a, b) => b.date.localeCompare(a.date));
      return {
        slug,
        count: pieces.length,
        latestFolder: sorted[0].folderId,
        latestDate: sorted[0].date,
      };
    });

    res.json({ silos, totalPieces: entries.length });
  } catch (err) {
    logger.error('GET /api/library failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/:silo ────────────────────────────────────────────────────

router.get('/:silo', (req, res) => {
  try {
    const { silo } = req.params;
    const pieces = scanLibrary()
      .filter(e => e.slug === silo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(p => ({ folderId: p.folderId, date: p.date, title: readTitle(p.folderId) }));

    res.json({ silo, pieces });
  } catch (err) {
    logger.error('GET /api/library/:silo failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/:silo/:folderId/artwork ──────────────────────────────────

router.get('/:silo/:folderId/artwork', (req, res) => {
  const { silo, folderId } = req.params;

  // Validate folder belongs to the requested silo
  const parsed = parseFolder(folderId);
  if (!parsed || parsed.slug !== silo) {
    return res.status(400).json({ error: 'Silo mismatch' });
  }

  const artworkPath = safePath(folderId, 'artwork.png');
  if (!artworkPath) return res.status(403).json({ error: 'Forbidden' });

  fs.access(artworkPath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).json({ error: 'Artwork not found' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(artworkPath).pipe(res);
  });
});

// ── GET /api/library/:silo/:folderId/mockup/:room ─────────────────────────────

const VALID_ROOMS = new Set(['living-room', 'bedroom', 'office', 'nursery', 'bathroom']);

router.get('/:silo/:folderId/mockup/:room', (req, res) => {
  const { silo, folderId, room } = req.params;

  if (!VALID_ROOMS.has(room)) return res.status(400).json({ error: 'Invalid room' });

  const parsed = parseFolder(folderId);
  if (!parsed || parsed.slug !== silo) {
    return res.status(400).json({ error: 'Silo mismatch' });
  }

  const mockupsDir = safePath(folderId, 'mockups');
  if (!mockupsDir) return res.status(403).json({ error: 'Forbidden' });

  if (!fs.existsSync(mockupsDir)) return res.status(404).json({ error: 'No mockups' });

  const files = fs.readdirSync(mockupsDir).filter(f => f.endsWith(`_${room}.png`));
  if (!files.length) return res.status(404).json({ error: 'Mockup not found' });

  const mockupPath = path.join(mockupsDir, files[0]);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(mockupPath).pipe(res);
});

// ── GET /api/library/:silo/:folderId/listing ──────────────────────────────────

router.get('/:silo/:folderId/listing', (req, res) => {
  const { folderId } = req.params;

  const listingPath = safePath(folderId, 'listing.txt');
  if (!listingPath) return res.status(403).json({ error: 'Forbidden' });

  if (!fs.existsSync(listingPath)) return res.status(404).json({ error: 'Listing not found' });

  try {
    const content = fs.readFileSync(listingPath, 'utf8');
    const lines = content.split('\n');

    const title = (lines.find(l => l.startsWith('TITLE:')) || '').replace('TITLE:', '').trim();
    const priceStr = (lines.find(l => l.startsWith('PRICE:')) || '').replace('PRICE:', '').replace('$', '').trim();
    const tagsStr = (lines.find(l => l.startsWith('TAGS:')) || '').replace('TAGS:', '').trim();
    const descStart = lines.findIndex(l => l.trim() === 'DESCRIPTION:');
    const description = descStart >= 0 ? lines.slice(descStart + 1).join('\n').trim() : '';

    res.json({
      title,
      price: parseFloat(priceStr) || 4.99,
      tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/library/:silo/:folderId/open-folder ─────────────────────────────

router.post('/:silo/:folderId/open-folder', (req, res) => {
  const { folderId } = req.params;

  const folderPath = safePath(folderId);
  if (!folderPath) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

  execFile('open', [folderPath], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

module.exports = router;
```

**Step 2: Verify it loads**

```bash
cd /Users/atlas/atlas-control-center/atlas-art-factory
node -e "require('./api/routes/library'); console.log('✅ loads clean')"
```

Expected: `✅ loads clean`

**Step 3: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add atlas-art-factory/api/routes/library.js
git commit -m "feat(warehouse): library API routes — scan, images, listing, open-folder"
```

---

## Task 2: Mount library routes in api/index.js

**Files:**
- Modify: `atlas-art-factory/api/index.js`

**Step 1: Add the library router**

In `atlas-art-factory/api/index.js`, add after the existing `generateRouter` require (around line 10):

```javascript
const libraryRouter = require('./routes/library');
```

Then add the mount after the existing `app.use('/api/generate', generateRouter);` line:

```javascript
app.use('/api/library', libraryRouter);
```

**Step 2: Verify it starts**

```bash
cd /Users/atlas/atlas-control-center/atlas-art-factory
node -e "const { app } = require('./api/index'); console.log('✅ API loads with library routes'); process.exit(0);"
```

Expected: `✅ API loads with library routes`

**Step 3: Quick smoke test against the running API**

Restart the API (kill port 3001, restart), then:

```bash
curl -s http://localhost:3001/api/library | python3 -m json.tool
```

Expected: JSON with `silos` array (at least 1 entry for `botanical-prints`) and `totalPieces: 1`.

**Step 4: Commit**

```bash
cd /Users/atlas/atlas-control-center
git add atlas-art-factory/api/index.js
git commit -m "feat(warehouse): mount /api/library routes in API server"
```

---

## Task 3: Create WarehouseTab.tsx

**Files:**
- Create: `frontend/app/art-factory/components/WarehouseTab.tsx`

This is the largest task. The component has three views managed by local state. No routing — just `view` state switching with framer-motion transitions.

**Step 1: Create `frontend/app/art-factory/components/WarehouseTab.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = 'http://localhost:3001'
const ROOMS = ['living-room', 'bedroom', 'office', 'nursery', 'bathroom'] as const
type Room = typeof ROOMS[number]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Silo {
  id: number
  name: string
  category: string
  priority: number
}

interface LibrarySilo {
  slug: string
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
  price: number
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
  result: { folderPath: string } | null
}

// ── useLibrary ────────────────────────────────────────────────────────────────

function useLibrary() {
  const [library, setLibrary] = useState<LibrarySilo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`${API_BASE}/api/library`)
      .then(r => r.json())
      .then(d => { setLibrary(d.silos || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { library, loading, refresh }
}

// ── useSiloInventory ──────────────────────────────────────────────────────────

function useSiloInventory(slug: string | null) {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!slug) return
    setLoading(true)
    fetch(`${API_BASE}/api/library/${slug}`)
      .then(r => r.json())
      .then(d => { setPieces(d.pieces || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  useEffect(() => { refresh() }, [refresh])

  return { pieces, loading, refresh }
}

// ── useListing ────────────────────────────────────────────────────────────────

function useListing(slug: string | null, folderId: string | null) {
  const [listing, setListing] = useState<Listing | null>(null)

  useEffect(() => {
    if (!slug || !folderId) return
    setListing(null)
    fetch(`${API_BASE}/api/library/${slug}/${folderId}/listing`)
      .then(r => r.json())
      .then(setListing)
      .catch(() => {})
  }, [slug, folderId])

  return listing
}

// ── useGenerateForSilo ────────────────────────────────────────────────────────

function useGenerateForSilo() {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [isPending, setIsPending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const generate = useCallback(async (siloId: number) => {
    stopPolling()
    setJobStatus(null)
    setIsPending(true)
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siloId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start job')
      }
      const { jobId } = await res.json()
      pollRef.current = setInterval(async () => {
        try {
          const s: JobStatus = await fetch(`${API_BASE}/api/generate/${jobId}/status`).then(r => r.json())
          setJobStatus(s)
          if (s.status === 'done' || s.status === 'error') stopPolling()
        } catch { /* keep polling */ }
      }, 2000)
    } finally {
      setIsPending(false)
    }
  }, [stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    setJobStatus(null)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return {
    jobStatus,
    generate,
    reset,
    isRunning: isPending || (!!jobStatus && jobStatus.status !== 'done' && jobStatus.status !== 'error'),
  }
}

// ── WarehouseTab ──────────────────────────────────────────────────────────────

export default function WarehouseTab({ silos }: { silos: Silo[] }) {
  const [view, setView] = useState<'grid' | 'silo' | 'detail'>('grid')
  const [selectedSilo, setSelectedSilo] = useState<Silo | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const { library, loading: libraryLoading, refresh: refreshLibrary } = useLibrary()

  const libraryMap: Record<string, LibrarySilo> = Object.fromEntries(
    library.map(s => [s.slug, s])
  )

  const openSilo = (silo: Silo) => {
    setSelectedSilo(silo)
    setView('silo')
  }

  const openDetail = (folderId: string) => {
    setSelectedFolder(folderId)
    setView('detail')
  }

  const goBack = () => {
    if (view === 'detail') { setSelectedFolder(null); setView('silo') }
    else { setSelectedSilo(null); setView('grid') }
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {view === 'grid' && (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SiloGrid silos={silos} libraryMap={libraryMap} loading={libraryLoading} onSelect={openSilo} />
          </motion.div>
        )}
        {view === 'silo' && selectedSilo && (
          <motion.div key="silo" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <SiloView silo={selectedSilo} onBack={goBack} onSelectPiece={openDetail} onGenerated={refreshLibrary} />
          </motion.div>
        )}
        {view === 'detail' && selectedSilo && selectedFolder && (
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <DetailView silo={selectedSilo} folderId={selectedFolder} onBack={goBack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── SiloGrid ──────────────────────────────────────────────────────────────────

function SiloGrid({ silos, libraryMap, loading, onSelect }: {
  silos: Silo[]
  libraryMap: Record<string, LibrarySilo>
  loading: boolean
  onSelect: (silo: Silo) => void
}) {
  const totalPieces = Object.values(libraryMap).reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Art Warehouse</h2>
        <span className="text-sm text-gray-400">
          {loading ? 'Scanning library…' : `${totalPieces} piece${totalPieces !== 1 ? 's' : ''} across ${silos.length} niches`}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {silos.map(silo => {
          const lib = libraryMap[silo.name]
          const count = lib?.count ?? 0
          const latestFolder = lib?.latestFolder ?? null

          return (
            <button
              key={silo.id}
              onClick={() => onSelect(silo)}
              className="bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-xl overflow-hidden text-left transition-all group"
            >
              {/* Thumbnail */}
              <div className="aspect-square bg-gray-800 relative overflow-hidden">
                {latestFolder ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_BASE}/api/library/${silo.name}/${latestFolder}/artwork`}
                    alt={silo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-gray-700">🎨</div>
                )}
                <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                  count > 0 ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-500'
                }`}>
                  {count > 0 ? count : '—'}
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="text-xs font-semibold text-white truncate capitalize">
                  {silo.name.replace(/-/g, ' ')}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{silo.category}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── SiloView ──────────────────────────────────────────────────────────────────

function SiloView({ silo, onBack, onSelectPiece, onGenerated }: {
  silo: Silo
  onBack: () => void
  onSelectPiece: (folderId: string) => void
  onGenerated: () => void
}) {
  const { pieces, loading, refresh } = useSiloInventory(silo.name)
  const { jobStatus, generate, reset, isRunning } = useGenerateForSilo()

  // When job completes, refresh inventory then clear status after 3s
  useEffect(() => {
    if (jobStatus?.status === 'done') {
      refresh()
      onGenerated()
      const t = setTimeout(reset, 3000)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus?.status])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white capitalize">
              {silo.name.replace(/-/g, ' ')}
            </h2>
            <p className="text-xs text-gray-500">
              {silo.category} · {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => generate(silo.id)}
          disabled={isRunning}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {isRunning ? '⚡ Generating…' : '⚡ Generate Now'}
        </button>
      </div>

      {/* Inline generate status bar */}
      <AnimatePresence>
        {jobStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`rounded-lg p-4 border ${
              jobStatus.status === 'error' ? 'bg-red-900/20 border-red-700' :
              jobStatus.status === 'done'  ? 'bg-green-900/20 border-green-700' :
              'bg-indigo-900/20 border-indigo-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${
                jobStatus.status === 'error' ? 'text-red-400' :
                jobStatus.status === 'done'  ? 'text-green-400' : 'text-indigo-300'
              }`}>
                {jobStatus.status === 'done'  ? '✅ Done! New piece added to library.' :
                 jobStatus.status === 'error' ? `❌ ${jobStatus.error}` :
                 `${jobStatus.step} — ${jobStatus.message}`}
              </span>
              <span className="text-xs text-gray-500">{jobStatus.progress}%</span>
            </div>
            {jobStatus.status !== 'done' && jobStatus.status !== 'error' && (
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <motion.div
                  className="bg-indigo-500 h-1.5 rounded-full"
                  animate={{ width: `${jobStatus.progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inventory grid */}
      {loading ? (
        <div className="text-center text-gray-500 text-sm py-12">Loading…</div>
      ) : pieces.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎨</div>
          <p className="text-gray-400 text-sm">No pieces yet.</p>
          <p className="text-gray-600 text-xs mt-1">Hit ⚡ Generate Now to make the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pieces.map(piece => (
            <button
              key={piece.folderId}
              onClick={() => onSelectPiece(piece.folderId)}
              className="bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-xl overflow-hidden text-left transition-all group"
            >
              <div className="aspect-square bg-gray-800 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/api/library/${silo.name}/${piece.folderId}/artwork`}
                  alt={piece.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div className="p-3">
                <div className="text-xs text-white font-medium truncate">{piece.title}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{piece.date}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DetailView ────────────────────────────────────────────────────────────────

function DetailView({ silo, folderId, onBack }: {
  silo: Silo
  folderId: string
  onBack: () => void
}) {
  const listing = useListing(silo.name, folderId)
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)

  const displaySrc = activeRoom
    ? `${API_BASE}/api/library/${silo.name}/${folderId}/mockup/${activeRoom}`
    : `${API_BASE}/api/library/${silo.name}/${folderId}/artwork`

  const listingText = listing ? [
    `TITLE: ${listing.title}`,
    `PRICE: $${listing.price}`,
    `TAGS: ${listing.tags.join(', ')}`,
    '',
    'DESCRIPTION:',
    listing.description,
  ].join('\n') : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(listingText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const handleOpenFolder = () => {
    fetch(`${API_BASE}/api/library/${silo.name}/${folderId}/open-folder`, { method: 'POST' })
      .catch(() => {})
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <h2 className="text-base font-semibold text-white truncate max-w-xl">
            {listing?.title ?? folderId}
          </h2>
        </div>
        <button
          onClick={handleOpenFolder}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          📂 Open Folder
        </button>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: main image + mockup strip */}
        <div className="space-y-3">
          <div className="aspect-square bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt="Artwork"
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Thumbnail strip: original + 5 rooms */}
          <div className="flex gap-2">
            {/* Original */}
            <button
              onClick={() => setActiveRoom(null)}
              className={`flex-1 aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                activeRoom === null ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'
              }`}
              title="Original artwork"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_BASE}/api/library/${silo.name}/${folderId}/artwork`}
                alt="Original"
                className="w-full h-full object-cover"
              />
            </button>

            {/* Room mockups */}
            {ROOMS.map(room => (
              <button
                key={room}
                onClick={() => setActiveRoom(room)}
                className={`flex-1 aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                  activeRoom === room ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'
                }`}
                title={room}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/api/library/${silo.name}/${folderId}/mockup/${room}`}
                  alt={room}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right: listing copy */}
        <div className="space-y-4 flex flex-col">
          {listing ? (
            <>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Title</div>
                <p className="text-white text-sm font-medium leading-snug">{listing.title}</p>
              </div>

              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Price</div>
                <p className="text-green-400 font-bold text-lg">${listing.price}</p>
              </div>

              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {listing.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Description</div>
                <pre className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed overflow-auto max-h-64">
                  {listing.description}
                </pre>
              </div>

              <button
                onClick={handleCopy}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {copied ? '✓ Copied to Clipboard!' : 'Copy Full Listing'}
              </button>
            </>
          ) : (
            <div className="text-gray-500 text-sm animate-pulse">Loading listing…</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: TypeScript check**

```bash
cd /Users/atlas/atlas-control-center/frontend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "WarehouseTab" | head -10 || echo "✅ clean"
```

Expected: `✅ clean`

**Step 3: Commit**

```bash
cd /Users/atlas/atlas-control-center/frontend
git add app/art-factory/components/WarehouseTab.tsx
git commit -m "feat(warehouse): WarehouseTab — silo grid, silo view, detail view, inline generate"
```

---

## Task 4: Wire Warehouse tab into page.tsx

**Files:**
- Modify: `frontend/app/art-factory/page.tsx`

**Step 1: Add the import**

At the top of `frontend/app/art-factory/page.tsx`, after the existing component imports (around line 8), add:

```typescript
import WarehouseTab from './components/WarehouseTab'
```

**Step 2: Add the tab to the TABS array**

In `page.tsx`, find the `TABS` array. Add the warehouse tab after `pipeline`:

```typescript
{ id: 'warehouse', label: '🏭 Warehouse' },
```

So the TABS array becomes:
```typescript
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'production', label: 'Production' },
  { id: 'pipeline', label: '⚡ Pipeline' },
  { id: 'warehouse', label: '🏭 Warehouse' },
  { id: 'silos', label: 'Silos' },
  { id: 'artists', label: 'Artists' },
  { id: 'trends', label: 'Trends' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
]
```

**Step 3: Add 'warehouse' to the TabId type**

Find the `TabId` type definition and add `'warehouse'`:

```typescript
type TabId = 'overview' | 'production' | 'pipeline' | 'warehouse' | 'silos' | 'artists' | 'trends' | 'analytics' | 'settings'
```

**Step 4: Render the tab**

In the content section, `WarehouseTab` should render outside the `{!loading && !error && ...}` gate (same pattern as PipelineTab) so it works even if the DB is down:

Add this line right after the `{activeTab === 'pipeline' && <PipelineTab />}` line:

```typescript
{activeTab === 'warehouse' && <WarehouseTab silos={silos} />}
```

**Step 5: TypeScript check**

```bash
cd /Users/atlas/atlas-control-center/frontend
npx tsc --noEmit 2>&1 | grep "error TS" | head -10 || echo "✅ clean"
```

Expected: `✅ clean`

**Step 6: Commit**

```bash
cd /Users/atlas/atlas-control-center/frontend
git add app/art-factory/page.tsx
git commit -m "feat(warehouse): add 🏭 Warehouse tab to Art Factory page"

cd /Users/atlas/atlas-control-center
git add frontend
git commit -m "chore: update frontend submodule (warehouse tab)"
```

---

## Verification

1. Kill and restart the Art Factory API: `lsof -ti :3001 | xargs kill -9 && cd atlas-art-factory && node api/index.js`
2. Frontend should already be running at `http://localhost:3002`
3. Visit `http://localhost:3002/art-factory` → click **🏭 Warehouse** tab
4. Should see 50 silo cards. `botanical-prints` should show `1` badge + artwork thumbnail
5. Click `botanical-prints` → inventory grid showing the one piece with its title + date
6. Click the piece → split screen: artwork left, listing copy right, 5 mockup thumbnails at bottom
7. Click a room mockup thumbnail → main image switches to that room scene
8. Click **Copy Full Listing** → paste into a text editor to verify
9. Click **📂 Open Folder** → Finder opens at the library folder
10. Go back to silo view → click **⚡ Generate Now** → progress bar appears and animates
11. After ~90 seconds → "✅ Done! New piece added to library." → grid refreshes showing 2 pieces

---

## Critical Files

- **Create:** `atlas-art-factory/api/routes/library.js`
- **Modify:** `atlas-art-factory/api/index.js` (mount library router)
- **Create:** `frontend/app/art-factory/components/WarehouseTab.tsx`
- **Modify:** `frontend/app/art-factory/page.tsx` (add tab)
