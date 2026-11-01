"""Analytics and "smart" features that sit on top of the SQL layer.

Everything here is deterministic and runs without any API key:
  * health_score      - a 0-100 financial health score with an explainable breakdown
  * weekday_totals    - which days of the week you spend most on
  * recurring         - detects subscriptions / repeated bills from your history
  * parse_quick_add   - natural-language entry: "450 uber to office yesterday"
  * ask               - answers plain-English questions about your spending
                        (rule-based first; Gemini is used only as an optional fallback)
"""
import calendar
import re
import statistics
from datetime import date, datetime, timedelta

from .insights import _gemini, generate_insights, keyword_category, money

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WEEKDAY_FULL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august",
               "september", "october", "november", "december"]


def _prev_month(month: str) -> str:
    y, m = map(int, month.split("-"))
    m -= 1
    if m == 0:
        y, m = y - 1, 12
    return f"{y}-{m:02d}"


def month_name(month: str) -> str:
    y, m = month.split("-")
    return f"{MONTH_NAMES[int(m) - 1].title()} {y}"


def _add_month(d: date) -> date:
    y, m = (d.year + (d.month == 12), d.month % 12 + 1)
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


# ------------------------------------------------------------------ weekday pattern
def weekday_totals(tracker, month: str):
    totals = [0.0] * 7
    counts = [0] * 7
    for r in tracker.list_expenses(month=month):
        wd = datetime.strptime(r["expense_date"], "%Y-%m-%d").weekday()
        totals[wd] += r["amount"]
        counts[wd] += 1
    return [{"day": WEEKDAYS[i], "total": round(totals[i], 2), "count": counts[i]} for i in range(7)]


# ------------------------------------------------------------------ recurring payments
def recurring(tracker):
    """Same description in 2+ different months with a similar amount => likely recurring."""
    groups = {}
    for r in tracker.list_expenses():
        key = re.sub(r"[^a-z ]", "", (r["description"] or "").lower()).strip()
        if key:
            groups.setdefault(key, []).append(r)
    out = []
    for items in groups.values():
        months = {i["expense_date"][:7] for i in items}
        amounts = [i["amount"] for i in items]
        mean = statistics.mean(amounts)
        if len(months) < 2 or max(amounts) - min(amounts) > 0.03 * mean:
            continue
        last = max(items, key=lambda i: i["expense_date"])
        last_date = datetime.strptime(last["expense_date"], "%Y-%m-%d").date()
        out.append({"description": last["description"], "category": last["category"],
                    "amount": round(mean, 2), "months": len(months), "last_date": last["expense_date"],
                    "next_expected": _add_month(last_date).isoformat()})
    out.sort(key=lambda x: -x["amount"])
    return {"items": out, "monthly_total": round(sum(i["amount"] for i in out), 2)}


# ------------------------------------------------------------------ health score
def health_score(tracker, month: str, today: date = None):
    """0-100 score from four explainable factors."""
    rows = tracker.list_expenses(month=month)
    if not rows:
        return None
    factors = []

    budgets = tracker.budget_status(month)
    if budgets:
        ok = sum(1 for b in budgets if not b["over_budget"])
        pts = round(40 * ok / len(budgets))
        note = f"{ok} of {len(budgets)} budgets respected"
    else:
        pts, note = 24, "Set budgets to unlock the full 40 points"
    factors.append({"name": "Budget discipline", "points": pts, "max": 40, "note": note})

    totals = tracker.monthly_totals()
    cur = next((m for m in totals if m["month"] == month), None)
    change = cur["change_pct"] if cur else None
    if change is None:
        pts, note = 18, "Not enough history yet"
    elif change <= 0:
        pts, note = 25, f"Spending is down {abs(change):.0f}% on last month"
    elif change <= 10:
        pts, note = 20, f"Up only {change:.0f}% on last month"
    elif change <= 30:
        pts, note = 12, f"Up {change:.0f}% on last month"
    else:
        pts, note = 5, f"Up {change:.0f}% on last month"
    factors.append({"name": "Spending trend", "points": pts, "max": 25, "note": note})

    top = tracker.summary_by_category(month)[0]
    share = top["percent"]
    pts = 15 if share < 40 else 10 if share < 60 else 5
    factors.append({"name": "Balance across categories", "points": pts, "max": 15,
                    "note": f"{top['category']} is {share:.0f}% of spending"})

    unusual = sum(1 for i in generate_insights(tracker, month, today) if i["type"] == "unusual")
    pts = max(20 - 7 * unusual, 0)
    factors.append({"name": "No surprise spikes", "points": pts, "max": 20,
                    "note": f"{unusual} unusually large expense{'s' if unusual != 1 else ''}" if unusual else "No unusual expenses"})

    score = sum(f["points"] for f in factors)
    label = "Excellent" if score >= 85 else "Good" if score >= 70 else "Fair" if score >= 50 else "Needs attention"
    return {"score": score, "label": label, "factors": factors}


