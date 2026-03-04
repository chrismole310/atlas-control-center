"""FastCash — Job scoring algorithm (1-10 composite score)."""
import re

USER_SKILLS = [
    "video editing", "post-production", "documentary", "film", "tv production",
    "content editing", "broadcast", "espn", "netflix", "hbo", "emmy",
    "non-linear editing", "avid", "premiere", "final cut", "davinci",
]

SKILL_BOOSTS = {
    "video editing": 5, "post-production": 5, "documentary": 4,
    "film production": 4, "tv production": 4, "content editing": 3,
    "emmy": 2, "broadcast": 3, "avid": 2, "premiere": 2,
}

PAYMENT_SPEED_SCORES = {
    "same-day": 10, "daily": 10,
    "weekly": 8, "bi-weekly": 6,
    "monthly": 3, "net-30": 2, "net-60": 1,
    "unknown": 4,
}


def _speed_to_start_score(start_date: str) -> float:
    if not start_date:
        return 5.0
    s = start_date.lower()
    if any(w in s for w in ["immediately", "asap", "today", "now", "right away"]):
        return 10.0
    if any(w in s for w in ["this week", "week", "3 days", "5 days"]):
        return 8.0
    if any(w in s for w in ["2 weeks", "two weeks", "14 days"]):
        return 5.0
    if any(w in s for w in ["month", "30 days"]):
        return 2.0
    return 5.0


def _pay_score(pay_min: float, pay_max: float, pay_rate: str) -> float:
    effective = pay_max or pay_min
    if not effective:
        rate = (pay_rate or "").lower()
        if "$" in rate:
            nums = re.findall(r"\d+\.?\d*", rate)
            if nums:
                effective = float(nums[-1])
    if not effective:
        return 3.0
    if "hour" in (pay_rate or "").lower() or "/hr" in (pay_rate or "").lower():
        if effective >= 100: return 10.0
        if effective >= 75:  return 8.0
        if effective >= 50:  return 7.0
        if effective >= 25:  return 5.0
        return 3.0
    # Flat project rate
    if effective >= 1000: return 9.0
    if effective >= 500:  return 7.0
    if effective >= 200:  return 6.0
    if effective >= 50:   return 5.0
    return 3.0


def _skill_match_score(title: str, description: str, skills: list) -> float:
    text = f"{title or ''} {description or ''} {' '.join(skills or [])}".lower()
    base = 0
    for skill, boost in SKILL_BOOSTS.items():
        if skill in text:
            base += boost
    return min(10.0, max(1.0, base if base > 0 else 5.0))


def _apply_difficulty_score(description: str, source: str) -> float:
    desc = (description or "").lower()
    if source in ("remoteok", "weworkremotely"):
        return 8.0
    if any(w in desc for w in ["one click", "quick apply", "easy apply"]):
        return 9.0
    if any(w in desc for w in ["portfolio required", "test task", "assessment"]):
        return 4.0
    return 6.0


def score_job(job: dict) -> float:
    """Return composite score 1-10."""
    s1 = _speed_to_start_score(job.get("start_date", ""))
    s2 = PAYMENT_SPEED_SCORES.get(
        (job.get("payment_speed") or "unknown").lower(), 4.0
    )
    s3 = _pay_score(
        job.get("pay_min", 0),
        job.get("pay_max", 0),
        job.get("pay_rate", ""),
    )
    s4 = _skill_match_score(
        job.get("title", ""),
        job.get("description", ""),
        job.get("skills", []),
    )
    s5 = _apply_difficulty_score(
        job.get("description", ""),
        job.get("source", ""),
    )
    composite = (s1 * 0.25) + (s2 * 0.25) + (s3 * 0.20) + (s4 * 0.20) + (s5 * 0.10)
    return round(min(10.0, max(1.0, composite)), 2)
