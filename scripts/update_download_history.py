#!/usr/bin/env python3
"""Import once with --bootstrap; subsequent runs only collect new publications."""

import argparse
import os
import sys

from download_history.collector import APIError, collect
from download_history.model import empty, read_history
from star_history.model import DATA, atomic_json


def update(path, bootstrap=False):
    if path.exists():
        old = read_history(path)
    elif bootstrap:
        old = empty()
    else:
        raise ValueError("Missing history; first run requires --bootstrap")
    result = collect(old, os.environ.get("GITHUB_TOKEN"))
    atomic_json(path, result)
    return len(result["snapshots"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bootstrap", action="store_true")
    args = parser.parse_args()
    try:
        count = update(DATA / "download-history.json", args.bootstrap)
        print(f"Download history: {count} daily observations")
    except (APIError, ValueError, OSError, KeyError, TypeError) as error:
        print(f"Download history update failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
