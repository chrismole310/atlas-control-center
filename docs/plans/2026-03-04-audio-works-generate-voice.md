# Audio Works: Generate, Download & Voice Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add RTF/DOCX/TXT upload + generate flow, M4B download button, and 8-voice selection with on-demand model download to the Audio Works page.

**Architecture:** Two new backend tasks (4 routes in `audiobook_routes.py`, list endpoint extended) + frontend form/button additions in `audio-works/page.tsx`. Voice models fetched from HuggingFace Piper releases on first use. Generation chained after voice download in a single BackgroundTask.

**Tech Stack:** FastAPI (UploadFile, Form, BackgroundTasks), Python urllib.request (voice download), Next.js 14, TypeScript, existing WaveSurfer.js setup.

---

## Critical Files (read before touching anything)

- `backend/audiobook_routes.py` — all routes live here, registered via `register_audiobook_routes(app)`
- `frontend/app/audio-works/page.tsx` — 474 lines, full component
- `publishing/database.py` — schema reference (pub_books, pub_audiobook_versions)
- `publishing/audiobook.py` — `generate_audiobook(book_id, voice)` signature

---

## Task 1: Backend — voices + generate + download routes

**Files:**
- Modify: `backend/audiobook_routes.py`

No tests (routes follow established pattern, tested manually via curl).

### Step 1: Add voice catalog and HuggingFace download helper

At the **top of `backend/audiobook_routes.py`**, after the existing imports, add:

```python
import re
import urllib.request
from fastapi import File, Form, UploadFile

# ── Voice catalog ──────────────────────────────────────────────────────────────
_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
_VOICES_DIR = _REPO / "publishing" / "voices"

_VOICES = [
    {"name": "en_US-amy-medium",        "label": "Amy (US)",    "gender": "female", "hf_path": "en/en_US/amy/medium"},
    {"name": "en_US-arctic-medium",     "label": "Arctic (US)", "gender": "female", "hf_path": "en/en_US/arctic/medium"},
    {"name": "en_US-jenny_dioco-medium","label": "Jenny (US)",  "gender": "female", "hf_path": "en/en_US/jenny_dioco/medium"},
    {"name": "en_GB-alba-medium",       "label": "Alba (GB)",   "gender": "female", "hf_path": "en/en_GB/alba/medium"},
    {"name": "en_US-lessac-medium",     "label": "Lessac (US)", "gender": "male",   "hf_path": "en/en_US/lessac/medium"},
    {"name": "en_US-ryan-medium",       "label": "Ryan (US)",   "gender": "male",   "hf_path": "en/en_US/ryan/medium"},
    {"name": "en_US-joe-medium",        "label": "Joe (US)",    "gender": "male",   "hf_path": "en/en_US/joe/medium"},
    {"name": "en_GB-alan-medium",       "label": "Alan (GB)",   "gender": "male",   "hf_path": "en/en_GB/alan/medium"},
]


def _is_voice_installed(name: str) -> bool:
    return (_VOICES_DIR / f"{name}.onnx").exists()


def _download_voice(name: str, hf_path: str) -> None:
    """Download .onnx + .onnx.json for a Piper voice from HuggingFace."""
    _VOICES_DIR.mkdir(exist_ok=True)
    for ext in [".onnx", ".onnx.json"]:
        fname = f"{name}{ext}"
        dest = _VOICES_DIR / fname
        if not dest.exists():
            url = f"{_HF_BASE}/{hf_path}/{fname}"
            print(f"[Voices] Downloading {fname} from {url}")
            urllib.request.urlretrieve(url, str(dest))
            print(f"[Voices] Saved {fname}")


def _download_and_generate(book_id: int, voice: str, hf_path: str) -> None:
    """Download voice model then generate audiobook (for chaining in BackgroundTask)."""
    _download_voice(voice, hf_path)
    generate_audiobook(book_id, voice)
```

### Step 2: Modify list endpoint to include generating books

In `register_audiobook_routes(app)`, replace the existing `list_audiobooks` function body with:

