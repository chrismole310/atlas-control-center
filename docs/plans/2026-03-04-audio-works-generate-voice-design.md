# Audio Works: Generate, Download & Voice Selection — Design

**Date:** 2026-03-04
**Status:** Approved

---

## Overview

Extend the Audio Works library (`/audio-works`) with three capabilities:
1. Generate a new audiobook from an uploaded RTF/DOCX/TXT file
2. Download (save to file) any audiobook as an M4B
3. Select from 8 Piper TTS voices (4 female, 4 male) with on-demand model download

---

## Feature 1: Generate New Audiobook

### UI
- `+ New Audiobook` button at top of library sidebar
- Clicking expands an inline form in-place (no modal):
  - File picker — accepts `.rtf`, `.docx`, `.txt`
  - Voice dropdown — 8 options grouped Female / Male (see Feature 3)
  - `Generate` button

### Flow
1. User selects file + voice → clicks Generate
2. If selected voice is not installed → auto-download it first (see Feature 3)
3. `POST /api/v1/audiobooks/generate` (multipart: `file`, `voice`)
4. Backend:
   - Saves uploaded file to `publishing/uploads/{slug}.{ext}`
   - Creates `pub_books` record (title derived from filename, status `formatted`)
   - Fires `generate_audiobook(book_id, voice)` as BackgroundTask
5. New card appears immediately in sidebar with pulsing `⟳ Generating...` status
6. Frontend polls `GET /api/v1/audiobooks` every 10s; card updates when status = `audio_ready`

### Backend Route
```
POST /api/v1/audiobooks/generate
  Body: multipart/form-data { file: UploadFile, voice: str }
  Returns: { book_id: int, status: "generating" }
```

---

## Feature 2: Download (Save to File)

### UI
- `⬇ Download` button in the player header metadata row (next to QC badge, voice, size)

### Flow
- Button is an `<a href="/api/v1/audiobooks/{id}/download" download>` tag
- Browser native save dialog handles destination — no server-side path picking

### Backend Route
```
GET /api/v1/audiobooks/{id}/download
  Returns: M4B file with headers:
    Content-Disposition: attachment; filename="{title}.m4b"
    Content-Type: audio/mp4
    Accept-Ranges: bytes
```

---

## Feature 3: Voice Selection & On-Demand Download

### Voices

| Label | Model Name | Gender |
|-------|-----------|--------|
| Amy (US) | en_US-amy-medium | Female |
| Arctic (US) | en_US-arctic-medium | Female |
| Jenny (US) | en_US-jenny-medium | Female |
| Alba (GB) | en_GB-alba-medium | Female |
| Lessac (US) | en_US-lessac-medium | Male |
| Ryan (US) | en_US-ryan-medium | Male |
| Joe (US) | en_US-joe-medium | Male |
| Alan (GB) | en_GB-alan-medium | Male |

Voice models are fetched from the Piper TTS Hugging Face releases:
`https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang}/{name}/{quality}/{name}.onnx`

Each voice requires two files: `.onnx` (model) and `.onnx.json` (config).

### UI
- Voice dropdown in the generate form groups voices as **Female** / **Male**
- Installed voices: selectable, shown normally
- Uninstalled voices: selectable, shown with `⬇` indicator
- When an uninstalled voice is selected and Generate is clicked:
  - Download triggers automatically before generation
  - Status line below dropdown shows: `Downloading en_US-ryan-medium... (45MB)`
  - On completion, generation proceeds

### Backend Routes
```
GET /api/v1/voices
  Returns: list of { name, label, gender, installed: bool }

POST /api/v1/voices/{name}/download
  Downloads .onnx + .onnx.json from Hugging Face into publishing/voices/
  Returns: { status: "ok" | "already_installed" }
```

---

## Files to Change

| File | Change |
|------|--------|
| `backend/audiobook_routes.py` | Add `/generate`, `/download`, `/api/v1/voices` routes |
| `frontend/app/audio-works/page.tsx` | Add generate form, download button, voice dropdown with status |
| `publishing/voices/` | New voice model files downloaded at runtime |

---

## Out of Scope

- Word-level karaoke sync (uses existing paragraph-position approximation)
- Server-side file save path picker (browser handles destination)
- Voice preview/audition before generation
