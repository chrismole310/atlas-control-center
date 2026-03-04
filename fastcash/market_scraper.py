"""FastCash — Market Intelligence scraper.

Analyzes existing job data for skill trends, demand patterns, and opportunities.
Also scrapes Fiverr gig supply via Apify (graceful failure if unavailable).
"""
import sys
from pathlib import Path
from datetime import datetime

# Add repo root to path so package imports resolve
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastcash.database import get_conn, init_db, get_trending_skills

# Skills to track — (display_name, [keyword synonyms])
TRACKED_SKILLS = [
    ("After Effects",      ["after effects", " ae "]),
    ("Premiere Pro",       ["premiere pro", "premiere"]),
    ("DaVinci Resolve",    ["davinci", "da vinci", "color grading", "colorist"]),
    ("Documentary",        ["documentary"]),
    ("Podcast Video",      ["podcast"]),
    ("Motion Graphics",    ["motion graphics", "motion design"]),
    ("Animation",          ["animation", "animated", "animator"]),
    ("Social Media Video", ["social media", "tiktok", "reels", "shorts"]),
    ("Corporate Video",    ["corporate", "explainer", "brand video"]),
    ("Music Video",        ["music video"]),
    ("Broadcast/News",     ["broadcast", "news editing", "television"]),
    ("3D/VFX",             ["vfx", "visual effects", " 3d "]),
    ("Wedding/Events",     ["wedding", "event video", "event film"]),
    ("Color Grading",      ["color grading", "color correction", "grade"]),
]

# Categories for demand aggregation
DEMAND_CATEGORIES = [
    ("video-editing",      ["video edit", "video editor"]),
    ("documentary",        ["documentary"]),
    ("post-production",    ["post-production", "post production"]),
    ("animation",          ["animation", "animator"]),
    ("color-grading",      ["color grading", "colorist"]),
    ("social-media-video", ["social media", "tiktok", "reels"]),
    ("corporate-video",    ["corporate", "explainer"]),
    ("podcast-video",      ["podcast"]),
]


def analyze_skill_trends():
    """Extract skill demand and pay premium from existing fastcash_jobs."""
    week_start = datetime.utcnow().strftime("%Y-%m-%d")

    with get_conn() as conn:
        baseline_row = conn.execute(
            "SELECT AVG((pay_min + pay_max) / 2.0) FROM fastcash_jobs WHERE pay_max > 0"
        ).fetchone()
        baseline = float(baseline_row[0] or 50.0)

        total_jobs = conn.execute("SELECT COUNT(*) FROM fastcash_jobs").fetchone()[0]
        if total_jobs == 0:
            print("[Market] No jobs to analyze yet.")
            return

        conn.execute("DELETE FROM trending_skills")

        for skill_name, keywords in TRACKED_SKILLS:
            conditions = " OR ".join(
                ["LOWER(title || ' ' || COALESCE(description, '')) LIKE ?"] * len(keywords)
            )
            like_params = [f"%{kw}%" for kw in keywords]

            count = conn.execute(
                f"SELECT COUNT(*) FROM fastcash_jobs WHERE {conditions}", like_params
            ).fetchone()[0]

            pay_row = conn.execute(
                f"SELECT AVG((pay_min + pay_max) / 2.0) "
                f"FROM fastcash_jobs WHERE pay_max > 0 AND ({conditions})",
                like_params
            ).fetchone()
            avg_pay = float(pay_row[0] or baseline)
            pay_premium = round(avg_pay - baseline, 2)

            demand_score = min(10, max(1, round(count / 5)))
            competition_score = min(10, max(1, round(count / 8)))
            opportunity_score = min(10, max(1, round(
                (demand_score * 2 + (10 - competition_score) + (1 if pay_premium > 0 else 0)) / 3
            )))

            conn.execute("""
                INSERT INTO trending_skills
                    (skill_name, category, mention_count, avg_pay_premium,
                     demand_score, competition_score, opportunity_score, week_start)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                skill_name, "video-production", count, pay_premium,
                demand_score, competition_score, opportunity_score, week_start,
            ))

    print(f"[Market] Skill trends analyzed from {total_jobs} jobs.")


def aggregate_job_demand():
    """Aggregate demand data by category from existing scraped jobs."""
    week_start = datetime.utcnow().strftime("%Y-%m-%d")

    with get_conn() as conn:
        conn.execute("DELETE FROM market_demand WHERE week_start = ?", (week_start,))

        for category, keywords in DEMAND_CATEGORIES:
            conditions = " OR ".join(
                ["LOWER(title || ' ' || COALESCE(description, '')) LIKE ?"] * len(keywords)
            )
            params = [f"%{kw}%" for kw in keywords]

            count = conn.execute(
                f"SELECT COUNT(*) FROM fastcash_jobs WHERE {conditions}", params
            ).fetchone()[0]
            if count == 0:
                continue

            pay_row = conn.execute(
                f"SELECT AVG((pay_min + pay_max) / 2.0), MIN(pay_min), MAX(pay_max) "
                f"FROM fastcash_jobs WHERE pay_max > 0 AND ({conditions})", params
            ).fetchone()

            conn.execute("""
                INSERT INTO market_demand
                    (platform, category, service_type, num_requests,
                     avg_budget, min_budget, max_budget, week_start)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "mixed", category,
                category.replace("-", " ").title(),
                count,
                round(float(pay_row[0] or 0), 2),
                round(float(pay_row[1] or 0), 2),
                round(float(pay_row[2] or 0), 2),
                week_start,
            ))

    print("[Market] Job demand aggregated.")


