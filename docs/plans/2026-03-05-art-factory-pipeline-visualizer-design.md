# Art Factory Pipeline Visualizer — Design

**Date:** 2026-03-05
**Status:** Approved

## What We're Building

A visual animated pipeline display added as a new "Pipeline" tab on the Art Factory page (`/art-factory`). It shows the full Art Factory production flow as a horizontal node graph with live-looking animated electric wire connections between steps.

## Placement

New tab — **"Pipeline"** — added alongside Overview, Production, Trends, Analytics, etc. on the existing `frontend/app/art-factory/page.tsx`.

## Layout

**Horizontal flow** — 6 nodes, left to right, connected by SVG bezier curves:

```
[Market Intel] ──⚡──> [AI Artist] ──⚡──> [Quality Control] ──⚡──> [Mockup Generator] ──⚡──> [Package Builder] ──⚡──> [Publish ✅]
```

Full-width canvas, scrollable horizontally on small screens. Centered vertically in the tab content area.

## The 6 Nodes

| # | Name | Icon | Description shown during animation |
|---|------|------|-------------------------------------|
| 1 | Market Intel | 📊 | "Scanning Etsy trends…" → "Found 847 search opportunities" |
| 2 | AI Artist | 🎨 | "Generating artwork…" → "FLUX Kontext rendering…" |
| 3 | Quality Control | ✅ | "Scoring composition…" → "Quality score: 94/100" |
| 4 | Mockup Generator | 🏠 | "Placing art in room scenes…" → "5 room mockups ready" |
| 5 | Package Builder | 📦 | "Packaging 6 print formats…" → "ZIP ready (12.4 MB)" |
| 6 | Publish | 🚀 | "Uploading to Etsy…" → "Published! View listing →" |

## Node States & Visual Behavior

- **idle** — dark gray card, dim icon, no animation
- **active** — indigo/purple glow border, pulsing ring, typewriter text animates the status message
- **done** — green border + green glow, checkmark overlay, text shows completion message
- **error** — red border + shake animation

## Wire / Connection Animation

SVG `<path>` with cubic bezier curves between nodes. Two layers:
1. **Base wire** — dim gray static path
2. **Pulse dots** — 3–5 small glowing dots (indigo when traveling, green when done wire) that travel along the path using `stroke-dashoffset` CSS animation. Each dot offset-staggered so they form a "stream of electricity" effect. Direction: always left → right.

When a wire completes (downstream node goes done), wire turns green and pulses stay green.

## Simulation Loop

Auto-plays on mount. Each node takes 2–3 seconds to "process" with typewriter text, then transitions to done and activates the next node + wire. Full loop: ~18 seconds. Restarts after a 3-second pause at the end.

## Publish Node — End Buttons

When node 6 reaches **done** state, two glowing CTA buttons appear below it:
- **"View on Etsy →"** — links to `https://www.etsy.com/shop/` (or listing URL if available)
- **"View on Gumroad →"** — links to Gumroad shop (if configured)

Buttons use a green glow pulse animation to draw the eye.

## Tech

- **Framework:** Next.js (TypeScript, existing frontend)
- **Animations:** framer-motion (already installed) + CSS keyframes for wire pulses
- **SVG wires:** inline SVG with animated `stroke-dashoffset`
- **Typewriter effect:** character-by-character state update with `setInterval`
- **File:** `frontend/app/art-factory/components/PipelineTab.tsx` (new)
- **Integration:** Import and wire into existing `page.tsx` tab switcher

## What We're NOT Building

- Real backend connection (simulation only)
- Configurable node data
- Mobile-optimized layout (horizontal scroll is fine)
