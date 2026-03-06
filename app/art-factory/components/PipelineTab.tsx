'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const API_BASE = 'http://localhost:3001'

// ── Types ──────────────────────────────────────────────────────────────────

type NodeState = 'idle' | 'active' | 'done' | 'error'
type Mode = 'simulation' | 'live'

interface PipelineStep {
  id: string
  name: string
  icon: string
  activeLines: string[]
  doneLine: string
  durationMs: number
}

interface Silo {
  id: number
  name: string
  category: string
  priority: number
}

interface JobStatus {
  jobId: string
  step: string
  status: 'pending' | 'active' | 'done' | 'error'
  message: string
  progress: number
  error: string | null
  result: {
    folderPath: string
    artworkPath: string
    title: string
    description: string
    tags: string[]
    price: number
  } | null
}

// ── Pipeline definition ────────────────────────────────────────────────────

const STEPS: PipelineStep[] = [
  {
    id: 'market-intel',
    name: 'Market Intel',
    icon: '📊',
    activeLines: ['Scanning Etsy trends…', 'Analyzing 2,400 keywords…', 'Ranking opportunities…'],
    doneLine: 'Silo loaded ✓',
    durationMs: 3000,
  },
  {
    id: 'ai-artist',
    name: 'AI Artist',
    icon: '🎨',
    activeLines: ['Building prompt DNA…', 'Routing to FLUX Kontext…', 'Rendering at 2048×2048…'],
    doneLine: 'Artwork generated ✓',
    durationMs: 3500,
  },
  {
    id: 'quality-control',
    name: 'Quality Control',
    icon: '🔬',
    activeLines: ['Scoring composition…', 'Checking sharpness…', 'Evaluating color balance…'],
    doneLine: 'Quality score: 92 / 100',
    durationMs: 2500,
  },
  {
    id: 'mockup-generator',
    name: 'Mockup Generator',
    icon: '🏠',
    activeLines: ['Loading room templates…', 'Placing art in scenes…', 'Rendering 5 rooms…'],
    doneLine: '5 room mockups ready',
    durationMs: 3000,
  },
  {
    id: 'package-builder',
    name: 'Package Builder',
    icon: '📦',
    activeLines: ['Resizing 6 print formats…', 'Optimizing resolution…', 'Building ZIP archive…'],
    doneLine: 'ZIP ready',
    durationMs: 2500,
  },
  {
    id: 'publish',
    name: 'Save to Desktop',
    icon: '💾',
    activeLines: ['Generating SEO copy…', 'Writing listing.txt…', 'Saving to Desktop…'],
    doneLine: 'Saved to Desktop! 🎉',
    durationMs: 3000,
  },
]

const RESTART_DELAY_MS = 4000
const STEP_IDS = STEPS.map(s => s.id)

// ── useSilos hook ─────────────────────────────────────────────────────────

function useSilos() {
  const [silos, setSilos] = useState<Silo[]>([])

  useEffect(() => {
    fetch(`${API_BASE}/api/silos`)
      .then(r => r.json())
      .then(d => setSilos(d.silos || []))
      .catch(() => {/* API offline — silos stay empty */})
  }, [])

  return silos
}

// ── useGenerateJob hook ───────────────────────────────────────────────────

