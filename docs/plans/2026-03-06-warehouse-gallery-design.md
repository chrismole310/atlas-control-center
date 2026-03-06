# Warehouse Gallery — Design

**Date:** 2026-03-06
**Status:** Approved

---

## What We're Building

A **Warehouse** tab on the Art Factory page that shows the full art library stored on `/Volumes/Atlas_2TB/ArtFactory/library/` (Desktop fallback if drive not mounted). Three drill-down views: all 50 silos → silo inventory → piece detail. Generate button inside each silo fires the real pipeline inline without leaving the view.

---

## Library Source of Truth

The external drive at `/Volumes/Atlas_2TB/ArtFactory/library/` contains one folder per completed run:

```
{YYYY-MM-DD}-{silo-slug}-{6-char-id}/
  artwork.png
  listing.txt
  package.zip
  mockups/
    gen_..._bathroom.png
    gen_..._bedroom.png
    gen_..._living-room.png
    gen_..._nursery.png
    gen_..._office.png
  print-sizes/
    gen_..._8x10.png  ...
```

**Folder name parsing:** split by `-` → first 3 parts = date, last part = ID, middle parts joined = silo slug.

Example: `2026-03-06-botanical-prints-342359` → date `2026-03-06`, silo `botanical-prints`, id `342359`.

---

## Three Views

### View 1 — Silo Grid (default)

50 cards in a responsive grid, sorted by silo priority (highest first). Each card shows:
- Silo name + category badge
- Piece count (green badge if >0, gray "Empty" if 0)
- Thumbnail of the latest artwork (served via backend image endpoint)
- Click → navigates to Silo View

### View 2 — Silo View

Header: back button + silo name + **"⚡ Generate Now"** button (right side).

Clicking "Generate Now":
- Fires `POST /api/generate` with this silo's ID (no modal — silo is already known)
- Inline mini-pipeline animation appears below the button (reuses `PipelineNode` + wire components, same 6-node layout but compact)
- When job completes, new piece is appended to the inventory grid automatically
- No navigation away from this view

Below header: grid of piece thumbnails (artwork.png) sorted newest first. Each shows the date. Click → Detail View.

### View 3 — Detail View

Header: back button + piece title (from listing.txt) + **"📂 Open Folder"** button.

**Split layout:**

```
┌─────────────────────────┬─────────────────────────────┐
│  artwork.png (full)     │  TITLE                      │
│                         │  $4.99                      │
│  ─────────────────────  │  TAGS: tag1, tag2, ...      │
│  Mockups (5 thumbs row) │  ─────────────────────────  │
│  [LR][BR][OF][NU][BA]   │  DESCRIPTION (scrollable)   │
│                         │                             │
│                         │  [Copy Listing]             │
└─────────────────────────┴─────────────────────────────┘
```

Mockup thumbnails are clickable — clicking one expands it to replace the main artwork image.

---

## Backend API

**New route file:** `atlas-art-factory/api/routes/library.js`
**Mounted at:** `app.use('/api/library', libraryRouter)` in `api/index.js`

### `GET /api/library`

Scans `LIBRARY_ROOT`, parses folder names, groups by silo slug. Returns:

```json
{
  "silos": [
    {
      "slug": "botanical-prints",
      "count": 1,
      "latestFolder": "2026-03-06-botanical-prints-342359",
      "latestDate": "2026-03-06"
    }
  ],
  "totalPieces": 1
}
```

### `GET /api/library/:silo`

Returns all pieces for that silo slug, sorted newest first:

```json
{
  "silo": "botanical-prints",
  "pieces": [
    {
      "folderId": "2026-03-06-botanical-prints-342359",
      "date": "2026-03-06",
      "title": "Botanical Plant Art Print | ..."
    }
  ]
}
```

Title comes from reading `listing.txt` and extracting the `TITLE:` line.

### `GET /api/library/:silo/:folderId/artwork`

Streams `{folderId}/artwork.png` as `image/png`. Path-confined to `LIBRARY_ROOT`.

### `GET /api/library/:silo/:folderId/mockup/:room`

Streams `{folderId}/mockups/gen_*_{room}.png` (globs for the file). Rooms: `living-room`, `bedroom`, `office`, `nursery`, `bathroom`.

### `GET /api/library/:silo/:folderId/listing`

Reads and parses `listing.txt`, returns:

```json
{
  "title": "...",
  "price": 4.99,
  "tags": ["tag1", "tag2"],
  "description": "..."
}
```

---

## Frontend

**New file:** `frontend/app/art-factory/components/WarehouseTab.tsx`

**Added to page.tsx:** `{ id: 'warehouse', label: '🏭 Warehouse' }` tab, renders `<WarehouseTab silos={silos} />`

**Props:** receives the existing `silos` array (already fetched in `page.tsx`) so no extra fetch for silo metadata (name, category, priority, id).

**State:**
```ts
type View = 'grid' | 'silo' | 'detail'
selectedSilo: Silo | null
selectedFolder: string | null  // folderId
```

**Key hooks:**
- `useLibrary()` — fetches `GET /api/library`, returns silo counts + latest folder per silo
- `useSiloInventory(slug)` — fetches `GET /api/library/:silo` when silo view opens
- `useListing(silo, folderId)` — fetches `GET /api/library/:silo/:folderId/listing` when detail view opens
- `useGenerateForSilo(siloId)` — same polling logic as `useGenerateJob` but scoped to one silo; auto-refreshes inventory when job completes

**Image URLs** (used directly in `<img src>` tags):
- Artwork: `http://localhost:3001/api/library/{silo}/{folderId}/artwork`
- Mockup: `http://localhost:3001/api/library/{silo}/{folderId}/mockup/{room}`

---

## What We're NOT Building

- Pagination (library is small for now — scan all at once)
- Delete/archive pieces from UI
- Edit listing copy in-place
- Drag to reorder
- Search/filter across silos
