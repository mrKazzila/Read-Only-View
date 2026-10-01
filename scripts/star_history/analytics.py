"""Observed changes in daily total snapshots, without interpolation or attribution."""

from datetime import timedelta

from .model import Point, day, points


def current_stars(history: list[Point]) -> int | None:
    ordered = points(history)
    return ordered[-1]["stars"] if ordered else None


def change_between(history: list[Point], start: str, end: str) -> int | None:
    counts = {point["date"]: point["stars"] for point in points(history)}
    if start not in counts or end not in counts:
        return None
    return counts[end] - counts[start]


def growth(history: list[Point], days: int) -> int | None:
    if days <= 0:
        raise ValueError("Window must be positive")
    ordered = points(history)
    if not ordered:
        return None
    end = day(ordered[-1]["date"])
    return change_between(ordered, (end - timedelta(days=days)).isoformat(), end.isoformat())


def average_daily_growth(history: list[Point]) -> float | None:
    ordered = points(history)
    if len(ordered) < 2:
        return None
    elapsed = (day(ordered[-1]["date"]) - day(ordered[0]["date"])).days
    return (ordered[-1]["stars"] - ordered[0]["stars"]) / elapsed


def best_growth_day(history: list[Point]) -> Point | None:
    ordered = points(history)
    candidates = [
        after
        for before, after in zip(ordered, ordered[1:])
        if (day(after["date"]) - day(before["date"])).days == 1
    ]
    return max(candidates, key=lambda point: point["delta"] or 0, default=None)


def event_growth(history: list[Point], event_date: str) -> int | None:
    event = day(event_date)
    return change_between(
        history, (event - timedelta(days=2)).isoformat(), (event + timedelta(days=1)).isoformat()
    )


def summary(history: list[Point]) -> dict[str, object]:
    ordered = points(history)
    return {
        "current_stars": current_stars(ordered),
        "last_7_days": growth(ordered, 7),
        "last_30_days": growth(ordered, 30),
        "average_daily_growth": average_daily_growth(ordered),
        "best_growth_day": best_growth_day(ordered),
        "as_of": ordered[-1]["date"] if ordered else None,
    }
