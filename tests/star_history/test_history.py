import io
import json
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import pytest
import update_star_history
from star_history import api
from star_history.analytics import (
    average_daily_growth,
    best_growth_day,
    event_growth,
    growth,
    summary,
)
from star_history.model import (
    atomic_json,
    empty_history,
    points,
    read_events,
    read_history,
    reconstruct,
    updated_history,
)


def point(day, stars):
    return {"date": day, "stars": stars, "delta": None}


def week(start="2026-09-20", counts=None):
    counts = [1, 0, 2, 0, 0, 0, 0] if counts is None else counts
    return {
        "week": int(datetime.fromisoformat(start).replace(tzinfo=UTC).timestamp()),
        "total": sum(counts),
        "days": counts,
    }


def test_delta_sort_duplicates_first():
    assert points([point("2026-09-22", 3), point("2026-09-20", 5), point("2026-09-20", 5)]) == [
        {"date": "2026-09-20", "stars": 5, "delta": None},
        {"date": "2026-09-22", "stars": 3, "delta": -2},
    ]
    with pytest.raises(ValueError):
        points([point("2026-09-20", 1), point("2026-09-20", 2)])


@pytest.mark.parametrize("value", [-1, True, 1.5, "1"])
def test_invalid_counts(value):
    with pytest.raises(ValueError):
        points([point("2026-09-20", value)])


def test_reconstruct_cumulative_and_future():
    result = reconstruct([week()], date(2026, 9, 22))
    assert result == [
        point("2026-09-20", 1),
        {"date": "2026-09-21", "stars": 1, "delta": 0},
        {"date": "2026-09-22", "stars": 3, "delta": 2},
    ]
    assert reconstruct([], date(2026, 9, 22)) == []


def test_reconstruct_sort_duplicates_and_gap():
    first = week()
    second = week("2026-09-27")
    assert reconstruct([second, first, first], date(2026, 10, 1)) == reconstruct(
        [first, second], date(2026, 10, 1)
    )
    for invalid in [
        [first, week(counts=[0] * 7)],
        [first, week("2026-10-04")],
        [{**first, "total": 99}],
        [{**first, "days": [1]}],
    ]:
        with pytest.raises(ValueError):
            reconstruct(invalid, date(2026, 10, 1))


def test_daily_update_idempotence_and_replacement(tmp_path):
    now = datetime(2026, 9, 23, tzinfo=UTC)
    first = updated_history(empty_history(), [week()], 4, now)
    assert first["snapshots"] == [point("2026-09-23", 4)]
    assert updated_history(first, [week()], 4, now + timedelta(hours=1)) == first
    changed = updated_history(first, [week()], 3, now + timedelta(hours=1))
    assert len(changed["snapshots"]) == 1
    assert changed["snapshots"][0]["stars"] == 3
    tomorrow = updated_history(changed, [week()], 5, now + timedelta(days=1))
    assert tomorrow["snapshots"][-1]["delta"] == 2
    path = tmp_path / "history.json"
    assert atomic_json(path, first)
    before = path.stat().st_mtime_ns
    assert not atomic_json(path, first)
    assert path.stat().st_mtime_ns == before
    assert read_history(path) == first


def test_windows_gaps_average_best_and_event():
    history = [
        point((date(2026, 9, 1) + timedelta(days=index)).isoformat(), index * 2)
        for index in range(31)
    ]
    assert growth(list(reversed(history)), 7) == 14
    assert growth(history, 30) == 60
    assert average_daily_growth(history) == 2
    assert best_growth_day(history)["date"] == "2026-09-02"
    assert event_growth(history, "2026-09-15") == 6
    assert event_growth(history, "2026-09-01") is None
    assert growth([history[0], history[-1]], 30) == 60
    assert growth([history[0], history[-1]], 7) is None
    assert best_growth_day([history[0], history[-1]]) is None
    assert average_daily_growth([history[0], history[-1]]) == 2
    assert growth([history[-1]], 7) is None
    assert event_growth([history[0], history[-1]], "2026-09-15") is None


