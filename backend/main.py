import calendar
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import List, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_DSN = "dbname=postgres user=postgres host=localhost port=5432"


def get_conn():
    return psycopg2.connect(DB_DSN)


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

INIT_SQL = """
CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE IF NOT EXISTS finance.accounts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    starting_balance NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance.categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS finance.transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES finance.accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_rule_id INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_auto_tx
    ON finance.transactions (recurring_rule_id, date)
    WHERE is_auto_generated = TRUE AND recurring_rule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance.recurring_rules (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES finance.accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    category TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date DATE NOT NULL,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    last_generated_date DATE
);

CREATE TABLE IF NOT EXISTS finance.budgets (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL
);
"""

DEFAULT_INCOME = ["Salary", "Freelance", "Other Income"]
DEFAULT_EXPENSE = ["Housing", "Food", "Transport", "Entertainment", "Utilities", "Other"]


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(INIT_SQL)
    for name in DEFAULT_INCOME:
        cur.execute(
            "INSERT INTO finance.categories (name, type, is_custom) VALUES (%s, 'Income', FALSE) ON CONFLICT (name) DO NOTHING",
            (name,),
        )
    for name in DEFAULT_EXPENSE:
        cur.execute(
            "INSERT INTO finance.categories (name, type, is_custom) VALUES (%s, 'Expense', FALSE) ON CONFLICT (name) DO NOTHING",
            (name,),
        )
    conn.commit()
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Recurring generation helpers
# ---------------------------------------------------------------------------


def advance_date(current: date, frequency: str, start: date) -> date:
    if frequency == "Weekly":
        return current + timedelta(days=7)
    elif frequency == "Biweekly":
        return current + timedelta(days=14)
    else:  # Monthly
        month = current.month + 1
        year = current.year
        if month > 12:
            month = 1
            year += 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)


def occurrences_between(start: date, frequency: str, after: date, up_to: date) -> List[date]:
    """Return dates in (after, up_to] that match the schedule starting at start."""
    result = []
    cur = start
    while cur <= up_to:
        if cur > after:
            result.append(cur)
        cur = advance_date(cur, frequency, start)
    return result


def generate_recurring_transactions():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()

    cur.execute("SELECT * FROM finance.recurring_rules WHERE is_paused = FALSE")
    rules = cur.fetchall()

    for rule in rules:
        last = rule["last_generated_date"]
        after = last if last is not None else rule["start_date"] - timedelta(days=1)
        occs = occurrences_between(rule["start_date"], rule["frequency"], after, today)

        for d in occs:
            cur.execute(
                """
                INSERT INTO finance.transactions
                    (account_id, type, amount, date, category, is_auto_generated, recurring_rule_id)
                VALUES (%s, %s, %s, %s, %s, TRUE, %s)
                ON CONFLICT DO NOTHING
                """,
                (rule["account_id"], rule["type"], rule["amount"], d, rule["category"], rule["id"]),
            )

        # Always update last_generated_date to today
        cur.execute(
            "UPDATE finance.recurring_rules SET last_generated_date = %s WHERE id = %s",
            (today, rule["id"]),
        )

    conn.commit()
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    generate_recurring_transactions()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AccountCreate(BaseModel):
    name: str
    type: str
    starting_balance: float = 0.0


class TransactionCreate(BaseModel):
    account_id: int
    type: str
    amount: float
    date: str
    category: str
    note: Optional[str] = None


class RecurringCreate(BaseModel):
    account_id: int
    type: str
    amount: float
    category: str
    frequency: str
    start_date: str


class BudgetSet(BaseModel):
    category: str
    amount: float


class CategoryCreate(BaseModel):
    name: str
    type: str


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


