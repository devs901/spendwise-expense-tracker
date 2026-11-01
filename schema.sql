-- Expense Tracker schema (SQLite; the SQL is also easy to port to MySQL)
CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount       REAL    NOT NULL CHECK (amount > 0),
    category_id  INTEGER NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    expense_date TEXT    NOT NULL,                       -- YYYY-MM-DD
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS budgets (
    category_id  INTEGER NOT NULL,
    month        TEXT    NOT NULL,                       -- YYYY-MM
    limit_amount REAL    NOT NULL CHECK (limit_amount > 0),
    PRIMARY KEY (category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    emoji         TEXT    NOT NULL DEFAULT '🎯',
    target_amount REAL    NOT NULL CHECK (target_amount > 0),
    saved_amount  REAL    NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
    deadline      TEXT,                                  -- YYYY-MM-DD (optional)
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
