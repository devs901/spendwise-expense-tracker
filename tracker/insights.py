"""Smart features: category suggestion, spending insights and an AI summary.

How the "AI" works (so you can explain it honestly in an interview):
  * suggest_category: keyword rules first (fast, free). If nothing matches and a GEMINI_API_KEY
    is set, an LLM is asked over a REST call. Without a key, it just returns no suggestion.
  * generate_insights: statistics over your SQL data (shares, month-over-month change,
    budget usage, month-end projection, unusual expenses using mean + 2 standard deviations).
  * ai_summary: an LLM writes a short summary of those insights. If the AI call fails or no key
    is set, a plain-text summary is built from the same insights, so the page always works.
"""
import calendar
import logging
import os
import statistics
from datetime import date

log = logging.getLogger("tracker.ai")

CATEGORY_KEYWORDS = {
    "Food": ["lunch", "dinner", "breakfast", "snack", "tea", "coffee", "cafe", "restaurant", "pizza",
             "burger", "biryani", "grocer", "vegetable", "fruit", "milk", "swiggy", "zomato", "canteen",
             "bakery", "juice", "chai", "dosa", "idli", "samosa", "thali", "sandwich", "ice cream"],
    "Travel": ["bus", "train", "metro", "auto", "uber", "ola", "cab", "taxi", "petrol", "diesel",
               "fuel", "flight", "ticket", "toll", "parking", "rickshaw"],
    "Shopping": ["amazon", "flipkart", "shirt", "jeans", "shoes", "clothes", "headphones", "mobile",
                 "laptop", "gadget", "bag", "watch", "myntra", "mall", "gift"],
    "Bills": ["electricity", "recharge", "wifi", "broadband", "internet", "rent", "water bill",
              "gas", "insurance", "emi", "subscription", "jio", "airtel", "phone bill"],
    "Health": ["doctor", "medicine", "pharmacy", "hospital", "clinic", "gym", "dental", "checkup",
               "medical", "vitamin"],
    "Entertainment": ["movie", "netflix", "spotify", "game", "concert", "hotstar", "prime", "party",
                      "outing", "trip"],
    "Education": ["course", "book", "tuition", "exam", "fees", "udemy", "coursera", "stationery",
                  "notebook", "pen"],
}


def money(x: float) -> str:
    return f"₹{x:,.0f}"


