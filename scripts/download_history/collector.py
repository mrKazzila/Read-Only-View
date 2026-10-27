"""Incremental official stats history; no visitor or user data is retained."""

import json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from download_history.model import PLUGIN, SINCE, SOURCE, sha, stamp
from star_history.model import integer


class APIError(Exception):
    pass


def request(url, token=None):
    headers = {"User-Agent": "read-only-view-download-history"}
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urlopen(Request(url, headers=headers), timeout=60) as response:
            return json.load(response)
    except (OSError, ValueError) as error:
        raise APIError(f"Could not read official download stats ({type(error).__name__})") from None


def commits(cursor, token=None):
    result = []
    for page in range(1, 101):
        query = urlencode(
            {"path": "community-plugin-stats.json", "since": SINCE, "per_page": 100, "page": page}
        )
        batch = request(f"https://api.github.com/repos/{SOURCE}/commits?{query}", token)
        if not isinstance(batch, list):
            raise ValueError("Invalid commit response")
        for item in batch:
            revision = sha(item["sha"])
            published = item["commit"]["committer"]["date"]
            stamp(published)
            if revision == cursor:
                return result
            result.append({"sha": revision, "published_at": published})
        if len(batch) < 100:
            if cursor is not None:
                raise ValueError("Saved cursor missing upstream; explicit reimport required")
            return result
    raise ValueError("Pagination limit reached; refusing partial history")


def snapshot(commit):
    url = f"https://raw.githubusercontent.com/{SOURCE}/{commit['sha']}/community-plugin-stats.json"
    data = request(url)
    if not isinstance(data, dict):
        raise ValueError("Invalid stats file")
    entry = data.get(PLUGIN)
    if entry is None:
        return None
    return {
        **commit,
        "date": stamp(commit["published_at"]).date().isoformat(),
        "downloads": integer(entry["downloads"]),
        "updated": integer(entry["updated"]),
    }


def collect(old, token=None):
    changes = commits(old["cursor"], token)
    if not changes:
        return old
    daily = {}
    for commit in changes:
        key = stamp(commit["published_at"]).date().isoformat()
        if key not in daily or commit["published_at"] > daily[key]["published_at"]:
            daily[key] = commit
    points = {point["date"]: point for point in old["snapshots"]}
    # Fetch only the last publication per UTC day; discard full upstream files immediately.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for key, point in zip(daily, pool.map(snapshot, daily.values()), strict=True):
            points.pop(key, None)
            if point is not None:
                points[key] = point
    return {
        **old,
        "cursor": changes[0]["sha"],
        "snapshots": [points[key] for key in sorted(points)],
    }
