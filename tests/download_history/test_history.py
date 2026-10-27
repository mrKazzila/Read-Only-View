import json

import pytest
from download_history import collector
from download_history.model import analytics, empty, read_history
from star_history.model import atomic_json
from update_download_history import update


def commit(number, date="2026-03-01", hour="00"):
    return {"sha": f"{number:040x}", "published_at": f"{date}T{hour}:00:00Z"}


def point(number, date="2026-03-01", count=100):
    return {**commit(number, date), "date": date, "downloads": count, "updated": 123}


def api_commit(number):
    value = commit(number)
    return {"sha": value["sha"], "commit": {"committer": {"date": value["published_at"]}}}


def test_pagination_and_cursor(monkeypatch):
    pages = [list(map(api_commit, range(200, 100, -1))), [api_commit(100), api_commit(99)]]
    calls = []

    def request(url, token):
        calls.append(url)
        return pages.pop(0)

    monkeypatch.setattr(collector, "request", request)
    assert len(collector.commits(f"{99:040x}")) == 101
    assert "page=2" in calls[-1]


def test_missing_cursor_rejected(monkeypatch):
    monkeypatch.setattr(collector, "request", lambda *args: [])
    with pytest.raises(ValueError, match="cursor"):
        collector.commits(f"{1:040x}")


def test_last_publication_and_rerun(monkeypatch):
    changes = [commit(3, hour="20"), commit(2, hour="10"), commit(1, "2026-02-28")]
    monkeypatch.setattr(collector, "commits", lambda *args: changes)
    fetched = []

    def snapshot(value):
        fetched.append(value["sha"])
        return {**value, "date": value["published_at"][:10], "downloads": 10, "updated": 1}

    monkeypatch.setattr(collector, "snapshot", snapshot)
    result = collector.collect(empty())
    assert len(result["snapshots"]) == 2
    assert commit(2)["sha"] not in fetched
    assert result["cursor"] == commit(3)["sha"]
    monkeypatch.setattr(collector, "commits", lambda *args: [])
    assert collector.collect(result) == result


def test_missing_plugin_replaces_same_day_without_zero(monkeypatch):
    monkeypatch.setattr(collector, "request", lambda *args: {})
    assert collector.snapshot(commit(2)) is None
    monkeypatch.setattr(collector, "commits", lambda *args: [commit(2, hour="20")])
    old = {**empty(), "snapshots": [point(1)]}
    result = collector.collect(old)
    assert result["snapshots"] == []
    assert result["cursor"] == commit(2)["sha"]


def test_gaps_boundaries_and_corrections():
    history = {**empty(), "snapshots": [point(1), point(2, "2026-03-08", 90)]}
    result = analytics(history)
    assert result["last_7_days"] == -10
    assert result["last_30_days"] is None
    assert result["rows"][1]["from"] == "2026-03-01"
    assert result["rows"][1]["delta"] == -10
    assert result["rows"][0]["delta"] is None
    assert analytics(empty())["total"] is None
    assert analytics({**empty(), "snapshots": [point(1)]})["last_7_days"] is None


def test_failure_preserves_file(tmp_path, monkeypatch):
    path = tmp_path / "history.json"
    old = {**empty(), "cursor": commit(1)["sha"], "snapshots": [point(1)]}
    atomic_json(path, old)
    before = path.read_bytes()
    monkeypatch.setattr(collector, "commits", lambda *args: [commit(2)])

    def fail(*args):
        raise collector.APIError("rate limit")

    monkeypatch.setattr(collector, "snapshot", fail)
    with pytest.raises(collector.APIError):
        update(path)
    assert path.read_bytes() == before
    assert read_history(path) == old


def test_incremental_update_is_idempotent(tmp_path, monkeypatch):
    path = tmp_path / "history.json"
    with pytest.raises(ValueError, match="bootstrap"):
        update(path)
    monkeypatch.setattr(collector, "commits", lambda *args: [])
    update(path, bootstrap=True)
    modified = path.stat().st_mtime_ns
    update(path)
    assert path.stat().st_mtime_ns == modified
    assert json.loads(path.read_text()) == empty()


@pytest.mark.parametrize("count", [-1, True, "10"])
def test_invalid_source_counts_rejected(monkeypatch, count):
    monkeypatch.setattr(
        collector, "request", lambda *args: {"read-only-view": {"downloads": count, "updated": 1}}
    )
    with pytest.raises(ValueError):
        collector.snapshot(commit(1))
