# Personal Finance Tracker with Recurring Transactions

Build a personal finance tracker that keeps tabs on multiple accounts, categorizes spending, automates recurring transactions, enforces category budgets, and projects future balances — all in one page-reload-safe app.

## Stack

- **Frontend**: React (no framework, pure React) — Port **3000**
- **Backend**: FastAPI (Python) — Port **3001**
- **Persistence**: PostgreSQL at port **5432**, schema **`finance`**

---

## Accounts

Users can create named accounts with a **type** (Checking, Savings, or Credit Card) and a **starting balance**. The current balance of each account is computed as:

```
current balance = starting balance + sum(income transactions) − sum(expense transactions)
```

Credit Card accounts are treated as liabilities — their balances contribute **negatively** to net worth. The **net worth** figure sums all account balances with this sign convention applied.

All accounts appear in the accounts panel, and clicking an account (or selecting it from a dropdown elsewhere) filters or associates transactions with it.

---

## Transactions

Transactions belong to an account and carry: **type** (Income or Expense), **amount**, **date**, **category**, and an optional **note**.

The transaction list is shown in reverse chronological order and can be filtered by account, category, and date range simultaneously. Each filter operates independently — multiple filters combine with AND logic.

### Categories

Predefined categories ship with the app:

- **Income**: Salary, Freelance, Other Income
- **Expense**: Housing, Food, Transport, Entertainment, Utilities, Other

Users can create custom categories beyond these defaults. Custom categories are persisted and available for selection just like built-in ones.

---

## Recurring Transactions

A recurring transaction is a rule that automatically generates real transactions on a schedule. Each rule stores: type, amount, account, category, **frequency** (Weekly, Biweekly, or Monthly), and a **start date**.

When the application loads, it evaluates every active recurring rule and generates any transactions that are due from the start date up to and including today. If occurrences were already generated from a previous load, only new ones (since the last generation) are created — no duplicates. Auto-generated transactions are visually marked to distinguish them from manually entered ones (e.g., a small recurring icon).

Recurring rules can be **paused** or **deleted**:

- **Pausing** freezes future generation while preserving all previously generated transactions.
- **Deleting** removes the rule entirely but leaves past generated transactions intact.

---

## Category Budgets

Users can assign a monthly spending budget to any expense category. For each budgeted category, the UI shows:

- The budget amount
- Total spent this month
- Remaining amount
- A progress bar reflecting the percentage used

Two threshold states are shown:

- **Warning** — spending has crossed 80% of the budget (progress bar turns yellow)
- **Overspend** — spending has exceeded 100% of the budget (progress bar turns red, alert indicator visible)

---

## Balance Projection

For each account, the app projects the balance for each of the next 30 days based on upcoming scheduled occurrences from active (non-paused) recurring transactions. Starting from today's actual balance, each day's projected balance is computed by adding any income and subtracting any expenses scheduled to fall on that day.

The projection is displayed as a table or line chart showing date and projected balance per account. If a projected balance goes negative for a Checking or Savings account, that date is visually highlighted in red.

---

## Persistence

All accounts, transactions, recurring rules, custom categories, and budgets must survive a full page reload. Everything is stored in PostgreSQL.

---

## Page Structure

The app lives on a **single page at `/`**. No routing is needed. The four primary panels — accounts, transactions, recurring, and budgets — plus the projection panel are all visible on this one page.

A **"Delete All Data"** button clears every account, transaction, recurring rule, category, and budget from the database, resetting the app to a blank state.

---

## `data-testid` Reference

### Global Controls

- `reset-btn` — the "Delete All Data" button

### Accounts Panel

- `accounts-panel` — the accounts section container
- `account-{id}` — each account card, where `{id}` is the account's unique identifier (integer or UUID as stored in the DB)
- `net-worth` — the element displaying the total net worth figure

### Transactions Panel

- `transactions-panel` — the transactions section container
- `transaction-{id}` — each transaction row, where `{id}` is the transaction's unique identifier

### Recurring Transactions Panel

- `recurring-panel` — the recurring rules section container
- `recurring-{id}` — each recurring rule card, where `{id}` is the rule's unique identifier

### Budget Panel

- `budget-panel` — the budgets section container
- `budget-{category}` — the budget row for a given category name, e.g. `budget-Food`
- `overspend-{category}` — the alert indicator shown when spending exceeds the budget, e.g. `overspend-Food`
- `warning-{category}` — the warning indicator shown when spending is between 80–100% of the budget, e.g. `warning-Food`

### Balance Projection Panel

- `projection-panel` — the projection section container
- `projection-{accountId}-{date}` — the projected balance cell for a given account and date, where `{date}` is formatted `YYYY-MM-DD`, e.g. `projection-3-2025-06-15`
- `negative-{accountId}-{date}` — applied to the same cell (or a wrapper) when the projected balance for a Checking/Savings account is negative, e.g. `negative-3-2025-06-15`