# ------------------------------------------------------------------ quick add parser
_FILLER = {"spent", "paid", "pay", "on", "for", "at", "to", "rs", "inr", "rupees", "bought", "buy", "i", "a", "the", "of", "using"}


def parse_quick_add(text: str, today: date = None) -> dict:
    """'450 uber to office yesterday' -> {amount, description, category, expense_date}."""
    today = today or date.today()
    s = " " + (text or "").strip() + " "
    low = s.lower()
    when = None

    def cut(m):
        nonlocal s, low
        s = s[:m.start()] + " " + s[m.end():]
        low = s.lower()

    if m := re.search(r"\b(\d{4}-\d{2}-\d{2})\b", low):
        try:
            when = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            cut(m)
        except ValueError:
            pass
    if when is None:
        if m := re.search(r"\bday before yesterday\b", low):
            when = today - timedelta(days=2); cut(m)
        elif m := re.search(r"\byesterday\b", low):
            when = today - timedelta(days=1); cut(m)
        elif m := re.search(r"\btoday\b", low):
            when = today; cut(m)
        elif m := re.search(r"\b(\d{1,2}) days? ago\b", low):
            when = today - timedelta(days=int(m.group(1))); cut(m)
        elif m := re.search(r"\b(?:last |on )?(" + "|".join(WEEKDAY_FULL) + r")\b", low):
            target = WEEKDAY_FULL.index(m.group(1))
            delta = (today.weekday() - target) % 7 or 7
            when = today - timedelta(days=delta); cut(m)
        elif m := re.search(r"\bon (\d{1,2})(?:st|nd|rd|th)?\b(?! ?(?:rs|inr|₹))", low):
            day = int(m.group(1))
            y, mo = today.year, today.month
            if day > today.day:
                y, mo = (y - 1, 12) if mo == 1 else (y, mo - 1)
            if 1 <= day <= calendar.monthrange(y, mo)[1]:
                when = date(y, mo, day); cut(m)

    amount = None
    pats = [r"(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?", r"(\d[\d,]*(?:\.\d+)?)\s*(k\b)?\s*(?:₹|rs\b|inr\b|rupees\b)",
            r"(\d[\d,]*(?:\.\d+)?)\s*(k\b)?"]
    for p in pats:
        if m := re.search(p, low):
            amount = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
            cut(m)
            break

    words = [w for w in re.split(r"\s+", s.strip()) if w]
    while words and words[0].lower().strip(".,") in _FILLER:
        words.pop(0)
    while words and words[-1].lower().strip(".,") in _FILLER:
        words.pop()
    desc = " ".join(words).strip(" .,-")
    desc = desc[:1].upper() + desc[1:] if desc else ""
    return {"amount": amount, "description": desc, "category": keyword_category(desc) if desc else None,
            "expense_date": (when or today).isoformat(), "date_found": when is not None}


