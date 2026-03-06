# Generate & Save — Design

**Date:** 2026-03-05
**Status:** Approved

## What We're Building

A "Generate & Save" feature that runs the full Art Factory pipeline on demand and saves output to `~/Desktop/art-factory-output/` so Chris can manually post to Etsy while waiting for the API key.

## User Flow

1. Visit `/art-factory` → click **⚡ Pipeline** tab
2. Click **"▶ Generate New Artwork"** button (top-right)
3. Modal appears: niche dropdown (all silos, sorted by priority) + Confirm
4. Hit Confirm → pipeline animation switches from simulation to real-time
5. Each node lights up as the actual job progresses with real status messages
6. When complete: "Publish" node shows "Saved to Desktop!"
7. **"📂 Open Folder →"** button opens `~/Desktop/art-factory-output/` in Finder
8. Result card below node graph shows artwork preview + full listing copy to paste into Etsy

## Output Folder Structure

One folder per run:
```
~/Desktop/art-factory-output/{YYYY-MM-DD}-{silo-name}/
  artwork.png          ← master artwork (2048×2048)
  mockups/
    living-room.png
    bedroom.png
    office.png
    nursery.png
    bathroom.png
  print-sizes/
    4x6.png
    5x7.png
    8x10.png
    11x14.png
    16x20.png
    square.png
  listing.txt          ← Etsy-ready copy (title, description, tags, price)
  package.zip          ← everything bundled for digital download
```

## listing.txt Format

```
TITLE: [Claude-generated SEO title]
PRICE: $4.99
TAGS: [13 comma-separated tags]

DESCRIPTION:
[Full Etsy description with emoji, bullet points, size list]
```

## Backend API

### New endpoint: POST /api/generate

**Request:** `{ siloId: number }`

**Response:** `{ jobId: string }`

**What it does (runs async):**
1. Load silo + pick top AI artist for that silo
2. Build prompt using artist DNA
3. Generate artwork with FLUX.1 schnell (Replicate)
4. Score image quality (threshold: 80/100, retry once if below)
5. Generate 5 room mockups with FLUX Kontext Dev
6. Generate 6 print sizes with Sharp
7. Generate SEO title/description/tags via Claude Haiku
8. Save to `~/Desktop/art-factory-output/{date}-{silo}/`
9. Bundle package.zip
10. Save record to DB (skip gracefully if DB unavailable)

### New endpoint: GET /api/generate/:jobId/status

**Response:**
```json
{
  "jobId": "abc123",
  "step": "mockup-generator",
  "status": "active",
  "message": "Creating bedroom scene (3/5)…",
  "progress": 60,
  "error": null,
  "result": null
}
```

Steps: `market-intel` → `ai-artist` → `quality-control` → `mockup-generator` → `package-builder` → `publish`

Status values: `pending` | `active` | `done` | `error`

When complete, `result` contains:
```json
{
  "folderPath": "/Users/atlas/Desktop/art-factory-output/2026-03-05-botanical-prints",
  "artworkPath": "...",
  "title": "...",
  "description": "...",
  "tags": [...],
  "price": 4.99
}
```

## Frontend Changes

**File:** `frontend/app/art-factory/components/PipelineTab.tsx`

- Add **"▶ Generate New Artwork"** button top-right above node graph
- Add **niche picker modal** (dropdown of silos from `/api/silos` + Confirm button)
- Add `useGenerateJob` hook: manages job state, polls `/api/generate/:jobId/status` every 2s
- Pipeline nodes switch from simulation mode to real-time mode when a job is running
- When job complete: Publish node shows "Saved to Desktop!", end buttons replaced by "📂 Open Folder →" (calls `/api/generate/:jobId/open-folder`)
- Result card below nodes shows: artwork preview image + listing copy in a copyable text box

**New endpoint for opening Finder:**

`POST /api/generate/:jobId/open-folder` → runs `open {folderPath}` (macOS) on the server

## Tech

- **Backend:** New route file `atlas-art-factory/api/routes/generate.js`
- **Job store:** In-memory Map (no Redis needed for manual one-at-a-time runs)
- **Image gen:** FLUX.1 schnell via existing `engines/4-ai-artist/engines/flux.js`
- **Mockups:** FLUX Kontext via existing `engines/5-mockup-generation/art-placer.js`
- **SEO:** Claude Haiku via existing `engines/distribution/seo-optimizer.js`
- **Print sizes:** Sharp via existing `engines/5-mockup-generation/format-optimizer.js`
- **ZIP:** archiver via existing `engines/5-mockup-generation/package-builder.js`
- **Frontend:** React polling hook, modal, result card added to PipelineTab.tsx

## What We're NOT Building

- Queue system (Redis/Bull) — one job at a time, in-memory is fine
- Real-time WebSocket streaming — polling every 2s is sufficient
- Database dependency — DB writes are best-effort, skipped if unavailable
- Automatic niche selection — user always chooses
