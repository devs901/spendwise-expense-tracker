"""Database connection and schema setup."""
import sqlite3
from pathlib import Path

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema.sql"


def connect(path: str = "expenses.db") -> sqlite3.Connection:
    """Open the database (use ':memory:' for tests) and make sure the tables exist."""
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
    return conn