# ------------------------------------------------------------------ ask your data
def _range(q: str, month: str, today: date):
    """Return (label, start, end) for the period mentioned in the question."""
    if "yesterday" in q:
        d = today - timedelta(days=1)
        return "yesterday", d, d
    if "today" in q:
        return "today", today, today
    if re.search(r"last (7 days|week)|past week|this week", q):
        return "the last 7 days", today - timedelta(days=6), today
    if "last month" in q or "previous month" in q:
        pm = _prev_month(today.strftime("%Y-%m"))
        y, m = map(int, pm.split("-"))
        return month_name(pm), date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    if re.search(r"all time|overall|ever|so far|in total", q):
        return "all time", date(2000, 1, 1), date(2100, 1, 1)
    for i, name in enumerate(MONTH_NAMES):
        if re.search(rf"\b{name}\b", q):
            year = int(month[:4]) if (i + 1) <= int(month[5:]) else int(month[:4]) - 1
            return f"{name.title()} {year}", date(year, i + 1, 1), date(year, i + 1, calendar.monthrange(year, i + 1)[1])
    y, m = map(int, month.split("-"))
    return month_name(month), date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def ask(tracker, question: str, month: str = None, today: date = None) -> dict:
    today = today or date.today()
    q = (question or "").lower().strip()
    if not q:
        return {"answer": "Ask me anything about your spending, like “How much did I spend on food last month?”", "source": "rules"}
    if tracker.is_empty():
        return {"answer": "There is no data yet. Add an expense or load the sample data and ask me again.", "source": "rules"}
    month = month or tracker.monthly_totals()[-1]["month"]
    label, start, end = _range(q, month, today)
    all_rows = tracker.list_expenses()
    rows = [r for r in all_rows if start.isoformat() <= r["expense_date"] <= end.isoformat()]
    cat = next((c for c in tracker.categories() if re.search(rf"\b{re.escape(c.lower())}\b", q)), None)
    scoped = [r for r in rows if r["category"] == cat] if cat else rows
    total = sum(r["amount"] for r in scoped)
    scope = f"on {cat}" if cat else "in total"

    if re.search(r"subscription|recurring|repeat|every month", q):
        rec = recurring(tracker)
        if not rec["items"]:
            return {"answer": "I could not find any repeating payments yet.", "source": "rules"}
        lines = ", ".join(f"{i['description']} ({money(i['amount'])})" for i in rec["items"][:4])
        return {"answer": f"You have {len(rec['items'])} recurring payments costing about {money(rec['monthly_total'])} a month: {lines}.", "source": "rules"}
    if re.search(r"budget", q):
        b = tracker.budget_status(month)
        if not b:
            return {"answer": f"No budgets are set for {month_name(month)} yet. You can add them on the Budgets page.", "source": "rules"}
        over = [x for x in b if x["over_budget"]]
        if cat:
            x = next((x for x in b if x["category"] == cat), None)
            if x:
                return {"answer": f"{cat}: {money(x['spent'])} spent of {money(x['budget'])} ({'over by ' + money(-x['remaining']) if x['over_budget'] else money(x['remaining']) + ' left'}).", "source": "rules"}
        if over:
            return {"answer": f"You are over budget in {', '.join(x['category'] for x in over)} for {month_name(month)}. The biggest overshoot is {max(over, key=lambda x: -x['remaining'])['category']} by {money(-min(x['remaining'] for x in over))}.", "source": "rules"}
        return {"answer": f"Good news: all {len(b)} budgets are on track for {month_name(month)}.", "source": "rules"}
    if re.search(r"biggest|largest|highest|most expensive|top expense", q):
        if not scoped:
            return {"answer": f"I found no expenses {scope} for {label}.", "source": "rules"}
        r = max(scoped, key=lambda r: r["amount"])
        return {"answer": f"Your biggest expense{' on ' + cat if cat else ''} for {label} was {money(r['amount'])} for “{r['description'] or r['category']}” on {r['expense_date']}.", "source": "rules"}
    if re.search(r"forecast|project|predict|end of (the )?month|will i spend", q):
        cur = today.strftime("%Y-%m")
        spent = tracker.total(cur)
        if today.day < 5:
            return {"answer": f"You have spent {money(spent)} so far this month. It is too early in the month for a reliable forecast, so ask again in a few days.", "source": "rules"}
        n = calendar.monthrange(today.year, today.month)[1]
        return {"answer": f"You have spent {money(spent)} so far this month. At this pace you will reach about {money(spent / today.day * n)} by month end.", "source": "rules"}
    if re.search(r"compare|versus|\bvs\b|change|than last month|more than", q):
        totals = tracker.monthly_totals()
        idx = next((i for i, m in enumerate(totals) if m["month"] == month), len(totals) - 1)
        if idx == 0 or totals[idx]["change_pct"] is None:
            return {"answer": "I need at least two months of data to compare.", "source": "rules"}
        c, p = totals[idx], totals[idx - 1]
        return {"answer": f"{month_name(c['month'])}: {money(c['total'])} vs {month_name(p['month'])}: {money(p['total'])}, a change of {c['change_pct']:+.1f}%.", "source": "rules"}
    if re.search(r"average|per day|daily|a day", q):
        days = max((min(end, today) - start).days + 1, 1)
        return {"answer": f"You spend about {money(total / days)} a day {scope} over {label}.", "source": "rules"}
    if re.search(r"top|most|where|which categor|breakdown|biggest categor|categories", q) and not cat:
        by = {}
        for r in rows:
            by[r["category"]] = by.get(r["category"], 0) + r["amount"]
        if not by:
            return {"answer": f"I found no expenses for {label}.", "source": "rules"}
        ranked = sorted(by.items(), key=lambda kv: -kv[1])[:3]
        return {"answer": f"Top categories for {label}: " + ", ".join(f"{c} {money(v)}" for c, v in ranked) + ".", "source": "rules"}
    if re.search(r"save|saving|tip|advice|reduce|cut|improve|help", q):
        items = generate_insights(tracker, month, today)
        bad = [i for i in items if i["level"] in ("bad", "warn")]
        if bad:
            return {"answer": "Here is where I would start: " + " ".join(i["title"] + "." for i in bad[:3]) + " Trimming these will have the biggest impact.", "source": "rules"}
        return {"answer": "You are doing well. Keep your budgets in place and review your recurring payments once a month.", "source": "rules"}
    if re.search(r"how much|total|spent|spend|cost|paid", q):
        if not scoped:
            return {"answer": f"I found no expenses {scope} for {label}.", "source": "rules"}
        return {"answer": f"You spent {money(total)} {scope} for {label} across {len(scoped)} transaction{'s' if len(scoped) != 1 else ''}.", "source": "rules"}

    context = "\n".join(f"- {i['title']}: {i['text']}" for i in generate_insights(tracker, month, today))
    ai = _gemini("You are a concise finance assistant. Answer using only these facts, in 2 sentences max. Do not invent numbers.\n"
                 f"Facts for {month}:\n{context}\nQuestion: {question}")
    if ai:
        return {"answer": ai, "source": "ai"}
    return {"answer": "I can answer things like “How much did I spend on food last month?”, “What is my biggest expense?”, "
                      "“Am I over budget?”, “Show my subscriptions” or “Compare with last month”.", "source": "rules"}
