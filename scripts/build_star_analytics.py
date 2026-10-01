#!/usr/bin/env python3
"""Generate dashboard data offline from the committed aggregate files."""

from star_history.analytics import event_growth, summary
from star_history.model import DATA, ROOT, atomic_json, read_events, read_history


def main() -> None:
    history = read_history(DATA / "star-history.json")
    events = read_events(DATA / "events.json")
    result = {
        "history": history,
        "summary": summary(history["snapshots"]),
        "events": [
            {**event, "observed_change": event_growth(history["snapshots"], event["date"])}
            for event in reversed(events)
        ],
    }
    atomic_json(ROOT / "docs-site/.vitepress/generated/star-analytics.json", result)


if __name__ == "__main__":
    main()
