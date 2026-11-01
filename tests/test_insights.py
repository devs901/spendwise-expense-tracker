import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tracker import ExpenseTracker, connect, insights  # noqa: E402
from tracker.demo import seed_demo  # noqa: E402
from web import create_app  # noqa: E402


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


@pytest.fixture()
def t():
    conn = connect(":memory:")
    yield ExpenseTracker(conn)
    conn.close()


def test_keyword_suggestion():
    assert insights.suggest_category("Uber to office")["category"] == "Travel"
    assert insights.suggest_category("Netflix subscription")["category"] in ("Entertainment", "Bills")
    assert insights.suggest_category("xyz")["category"] is None
    assert insights.suggest_category("qwerty asdf")["source"] is None


def test_ai_fallback_and_success(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    calls = {}

    def fake(prompt, timeout=8):
        calls["n"] = calls.get("n", 0) + 1
        return "Health."
    monkeypatch.setattr(insights, "_gemini", fake)
    r = insights.suggest_category("qwerty asdf")
    assert r == {"category": "Health", "source": "ai"}
    monkeypatch.setattr(insights, "_gemini", lambda *a, **k: "Banana")  # invalid answer ignored
    assert insights.suggest_category("qwerty asdf")["category"] is None
    monkeypatch.setattr(insights, "_gemini", lambda *a, **k: None)  # AI failure
    assert insights.suggest_category("qwerty asdf")["category"] is None


def test_insights_cover_main_cases(t):
    seed_demo(t, today=date(2026, 10, 31))
    items = insights.generate_insights(t, "2026-10", today=date(2026, 10, 31))
    types = {i["type"] for i in items}
    assert {"top_category", "mom", "budget", "peak_day"} <= types
    unusual = [i for i in items if i["type"] == "unusual"]
    assert unusual and "9,499" in unusual[0]["text"]
    assert any(i["level"] == "bad" for i in items)  # an over-budget category exists


def test_projection_only_for_current_month(t):
    t.add_expense(1000, "food", "x", "2026-10-05")
    cur = insights.generate_insights(t, "2026-10", today=date(2026, 10, 10))
    assert any(i["type"] == "projection" for i in cur)
    old = insights.generate_insights(t, "2026-10", today=date(2026, 11, 20))
    assert not any(i["type"] == "projection" for i in old)


def test_empty_insights(t):
    assert insights.generate_insights(t) == []
    assert insights.ai_summary([], "2026-10", 0)["source"] == "none"


def test_summary_fallback_and_ai(t, monkeypatch):
    seed_demo(t, today=date(2026, 10, 31))
    items = insights.generate_insights(t, "2026-10", today=date(2026, 10, 31))
    s = insights.ai_summary(items, "2026-10", t.total("2026-10"))
    assert s["source"] == "rules" and "2026-10" in s["text"]
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setattr(insights, "_gemini", lambda *a, **k: "You did fine.")
    assert insights.ai_summary(items, "2026-10", 1)["source"] == "ai"


def test_web_endpoints(tmp_path):
    c = create_app(str(tmp_path / "w.db")).test_client()
    assert c.get("/api/meta").json["has_data"] is False
    assert c.post("/api/demo").status_code == 201
    assert c.post("/api/demo").status_code == 409  # only into an empty database
    meta = c.get("/api/meta").json
    assert meta["has_data"] and meta["default_month"] == meta["months"][-1]
    data = c.get(f"/api/insights?month={meta['default_month']}").json
    assert data["insights"] and data["summary"] and data["summary_source"] == "rules"
    assert c.get(f"/api/daily?month={meta['default_month']}").json
    assert c.get("/api/daily").status_code == 400
    assert c.get("/api/suggest-category?description=Zomato%20dinner").json["category"] == "Food"