# ---------------------------------------------------------------- AI helper
def _gemini(prompt: str, timeout: int = 8):
    """Ask Gemini over REST. Returns text, or None if not configured / any failure."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    try:
        import requests  # optional dependency
        model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        r = requests.post(url, params={"key": key}, timeout=timeout,
                          json={"contents": [{"parts": [{"text": prompt}]}]})
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:  # network error, bad key, quota, bad JSON ...
        log.warning("Gemini call failed, using fallback: %s", exc)
        return None


def ai_enabled() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


# ---------------------------------------------------------------- categories
def keyword_category(description: str):
    text = (description or "").lower()
    scores = {c: sum(k in text for k in kws) for c, kws in CATEGORY_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def suggest_category(description: str) -> dict:
    description = (description or "").strip()
    if len(description) < 3:
        return {"category": None, "source": None}
    cat = keyword_category(description)
    if cat:
        return {"category": cat, "source": "keyword"}
    answer = _gemini("Classify this expense into exactly one of: " + ", ".join(CATEGORY_KEYWORDS)
                     + ". Reply with only the category name.\nExpense: " + description)
    if answer:
        answer = answer.strip().strip(".").title()
        if answer in CATEGORY_KEYWORDS:
            return {"category": answer, "source": "ai"}
    return {"category": None, "source": None}


# ---------------------------------------------------------------- insights
def latest_month(tracker):
    months = tracker.monthly_totals()
    return months[-1]["month"] if months else None


def generate_insights(tracker, month: str = None, today: date = None):
    """Return a list of {type, level, title, text}. level: good | info | warn | bad."""
    today = today or date.today()
    month = month or latest_month(tracker)
    if not month:
        return []
    rows = tracker.list_expenses(month=month)
    if not rows:
        return []
    out = []
    total = sum(r["amount"] for r in rows)

    # 1. Biggest category
    cats = tracker.summary_by_category(month)
    top = cats[0]
    out.append({"type": "top_category", "level": "info", "title": f"{top['category']} leads your spending",
                "text": f"{money(top['total'])} ({top['percent']:.0f}% of {money(total)}) went to {top['category']}."})

    # 2. Month over month
    totals = tracker.monthly_totals()
    idx = next((i for i, m in enumerate(totals) if m["month"] == month), None)
    if idx and idx > 0:
        prev = totals[idx - 1]
        change = totals[idx]["change_pct"]
        if change is not None:
            if change > 20:
                level, word = "warn", "up"
            elif change < -10:
                level, word = "good", "down"
            else:
                level, word = "info", "about the same" if abs(change) < 3 else ("up" if change > 0 else "down")
            title = f"Spending is {word} versus {prev['month']}" if word != "about the same" else \
                f"Spending is steady versus {prev['month']}"
            out.append({"type": "mom", "level": level, "title": title,
                        "text": f"{money(totals[idx]['total'])} this month against {money(prev['total'])} "
                                f"in {prev['month']} ({change:+.1f}%)."})

    # 3. Budgets
    for b in tracker.budget_status(month):
        if b["over_budget"]:
            out.append({"type": "budget", "level": "bad", "title": f"{b['category']} is over budget",
                        "text": f"You spent {money(b['spent'])} against a budget of {money(b['budget'])}, "
                                f"{money(-b['remaining'])} over."})
        elif b["budget"] and b["spent"] / b["budget"] >= 0.8:
            out.append({"type": "budget", "level": "warn", "title": f"{b['category']} budget almost used",
                        "text": f"{b['spent'] / b['budget'] * 100:.0f}% used, {money(b['remaining'])} left."})

    # 4. Month-end projection (only for the current month)
    if month == today.strftime("%Y-%m"):
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        if 5 <= today.day < days_in_month:   # too noisy in the first days of a month
            projected = total / today.day * days_in_month
            out.append({"type": "projection", "level": "info", "title": "Projected month-end spend",
                        "text": f"At this pace you will spend about {money(projected)} by the end of the month."})

    # 5. Unusual expenses (mean + 2 standard deviations, per category, over all history)
    history = {}
    for r in tracker.list_expenses():
        history.setdefault(r["category"], []).append(r["amount"])
    unusual = []
    for r in rows:
        vals = history.get(r["category"], [])
        if len(vals) >= 5:
            mean, sd = statistics.mean(vals), statistics.pstdev(vals)
            if sd > 0 and r["amount"] > mean + 2 * sd:
                unusual.append((r["amount"] / mean, r, mean))
    for _, r, mean in sorted(unusual, key=lambda x: -x[0])[:2]:
        out.append({"type": "unusual", "level": "warn", "title": "Unusually large expense",
                    "text": f"{money(r['amount'])} on '{r['description'] or r['category']}' ({r['expense_date']}) "
                            f"is far above your typical {r['category']} spend of {money(mean)}."})

    # 6. Busiest day
    daily = tracker.daily_totals(month)
    if daily:
        peak = max(daily, key=lambda d: d["total"])
        out.append({"type": "peak_day", "level": "info", "title": "Your biggest spending day",
                    "text": f"{peak['day']} with {money(peak['total'])} across all categories."})
    return out


def ai_summary(insights, month: str, total: float) -> dict:
    """Short natural-language summary: LLM if available, otherwise built from the insights."""
    if not insights:
        return {"text": "Add a few expenses to see your personalised summary.", "source": "none"}
    bullet_text = "\n".join(f"- {i['title']}: {i['text']}" for i in insights)
    prompt = ("You are a friendly personal finance assistant. In 2-3 short sentences, summarise this "
              f"user's spending for {month} (total {money(total)}) and give one practical tip. "
              "Do not invent numbers.\n" + bullet_text)
    answer = _gemini(prompt)
    if answer:
        return {"text": answer, "source": "ai"}
    top = next((i for i in insights if i["type"] == "top_category"), None)
    mom = next((i for i in insights if i["type"] == "mom"), None)
    sentence = f"You spent {money(total)} in {month}"
    if top:
        sentence += f", mostly on {top['title'].split(' leads')[0]}"
    parts = [sentence + "."]
    if mom:
        parts.append(mom["title"] + ".")
    over = [i["title"].replace(" is over budget", "") for i in insights if i["type"] == "budget" and i["level"] == "bad"]
    if over:
        parts.append("Over budget: " + ", ".join(over) + ".")
    odd = next((i for i in insights if i["type"] == "unusual"), None)
    if odd:
        parts.append("Review the large one-off expense flagged below.")
    return {"text": " ".join(parts), "source": "rules"}