def scrape_fiverr_supply():
    """Scrape top Fiverr gigs using Apify. Gracefully skips on any failure."""
    try:
        from intelligence.apify_client import run_actor
    except ImportError:
        print("[Market] Apify client not found, skipping Fiverr.")
        return

    week_start = datetime.utcnow().strftime("%Y-%m-%d")
    queries = ["video editing", "documentary editing", "podcast video editing"]

    for query in queries:
        try:
            items, _ = run_actor("epctex/fiverr-scraper", {
                "startUrls": [{
                    "url": f"https://www.fiverr.com/search/gigs?query={query.replace(' ', '+')}"
                }],
                "maxItems": 30,
            }, timeout_secs=120)

            prices = []
            with get_conn() as conn:
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    price = float(
                        item.get("price", 0) or item.get("startingPrice", 0) or 0
                    )
                    username = (
                        item.get("sellerName", "") or item.get("username", "")
                    )
                    reviews = int(
                        item.get("reviewsCount", 0) or item.get("reviews", 0) or 0
                    )
                    if price > 0:
                        prices.append(price)
                    if username:
                        conn.execute("""
                            INSERT OR IGNORE INTO top_performers
                                (platform, username, category, rate_per_hour, jobs_completed)
                            VALUES (?, ?, ?, ?, ?)
                        """, ("fiverr", username, "video-production", price, reviews))

                if prices:
                    category = query.replace(" ", "-")
                    conn.execute("""
                        INSERT INTO market_supply
                            (platform, category, service_type, num_sellers, avg_price, week_start)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        "fiverr", category, query.title(),
                        len(prices), round(sum(prices) / len(prices), 2), week_start,
                    ))

            print(f"[Market] Fiverr '{query}': {len(prices)} gigs scraped")
        except Exception as e:
            print(f"[Market] Fiverr '{query}' failed: {e}")


def identify_opportunities():
    """Generate opportunities from trending_skills data."""
    with get_conn() as conn:
        conn.execute("DELETE FROM market_opportunities")

        skills = conn.execute("""
            SELECT * FROM trending_skills
            WHERE demand_score >= 3
            ORDER BY opportunity_score DESC
            LIMIT 10
        """).fetchall()

        for skill in skills:
            s = dict(skill)
            if s["demand_score"] > s["competition_score"] + 2:
                opp_type = "high-demand-low-supply"
            elif s["avg_pay_premium"] > 15:
                opp_type = "premium-pricing"
            elif s["demand_score"] >= 6:
                opp_type = "high-demand"
            else:
                opp_type = "emerging-skill"

            pay_potential = round(75.0 + max(0.0, s["avg_pay_premium"]), 2)
            barrier = (
                "low" if s["competition_score"] < 4
                else "medium" if s["competition_score"] < 7
                else "high"
            )

            conn.execute("""
                INSERT INTO market_opportunities
                    (category, service_type, opportunity_type, description,
                     demand_score, competition_score, pay_potential,
                     barrier_to_entry, recommendation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "video-production",
                s["skill_name"],
                opp_type,
                (f"{s['skill_name']} appears in {s['mention_count']} job postings "
                 f"with {s['demand_score']}/10 demand score."),
                s["demand_score"],
                s["competition_score"],
                pay_potential,
                barrier,
                (f"Highlight {s['skill_name']} credentials in proposals — "
                 f"{s['demand_score']}/10 demand in current market."),
            ))

    print("[Market] Opportunities identified.")


def run_market_intelligence_scrape():
    """Complete market intelligence run — called daily at 3am."""
    init_db()
    print("[Market] Starting market intelligence scrape...")
    aggregate_job_demand()
    analyze_skill_trends()
    scrape_fiverr_supply()
    identify_opportunities()
    print("[Market] Market intelligence complete.")
