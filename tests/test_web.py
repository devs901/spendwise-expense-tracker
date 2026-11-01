import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from web import create_app  # noqa: E402


@pytest.fixture()
def client(tmp_path):
    return create_app(str(tmp_path / "test.db")).test_client()


def test_home_page_served(client):
    r = client.get("/")
    assert r.status_code == 200 and b"Expense Tracker" in r.data


def test_add_list_delete(client):
    r = client.post("/api/expenses", json={"amount": 250, "category": "food",
                                           "description": "Lunch", "expense_date": "2026-10-02"})
    assert r.status_code == 201
    rows = client.get("/api/expenses?month=2026-10").json
    assert len(rows) == 1 and rows[0]["category"] == "Food"
    assert client.delete(f"/api/expenses/{r.json['id']}").status_code == 200
    assert client.delete(f"/api/expenses/{r.json['id']}").status_code == 404


def test_validation_errors(client):
    assert client.post("/api/expenses", json={"amount": -1, "category": "x"}).status_code == 400
    assert client.post("/api/expenses", json={"amount": "abc", "category": "x"}).status_code == 400
    assert client.post("/api/expenses", json={"amount": 5, "category": "x", "expense_date": "bad"}).status_code == 400


def test_summary_monthly_budget(client):
    for amt, cat, d in [(600, "food", "2026-10-02"), (100, "travel", "2026-10-03"), (300, "food", "2026-09-02")]:
        client.post("/api/expenses", json={"amount": amt, "category": cat, "expense_date": d})
    s = client.get("/api/summary?month=2026-10").json
    assert s["total"] == 700 and s["categories"][0]["category"] == "Food"
    assert [m["month"] for m in client.get("/api/monthly").json] == ["2026-09", "2026-10"]
    assert client.post("/api/budgets", json={"category": "food", "month": "2026-10", "limit": 500}).status_code == 201
    b = client.get("/api/budgets/2026-10").json
    assert b[0]["over_budget"] is True and b[0]["remaining"] == -100


def test_update_expense(client):
    eid = client.post("/api/expenses", json={"amount": 100, "category": "food", "description": "Tea",
                                              "expense_date": "2026-10-02"}).json["id"]
    r = client.put(f"/api/expenses/{eid}", json={"amount": "150", "category": "travel", "description": "Bus"})
    assert r.status_code == 200
    assert r.json["amount"] == 150 and r.json["category"] == "Travel" and r.json["description"] == "Bus"
    assert client.put(f"/api/expenses/{eid}", json={"amount": -5}).status_code == 400
    assert client.put(f"/api/expenses/{eid}", json={"amount": "abc"}).status_code == 400
    assert client.put(f"/api/expenses/{eid}", json={}).status_code == 400
    assert client.put("/api/expenses/9999", json={"amount": 5}).status_code == 404


def test_categories_and_export(client):
    for cat in ("food", "travel"):
        client.post("/api/expenses", json={"amount": 10, "category": cat, "description": "x, y",
                                           "expense_date": "2026-10-02"})
    assert client.get("/api/categories").json == ["Food", "Travel"]
    r = client.get("/api/export?month=2026-10")
    assert r.status_code == 200 and r.mimetype == "text/csv"
    assert "attachment" in r.headers["Content-Disposition"]
    lines = r.data.decode().strip().splitlines()
    assert lines[0] == "id,expense_date,category,amount,description" and len(lines) == 3
    assert client.get("/api/export?month=bad").status_code == 400


def test_demo_only_when_empty(client):
    assert client.post("/api/demo").status_code == 201
    assert client.post("/api/demo").status_code == 409
    assert client.get("/api/meta").json["has_data"] is True


def test_analytics_parse_ask_goals(client):
    assert client.post("/api/demo").status_code == 201
    a = client.get("/api/analytics").json
    assert a["health"]["score"] >= 0 and len(a["weekdays"]) == 7
    p = client.get("/api/parse", query_string={"text": "250 swiggy dinner yesterday"}).json
    assert p["amount"] == 250 and p["category"] == "Food"
    assert "answer" in client.post("/api/ask", json={"question": "top categories"}).json
    goals = client.get("/api/goals").json
    assert len(goals) == 3
    gid = client.post("/api/goals", json={"name": "Bike", "target_amount": 1000, "emoji": "🚲"}).json["id"]
    assert client.post(f"/api/goals/{gid}/contribute", json={"amount": 400}).json["percent"] == 40
    assert client.post(f"/api/goals/{gid}/contribute", json={"amount": "x"}).status_code == 400
    assert client.post("/api/goals/9999/contribute", json={"amount": 5}).status_code == 404
    assert client.post("/api/goals", json={"name": "", "target_amount": 5}).status_code == 400
    assert client.delete(f"/api/goals/{gid}").status_code == 200
    assert client.delete(f"/api/goals/{gid}").status_code == 404
