"""Web interface for the Expense Tracker.

Run:  python web.py     then open http://localhost:5000
"""
import os
from functools import wraps

from flask import Flask, Response, jsonify, request, send_from_directory

from tracker import ExpenseTracker, connect
from tracker import analytics, insights
from tracker.demo import seed_demo


def create_app(db_path: str = None):
    app = Flask(__name__)
    path = db_path or os.environ.get("EXPENSE_DB", "expenses.db")
    connect(path).close()  # make sure tables exist

    def with_tracker(fn):
        """Open a database connection for the request and close it afterwards."""
        @wraps(fn)
        def wrapper(*args, **kwargs):
            conn = connect(path)
            try:
                return fn(ExpenseTracker(conn), *args, **kwargs)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            finally:
                conn.close()
        return wrapper

    @app.get("/")
    def home():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/api/expenses")
    @with_tracker
    def list_expenses(t):
        rows = t.list_expenses(month=request.args.get("month") or None,
                               category=request.args.get("category") or None)
        return jsonify(rows)

    @app.post("/api/expenses")
    @with_tracker
    def add_expense(t):
        d = request.get_json(silent=True) or {}
        try:
            amount = float(d.get("amount"))
        except (TypeError, ValueError):
            raise ValueError("Amount must be a number.")
        eid = t.add_expense(amount, d.get("category"), d.get("description", ""),
                            d.get("expense_date") or None)
        return jsonify({"id": eid}), 201

    @app.put("/api/expenses/<int:eid>")
    @with_tracker
    def update_expense(t, eid):
        d = request.get_json(silent=True) or {}
        amount = d.get("amount")
        if amount is not None:
            try:
                amount = float(amount)
            except (TypeError, ValueError):
                raise ValueError("Amount must be a number.")
        if not t.update_expense(eid, amount, d.get("category"), d.get("description"),
                                d.get("expense_date")):
            return jsonify({"error": "Expense not found"}), 404
        return jsonify(t.get_expense(eid))

    @app.delete("/api/expenses/<int:eid>")
    @with_tracker
    def delete_expense(t, eid):
        if not t.delete_expense(eid):
            return jsonify({"error": "Expense not found"}), 404
        return jsonify({"deleted": eid})

    @app.get("/api/categories")
    @with_tracker
    def categories(t):
        return jsonify(t.categories())

    @app.get("/api/export")
    @with_tracker
    def export(t):
        month = request.args.get("month") or None
        name = f"expenses-{month}.csv" if month else "expenses-all.csv"
        return Response(t.export_csv_text(month), mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={name}"})

    @app.get("/api/summary")
    @with_tracker
    def summary(t):
        month = request.args.get("month") or None
        return jsonify({"categories": t.summary_by_category(month), "total": t.total(month)})

    @app.get("/api/monthly")
    @with_tracker
    def monthly(t):
        return jsonify(t.monthly_totals())

    @app.get("/api/daily")
    @with_tracker
    def daily(t):
        month = request.args.get("month")
        if not month:
            raise ValueError("month is required (YYYY-MM)")
        return jsonify(t.daily_totals(month))

    @app.get("/api/meta")
    @with_tracker
    def meta(t):
        months = [m["month"] for m in t.monthly_totals()]
        return jsonify({"has_data": not t.is_empty(), "months": months,
                        "default_month": months[-1] if months else None,
                        "ai_enabled": insights.ai_enabled()})

    @app.get("/api/suggest-category")
    def suggest_category():
        return jsonify(insights.suggest_category(request.args.get("description", "")))

    @app.get("/api/insights")
    @with_tracker
    def get_insights(t):
        month = request.args.get("month") or insights.latest_month(t)
        items = insights.generate_insights(t, month)
        summary = insights.ai_summary(items, month, t.total(month)) if month else \
            {"text": "Add a few expenses to see your personalised summary.", "source": "none"}
        return jsonify({"month": month, "insights": items, "summary": summary["text"],
                        "summary_source": summary["source"]})

    @app.get("/api/analytics")
    @with_tracker
    def get_analytics(t):
        month = request.args.get("month") or insights.latest_month(t)
        if not month:
            return jsonify({"health": None, "weekdays": [], "recurring": {"items": [], "monthly_total": 0}})
        return jsonify({"health": analytics.health_score(t, month),
                        "weekdays": analytics.weekday_totals(t, month),
                        "recurring": analytics.recurring(t)})

    @app.get("/api/parse")
    def parse_quick_add():
        return jsonify(analytics.parse_quick_add(request.args.get("text", "")))

    @app.post("/api/ask")
    @with_tracker
    def ask(t):
        d = request.get_json(silent=True) or {}
        return jsonify(analytics.ask(t, d.get("question", ""), d.get("month") or None))

    @app.get("/api/goals")
    @with_tracker
    def list_goals(t):
        return jsonify(t.list_goals())

    @app.post("/api/goals")
    @with_tracker
    def add_goal(t):
        d = request.get_json(silent=True) or {}
        try:
            target = float(d.get("target_amount"))
            saved = float(d.get("saved_amount") or 0)
        except (TypeError, ValueError):
            raise ValueError("Target and saved amounts must be numbers.")
        gid = t.add_goal(d.get("name"), target, d.get("emoji") or "🎯", d.get("deadline") or None, saved)
        return jsonify({"id": gid}), 201

    @app.post("/api/goals/<int:gid>/contribute")
    @with_tracker
    def contribute(t, gid):
        d = request.get_json(silent=True) or {}
        try:
            amount = float(d.get("amount"))
        except (TypeError, ValueError):
            raise ValueError("Amount must be a number.")
        goal = t.contribute_to_goal(gid, amount)
        if goal is None:
            return jsonify({"error": "Goal not found"}), 404
        return jsonify(goal)

    @app.delete("/api/goals/<int:gid>")
    @with_tracker
    def delete_goal(t, gid):
        if not t.delete_goal(gid):
            return jsonify({"error": "Goal not found"}), 404
        return jsonify({"deleted": gid})

    @app.post("/api/demo")
    @with_tracker
    def load_demo(t):
        if not t.is_empty():
            return jsonify({"error": "Demo data can only be loaded into an empty database."}), 409
        return jsonify({"added": seed_demo(t)}), 201

    @app.post("/api/budgets")
    @with_tracker
    def set_budget(t):
        d = request.get_json(silent=True) or {}
        try:
            limit = float(d.get("limit"))
        except (TypeError, ValueError):
            raise ValueError("Budget must be a number.")
        t.set_budget(d.get("category"), d.get("month"), limit)
        return jsonify({"saved": True}), 201

    @app.get("/api/budgets/<month>")
    @with_tracker
    def budget_status(t, month):
        return jsonify(t.budget_status(month))

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=int(os.environ.get("PORT", 5000)))