function useGenerateJob() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startJob = useCallback(async (siloId: number) => {
    stopPolling()
    setJobStatus(null)

    const res = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siloId }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to start job')
    }

    const { jobId: newJobId } = await res.json()
    setJobId(newJobId)

    // Poll every 2 seconds
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/api/generate/${newJobId}/status`)
        const status: JobStatus = await statusRes.json()
        setJobStatus(status)

        if (status.status === 'done' || status.status === 'error') {
          stopPolling()
        }
      } catch {/* network hiccup — keep polling */}
    }, 2000)
  }, [stopPolling])

  const openFolder = useCallback(async () => {
    if (!jobId) return
    await fetch(`${API_BASE}/api/generate/${jobId}/open-folder`, { method: 'POST' })
  }, [jobId])

  const reset = useCallback(() => {
    stopPolling()
    setJobId(null)
    setJobStatus(null)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { jobStatus, startJob, openFolder, reset, isRunning: !!jobId && jobStatus?.status !== 'done' && jobStatus?.status !== 'error' }
}

// ── usePipelineSimulation hook ────────────────────────────────────────────

function usePipelineSimulation(active: boolean) {
  const [states, setStates] = useState<NodeState[]>(STEPS.map(() => 'idle'))
  const [activeLineIndex, setActiveLineIndex] = useState<number[]>(STEPS.map(() => 0))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = useCallback(() => {
    setStates(STEPS.map(() => 'idle'))
    setActiveLineIndex(STEPS.map(() => 0))
  }, [])

  const runStep = useCallback((stepIndex: number) => {
    if (stepIndex >= STEPS.length) {
      timerRef.current = setTimeout(() => {
        reset()
        timerRef.current = setTimeout(() => runStep(0), 500)
      }, RESTART_DELAY_MS)
      return
    }

    setStates(prev => { const n = [...prev]; n[stepIndex] = 'active'; return n })

    const step = STEPS[stepIndex]
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveLineIndex(prev => {
        const n = [...prev]; n[stepIndex] = (n[stepIndex] + 1) % step.activeLines.length; return n
      })
    }, 900)

    timerRef.current = setTimeout(() => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      setStates(prev => { const n = [...prev]; n[stepIndex] = 'done'; return n })
      timerRef.current = setTimeout(() => runStep(stepIndex + 1), 400)
    }, step.durationMs)
  }, [reset])

  useEffect(() => {
    if (!active) return
    timerRef.current = setTimeout(() => runStep(0), 800)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active, runStep])

  return { states, activeLineIndex, reset }
}

// ── Derive live node states from job status ────────────────────────────────

function liveNodeStates(jobStatus: JobStatus | null): { states: NodeState[]; messages: string[] } {
  const states: NodeState[] = STEPS.map(() => 'idle')
  const messages: string[] = STEPS.map((s) => s.activeLines[0])

  if (!jobStatus) return { states, messages }

  const activeIdx = STEP_IDS.indexOf(jobStatus.step)

  for (let i = 0; i < STEPS.length; i++) {
    if (i < activeIdx) states[i] = 'done'
    else if (i === activeIdx) {
      states[i] = jobStatus.status === 'done' ? 'done' : jobStatus.status === 'error' ? 'error' : 'active'
      messages[i] = jobStatus.message
    }
  }

  // If the whole job is done, mark all done
  if (jobStatus.status === 'done') {
    states.fill('done')
  }

  return { states, messages }
}

// ── PipelineTab ────────────────────────────────────────────────────────────

export default function PipelineTab() {
  const silos = useSilos()
  const { jobStatus, startJob, openFolder, reset: resetJob, isRunning } = useGenerateJob()
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mode: Mode = jobStatus ? 'live' : 'simulation'

  // Simulation runs only when no live job
  const sim = usePipelineSimulation(mode === 'simulation')

  // Resolve node states
  const { states, messages } = mode === 'live'
    ? liveNodeStates(jobStatus)
    : { states: sim.states, messages: STEPS.map((s, i) => s.activeLines[sim.activeLineIndex[i]]) }

  const allDone = states.every(s => s === 'done')
  const jobDone = jobStatus?.status === 'done'
  const jobError = jobStatus?.status === 'error'

  const handleGenerate = async (siloId: number) => {
    setShowModal(false)
    setError(null)
    try {
      await startJob(siloId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job')
    }
  }

  const handleReset = () => {
    resetJob()
    sim.reset()
    setError(null)
  }

  return (
    <div className="w-full py-12 px-4 overflow-x-auto">
      <div className="min-w-[1000px] mx-auto">

        {/* Header row */}
        <div className="flex items-center justify-between mb-10">
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            Art Factory Production Pipeline
          </p>
          <div className="flex items-center gap-3">
            {(jobDone || jobError) && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
              >
                ↺ Reset
              </button>
            )}
            {!isRunning && (
              <button
                onClick={() => setShowModal(true)}
                disabled={isRunning}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                ▶ Generate New Artwork
              </button>
            )}
            {isRunning && (
              <span className="text-xs text-indigo-400 animate-pulse">⚡ Generating…</span>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Mode badge */}
        {mode === 'live' && (
          <div className="mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Live run in progress</span>
          </div>
        )}

        {/* Nodes + wires row */}
        <div className="flex items-center justify-between relative">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <PipelineNode
                step={step}
                state={states[i]}
                activeLine={mode === 'live' && i === STEP_IDS.indexOf(jobStatus?.step ?? '') ? messages[i] : step.activeLines[sim.activeLineIndex[i]]}
              />
              {i < STEPS.length - 1 && (
                <WireConnector fromState={states[i]} toState={states[i + 1]} />
              )}
            </div>
          ))}
        </div>

        {/* End section */}
        {mode === 'simulation' && <SimEndButtons visible={allDone} />}
        {jobDone && jobStatus?.result && (
          <ResultCard jobId={jobStatus.jobId} result={jobStatus.result} onOpenFolder={openFolder} />
        )}
        {jobError && (
          <div className="mt-8 text-center text-red-400 text-sm">
            ❌ Generation failed: {jobStatus?.error}
          </div>
        )}
      </div>

      {/* Niche picker modal */}
      {showModal && (
        <NicheModal
          silos={silos}
          onConfirm={handleGenerate}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ── PipelineNode ───────────────────────────────────────────────────────────

function PipelineNode({ step, state, activeLine }: { step: PipelineStep; state: NodeState; activeLine: string }) {
  const isDone   = state === 'done'
  const isActive = state === 'active'
  const isError  = state === 'error'

  const borderColor = isDone ? '#22c55e' : isActive ? '#6366f1' : isError ? '#ef4444' : '#374151'
  const glowColor   = isDone ? '0 0 20px #22c55e55' : isActive ? '0 0 24px #6366f188' : 'none'
  const textColor   = isDone ? 'text-green-400' : isActive ? 'text-indigo-300' : isError ? 'text-red-400' : 'text-gray-600'
  const displayText = isDone ? step.doneLine : isActive ? activeLine : isError ? 'Error' : 'Waiting…'

  return (
    <motion.div
      animate={{ borderColor, boxShadow: glowColor, scale: isActive ? 1.05 : 1 }}
      transition={{ duration: 0.4 }}
      style={{ borderWidth: 2, borderStyle: 'solid' }}
      className="relative w-36 rounded-xl p-4 bg-gray-900 flex flex-col items-center gap-2"
    >
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-indigo-500 pointer-events-none"
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {isDone && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-2 -right-2 bg-green-500 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white"
        >
          ✓
        </motion.div>
      )}
      <span className="text-3xl">{step.icon}</span>
      <span className="text-xs font-semibold text-gray-200 text-center">{step.name}</span>
      <motion.span
        key={displayText}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`text-[10px] text-center min-h-[2.5rem] leading-tight ${textColor}`}
      >
        {displayText}
      </motion.span>
    </motion.div>
  )
}

// ── WireConnector ──────────────────────────────────────────────────────────

function WireConnector({ fromState, toState }: { fromState: NodeState; toState: NodeState }) {
  const isLive    = fromState === 'active' || fromState === 'done'
  const isDone    = fromState === 'done' && toState === 'done'
  const wireColor = isDone ? '#22c55e' : isLive ? '#6366f1' : '#374151'
  const dotColor  = isDone ? '#4ade80' : '#818cf8'

  return (
    <div className="relative flex-shrink-0 mx-1" style={{ width: 48, height: 40 }}>
      <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
        <line x1="0" y1="20" x2="48" y2="20" stroke={wireColor} strokeWidth="2" />
        {isLive && [0, 1, 2].map(i => (
          <circle key={i} cx="0" cy="20" r="3" fill={dotColor}
            style={{ animation: `wirePulse 1.2s linear infinite`, animationDelay: `${i * 0.4}s` }} />
        ))}
      </svg>
    </div>
  )
}

// ── SimEndButtons (simulation end only) ───────────────────────────────────

function SimEndButtons({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex justify-center gap-4 mt-12"
    >
      <motion.a
        href="https://www.etsy.com/your/shops/me/dashboard"
        target="_blank"
        rel="noopener noreferrer"
        animate={{ boxShadow: ['0 0 0px #22c55e', '0 0 20px #22c55e88', '0 0 0px #22c55e'] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
      >
        View on Etsy →
      </motion.a>
      <motion.a
        href="https://app.gumroad.com/dashboard"
        target="_blank"
        rel="noopener noreferrer"
        animate={{ boxShadow: ['0 0 0px #22c55e', '0 0 20px #22c55e66', '0 0 0px #22c55e'] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-green-600 text-green-400 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
      >
        View on Gumroad →
      </motion.a>
    </motion.div>
  )
}

// ── ResultCard ────────────────────────────────────────────────────────────

function ResultCard({ jobId, result, onOpenFolder }: { jobId: string; result: NonNullable<JobStatus['result']>; onOpenFolder: () => void }) {
  const [copied, setCopied] = useState(false)

  const listingText = [
    `TITLE: ${result.title}`,
    `PRICE: $${result.price}`,
    `TAGS: ${result.tags?.join(', ')}`,
    '',
    'DESCRIPTION:',
    result.description,
  ].join('\n')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(listingText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-12 bg-gray-900 border border-green-700 rounded-xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-green-400 font-semibold text-sm flex items-center gap-2">
          ✅ Ready to post on Etsy
        </h3>
        <motion.button
          onClick={onOpenFolder}
          animate={{ boxShadow: ['0 0 0px #22c55e', '0 0 16px #22c55e88', '0 0 0px #22c55e'] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          📂 Open Folder in Finder
        </motion.button>
      </div>

      <p className="text-xs text-gray-400 mb-4 font-mono truncate">{result.folderPath}</p>

      {/* Artwork preview */}
      <div className="mb-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${API_BASE}/api/generate/${jobId}/artwork`}
          alt="Generated artwork preview"
          className="max-w-xs rounded-lg border border-gray-700 object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>

      <div className="text-xs text-indigo-300 font-semibold mb-2 uppercase tracking-wide">
        Etsy Listing Copy
      </div>

      <div className="relative">
        <pre className="bg-gray-950 rounded-lg p-4 text-xs text-gray-300 overflow-auto max-h-64 whitespace-pre-wrap font-mono leading-relaxed">
          {listingText}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs rounded transition-colors"
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
    </motion.div>
  )
}

// ── NicheModal ────────────────────────────────────────────────────────────

function NicheModal({ silos, onConfirm, onCancel }: {
  silos: Silo[]
  onConfirm: (siloId: number) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<number | null>(silos[0]?.id ?? null)

  // Update selection when silos load
  useEffect(() => {
    if (silos.length > 0 && !selected) setSelected(silos[0].id)
  }, [silos, selected])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl"
      >
        <h2 className="text-white font-semibold mb-1">Choose a Niche</h2>
        <p className="text-gray-400 text-xs mb-4">Pick the art category to generate for.</p>

        {silos.length === 0 ? (
          <p className="text-yellow-400 text-xs mb-4">⚠️ Could not load silos — is the Art Factory API running on port 3001?</p>
        ) : (
          <select
            value={selected ?? ''}
            onChange={e => setSelected(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-indigo-500"
          >
            {silos.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.category}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || silos.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ▶ Generate
          </button>
        </div>
      </motion.div>
    </div>
  )
}
