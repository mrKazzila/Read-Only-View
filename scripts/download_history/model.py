"""Download snapshots, provenance validation and offline calculations."""

import re
from datetime import date, datetime, timedelta

from star_history.model import day, integer, read_json

SOURCE = "obsidianmd/obsidian-releases"
PLUGIN = "read-only-view"
SINCE = "2026-02-23T16:04:36Z"  # First public release, 1.0.1.


def stamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Expected UTC timestamp")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sha(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Invalid source SHA")
    return value


def empty():
    return {
        "schema_version": 1,
        "source": SOURCE,
        "plugin": PLUGIN,
        "since": SINCE,
        "cursor": None,
        "snapshots": [],
    }


def read_history(path):
    data = read_json(path)
    if (
        set(data) != set(empty())
        or data["schema_version"] != 1
        or data["source"] != SOURCE
        or data["plugin"] != PLUGIN
        or data["since"] != SINCE
    ):
        raise ValueError("Invalid download history")
    if data["cursor"] is not None:
        sha(data["cursor"])
    previous = ""
    for point in data["snapshots"]:
        day(point["date"])
        if (
            point["date"] <= previous
            or stamp(point["published_at"]).date().isoformat() != point["date"]
        ):
            raise ValueError("Snapshots must have unique ordered UTC dates")
        sha(point["sha"])
        integer(point["downloads"])
        integer(point["updated"])
        previous = point["date"]
    return data


def analytics(history):
    rows = []
    previous = None
    for point in history["snapshots"]:
        rows.append(
            {
                **point,
                "delta": None if previous is None else point["downloads"] - previous["downloads"],
                "from": None if previous is None else previous["date"],
            }
        )
        previous = point
    latest = rows[-1] if rows else None
    counts = {point["date"]: point["downloads"] for point in rows}

    def change(days):
        if latest is None:
            return None
        boundary = (date.fromisoformat(latest["date"]) - timedelta(days=days)).isoformat()
        return latest["downloads"] - counts[boundary] if boundary in counts else None

    return {
        "rows": rows,
        "total": latest["downloads"] if latest else None,
        "as_of": latest["date"] if latest else None,
        "last_7_days": change(7),
        "last_30_days": change(30),
    }
