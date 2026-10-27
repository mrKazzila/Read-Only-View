#!/usr/bin/env python3
"""Generate download dashboard input without network requests."""

from download_history.model import analytics, read_history
from star_history.model import DATA, ROOT, atomic_json

if __name__ == "__main__":
    atomic_json(
        ROOT / "docs-site/.vitepress/generated/download-analytics.json",
        analytics(read_history(DATA / "download-history.json")),
    )
