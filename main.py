"""Command-line interface for the Expense Tracker.

Examples:
  python main.py add 250 food "Lunch at canteen"
  python main.py list --month 2026-10
  python main.py summary --month 2026-10
"""
import argparse
import sys

from tracker import ExpenseTracker, connect


def table(rows, columns):
    if not rows:
        print("(no records)")
        return
    widths = {c: max(len(c), *(len(str(r[c])) for r in rows)) for c in columns}
    print("  ".join(c.upper().ljust(widths[c]) for c in columns))
    print("  ".join("-" * widths[c] for c in columns))
    for r in rows:
        print("  ".join(str(r[c]).ljust(widths[c]) for c in columns))


def build_parser():
    p = argparse.ArgumentParser(description="Expense Tracker (Python + SQL)")
    p.add_argument("--db", default="expenses.db", help="database file (default expenses.db)")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="add an expense")
    a.add_argument("amount", type=float)
    a.add_argument("category")
    a.add_argument("description", nargs="?", default="")
    a.add_argument("--date", help="YYYY-MM-DD (default today)")

    l = sub.add_parser("list", help="list expenses")
    l.add_argument("--month", help="YYYY-MM")
    l.add_argument("--category")
    l.add_argument("--limit", type=int)

    u = sub.add_parser("update", help="update an expense")
    u.add_argument("id", type=int)
    u.add_argument("--amount", type=float)
    u.add_argument("--category")
    u.add_argument("--description")
    u.add_argument("--date")

    d = sub.add_parser("delete", help="delete an expense")
    d.add_argument("id", type=int)

    s = sub.add_parser("summary", help="spending by category")
    s.add_argument("--month", help="YYYY-MM")

    sub.add_parser("monthly", help="monthly totals with % change")

    t = sub.add_parser("top", help="biggest expenses")
    t.add_argument("-n", type=int, default=5)
    t.add_argument("--month")

    b = sub.add_parser("budget-set", help="set a monthly budget for a category")
    b.add_argument("category")
    b.add_argument("month", help="YYYY-MM")
    b.add_argument("limit", type=float)

    bs = sub.add_parser("budget-status", help="budget vs spending")
    bs.add_argument("month", help="YYYY-MM")

    e = sub.add_parser("export", help="export to CSV")
    e.add_argument("file")
    e.add_argument("--month")
    return p


def run(args, tracker: ExpenseTracker):
    c = args.cmd
    if c == "add":
        eid = tracker.add_expense(args.amount, args.category, args.description, args.date)
        print(f"Added expense #{eid}")
    elif c == "list":
        table(tracker.list_expenses(args.month, args.category, args.limit),
              ["id", "expense_date", "category", "amount", "description"])
    elif c == "update":
        ok = tracker.update_expense(args.id, args.amount, args.category, args.description, args.date)
        print("Updated" if ok else "No expense with that id")
    elif c == "delete":
        print("Deleted" if tracker.delete_expense(args.id) else "No expense with that id")
    elif c == "summary":
        table(tracker.summary_by_category(args.month), ["category", "count", "total", "percent"])
        print(f"\nTotal: {tracker.total(args.month)}")
    elif c == "monthly":
        table(tracker.monthly_totals(), ["month", "total", "change_pct"])
    elif c == "top":
        table(tracker.top_expenses(args.n, args.month),
              ["id", "expense_date", "category", "amount", "description"])
    elif c == "budget-set":
        tracker.set_budget(args.category, args.month, args.limit)
        print("Budget saved")
    elif c == "budget-status":
        rows = tracker.budget_status(args.month)
        for r in rows:
            r["status"] = "OVER BUDGET" if r["over_budget"] else "ok"
        table(rows, ["category", "budget", "spent", "remaining", "status"])
    elif c == "export":
        print(f"Exported {tracker.export_csv(args.file, args.month)} rows to {args.file}")


def main(argv=None):
    args = build_parser().parse_args(argv)
    conn = connect(args.db)
    try:
        run(args, ExpenseTracker(conn))
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
