"""Realistic sample data so the dashboard looks good on the first run."""
import calendar
import random
from datetime import date


def _month_back(d: date, n: int):
    y, m = d.year, d.month - n
    while m < 1:
        m += 12
        y -= 1
    return y, m


TEMPLATES = {
    "Food": [("Lunch at canteen", 90, 220), ("Groceries", 600, 1800), ("Dinner with friends", 350, 900),
             ("Swiggy order", 180, 480), ("Tea and snacks", 40, 120)],
    "Travel": [("Bus pass", 150, 400), ("Auto fare", 60, 250), ("Petrol", 400, 900), ("Train ticket", 120, 600)],
    "Shopping": [("T-shirt", 500, 1200), ("Shoes", 1200, 2500), ("Amazon order", 300, 1500)],
    "Bills": [("Mobile recharge", 299, 299), ("Wifi bill", 700, 700), ("Electricity bill", 600, 1400)],
    "Entertainment": [("Movie tickets", 300, 700), ("Netflix subscription", 199, 199), ("Gaming topup", 100, 400)],
    "Health": [("Pharmacy", 150, 600), ("Doctor consultation", 400, 800)],
    "Education": [("Online course", 400, 1200), ("Stationery", 80, 300)],
}
GOALS = [("Emergency fund", "🛟", 50000, 32500), ("Goa trip", "🏖️", 20000, 8400), ("New laptop", "💻", 65000, 65000)]
BUDGETS = {"Food": 6000, "Travel": 2000, "Shopping": 3000, "Bills": 4000, "Entertainment": 1500}


def seed_demo(tracker, today: date = None, months: int = 3) -> int:
    """Insert about three months of expenses ending at `today`. Returns rows added."""
    today = today or date.today()
    rng = random.Random(7)
    added = 0
    for back in range(months - 1, -1, -1):
        y, m = _month_back(today, back)
        last_day = today.day if back == 0 else calendar.monthrange(y, m)[1]
        for _ in range(rng.randint(15, 19)):
            cat = rng.choices(list(TEMPLATES), weights=[34, 14, 10, 12, 10, 8, 6])[0]
            desc, lo, hi = rng.choice(TEMPLATES[cat])
            amount = round(rng.uniform(lo, hi) / 5) * 5 or lo
            day = rng.randint(1, max(last_day, 1))
            tracker.add_expense(amount, cat, desc, date(y, m, day).isoformat())
            added += 1
        # a few overspend situations in the current month make the insights interesting
        if back == 0 and last_day >= 10:
            tracker.add_expense(9499, "Shopping", "Smartphone down payment", date(y, m, min(last_day, 8)).isoformat())
            tracker.add_expense(1850, "Entertainment", "Concert tickets", date(y, m, min(last_day, 6)).isoformat())
            added += 2
    for name, emoji, target, saved in GOALS:
        tracker.add_goal(name, target, emoji, saved_amount=saved)
    for back in range(months):                      # budgets for every seeded month
        y, m = _month_back(today, back)
        for cat, limit in BUDGETS.items():
            tracker.set_budget(cat, f"{y}-{m:02d}", limit)
    return added