```python
    @app.get("/api/v1/audiobooks")
    def list_audiobooks():
        with get_conn() as conn:
            rows = conn.execute(
                """
                SELECT
                    av.id, av.book_id, av.voice, av.duration_minutes,
                    av.file_path, av.file_size,
                    b.title, b.author, b.slug,
                    b.status AS book_status, b.cover_art_path
                FROM pub_audiobook_versions av
                JOIN pub_books b ON b.id = av.book_id
                ORDER BY av.id DESC
                """
            ).fetchall()
            generating = conn.execute(
                """
                SELECT id, title, author, slug, status
                FROM pub_books
                WHERE status IN ('generating_audio', 'formatted', 'failed')
                AND id NOT IN (SELECT book_id FROM pub_audiobook_versions)
                ORDER BY id DESC
                """
            ).fetchall()

        result = []
        for row in rows:
            record = dict(row)
            record["qc_status"] = _quick_qc_status(record["file_path"])
            result.append(record)

        return {"audiobooks": result, "generating": [dict(r) for r in generating]}
```

### Step 3: Add 4 new routes inside `register_audiobook_routes(app)`

Add these 4 routes **before** the final closing of `register_audiobook_routes`. Paste them after the existing `regenerate_audiobook` route:

```python
    # ── ROUTE: List available voices ──────────────────────────────────────────
    @app.get("/api/v1/voices")
    def list_voices():
        return {
            "voices": [
                {**v, "installed": _is_voice_installed(v["name"])}
                for v in _VOICES
            ]
        }

    # ── ROUTE: Download a voice model ─────────────────────────────────────────
    @app.post("/api/v1/voices/{voice_name}/download")
    def download_voice(voice_name: str, background_tasks: BackgroundTasks):
        voice_info = next((v for v in _VOICES if v["name"] == voice_name), None)
        if not voice_info:
            raise HTTPException(404, f"Unknown voice: {voice_name}")
        if _is_voice_installed(voice_name):
            return {"status": "already_installed"}
        background_tasks.add_task(_download_voice, voice_name, voice_info["hf_path"])
        return {"status": "downloading"}

    # ── ROUTE: Generate new audiobook from uploaded file ──────────────────────
    @app.post("/api/v1/audiobooks/generate")
    async def generate_new_audiobook(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        voice: str = Form("en_US-lessac-medium"),
    ):
        # Save uploaded file
        uploads_dir = _REPO / "publishing" / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        stem = Path(file.filename or "untitled").stem
        safe_stem = re.sub(r"[^\w\s-]", "", stem).strip()
        title = re.sub(r"[\s_-]+", " ", safe_stem).title()
        base_slug = re.sub(r"[\s_]+", "-", safe_stem.lower())
        base_slug = re.sub(r"-+", "-", base_slug).strip("-")

        # Ensure unique slug
        slug = base_slug
        suffix = Path(file.filename or "file.txt").suffix.lower() or ".txt"
        with get_conn() as conn:
            n = 1
            while conn.execute("SELECT 1 FROM pub_books WHERE slug=?", (slug,)).fetchone():
                slug = f"{base_slug}-{n}"
                n += 1

        save_path = uploads_dir / f"{slug}{suffix}"
        content = await file.read()
        save_path.write_bytes(content)

        # Create pub_books record
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO pub_books (title, slug, manuscript_path, status) VALUES (?,?,?,?)",
                (title, slug, str(save_path), "formatted"),
            )
            book_id = cur.lastrowid

        # Check if voice needs downloading; chain download+generate if so
        voice_info = next((v for v in _VOICES if v["name"] == voice), None)
        if voice_info and not _is_voice_installed(voice):
            background_tasks.add_task(
                _download_and_generate, book_id, voice, voice_info["hf_path"]
            )
            return {"book_id": book_id, "title": title, "status": "downloading_voice"}

        background_tasks.add_task(generate_audiobook, book_id, voice)
        return {"book_id": book_id, "title": title, "status": "generating"}

    # ── ROUTE: Download M4B as attachment ─────────────────────────────────────
    @app.get("/api/v1/audiobooks/{audiobook_id}/download")
    def audiobook_download(audiobook_id: int):
        with get_conn() as conn:
            row = conn.execute(
                """
                SELECT av.*, b.title FROM pub_audiobook_versions av
                JOIN pub_books b ON b.id = av.book_id
                WHERE av.id=?
                """,
                (audiobook_id,),
            ).fetchone()
        if not row:
            raise HTTPException(404, "Audiobook not found")
        path = Path(row["file_path"])
        if not path.exists():
            raise HTTPException(404, "Audio file not found on disk")
        safe_title = re.sub(r'[<>:"/\\|?*]', "", row["title"]) or "audiobook"
        filename = f"{safe_title}.m4b"
        return FileResponse(
            str(path),
            media_type="audio/mp4",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
```

