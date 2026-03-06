'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────────────

type NodeState = 'idle' | 'active' | 'done'

interface PipelineStep {
  id: string
  name: string
  icon: string
  activeLines: string[]   // lines shown during active state (typewriter)
  doneLine: string        // final line shown when done
}

// ── Pipeline definition ────────────────────────────────────────────────────

const STEPS: PipelineStep[] = [
  {
    id: 'market-intel',
    name: 'Market Intel',
    icon: '📊',
    activeLines: ['Scanning Etsy trends…', 'Analyzing 2,400 keywords…', 'Ranking opportunities…'],
    doneLine: 'Found 847 search opportunities',
  },
  {
    id: 'ai-artist',
    name: 'AI Artist',
    icon: '🎨',
    activeLines: ['Building prompt DNA…', 'Routing to FLUX Kontext…', 'Rendering at 2048×2048…'],
    doneLine: 'Artwork generated ✓',
  },
  {
    id: 'quality-control',
    name: 'Quality Control',
    icon: '🔬',
    activeLines: ['Scoring composition…', 'Checking sharpness…', 'Evaluating color balance…'],
    doneLine: 'Quality score: 94 / 100',
  },
  {
    id: 'mockup-generator',
    name: 'Mockup Generator',
    icon: '🏠',
    activeLines: ['Loading room templates…', 'Placing art in scenes…', 'Rendering 5 rooms…'],
    doneLine: '5 room mockups ready',
  },
  {
    id: 'package-builder',
    name: 'Package Builder',
    icon: '📦',
    activeLines: ['Resizing 6 print formats…', 'Optimizing resolution…', 'Building ZIP archive…'],
    doneLine: 'ZIP ready (12.4 MB)',
  },
  {
    id: 'publish',
    name: 'Publish',
    icon: '🚀',
    activeLines: ['Creating Etsy draft…', 'Uploading 5 room photos…', 'Activating listing…'],
    doneLine: 'Published on Etsy! 🎉',
  },
]

// ── PipelineTab (static shell — animation added in Task 2) ─────────────────

export default function PipelineTab() {
  const nodeStates: NodeState[] = STEPS.map(() => 'idle')

  return (
    <div className="w-full py-12 px-4 overflow-x-auto">
      <div className="min-w-[900px] mx-auto">
        {/* Nodes + wires row */}
        <div className="flex items-center justify-between relative">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <StaticNode step={step} state={nodeStates[i]} />
              {i < STEPS.length - 1 && (
                <WireConnector state="idle" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── StaticNode ─────────────────────────────────────────────────────────────

function StaticNode({ step, state }: { step: PipelineStep; state: NodeState }) {
  const borderColor =
    state === 'done'   ? 'border-green-500' :
    state === 'active' ? 'border-indigo-500' :
                         'border-gray-700'

  return (
    <div className={`
      relative w-36 rounded-xl border-2 p-4 bg-gray-900 flex flex-col items-center gap-2
      ${borderColor}
    `}>
      <span className="text-3xl">{step.icon}</span>
      <span className="text-xs font-semibold text-gray-300 text-center">{step.name}</span>
      <span className="text-[10px] text-gray-500 text-center min-h-[2.5rem]">
        {state === 'done' ? step.doneLine : state === 'active' ? step.activeLines[0] : 'Waiting…'}
      </span>
    </div>
  )
}

// ── WireConnector (static) ─────────────────────────────────────────────────

function WireConnector({ state }: { state: NodeState }) {
  return (
    <div className="w-12 h-0.5 bg-gray-700 mx-1 flex-shrink-0" />
  )
}
