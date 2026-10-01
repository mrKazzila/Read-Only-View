"""Validated, aggregate-only data and atomic persistence."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import TypedDict

REPOSITORY = "mrKazzila/Read-Only-View"
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs-site/public/data"
EVENT_TYPES = {"release", "forum", "youtube", "documentation", "other"}


class Point(TypedDict):
    date: str
    stars: int
    delta: int | None


class History(TypedDict):
    schema_version: int
    repository: str
    updated_at: str | None
    reconstructed: list[Point]
    snapshots: list[Point]


def integer(value: object) -> int:
    if type(value) is not int or value < 0:
        raise ValueError("Expected a non-negative integer")
    return value


def day(value: object) -> date:
    if not isinstance(value, str):
        raise ValueError("Expected an ISO date")
    result = date.fromisoformat(value)
    if result.isoformat() != value:
        raise ValueError("Expected YYYY-MM-DD")
    return result


def points(value: object) -> list[Point]:
    if not isinstance(value, list):
        raise ValueError("Expected a list of points")
    counts: dict[str, int] = {}
    for item in value:
        if not isinstance(item, dict) or set(item) != {"date", "stars", "delta"}:
            raise ValueError("Invalid point fields")
        key = day(item["date"]).isoformat()
        count = integer(item["stars"])
        if item["delta"] is not None and type(item["delta"]) is not int:
            raise ValueError("Invalid delta")
        if key in counts and counts[key] != count:
            raise ValueError("Conflicting duplicate date")
        counts[key] = count
    previous = None
    result: list[Point] = []
    for key, count in sorted(counts.items()):
        result.append(
            {"date": key, "stars": count, "delta": None if previous is None else count - previous}
        )
        previous = count
    return result


def reconstruct(weeks: object, today: date) -> list[Point]:
    if not isinstance(weeks, list):
        raise ValueError("Expected history weeks")
    by_week: dict[int, list[int]] = {}
    for item in weeks:
        if not isinstance(item, dict) or set(item) != {"week", "total", "days"}:
            raise ValueError("Invalid history week")
        stamp = integer(item["week"])
        days = item["days"]
        if not isinstance(days, list) or len(days) != 7:
            raise ValueError("Expected seven daily counts")
        counts = [integer(count) for count in days]
        if sum(counts) != integer(item["total"]):
            raise ValueError("Weekly total does not match daily counts")
        if stamp in by_week and by_week[stamp] != counts:
            raise ValueError("Conflicting duplicate week")
        by_week[stamp] = counts
    result: list[Point] = []
    total = 0
    previous_start = None
    for stamp, counts in sorted(by_week.items()):
        start = datetime.fromtimestamp(stamp, UTC).date()
        if previous_start is not None and (start - previous_start).days != 7:
            raise ValueError("History contains missing or overlapping weeks")
        previous_start = start
        for offset, count in enumerate(counts):
            current = start + timedelta(days=offset)
            if current > today:
                continue
            total += count
            result.append({"date": current.isoformat(), "stars": total, "delta": None})
    return points(result)


def empty_history() -> History:
    return {
        "schema_version": 1,
        "repository": REPOSITORY,
        "updated_at": None,
        "reconstructed": [],
        "snapshots": [],
    }


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def read_history(path: Path) -> History:
    if not path.exists():
        return empty_history()
    value = read_json(path)
    if not isinstance(value, dict) or set(value) != set(empty_history()):
        raise ValueError("Invalid history document")
    if type(value["schema_version"]) is not int or value["schema_version"] != 1:
        raise ValueError("Unsupported schema version")
    if value["repository"] != REPOSITORY:
        raise ValueError("Unexpected repository")
    updated = value["updated_at"]
    if updated is not None:
        if not isinstance(updated, str) or not updated.endswith("Z"):
            raise ValueError("Invalid updated_at")
        datetime.fromisoformat(updated.replace("Z", "+00:00"))
    return {
        "schema_version": 1,
        "repository": REPOSITORY,
        "updated_at": updated,
        "reconstructed": points(value["reconstructed"]),
        "snapshots": points(value["snapshots"]),
    }


def updated_history(old: History, weeks: object, count: int, now: datetime) -> History:
    today = now.astimezone(UTC).date()
    snapshots = [point for point in old["snapshots"] if point["date"] != today.isoformat()]
    if any(day(point["date"]) > today for point in snapshots):
        raise ValueError("Snapshot date is in the future")
    snapshots.append({"date": today.isoformat(), "stars": integer(count), "delta": None})
    result = empty_history()
    result["reconstructed"] = reconstruct(weeks, today)
    result["snapshots"] = points(snapshots)
    result["updated_at"] = old["updated_at"]
    if result != old:
        result["updated_at"] = (
            now.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
        )
    return result


def atomic_json(path: Path, value: object) -> bool:
    content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return True


def read_events(path: Path) -> list[dict[str, str]]:
    value = read_json(path)
    if not isinstance(value, list):
        raise ValueError("Expected an events array")
    result = []
    for event in value:
        if not isinstance(event, dict) or set(event) != {"date", "type", "title"}:
            raise ValueError("Invalid event fields")
        day(event["date"])
        if not isinstance(event["type"], str) or event["type"] not in EVENT_TYPES:
            raise ValueError("Invalid event type")
        if not isinstance(event["title"], str) or not event["title"].strip():
            raise ValueError("Event title is required")
        result.append(event)
    return sorted(result, key=lambda event: (event["date"], event["type"], event["title"]))
