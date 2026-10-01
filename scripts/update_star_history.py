#!/usr/bin/env python3
"""Import all available star history and update today's UTC total snapshot."""

import os
import sys
from datetime import UTC, datetime

from star_history.api import APIError, fetch_count, fetch_history
from star_history.model import DATA, atomic_json, read_history, updated_history


def main() -> int:
    try:
        path = DATA / "star-history.json"
        old = read_history(path)
        token = os.environ.get("GITHUB_TOKEN")
        weeks = fetch_history(token)
        count = fetch_count(token)
        result = updated_history(old, weeks, count, datetime.now(UTC))
        changed = atomic_json(path, result)
    except (APIError, ValueError, OSError, OverflowError):
        # Do not print exceptions: local paths and third-party errors may contain secrets.
        print(
            "Star history update failed: check network/rate limits and input JSON; "
            "previous data preserved.",
            file=sys.stderr,
        )
        return 1
    print("Star history updated." if changed else "Star history unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
