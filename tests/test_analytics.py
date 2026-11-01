import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tracker import ExpenseTracker, analytics, connect  # noqa: E402
from tracker.demo import seed_demo  # noqa: E402

TODAY = date(2026, 10, 31)  # a Saturday


@pytest.fixture()
def t():
    tracker = ExpenseTracker(connect(":memory:"))
    seed_demo(tracker, TODAY)
    yield tracker
    tracker.conn.close()


@pytest.mark.parametrize("text,amount,desc,cat,when", [
    ("450 uber to office yesterday", 450, "Uber to office", "Travel", "2026-10-30"),
    ("spent ₹1.5k on groceries", 1500, "Groceries", "Food", "2026-10-31"),
    ("rs 200 chai on 12th", 200, "Chai", "Food", "2026-10-12"),
    ("Netflix 199 2026-10-02", 199, "Netflix", "Entertainment", "2026-10-02"),
    ("3 days ago pizza 600 rupees", 600, "Pizza", "Food", "2026-10-28"),
    ("petrol 900 last friday", 900, "Petrol", "Travel", "2026-10-30"),
])
def test_parse_quick_add(text, amount, desc, cat, when):
    r = analytics.parse_quick_add(text, TODAY)
    assert (r["amount"], r["description"], r["category"], r["expense_date"]) == (amount, desc, cat, when)


def test_parse_without_amount():
    assert analytics.parse_quick_add("just a note", TODAY)["amount"] is None


def test_health_score_structure(t):
    h = analytics.health_score(t, "2026-10", TODAY)
    assert 0 <= h["score"] <= 100 and sum(f["points"] for f in h["factors"]) == h["score"]
    assert all(0 <= f["points"] <= f["max"] for f in h["factors"])
    assert analytics.health_score(ExpenseTracker(connect(":memory:")), "2026-10") is None


def test_health_score_rewards_good_behaviour():
    tr = ExpenseTracker(connect(":memory:"))
    for m, amt in (("2026-09", 1000), ("2026-10", 800)):
        for cat in ("food", "travel", "bills"):
            tr.add_expense(amt / 3, cat, "x", f"{m}-05")
    tr.set_budget("food", "2026-10", 1000)
    assert analytics.health_score(tr, "2026-10", TODAY)["label"] in ("Excellent", "Good")


def test_recurring_needs_similar_amounts(t):
    t.add_expense(199, "bills", "Spotify", "2026-08-05")
    t.add_expense(199, "bills", "Spotify", "2026-09-05")
    t.add_expense(50, "food", "Lunch", "2026-08-06")
    t.add_expense(400, "food", "Lunch", "2026-09-06")
    names = [i["description"] for i in analytics.recurring(t)["items"]]
    assert "Spotify" in names and "Lunch" not in names


def test_weekday_totals(t):
    w = analytics.weekday_totals(t, "2026-10")
    assert [d["day"] for d in w] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert round(sum(d["total"] for d in w), 2) == t.total("2026-10")


def test_ask_answers(t):
    a = lambda q: analytics.ask(t, q, "2026-10", TODAY)["answer"]  # noqa: E731
    assert "₹1,985" in a("how much did I spend on food last month")
    assert "Smartphone" in a("what is my biggest expense")
    assert "over budget" in a("am I over budget").lower()
    assert "+131.5%" in a("compare with last month")
    assert "Top categories" in a("top categories")
    assert "recurring" in a("show my subscriptions")
    assert "can answer" in a("what is the meaning of life")
    assert "no data" in analytics.ask(ExpenseTracker(connect(":memory:")), "total?")["answer"].lower()


def test_goals(t):
    gid = t.add_goal("Bike", 30000, "🚲", "2027-03-01", 5000)
    g = next(x for x in t.list_goals() if x["id"] == gid)
    assert g["percent"] == 16.7 and not g["completed"]
    assert t.contribute_to_goal(gid, 25000)["completed"] is True
    assert t.contribute_to_goal(gid, -99999)["saved_amount"] == 0
    assert t.contribute_to_goal(9999, 5) is None
    with pytest.raises(ValueError):
        t.add_goal("", 10)
    with pytest.raises(ValueError):
        t.add_goal("x", 0)
    with pytest.raises(ValueError):
        t.contribute_to_goal(gid, 0)
    assert t.delete_goal(gid) and not t.delete_goal(gid)
