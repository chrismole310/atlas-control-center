"use client";
import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000/api/v1/fastcash";

interface Job {
  id: number;
  title: string;
  company: string;
  source: string;
  url: string;
  pay_rate: string;
  score: number;
  tab: string;
  status: string;
  applied: number;
  description: string;
  start_date: string;
  payment_speed: string;
}

interface Stats {
  total_jobs: number;
  atlas_jobs: number;
  chris_jobs: number;
  applied: number;
  total_earned: number;
  tasks_ready: number;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-gray-500";
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
      {score.toFixed(1)}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    upwork: "bg-green-700",
    linkedin: "bg-blue-700",
    indeed: "bg-purple-700",
    remoteok: "bg-red-700",
    weworkremotely: "bg-orange-700",
  };
  return (
    <span className={`${colors[source] || "bg-gray-700"} text-white text-xs px-2 py-0.5 rounded`}>
      {source}
    </span>
  );
}

export default function FastCashPage() {
  const [activeTab, setActiveTab] = useState<"atlas" | "chris">("chris");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [proposal, setProposal] = useState("");
  const [generatingProposal, setGeneratingProposal] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/jobs/top?tab=${activeTab}&limit=20`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchStats();
  }, [fetchJobs, fetchStats]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch(`${API}/scrape`, { method: "POST" });
      setTimeout(() => {
        fetchJobs();
        fetchStats();
        setScraping(false);
      }, 5000);
    } catch (e) {
      setScraping(false);
    }
  };

  const handleApply = async (job: Job) => {
    setSelectedJob(job);
    setGeneratingProposal(true);
    setProposal("");
    try {
      const res = await fetch(`${API}/apply/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });
      const data = await res.json();
      setProposal(data.proposal || "");
      fetchJobs();
      fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingProposal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">⚡ FastCash</h1>
          <p className="text-gray-400 text-sm mt-1">
            Fastest path to income — automated and manual
          </p>
        </div>
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
        >
          {scraping ? "Scanning..." : "⟳ Scan Now"}
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Jobs", value: stats.total_jobs },
            { label: "Atlas Jobs", value: stats.atlas_jobs },
            { label: "Chris Jobs", value: stats.chris_jobs },
            { label: "Applied", value: stats.applied },
            { label: "Earned", value: `$${stats.total_earned.toFixed(2)}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-yellow-400">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("chris")}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "chris"
              ? "bg-yellow-500 text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          👤 Chris Works
        </button>
        <button
          onClick={() => setActiveTab("atlas")}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "atlas"
              ? "bg-purple-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          🤖 Atlas Works
        </button>
      </div>

      {/* Tab Description */}
      <p className="text-gray-400 text-sm mb-4">
        {activeTab === "chris"
          ? "High-value jobs matching your Emmy credentials. Atlas drafts the proposal — you click Apply."
          : "Jobs Atlas can complete autonomously using Whisper (transcription) and Claude (writing)."}
      </p>

      {/* Job List */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Scanning job boards...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No jobs yet. Hit <strong>Scan Now</strong> to fetch the latest.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`bg-gray-900 border rounded-lg p-4 ${
                job.applied ? "border-gray-700 opacity-60" : "border-gray-700 hover:border-yellow-600"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <ScoreBadge score={job.score} />
                    <SourceBadge source={job.source} />
                    {job.applied === 1 && (
                      <span className="text-xs text-green-400 font-medium">✓ Applied</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-white text-sm truncate">{job.title}</h3>
                  <p className="text-gray-400 text-xs">{job.company}</p>
                  {job.pay_rate && (
                    <p className="text-yellow-400 text-xs mt-1">{job.pay_rate}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1 line-clamp-2">{job.description}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded text-center"
                  >
                    View
                  </a>
                  {!job.applied && (
                    <button
                      onClick={() => handleApply(job)}
                      className={`text-xs px-3 py-1.5 rounded font-semibold ${
                        activeTab === "chris"
                          ? "bg-yellow-500 hover:bg-yellow-400 text-black"
                          : "bg-purple-600 hover:bg-purple-500 text-white"
                      }`}
                    >
                      {activeTab === "chris" ? "Apply" : "Queue"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proposal Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-yellow-400">
                  {activeTab === "chris" ? "AI-Drafted Proposal" : "Task Queued"}
                </h2>
                <p className="text-gray-400 text-sm">{selectedJob.title}</p>
              </div>
              <button
                onClick={() => { setSelectedJob(null); setProposal(""); }}
                className="text-gray-500 hover:text-white text-xl"
              >×</button>
            </div>
            {generatingProposal ? (
              <div className="text-center text-gray-400 py-8">
                ✍️ Writing your proposal...
              </div>
            ) : (
              <>
                <textarea
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg p-4 text-sm min-h-[300px] border border-gray-700 focus:outline-none focus:border-yellow-500"
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => navigator.clipboard.writeText(proposal)}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-2 rounded-lg text-sm"
                  >
                    Copy to Clipboard
                  </button>
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Open Job →
                  </a>
                  <button
                    onClick={() => { setSelectedJob(null); setProposal(""); }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
