"""GitHub aggregate endpoints only; never request stargazer identities."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .model import REPOSITORY, integer


class APIError(Exception):
    """Safe diagnostic without response bodies or credentials."""


def request_json(resource: str, token: str | None = None) -> object:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "read-only-view-star-history",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"https://api.github.com/repos/{REPOSITORY}/stargazers/{resource}", headers=headers
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        suffix = " (rate limit or access restriction)" if error.code in {403, 429} else ""
        raise APIError(f"GitHub HTTP {error.code}{suffix}; retry later") from None
    except (URLError, TimeoutError, OSError):
        raise APIError("GitHub network request failed; retry later") from None
    except (ValueError, UnicodeError):
        raise APIError("GitHub returned invalid JSON") from None


def fetch_history(token: str | None = None) -> list[object]:
    weeks: list[object] = []
    for page in range(1, 101):
        batch = request_json(f"history?per_page=30&page={page}", token)
        if not isinstance(batch, list) or len(batch) > 30:
            raise APIError("GitHub returned an invalid history page")
        weeks.extend(batch)
        if len(batch) < 30:
            return weeks
    raise APIError("History pagination limit reached; refusing an incomplete import")


def fetch_count(token: str | None = None) -> int:
    value = request_json("count", token)
    if not isinstance(value, dict) or set(value) != {"count"}:
        raise APIError("GitHub returned an invalid count")
    return integer(value["count"])
