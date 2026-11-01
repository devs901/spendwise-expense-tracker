import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tracker import ExpenseTracker, connect  # noqa: E402


@pytest.fixture()
def t():
    conn = connect(":memory:")
    yield ExpenseTracker(conn)
    conn.close()


def test_add_and_list(t):
    eid = t.add_expense(250, " food ", "Lunch", "2026-10-05")
    rows = t.list_expenses()
    assert rows[0]["id"] == eid and rows[0]["category"] == "Food" and rows[0]["amount"] == 250


def test_validation(t):
    with pytest.raises(ValueError):
        t.add_expense(-5, "food")
    with pytest.raises(ValueError):
        t.add_expense(10, "food", expense_date="05-10-2026")
    with pytest.raises(ValueError):
        t.add_expense(10, "   ")


def test_update_and_delete(t):
    eid = t.add_expense(100, "travel", "Bus", "2026-10-01")
    assert t.update_expense(eid, amount=120, description="Auto") is True
    assert t.list_expenses()[0]["amount"] == 120
    assert t.delete_expense(eid) is True
    assert t.delete_expense(eid) is False


def test_filters(t):
    t.add_expense(100, "food", "", "2026-09-10")
    t.add_expense(200, "food", "", "2026-10-10")
    t.add_expense(50, "travel", "", "2026-10-11")
    assert len(t.list_expenses(month="2026-10")) == 2
    assert len(t.list_expenses(category="Food")) == 2
    assert t.total("2026-10") == 250


def test_summary_and_monthly(t):
    t.add_expense(100, "food", "", "2026-09-10")
    t.add_expense(300, "food", "", "2026-10-10")
    t.add_expense(100, "travel", "", "2026-10-11")
    s = t.summary_by_category("2026-10")
    assert s[0]["category"] == "Food" and s[0]["total"] == 300 and s[0]["percent"] == 75.0
    m = t.monthly_totals()
    assert [r["month"] for r in m] == ["2026-09", "2026-10"]
    assert m[0]["change_pct"] is None and m[1]["change_pct"] == 300.0


def test_budget_status(t):
    t.add_expense(600, "food", "", "2026-10-02")
    t.add_expense(100, "travel", "", "2026-10-03")
    t.add_expense(900, "food", "", "2026-11-02")  # different month, must not count
    t.set_budget("food", "2026-10", 500)
    t.set_budget("travel", "2026-10", 300)
    t.set_budget("food", "2026-10", 550)  # update, not duplicate
    st = {r["category"]: r for r in t.budget_status("2026-10")}
    assert st["Food"]["budget"] == 550 and st["Food"]["spent"] == 600 and st["Food"]["over_budget"]
    assert st["Travel"]["remaining"] == 200 and not st["Travel"]["over_budget"]


def test_top_and_export(t, tmp_path):
    t.add_expense(10, "a", "", "2026-10-01")
    t.add_expense(90, "b", "", "2026-10-02")
    assert t.top_expenses(1)[0]["amount"] == 90
    out = tmp_path / "out.csv"
    assert t.export_csv(str(out)) == 2
    assert out.read_text().splitlines()[0] == "id,expense_date,category,amount,description"


def test_categories_get_and_csv_text(t):
    eid = t.add_expense(40, "tea", "Chai", "2026-10-05")
    t.add_expense(90, "bus", "Ticket", "2026-10-06")
    assert t.categories() == ["Bus", "Tea"]
    assert t.get_expense(eid)["description"] == "Chai" and t.get_expense(999) is None
    text = t.export_csv_text("2026-10")
    assert text.splitlines()[0] == "id,expense_date,category,amount,description" and "Chai" in text