def test_empty_and_negative():
    assert summary([]) == {
        "current_stars": None,
        "last_7_days": None,
        "last_30_days": None,
        "average_daily_growth": None,
        "best_growth_day": None,
        "as_of": None,
    }
    assert average_daily_growth([point("2026-09-01", 3)]) is None
    negative = [point("2026-09-01", 5), point("2026-09-02", 3)]
    assert best_growth_day(negative)["delta"] == -2
    assert average_daily_growth(negative) == -2
    with pytest.raises(ValueError):
        growth(negative, 0)


def test_pagination_and_limit():
    with patch.object(api, "request_json", side_effect=[[week()] * 30, [week()]]) as request:
        assert len(api.fetch_history()) == 31
        assert request.call_args.args[0] == "history?per_page=30&page=2"
    with patch.object(api, "request_json", return_value=[week()] * 30):
        with pytest.raises(api.APIError, match="incomplete"):
            api.fetch_history()
    with patch.object(api, "request_json", return_value={}):
        with pytest.raises(api.APIError):
            api.fetch_history()
    with patch.object(api, "request_json", return_value={"count": 4}):
        assert api.fetch_count() == 4
    with patch.object(api, "request_json", return_value={"count": True}):
        with pytest.raises(ValueError):
            api.fetch_count()


@pytest.mark.parametrize(
    "error",
    [
        HTTPError("url", 429, "secret-value", {}, None),
        HTTPError("url", 403, "secret-value", {}, None),
        HTTPError("url", 500, "secret-value", {}, None),
        URLError("secret-value"),
        TimeoutError("secret-value"),
    ],
)
def test_api_errors_redact_token(error):
    with patch.object(api, "urlopen", side_effect=error):
        with pytest.raises(api.APIError) as caught:
            api.request_json("count", "secret-value")
    assert "secret-value" not in str(caught.value)


def test_request_headers_and_invalid_json():
    with patch.object(api, "urlopen", return_value=io.BytesIO(b'{"count": 4}')) as opener:
        assert api.request_json("count") == {"count": 4}
        request = opener.call_args.args[0]
        assert request.full_url.endswith("/stargazers/count")
        assert not request.has_header("Authorization")
    with patch.object(api, "urlopen", return_value=io.BytesIO(b"bad-json")):
        with pytest.raises(api.APIError):
            api.request_json("count")
    with patch.object(api, "urlopen", return_value=io.BytesIO(b"{}")) as opener:
        api.request_json("count", "test-token")
        assert opener.call_args.args[0].get_header("Authorization") == "Bearer test-token"


def test_atomic_failure_preserves_file(tmp_path):
    path = tmp_path / "history.json"
    atomic_json(path, empty_history())
    original = path.read_bytes()
    with patch("star_history.model.os.replace", side_effect=OSError("failure")):
        with pytest.raises(OSError):
            atomic_json(path, {"different": True})
    assert path.read_bytes() == original
    assert list(tmp_path.iterdir()) == [path]


@pytest.mark.parametrize("body", ["{", "{}", '{"schema_version": 9}'])
def test_malformed_stored_json(tmp_path, body):
    path = tmp_path / "history.json"
    path.write_text(body)
    with pytest.raises(ValueError):
        read_history(path)


def test_cli_failure_does_not_write_or_leak(tmp_path, capsys):
    path = tmp_path / "star-history.json"
    atomic_json(path, empty_history())
    before = path.read_bytes()
    with (
        patch.object(update_star_history, "DATA", tmp_path),
        patch.object(
            update_star_history, "fetch_history", side_effect=api.APIError("secret-value")
        ),
    ):
        assert update_star_history.main() == 1
    assert path.read_bytes() == before
    assert "secret-value" not in capsys.readouterr().err


def test_events(tmp_path):
    path = tmp_path / "events.json"
    path.write_text("[]")
    assert read_events(path) == []
    event = {"date": "2026-09-20", "type": "other", "title": "Synthetic test event"}
    path.write_text(json.dumps([event]))
    assert read_events(path) == [event]
    for invalid in [
        {**event, "type": "tracking"},
        {**event, "title": " "},
        {**event, "date": "2026-02-30"},
        {**event, "url": "extra"},
    ]:
        path.write_text(json.dumps([invalid]))
        with pytest.raises(ValueError):
            read_events(path)