**Note on the generate route ordering:** FastAPI routes are matched in registration order. `POST /api/v1/audiobooks/generate` must be registered **before** `POST /api/v1/audiobooks/{audiobook_id}/regenerate`, otherwise FastAPI will try to match "generate" as an integer audiobook_id and fail. Paste the generate route **before** the regenerate route inside `register_audiobook_routes`.

### Step 4: Verify backend manually

With the backend running:
```bash
curl http://localhost:8000/api/v1/voices | python3 -m json.tool
# Expected: list of 8 voices, only lessac has installed:true

curl http://localhost:8000/api/v1/audiobooks | python3 -m json.tool
# Expected: {"audiobooks": [...], "generating": [...]}
```

### Step 5: Commit

```bash
git add backend/audiobook_routes.py
git commit -m "feat(audiobook): voices list/download, generate upload, M4B download route"
```

---

## Task 2: Frontend — generate form, voice dropdown, download button, polling

**Files:**
- Modify: `frontend/app/audio-works/page.tsx`

No tests (UI component, verify in browser).

### Step 1: Add new interfaces after the existing `Transcript` interface

Find `interface Transcript {` (around line 33) and add after the closing `}`:

```typescript
interface Voice {
  name: string
  label: string
  gender: "male" | "female"
  installed: boolean
}

interface GeneratingBook {
  id: number
  title: string
  author?: string
  status: string
}
```

### Step 2: Add new state variables

Find the block of `useState` declarations (around lines 68-78). Add these after `regenMsg`:

```typescript
const [voices, setVoices] = useState<Voice[]>([])
const [showGenerateForm, setShowGenerateForm] = useState(false)
const [genFile, setGenFile] = useState<File | null>(null)
const [genVoice, setGenVoice] = useState("en_US-lessac-medium")
const [genLoading, setGenLoading] = useState(false)
const [genMsg, setGenMsg] = useState<string | null>(null)
const [generatingBooks, setGeneratingBooks] = useState<GeneratingBook[]>([])
```

Also add a ref for the file input (add after `regenTimersRef`):
```typescript
const fileInputRef = useRef<HTMLInputElement>(null)
```

### Step 3: Update `loadAudiobooks` to extract generating books

Find the line `setAudiobooks(data.audiobooks ?? [])` and add the line after it:
```typescript
setGeneratingBooks(data.generating ?? [])
```

### Step 4: Add `loadVoices` callback and effect

After the `loadAudiobooks` useCallback + useEffect block (around line 101), add:

```typescript
// ── Load voice list ──────────────────────────────────────────────────────────
const loadVoices = useCallback(async () => {
  try {
    const res = await fetch(`${API}/api/v1/voices`)
    if (res.ok) {
      const data = await res.json()
      setVoices(data.voices ?? [])
    }
  } catch {}
}, [])

useEffect(() => { loadVoices() }, [loadVoices])
```

### Step 5: Add polling effect for generating books

After the `loadVoices` useEffect, add:

```typescript
// ── Poll while books are generating ──────────────────────────────────────────
useEffect(() => {
  if (generatingBooks.length === 0) return
  const interval = setInterval(loadAudiobooks, 10000)
  return () => clearInterval(interval)
}, [generatingBooks.length, loadAudiobooks])
```

### Step 6: Add `handleGenerate` function

After `handleRegen` (around line 221), add:

```typescript
// ── Generate new audiobook ────────────────────────────────────────────────────
const handleGenerate = async () => {
  if (!genFile) return
  setGenLoading(true)
  setGenMsg("Uploading...")
  try {
    const form = new FormData()
    form.append("file", genFile)
    form.append("voice", genVoice)
    const res = await fetch(`${API}/api/v1/audiobooks/generate`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) throw new Error("Generate failed")
    const data = await res.json()
    setGenMsg(
      data.status === "downloading_voice"
        ? "Downloading voice model, then generating..."
        : "Generation started!"
    )
    setShowGenerateForm(false)
    setGenFile(null)
    loadAudiobooks()
  } catch {
    setGenMsg("Error — check that backend is running")
  } finally {
    setGenLoading(false)
    regenTimersRef.current.push(setTimeout(() => setGenMsg(null), 5000))
  }
}
```

### Step 7: Add "New Audiobook" button + inline form to sidebar

Find this block in the sidebar (around line 250-252):
```tsx
<div className="px-4 pt-4 pb-2">
  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Library</p>
</div>
```

Replace it with:

```tsx
<div className="px-4 pt-4 pb-2">
  <div className="flex items-center justify-between mb-2">
    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Library</p>
    <button
      onClick={() => setShowGenerateForm(v => !v)}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
    >
      + New
    </button>
  </div>

  {showGenerateForm && (
    <div className="mb-3 p-3 rounded-lg border border-slate-700 bg-slate-800/60 flex flex-col gap-2">
      {/* File picker */}
      <div>
        <label className="text-xs text-slate-400 block mb-1">Manuscript file</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".rtf,.docx,.txt,.odt"
          className="hidden"
          onChange={e => setGenFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full text-xs py-1.5 px-2 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 text-slate-300 text-left truncate transition-colors"
        >
          {genFile ? genFile.name : "Choose file (.rtf, .docx, .txt)"}
        </button>
      </div>

      {/* Voice dropdown */}
      <div>
        <label className="text-xs text-slate-400 block mb-1">Voice</label>
        <select
          value={genVoice}
          onChange={e => setGenVoice(e.target.value)}
          className="w-full text-xs py-1.5 px-2 rounded border border-slate-600 bg-slate-700 text-slate-200 transition-colors"
        >
          <optgroup label="Female">
            {voices.filter(v => v.gender === "female").map(v => (
              <option key={v.name} value={v.name}>
                {v.label}{v.installed ? "" : " ⬇"}
              </option>
            ))}
          </optgroup>
          <optgroup label="Male">
            {voices.filter(v => v.gender === "male").map(v => (
              <option key={v.name} value={v.name}>
                {v.label}{v.installed ? "" : " ⬇"}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs text-slate-500 mt-0.5">⬇ = will download first (~50-150MB)</p>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!genFile || genLoading}
        className="w-full text-xs py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold transition-colors"
      >
        {genLoading ? "Working..." : "Generate Audiobook"}
      </button>

      {genMsg && (
        <p className="text-xs text-indigo-400 animate-pulse">{genMsg}</p>
      )}
    </div>
  )}
</div>
```

### Step 8: Add generating book cards in sidebar

Find the line `{audiobooks.map(book => {` (around line 265). **Before** that line, add generating book cards:

```tsx
{generatingBooks.map(book => (
  <div
    key={`gen-${book.id}`}
    className="mx-3 mb-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3"
  >
    <p className="font-semibold text-slate-300 text-sm leading-snug mb-0.5 truncate">
      {book.title}
    </p>
    <div className="flex items-center gap-2 mt-1">
      <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
      <span className="text-xs text-indigo-400">
        {book.status === "generating_audio" ? "Generating..." :
         book.status === "failed" ? "❌ Failed" : "Queued..."}
      </span>
    </div>
  </div>
))}
```

### Step 9: Add ⬇ Download button in player header

Find this block in the player header (around lines 362-364):
```tsx
<span className="text-xs text-slate-400">Voice: {selected.voice}</span>
<span className="text-xs text-slate-400">{formatSize(selected.file_size)}</span>
<span className="text-xs text-slate-400">{formatTRT(selected.duration_minutes)}</span>
```

Add a download link **after** those three spans:
```tsx
<a
  href={`${API}/api/v1/audiobooks/${selected.id}/download`}
  download
  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
>
  ⬇ Download
</a>
```

### Step 10: Update the empty-state message

Find the empty library message:
```tsx
<p className="text-sm text-center">No audiobooks yet. Generate one from the Publishing page.</p>
```
Change it to:
```tsx
<p className="text-sm text-center">No audiobooks yet. Click &quot;+ New&quot; to generate one.</p>
```

### Step 11: TypeScript check

```bash
cd /Users/atlas/atlas-control-center/frontend && npx tsc --noEmit
```
Expected: no output (zero errors). Fix any errors before committing.

### Step 12: Commit

```bash
cd /Users/atlas/atlas-control-center
git add frontend
git commit -m "feat(audio-works): generate form, voice selector, download button, generating cards"
```

---

## Verification

```bash
# 1. Voices list
curl http://localhost:8000/api/v1/voices | python3 -m json.tool
# → 8 voices, lessac installed:true, rest installed:false

# 2. List includes generating field
curl http://localhost:8000/api/v1/audiobooks | python3 -m json.tool
# → {"audiobooks": [...], "generating": [...]}

# 3. Download endpoint
curl -I http://localhost:8000/api/v1/audiobooks/1/download
# → Content-Disposition: attachment; filename="..."

# 4. Browser: open localhost:3000/audio-works
#    - "+ New" button visible in sidebar header
#    - Click it → form opens with file picker, voice dropdown, Generate button
#    - Voice dropdown shows Female/Male groups
#    - Uninstalled voices show "⬇" indicator
#    - Select book in player → "⬇ Download" button visible in header
```