@app.get("/api/accounts")
def list_accounts():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT a.id, a.name, a.type, a.starting_balance,
               a.starting_balance
                 + COALESCE(SUM(CASE WHEN t.type = 'Income'  THEN t.amount ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0)
                 AS current_balance
        FROM finance.accounts a
        LEFT JOIN finance.transactions t ON t.account_id = a.id
        GROUP BY a.id, a.name, a.type, a.starting_balance
        ORDER BY a.id
        """
    )
    accounts = [dict(r) for r in cur.fetchall()]
    for a in accounts:
        a["current_balance"] = float(a["current_balance"])
        a["starting_balance"] = float(a["starting_balance"])

    net_worth = sum(
        (-a["current_balance"] if a["type"] == "Credit Card" else a["current_balance"])
        for a in accounts
    )

    cur.close()
    conn.close()
    return {"accounts": accounts, "net_worth": round(net_worth, 2)}


@app.post("/api/accounts")
def create_account(body: AccountCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "INSERT INTO finance.accounts (name, type, starting_balance) VALUES (%s, %s, %s) RETURNING *",
        (body.name, body.type, body.starting_balance),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()
    row["current_balance"] = float(row["starting_balance"])
    row["starting_balance"] = float(row["starting_balance"])
    return row


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------


@app.get("/api/transactions")
def list_transactions():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT * FROM finance.transactions
        ORDER BY date DESC, id DESC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["amount"] = float(r["amount"])
        r["date"] = str(r["date"])
    cur.close()
    conn.close()
    return rows


@app.post("/api/transactions")
def create_transaction(body: TransactionCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        INSERT INTO finance.transactions (account_id, type, amount, date, category, note, is_auto_generated)
        VALUES (%s, %s, %s, %s, %s, %s, FALSE)
        RETURNING *
        """,
        (body.account_id, body.type, body.amount, body.date, body.category, body.note),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()
    row["amount"] = float(row["amount"])
    row["date"] = str(row["date"])
    return row


# ---------------------------------------------------------------------------
# Recurring rules
# ---------------------------------------------------------------------------


@app.get("/api/recurring")
def list_recurring():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM finance.recurring_rules ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["amount"] = float(r["amount"])
        r["start_date"] = str(r["start_date"])
        r["last_generated_date"] = str(r["last_generated_date"]) if r["last_generated_date"] else None
    cur.close()
    conn.close()
    return rows


@app.post("/api/recurring")
def create_recurring(body: RecurringCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        INSERT INTO finance.recurring_rules (account_id, type, amount, category, frequency, start_date)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (body.account_id, body.type, body.amount, body.category, body.frequency, body.start_date),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()

    # Generate transactions for this new rule immediately
    generate_recurring_transactions()

    row["amount"] = float(row["amount"])
    row["start_date"] = str(row["start_date"])
    row["last_generated_date"] = str(row["last_generated_date"]) if row["last_generated_date"] else None
    return row


@app.patch("/api/recurring/{rule_id}/pause")
def toggle_pause(rule_id: int):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "UPDATE finance.recurring_rules SET is_paused = NOT is_paused WHERE id = %s RETURNING *",
        (rule_id,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Rule not found")
    row = dict(row)
    conn.commit()
    cur.close()
    conn.close()
    row["amount"] = float(row["amount"])
    row["start_date"] = str(row["start_date"])
    return row


@app.delete("/api/recurring/{rule_id}")
def delete_recurring(rule_id: int):
    conn = get_conn()
    cur = conn.cursor()
    # Nullify recurring_rule_id on related transactions so they persist
    cur.execute(
        "UPDATE finance.transactions SET recurring_rule_id = NULL WHERE recurring_rule_id = %s",
        (rule_id,),
    )
    cur.execute("DELETE FROM finance.recurring_rules WHERE id = %s", (rule_id,))
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


@app.get("/api/categories")
def list_categories():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM finance.categories ORDER BY type, name")
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


@app.post("/api/categories")
def create_category(body: CategoryCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "INSERT INTO finance.categories (name, type, is_custom) VALUES (%s, %s, TRUE) ON CONFLICT (name) DO UPDATE SET is_custom = TRUE RETURNING *",
        (body.name, body.type),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()
    return row


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------


@app.get("/api/budgets")
def list_budgets():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()
    first_of_month = today.replace(day=1)

    cur.execute(
        """
        SELECT b.id, b.category, b.amount,
               COALESCE(SUM(
                   CASE WHEN t.type = 'Expense'
                        AND t.date >= %s AND t.date <= %s
                   THEN t.amount ELSE 0 END
               ), 0) AS spent
        FROM finance.budgets b
        LEFT JOIN finance.transactions t ON t.category = b.category
        GROUP BY b.id, b.category, b.amount
        ORDER BY b.category
        """,
        (first_of_month, today),
    )
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["amount"] = float(r["amount"])
        r["spent"] = float(r["spent"])
    cur.close()
    conn.close()
    return rows


@app.post("/api/budgets")
def set_budget(body: BudgetSet):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        INSERT INTO finance.budgets (category, amount) VALUES (%s, %s)
        ON CONFLICT (category) DO UPDATE SET amount = EXCLUDED.amount
        RETURNING *
        """,
        (body.category, body.amount),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()
    row["amount"] = float(row["amount"])
    return row


# ---------------------------------------------------------------------------
# Balance projection
# ---------------------------------------------------------------------------


@app.get("/api/projection")
def get_projection():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()

    cur.execute(
        """
        SELECT a.id, a.name, a.type,
               a.starting_balance
                 + COALESCE(SUM(CASE WHEN t.type = 'Income'  THEN t.amount ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0)
                 AS current_balance
        FROM finance.accounts a
        LEFT JOIN finance.transactions t ON t.account_id = a.id
        GROUP BY a.id, a.name, a.type, a.starting_balance
        ORDER BY a.id
        """
    )
    accounts = [dict(r) for r in cur.fetchall()]
    for a in accounts:
        a["current_balance"] = float(a["current_balance"])

    cur.execute("SELECT * FROM finance.recurring_rules WHERE is_paused = FALSE")
    rules = cur.fetchall()

    # Pre-compute future occurrences per account per day (day+1 to day+29)
    future: dict = {}
    end_date = today + timedelta(days=30)
    for rule in rules:
        acc_id = rule["account_id"]
        if acc_id not in future:
            future[acc_id] = {}
        occs = occurrences_between(rule["start_date"], rule["frequency"], today, end_date)
        for d in occs:
            ds = str(d)
            delta = float(rule["amount"]) if rule["type"] == "Income" else -float(rule["amount"])
            future[acc_id][ds] = future[acc_id].get(ds, 0.0) + delta

    result = []
    for a in accounts:
        acc_id = a["id"]
        running = a["current_balance"]
        days = []
        acc_future = future.get(acc_id, {})
        for offset in range(31):
            d = today + timedelta(days=offset)
            ds = str(d)
            if offset > 0:
                running += acc_future.get(ds, 0.0)
            days.append({"date": ds, "balance": round(running, 2)})
        result.append({"account": a, "days": days})

    cur.close()
    conn.close()
    return result


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------


@app.delete("/api/reset")
def reset_all():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM finance.transactions")
    cur.execute("DELETE FROM finance.recurring_rules")
    cur.execute("DELETE FROM finance.budgets")
    cur.execute("DELETE FROM finance.accounts")
    cur.execute("DELETE FROM finance.categories WHERE is_custom = TRUE")
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
