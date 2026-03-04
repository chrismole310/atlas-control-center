"use client";
import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000/api/v1/publishing";

interface Ebook {
  format: string;
  file_path: string;
  file_size: number;
}

interface Audiobook {
  voice: string;
  duration_minutes: number;
  file_path: string;
}

interface Publication {
  platform: string;
  format: string;
  status: string;
  store_url: string;
  price: number;
}

interface Book {
  id: number;
  title: string;
  author: string;
  series: string | null;
  genre: string;
  word_count: number | null;
  slug: string;
  blurb: string | null;
  cover_art_path: string | null;
  status: string;
  created_at: string;
  ebooks: Ebook[];
  audiobooks: Audiobook[];
  publications: Publication[];
}

interface Stats {
  total_books: number;
  formatted: number;
  audio_ready: number;
  published: number;
  total_revenue: number;
}

const STATUS_STEPS = ["uploaded", "formatted", "audio_ready", "published"];
const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  formatting: "Formatting...",
  formatted: "Formatted",
  generating_audio: "Generating Audio...",
  audio_ready: "Audio Ready",
  publishing: "Publishing...",
  published: "Published",
  failed: "Failed",
};
const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-600",
  formatting: "bg-yellow-500 animate-pulse",
  formatted: "bg-blue-500",
  generating_audio: "bg-purple-500 animate-pulse",
  audio_ready: "bg-purple-500",
  publishing: "bg-green-500 animate-pulse",
  published: "bg-green-500",
  failed: "bg-red-600",
};

