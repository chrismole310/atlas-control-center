'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────────────

type NodeState = 'idle' | 'active' | 'done'

interface PipelineStep {
  id: string
  name: string
  icon: string
  activeLines: string[]
  doneLine: string
  durationMs: number   // how long this node stays "active" before going done
}

// ── Pipeline definition ────────────────────────────────────────────────────

const STEPS: PipelineStep[] = [
  {
    id: 'market-intel',
    name: 'Market Intel',
    icon: '📊',
    activeLines: ['Scanning Etsy trends…', 'Analyzing 2,400 keywords…', 'Ranking opportunities…'],
    doneLine: 'Found 847 search opportunities',
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
    doneLine: 'Quality score: 94 / 100',
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
    doneLine: 'ZIP ready (12.4 MB)',
    durationMs: 2500,
  },
  {
    id: 'publish',
    name: 'Publish',
    icon: '🚀',
    activeLines: ['Creating Etsy draft…', 'Uploading 5 room photos…', 'Activating listing…'],
    doneLine: 'Published on Etsy! 🎉',
    durationMs: 3000,
  },
]

const RESTART_DELAY_MS = 4000

// ── usePipelineSimulation hook ─────────────────────────────────────────────

function usePipelineSimulation() {
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
      // All done — restart after delay
      timerRef.current = setTimeout(() => {
        reset()
        timerRef.current = setTimeout(() => runStep(0), 500)
      }, RESTART_DELAY_MS)
      return
    }

    // Activate this node
    setStates(prev => {
      const next = [...prev]
      next[stepIndex] = 'active'
      return next
    })

    // Cycle through activeLines every 900ms
    const step = STEPS[stepIndex]
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActiveLineIndex(prev => {
        const next = [...prev]
        next[stepIndex] = (next[stepIndex] + 1) % step.activeLines.length
        return next
      })
    }, 900)

    // After durationMs, mark done and advance
    timerRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setStates(prev => {
        const next = [...prev]
        next[stepIndex] = 'done'
        return next
      })
      timerRef.current = setTimeout(() => runStep(stepIndex + 1), 400)
    }, step.durationMs)
  }, [reset])

  useEffect(() => {
    timerRef.current = setTimeout(() => runStep(0), 800)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [runStep])

  return { states, activeLineIndex }
}

// ── PipelineTab ────────────────────────────────────────────────────────────

export default function PipelineTab() {
  const { states, activeLineIndex } = usePipelineSimulation()
  const allDone = states.every(s => s === 'done')

  return (
    <div className="w-full py-12 px-4 overflow-x-auto">
      <div className="min-w-[1000px] mx-auto">
        {/* Title */}
        <p className="text-center text-xs text-gray-500 uppercase tracking-widest mb-10">
          Art Factory Production Pipeline
        </p>

        {/* Nodes + wires row */}
        <div className="flex items-center justify-between relative">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <PipelineNode
                step={step}
                state={states[i]}
                activeLine={step.activeLines[activeLineIndex[i]]}
              />
              {i < STEPS.length - 1 && (
                <WireConnector
                  fromState={states[i]}
                  toState={states[i + 1]}
                />
              )}
            </div>
          ))}
        </div>

        {/* End buttons */}
        <EndButtons visible={allDone} />
      </div>
    </div>
  )
}

// ── PipelineNode ───────────────────────────────────────────────────────────

function PipelineNode({
  step,
  state,
  activeLine,
}: {
  step: PipelineStep
  state: NodeState
  activeLine: string
}) {
  const isDone   = state === 'done'
  const isActive = state === 'active'

  const borderColor = isDone ? '#22c55e' : isActive ? '#6366f1' : '#374151'
  const glowColor   = isDone ? '0 0 20px #22c55e55' : isActive ? '0 0 24px #6366f188' : 'none'
  const textColor   = isDone ? 'text-green-400' : isActive ? 'text-indigo-300' : 'text-gray-600'
  const displayText = isDone ? step.doneLine : isActive ? activeLine : 'Waiting…'

  return (
    <motion.div
      animate={{
        borderColor,
        boxShadow: glowColor,
        scale: isActive ? 1.05 : 1,
      }}
      transition={{ duration: 0.4 }}
      style={{ borderWidth: 2, borderStyle: 'solid' }}
      className="relative w-36 rounded-xl p-4 bg-gray-900 flex flex-col items-center gap-2"
    >
      {/* Pulsing ring when active */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-indigo-500 pointer-events-none"
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Done checkmark overlay */}
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
// Inline SVG with animated pulse dots traveling left → right

function WireConnector({
  fromState,
  toState,
}: {
  fromState: NodeState
  toState: NodeState
}) {
  const isLive  = fromState === 'active' || fromState === 'done'
  const isDone  = fromState === 'done' && toState === 'done'
  const wireColor = isDone ? '#22c55e' : isLive ? '#6366f1' : '#374151'
  const dotColor  = isDone ? '#4ade80' : '#818cf8'

  return (
    <div className="relative flex-shrink-0 mx-1" style={{ width: 48, height: 40 }}>
      <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
        {/* Base wire */}
        <line x1="0" y1="20" x2="48" y2="20" stroke={wireColor} strokeWidth="2" />

        {/* Traveling pulses — only when wire is live */}
        {isLive && [0, 1, 2].map(i => (
          <circle
            key={i}
            cx="0"
            cy="20"
            r="3"
            fill={dotColor}
            style={{
              animation: `wirePulse 1.2s linear infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </svg>
    </div>
  )
}

// ── EndButtons ─────────────────────────────────────────────────────────────

function EndButtons({ visible }: { visible: boolean }) {
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
