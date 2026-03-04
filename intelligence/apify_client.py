"""Atlas Intelligence — Apify API client."""
import os, time, requests
from datetime import datetime

API_TOKEN = os.getenv("APIFY_API_TOKEN", "apify_api_q1sITTiKHfhiqaHhl9Ns6m05uBQ4sO3DsSGQ")
BASE = "https://api.apify.com/v2"
HEADERS = {"Authorization": f"Bearer {API_TOKEN}"}


def run_actor(actor_id: str, input_data: dict, timeout_secs: int = 300) -> tuple:
    """Run an Apify actor, wait for completion, return dataset items."""
    print(f"[Apify] Starting actor {actor_id}...")

    # Start the run
    r = requests.post(
        f"{BASE}/acts/{actor_id}/runs",
        headers=HEADERS,
        json=input_data,
        params={"timeout": timeout_secs, "memory": 512}
    )
    r.raise_for_status()
    run = r.json()["data"]
    run_id = run["id"]
    print(f"[Apify] Run started: {run_id}")

    # Poll until done
    for _ in range(timeout_secs // 5):
        time.sleep(5)
        status_r = requests.get(f"{BASE}/actor-runs/{run_id}", headers=HEADERS)
        status = status_r.json()["data"]["status"]
        print(f"[Apify] Status: {status}")
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break

    if status != "SUCCEEDED":
        raise RuntimeError(f"Actor run {run_id} ended with status: {status}")

    # Fetch results
    dataset_id = status_r.json()["data"]["defaultDatasetId"]
    items_r = requests.get(
        f"{BASE}/datasets/{dataset_id}/items",
        headers=HEADERS,
        params={"format": "json", "limit": 1000}
    )
    items = items_r.json()
    print(f"[Apify] Got {len(items)} items from run {run_id}")
    return items, run_id


def get_run_status(run_id: str) -> dict:
    r = requests.get(f"{BASE}/actor-runs/{run_id}", headers=HEADERS)
    return r.json()["data"]


def get_dataset_items(dataset_id: str, limit: int = 1000) -> list:
    r = requests.get(
        f"{BASE}/datasets/{dataset_id}/items",
        headers=HEADERS,
        params={"format": "json", "limit": limit}
    )
    return r.json()
