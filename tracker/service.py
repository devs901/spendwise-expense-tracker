"""Business logic for the expense tracker (OOP + SQL)."""
import csv
import sqlite3
from datetime import date, datetime


def _check_date(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        raise ValueError(f"Invalid date '{value}'. Use YYYY-MM-DD.")
    return value


def _check_month(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m")
    except (TypeError, ValueError):
        raise ValueError(f"Invalid month '{value}'. Use YYYY-MM.")
    return value


def _clean_category(name: str) -> str:
    name = (name or "").strip().title()
    if not name:
        raise ValueError("Category cannot be empty.")
    return name


class ExpenseTracker:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # ---------- helpers ----------
    def _category_id(self, name: str, create: bool = True):
        name = _clean_category(name)
        row = self.conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
        if row:
            return row["id"]
        if not create:
            return None
        cur = self.conn.execute("INSERT INTO categories(name) VALUES (?)", (name,))
        return cur.lastrowid

    # ---------- CRUD ----------
    def add_expense(self, amount: float, category: str, description: str = "",
                    expense_date: str = None) -> int:
        amount = float(amount)
        if amount <= 0:
            raise ValueError("Amount must be greater than 0.")
        expense_date = _check_date(expense_date or date.today().isoformat())
        cat_id = self._category_id(category)
        cur = self.conn.execute(
            "INSERT INTO expenses(amount, category_id, description, expense_date) VALUES (?,?,?,?)",
            (amount, cat_id, description.strip(), expense_date))
        self.conn.commit()
        return cur.lastrowid

    def list_expenses(self, month: str = None, category: str = None, limit: int = None):
        sql = ("SELECT e.id, e.expense_date, c.name AS category, e.amount, e.description "
               "FROM expenses e JOIN categories c ON c.id = e.category_id WHERE 1=1")
        params = []
        if month:
            sql += " AND substr(e.expense_date, 1, 7) = ?"
            params.append(_check_month(month))
        if category:
            sql += " AND c.name = ?"
            params.append(_clean_category(category))
        sql += " ORDER BY e.expense_date DESC, e.id DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(int(limit))
        return [dict(r) for r in self.conn.execute(sql, params)]

    def update_expense(self, expense_id: int, amount: float = None, category: str = None,
                       description: str = None, expense_date: str = None) -> bool:
        fields, params = [], []
        if amount is not None:
            if float(amount) <= 0:
                raise ValueError("Amount must be greater than 0.")
            fields.append("amount = ?"); params.append(float(amount))
        if category is not None:
            fields.append("category_id = ?"); params.append(self._category_id(category))
        if description is not None:
            fields.append("description = ?"); params.append(description.strip())
        if expense_date is not None:
            fields.append("expense_date = ?"); params.append(_check_date(expense_date))
        if not fields:
            raise ValueError("Nothing to update.")
        params.append(expense_id)
        cur = self.conn.execute(f"UPDATE expenses SET {', '.join(fields)} WHERE id = ?", params)
        self.conn.commit()
        return cur.rowcount > 0

    def delete_expense(self, expense_id: int) -> bool:
        cur = self.conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ---------- reports (SQL aggregation) ----------
    def summary_by_category(self, month: str = None):
        sql = ("SELECT c.name AS category, COUNT(*) AS count, ROUND(SUM(e.amount), 2) AS total, "
               "ROUND(100.0 * SUM(e.amount) / (SELECT SUM(amount) FROM expenses x "
               "WHERE (? IS NULL OR substr(x.expense_date,1,7) = ?)), 1) AS percent "
               "FROM expenses e JOIN categories c ON c.id = e.category_id "
               "WHERE (? IS NULL OR substr(e.expense_date,1,7) = ?) "
               "GROUP BY c.name ORDER BY total DESC")
        m = _check_month(month) if month else None
        return [dict(r) for r in self.conn.execute(sql, (m, m, m, m))]

    def monthly_totals(self):
        """Total per month with change versus the previous month (window function)."""
        sql = ("WITH m AS (SELECT substr(expense_date,1,7) AS month, SUM(amount) AS total "
               "FROM expenses GROUP BY month) "
               "SELECT month, ROUND(total, 2) AS total, "
               "ROUND(100.0 * (total - LAG(total) OVER (ORDER BY month)) "
               "/ LAG(total) OVER (ORDER BY month), 1) AS change_pct "
               "FROM m ORDER BY month")
        return [dict(r) for r in self.conn.execute(sql)]

    def daily_totals(self, month: str):
        sql = ("SELECT expense_date AS day, ROUND(SUM(amount), 2) AS total FROM expenses "
               "WHERE substr(expense_date, 1, 7) = ? GROUP BY expense_date ORDER BY expense_date")
        return [dict(r) for r in self.conn.execute(sql, (_check_month(month),))]

    def categories(self):
        """All category names, alphabetically."""
        return [r["name"] for r in self.conn.execute("SELECT name FROM categories ORDER BY name")]

    def get_expense(self, expense_id: int):
        row = self.conn.execute(
            "SELECT e.id, e.expense_date, c.name AS category, e.amount, e.description "
            "FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.id = ?",
            (expense_id,)).fetchone()
        return dict(row) if row else None

    def is_empty(self) -> bool:
        return self.conn.execute("SELECT COUNT(*) AS n FROM expenses").fetchone()["n"] == 0

    def top_expenses(self, n: int = 5, month: str = None):
        rows = self.list_expenses(month=month)
        return sorted(rows, key=lambda r: r["amount"], reverse=True)[:n]

    def total(self, month: str = None) -> float:
        sql = "SELECT COALESCE(SUM(amount), 0) AS t FROM expenses"
        params = []
        if month:
            sql += " WHERE substr(expense_date,1,7) = ?"
            params.append(_check_month(month))
        return round(self.conn.execute(sql, params).fetchone()["t"], 2)

    # ---------- budgets ----------
    def set_budget(self, category: str, month: str, limit_amount: float) -> None:
        if float(limit_amount) <= 0:
            raise ValueError("Budget must be greater than 0.")
        cat_id = self._category_id(category)
        self.conn.execute(
            "INSERT INTO budgets(category_id, month, limit_amount) VALUES (?,?,?) "
            "ON CONFLICT(category_id, month) DO UPDATE SET limit_amount = excluded.limit_amount",
            (cat_id, _check_month(month), float(limit_amount)))
        self.conn.commit()

    def budget_status(self, month: str):
        month = _check_month(month)
        sql = ("SELECT c.name AS category, b.limit_amount AS budget, "
               "ROUND(COALESCE(SUM(e.amount), 0), 2) AS spent "
               "FROM budgets b JOIN categories c ON c.id = b.category_id "
               "LEFT JOIN expenses e ON e.category_id = b.category_id "
               "AND substr(e.expense_date,1,7) = b.month "
               "WHERE b.month = ? GROUP BY c.name, b.limit_amount ORDER BY c.name")
        out = []
        for r in self.conn.execute(sql, (month,)):
            d = dict(r)
            d["remaining"] = round(d["budget"] - d["spent"], 2)
            d["over_budget"] = d["spent"] > d["budget"]
            out.append(d)
        return out

    # ---------- savings goals ----------
    def add_goal(self, name: str, target_amount: float, emoji: str = "🎯",
                 deadline: str = None, saved_amount: float = 0) -> int:
        name = (name or "").strip()
        if not name:
            raise ValueError("Goal name cannot be empty.")
        if float(target_amount) <= 0:
            raise ValueError("Target must be greater than 0.")
        if float(saved_amount) < 0:
            raise ValueError("Saved amount cannot be negative.")
        if deadline:
            _check_date(deadline)
        cur = self.conn.execute(
            "INSERT INTO goals(name, emoji, target_amount, saved_amount, deadline) VALUES (?,?,?,?,?)",
            (name, (emoji or "🎯").strip() or "🎯", float(target_amount), float(saved_amount), deadline or None))
        self.conn.commit()
        return cur.lastrowid

    def list_goals(self):
        rows = self.conn.execute("SELECT * FROM goals ORDER BY (saved_amount >= target_amount), id").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["percent"] = round(min(d["saved_amount"] / d["target_amount"] * 100, 100), 1)
            d["completed"] = d["saved_amount"] >= d["target_amount"]
            out.append(d)
        return out

    def contribute_to_goal(self, goal_id: int, amount: float):
        """Add (or, with a negative amount, withdraw) money. Returns the updated goal or None."""
        amount = float(amount)
        if amount == 0:
            raise ValueError("Amount cannot be zero.")
        row = self.conn.execute("SELECT saved_amount FROM goals WHERE id = ?", (goal_id,)).fetchone()
        if not row:
            return None
        new_total = max(row["saved_amount"] + amount, 0)
        self.conn.execute("UPDATE goals SET saved_amount = ? WHERE id = ?", (new_total, goal_id))
        self.conn.commit()
        return next(g for g in self.list_goals() if g["id"] == goal_id)

    def delete_goal(self, goal_id: int) -> bool:
        cur = self.conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ---------- export ----------
    CSV_FIELDS = ["id", "expense_date", "category", "amount", "description"]

    def export_csv(self, path: str, month: str = None) -> int:
        rows = self.list_expenses(month=month)
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=self.CSV_FIELDS)
            w.writeheader()
            w.writerows(rows)
        return len(rows)

    def export_csv_text(self, month: str = None) -> str:
        """Same CSV as export_csv, returned as a string (used by the web download)."""
        import io
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=self.CSV_FIELDS)
        w.writeheader()
        w.writerows(self.list_expenses(month=month))
        return buf.getvalue()