function StatusPipeline({ status }: { status: string }) {
  const activeIdx = STATUS_STEPS.indexOf(
    status.replace("formatting", "uploaded").replace("generating_audio", "formatted").replace("publishing", "audio_ready")
  );
  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${i <= activeIdx ? STATUS_COLORS[status] || "bg-gray-600" : "bg-gray-700"}`} />
          <span className={`text-xs ${i <= activeIdx ? "text-gray-300" : "text-gray-600"}`}>
            {STATUS_LABELS[step]}
          </span>
          {i < STATUS_STEPS.length - 1 && <div className="w-3 h-px bg-gray-700" />}
        </div>
      ))}
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    epub: "bg-blue-700", mobi: "bg-orange-700", pdf: "bg-red-700", m4b: "bg-purple-700",
  };
  return (
    <span className={`${colors[format] || "bg-gray-700"} text-white text-xs px-1.5 py-0.5 rounded`}>
      {format.toUpperCase()}
    </span>
  );
}

export default function PublishingPage() {
  const [activeTab, setActiveTab] = useState<"books" | "sales" | "settings">("books");
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const [booksRes, statsRes] = await Promise.all([
        fetch(`${API}/books`),
        fetch(`${API}/stats`),
      ]);
      if (booksRes.ok) setBooks((await booksRes.json()).books || []);
      if (statsRes.ok) setStats(await statsRes.json());
      setError(null);
    } catch {
      setError("Failed to load. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/scan`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.count > 0) await fetchBooks();
        else setError(`No new RTF files found in publishing/manuscripts/`);
      }
    } catch { setError("Scan failed."); }
    finally { setScanning(false); }
  };

  const handleAction = async (bookId: number, action: string, label: string) => {
    setActionLoading(prev => ({ ...prev, [bookId]: label }));
    try {
      const res = await fetch(`${API}/books/${bookId}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
      setTimeout(fetchBooks, 2000);
    } catch {
      setError(`${label} failed for book ${bookId}.`);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[bookId]; return n; });
    }
  };

  const handleProcessAll = async () => {
    setProcessingAll(true);
    try {
      await fetch(`${API}/process-all`, { method: "POST" });
      setTimeout(() => { fetchBooks(); setProcessingAll(false); }, 3000);
    } catch { setProcessingAll(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400">📚 Atlas Publishing</h1>
          <p className="text-gray-400 text-sm mt-1">
            Ebook + Audiobook automation for Brooks Hammer novels
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {scanning ? "Scanning..." : "📁 Scan for Books"}
          </button>
          <button
            onClick={handleProcessAll}
            disabled={processingAll}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
          >
            {processingAll ? "Processing..." : "🚀 Process All Books"}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Books", value: stats.total_books },
            { label: "Formatted", value: stats.formatted },
            { label: "Audio Ready", value: stats.audio_ready },
            { label: "Published", value: stats.published },
            { label: "Revenue", value: `$${stats.total_revenue.toFixed(2)}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["books", "sales", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors capitalize ${
              activeTab === tab
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {tab === "books" ? "📚 Books" : tab === "sales" ? "💰 Sales" : "⚙️ Settings"}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Books Tab */}
      {activeTab === "books" && (
        <>
          {loading ? (
            <div className="text-center text-gray-500 py-12">Loading books...</div>
          ) : books.length === 0 ? (
            <div className="text-center text-gray-500 py-16">
              <div className="text-5xl mb-4">📚</div>
              <div className="font-semibold text-gray-300 mb-2 text-lg">No Books Yet</div>
              <p className="text-sm max-w-sm mx-auto">
                Drop your RTF manuscripts into{" "}
                <code className="text-emerald-400">publishing/manuscripts/</code>{" "}
                then click <strong className="text-white">Scan for Books</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {books.map((book) => {
                const busy = actionLoading[book.id];
                const gumroadEbook = book.publications.find(p => p.platform === "gumroad" && p.format === "ebook");
                const gumroadAudio = book.publications.find(p => p.platform === "gumroad" && p.format === "audiobook");
                return (
                  <div key={book.id} className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[book.status] || "bg-gray-700"} text-white`}>
                            {STATUS_LABELS[book.status] || book.status}
                          </span>
                          {book.series && (
                            <span className="text-xs text-gray-400">{book.series}</span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-base">{book.title}</h3>
                        <p className="text-gray-400 text-xs">{book.author} · {book.genre}</p>
                        {book.word_count && (
                          <p className="text-gray-500 text-xs mt-0.5">
                            {book.word_count.toLocaleString()} words
                          </p>
                        )}
                        {/* Format badges */}
                        {(book.ebooks.length > 0 || book.audiobooks.length > 0) && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {book.ebooks.map(e => <FormatBadge key={e.format} format={e.format} />)}
                            {book.audiobooks.map(() => <FormatBadge key="m4b" format="m4b" />)}
                          </div>
                        )}
                        <StatusPipeline status={book.status} />
                        {/* Gumroad links */}
                        <div className="flex gap-3 mt-2">
                          {gumroadEbook && (
                            <a href={gumroadEbook.store_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-emerald-400 hover:text-emerald-300">
                              📖 Ebook on Gumroad →
                            </a>
                          )}
                          {gumroadAudio && (
                            <a href={gumroadAudio.store_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:text-purple-300">
                              🎧 Audiobook on Gumroad →
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
                        {book.status === "uploaded" && (
                          <button
                            onClick={() => handleAction(book.id, "format", "Format")}
                            disabled={!!busy}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Format" ? "Formatting..." : "📄 Format Ebook"}
                          </button>
                        )}
                        {book.status === "formatted" && (
                          <button
                            onClick={() => handleAction(book.id, "audio", "Audio")}
                            disabled={!!busy}
                            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Audio" ? "Generating..." : "🎧 Generate Audio"}
                          </button>
                        )}
                        {book.status === "audio_ready" && !gumroadEbook && (
                          <button
                            onClick={() => handleAction(book.id, "publish", "Publish")}
                            disabled={!!busy}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-semibold"
                          >
                            {busy === "Publish" ? "Publishing..." : "🚀 Publish to Gumroad"}
                          </button>
                        )}
                        {(book.ebooks.length > 0 || book.audiobooks.length > 0) && (
                          <button
                            onClick={() => handleAction(book.id, "export", "Export")}
                            disabled={!!busy}
                            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded"
                          >
                            {busy === "Export" ? "Exporting..." : "📦 Export Package"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Sales Tab */}
      {activeTab === "sales" && (
        <div className="text-center text-gray-500 py-16">
          <div className="text-5xl mb-4">💰</div>
          <div className="font-semibold text-gray-300 mb-2 text-lg">Sales Dashboard</div>
          <p className="text-sm">Revenue tracking will appear here once books are published.</p>
          {stats && stats.total_revenue > 0 && (
            <div className="mt-6 text-3xl font-bold text-emerald-400">
              ${stats.total_revenue.toFixed(2)} total earned
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="max-w-lg space-y-6">
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">📁 Manuscript Folder</h3>
            <p className="text-gray-400 text-sm">
              Drop your RTF files into:
            </p>
            <code className="block mt-2 text-emerald-400 text-sm bg-gray-800 rounded p-2">
              publishing/manuscripts/
            </code>
            <p className="text-gray-500 text-xs mt-2">
              Then click &quot;Scan for Books&quot; to register them.
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">🎙️ Narrator Voice</h3>
            <p className="text-gray-400 text-sm">Currently: en_US-lessac-medium (female)</p>
            <p className="text-gray-500 text-xs mt-1">
              Additional voices can be downloaded to publishing/voices/
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
            <h3 className="font-bold text-white mb-3">🛒 Platform Accounts</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>✅ Gumroad — set GUMROAD_ACCESS_TOKEN in backend/.env</p>
              <p>⏳ Amazon KDP — create account at kdp.amazon.com</p>
              <p>⏳ Draft2Digital — create account at draft2digital.com</p>
              <p>⏳ Findaway Voices — create account at findawayvoices.com</p>
              <p className="text-gray-500 text-xs mt-2">
                Export Package includes all files + instructions for manual uploads.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
