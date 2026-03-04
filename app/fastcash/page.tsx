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

interface TrendingSkill {
  id: number;
  skill_name: string;
  mention_count: number;
  avg_pay_premium: number;
  demand_score: number;
  competition_score: number;
  opportunity_score: number;
}

interface Opportunity {
  id: number;
  service_type: string;
  opportunity_type: string;
  description: string;
  demand_score: number;
  competition_score: number;
  pay_potential: number;
  barrier_to_entry: string;
  recommendation: string;
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

function ScoreBar({ score, color = "bg-blue-500" }: { score: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div
          className={`${color} rounded-full h-1.5 transition-all`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 w-4 text-right">{score}</span>
    </div>
  );
}

export default function FastCashPage() {
  const [activeTab, setActiveTab] = useState<"atlas" | "chris" | "market">("chris");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [proposal, setProposal] = useState("");
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketSkills, setMarketSkills] = useState<TrendingSkill[]>([]);
  const [marketOpps, setMarketOpps] = useState<Opportunity[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/jobs/top?tab=${activeTab}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
      setError("Failed to load jobs. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
      setStats(await res.json());
    } catch (e) {
      console.error(e);
      setError("Failed to load stats. Is the backend running?");
    }
  }, []);

  const fetchMarketData = useCallback(async () => {
    setMarketLoading(true);
    try {
      const [skillsRes, oppsRes] = await Promise.all([
        fetch(`${API}/market/skills`),
        fetch(`${API}/market/opportunities`),
      ]);
      if (skillsRes.ok) {
        const d = await skillsRes.json();
        setMarketSkills(d.skills || []);
      }
      if (oppsRes.ok) {
        const d = await oppsRes.json();
        setMarketOpps(d.opportunities || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    if (activeTab === "market") {
      fetchMarketData();
    } else {
      fetchJobs();
    }
  }, [activeTab, fetchJobs, fetchStats, fetchMarketData]);

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

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await fetch(`${API}/market/scrape`, { method: "POST" });
      setTimeout(async () => {
        await fetchMarketData();
        setAnalyzing(false);
      }, 4000);
    } catch {
      setAnalyzing(false);
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
        body: JSON.stringify({ notes: "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null);
      const data = await res.json();
      setProposal(data.proposal || "");
      fetchJobs();
      fetchStats();
    } catch (e) {
      console.error(e);
      setError("Failed to generate proposal.");
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
        <button
          onClick={() => setActiveTab("market")}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "market"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          📊 Market Intel
        </button>
      </div>

      {/* Tab Description */}
      <p className="text-gray-400 text-sm mb-4">
        {activeTab === "chris"
          ? "High-value jobs matching your Emmy credentials. Atlas drafts the proposal — you click Apply."
          : activeTab === "atlas"
          ? "Jobs Atlas can complete autonomously using Whisper (transcription) and Claude (writing)."
          : "Live analysis of market demand, skill trends, and opportunities from job posting data."}
      </p>

      {activeTab !== "market" && (
        <>
          {/* Error Banner */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
              {error}
            </div>
          )}

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
                    aria-label="Close"
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
        </>
      )}

      {/* Market Intelligence Tab */}
      {activeTab === "market" && (
        <div>
          {/* Controls Row */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-400 text-sm">
              {marketSkills.length > 0
                ? `${marketSkills.length} skills analyzed from job postings`
                : "No analysis yet — click Analyze Market to start"}
            </p>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
            >
              {analyzing ? "Analyzing..." : "🔄 Analyze Market"}
            </button>
          </div>

          {marketLoading ? (
            <div className="text-center text-gray-500 py-12">Analyzing job data...</div>
          ) : marketSkills.length === 0 ? (
            <div className="text-center text-gray-500 py-16">
              <div className="text-5xl mb-4">📊</div>
              <div className="font-semibold text-gray-300 mb-2 text-lg">Market Intelligence Ready</div>
              <p className="text-sm max-w-sm mx-auto">
                Click <strong className="text-white">Analyze Market</strong> to scan job postings
                for skill trends, demand patterns, and income opportunities.
              </p>
            </div>
          ) : (
            <div className="space-y-10">

              {/* Trending Skills Table */}
              <div>
                <h2 className="text-lg font-bold text-white mb-4">📈 Trending Skills</h2>
                <div className="bg-gray-900 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Skill</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium w-32">Demand</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium w-32">Opportunity</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Pay +/-</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium">Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketSkills.map((skill) => (
                        <tr
                          key={skill.id}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3 font-medium text-white">{skill.skill_name}</td>
                          <td className="px-4 py-3">
                            <ScoreBar
                              score={skill.demand_score}
                              color={
                                skill.demand_score >= 7
                                  ? "bg-green-500"
                                  : skill.demand_score >= 4
                                  ? "bg-yellow-500"
                                  : "bg-gray-500"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ScoreBar
                              score={skill.opportunity_score}
                              color={
                                skill.opportunity_score >= 7
                                  ? "bg-blue-400"
                                  : skill.opportunity_score >= 4
                                  ? "bg-blue-700"
                                  : "bg-gray-600"
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                skill.avg_pay_premium >= 0 ? "text-green-400" : "text-red-400"
                              }
                            >
                              {skill.avg_pay_premium >= 0 ? "+" : ""}$
                              {skill.avg_pay_premium.toFixed(0)}/hr
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {skill.mention_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Opportunities Board */}
              {marketOpps.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-white mb-4">🚀 Opportunities</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {marketOpps.map((opp) => {
                      const typeStyles: Record<string, string> = {
                        "high-demand-low-supply":
                          "text-green-300 bg-green-900/30 border-green-800",
                        "premium-pricing":
                          "text-yellow-300 bg-yellow-900/30 border-yellow-800",
                        "high-demand":
                          "text-blue-300 bg-blue-900/30 border-blue-800",
                        "emerging-skill":
                          "text-purple-300 bg-purple-900/30 border-purple-800",
                      };
                      const style =
                        typeStyles[opp.opportunity_type] ||
                        "text-gray-300 bg-gray-800 border-gray-700";
                      return (
                        <div key={opp.id} className={`border rounded-xl p-4 ${style}`}>
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-bold text-sm">{opp.service_type}</h3>
                            <span className="text-xs opacity-70 capitalize">
                              {opp.opportunity_type.replace(/-/g, " ")}
                            </span>
                          </div>
                          <p className="text-xs opacity-75 mb-3">{opp.description}</p>
                          <div className="grid grid-cols-3 gap-2 mb-3 text-xs text-center">
                            <div>
                              <div className="font-bold text-lg">{opp.demand_score}</div>
                              <div className="opacity-60">Demand</div>
                            </div>
                            <div>
                              <div className="font-bold text-lg">
                                ${opp.pay_potential.toFixed(0)}
                              </div>
                              <div className="opacity-60">Per hour</div>
                            </div>
                            <div>
                              <div className="font-bold text-lg capitalize">
                                {opp.barrier_to_entry}
                              </div>
                              <div className="opacity-60">Barrier</div>
                            </div>
                          </div>
                          <p className="text-xs opacity-90 italic">{opp.recommendation}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
