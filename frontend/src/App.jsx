import React, { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:3001'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Accounts Panel
// ---------------------------------------------------------------------------
function AccountsPanel({ accounts, netWorth, onCreated }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('Checking')
  const [balance, setBalance] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, type, starting_balance: parseFloat(balance) || 0 }),
    })
    setName('')
    setType('Checking')
    setBalance('')
    onCreated()
  }

  return (
    <div data-testid="accounts-panel" style={styles.panel}>
      <h2>Accounts</h2>
      <p>
        <strong>Net Worth: </strong>
        <span data-testid="net-worth">{fmt(netWorth)}</span>
      </p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          placeholder="Account name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={styles.input}
        />
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={styles.input}
        >
          <option value="Checking">Checking</option>
          <option value="Savings">Savings</option>
          <option value="Credit Card">Credit Card</option>
        </select>
        <input
          placeholder="Starting balance"
          name="balance"
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.btn}>Add Account</button>
      </form>
      <div>
        {accounts.map((a) => (
          <div
            key={a.id}
            data-testid={`account-${a.id}`}
            style={{ ...styles.card, borderLeft: '4px solid #4a90e2' }}
          >
            <strong>{a.name}</strong> ({a.type})<br />
            Balance: {fmt(a.current_balance)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transactions Panel
// ---------------------------------------------------------------------------
function TransactionsPanel({ accounts, categories, transactions, onCreated }) {
  const [txType, setTxType] = useState('Expense')
  const [amount, setAmount] = useState('')
  const [txDate, setTxDate] = useState(today())
  const [category, setCategory] = useState('Food')
  const [accountId, setAccountId] = useState('')
  const [note, setNote] = useState('')

  const [filterAccount, setFilterAccount] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(String(accounts[0].id))
  }, [accounts])

  async function handleSubmit(e) {
    e.preventDefault()
    await apiFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        account_id: parseInt(accountId),
        type: txType,
        amount: parseFloat(amount),
        date: txDate,
        category,
        note: note || null,
      }),
    })
    setAmount('')
    setNote('')
    onCreated()
  }

  const incomeCategories = categories.filter((c) => c.type === 'Income')
  const expenseCategories = categories.filter((c) => c.type === 'Expense')
  const visibleCategories = txType === 'Income' ? incomeCategories : expenseCategories

  const filtered = transactions.filter((t) => {
    if (filterAccount && String(t.account_id) !== filterAccount) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterStart && t.date < filterStart) return false
    if (filterEnd && t.date > filterEnd) return false
    return true
  })

  return (
    <div data-testid="transactions-panel" style={styles.panel}>
      <h2>Transactions</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <select
          name="type"
          value={txType}
          onChange={(e) => {
            setTxType(e.target.value)
            setCategory(e.target.value === 'Income' ? 'Salary' : 'Food')
          }}
          style={styles.input}
        >
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>
        <input
          type="number"
          placeholder="Amount"
          name="amount"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={styles.input}
        />
        <input
          type="date"
          value={txDate}
          onChange={(e) => setTxDate(e.target.value)}
          required
          style={styles.input}
        />
        <select
          name="category"
          id="tx-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={styles.input}
        >
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          name="account"
          id="tx-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={styles.input}
        >
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.btn}>Add Transaction</button>
      </form>

      {/* Filters — rendered outside the form */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <select
          data-testid="filter-account"
          name="filter-account"
          id="filter-account"
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          style={styles.input}
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        <select
          data-testid="filter-category"
          name="filter-category"
          id="filter-category"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={styles.input}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterStart}
          onChange={(e) => setFilterStart(e.target.value)}
          style={styles.input}
          placeholder="Start date"
        />
        <input
          type="date"
          value={filterEnd}
          onChange={(e) => setFilterEnd(e.target.value)}
          style={styles.input}
          placeholder="End date"
        />
      </div>

      <div>
        {filtered.map((t) => (
          <div
            key={t.id}
            data-testid={`transaction-${t.id}`}
            style={{
              ...styles.card,
              borderLeft: `4px solid ${t.type === 'Income' ? '#27ae60' : '#e74c3c'}`,
              opacity: 1,
            }}
          >
            {t.is_auto_generated && <span title="Auto-generated" style={{ marginRight: 4 }}>🔄</span>}
            <strong>{t.category}</strong> — {t.type === 'Income' ? '+' : '-'}{fmt(t.amount)}
            <span style={{ marginLeft: 8, color: '#666', fontSize: 12 }}>{t.date}</span>
            {t.note && <span style={{ marginLeft: 8, color: '#888' }}>{t.note}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recurring Panel
// ---------------------------------------------------------------------------
function RecurringPanel({ accounts, categories, recurring, onCreated, onChanged }) {
  const [txType, setTxType] = useState('Expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Housing')
  const [frequency, setFrequency] = useState('Monthly')
  const [startDate, setStartDate] = useState(today())
  const [accountId, setAccountId] = useState('')

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(String(accounts[0].id))
  }, [accounts])

  async function handleSubmit(e) {
    e.preventDefault()
    await apiFetch('/api/recurring', {
      method: 'POST',
      body: JSON.stringify({
        account_id: parseInt(accountId),
        type: txType,
        amount: parseFloat(amount),
        category,
        frequency,
        start_date: startDate,
      }),
    })
    setAmount('')
    onCreated()
  }

  async function handlePause(id) {
    await apiFetch(`/api/recurring/${id}/pause`, { method: 'PATCH' })
    onChanged()
  }

  async function handleDelete(id) {
    await apiFetch(`/api/recurring/${id}`, { method: 'DELETE' })
    onChanged()
  }

  const incomeCategories = categories.filter((c) => c.type === 'Income')
  const expenseCategories = categories.filter((c) => c.type === 'Expense')
  const visibleCategories = txType === 'Income' ? incomeCategories : expenseCategories

  return (
    <div data-testid="recurring-panel" style={styles.panel}>
      <h2>Recurring Transactions</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <select
          name="type"
          value={txType}
          onChange={(e) => {
            setTxType(e.target.value)
            setCategory(e.target.value === 'Income' ? 'Salary' : 'Housing')
          }}
          style={styles.input}
        >
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>
        <input
          type="number"
          placeholder="Amount"
          name="amount"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={styles.input}
        />
        <select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={styles.input}
        >
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          name="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          style={styles.input}
        >
          <option value="Weekly">Weekly</option>
          <option value="Biweekly">Biweekly</option>
          <option value="Monthly">Monthly</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
          style={styles.input}
        />
        <select
          name="account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={styles.input}
        >
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        <button type="submit" style={styles.btn}>Add Recurring</button>
      </form>

      <div>
        {recurring.map((r) => (
          <div
            key={r.id}
            data-testid={`recurring-${r.id}`}
            style={{
              ...styles.card,
              borderLeft: `4px solid ${r.is_paused ? '#95a5a6' : '#8e44ad'}`,
              opacity: r.is_paused ? 0.7 : 1,
            }}
          >
            <strong>{r.category}</strong> — {r.type} {fmt(r.amount)} / {r.frequency}
            {r.is_paused && <span style={{ marginLeft: 6, color: '#888' }}>(Paused)</span>}
            <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
              <button onClick={() => handlePause(r.id)} style={styles.smallBtn}>
                {r.is_paused ? 'Resume' : 'Pause'}
              </button>
              <button onClick={() => handleDelete(r.id)} style={{ ...styles.smallBtn, background: '#e74c3c', color: '#fff' }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Budget Panel
// ---------------------------------------------------------------------------
function BudgetPanel({ categories, budgets, onCreated }) {
  const [category, setCategory] = useState('Food')
  const [amount, setAmount] = useState('')

  const expenseCategories = categories.filter((c) => c.type === 'Expense')

  async function handleSubmit(e) {
    e.preventDefault()
    await apiFetch('/api/budgets', {
      method: 'POST',
      body: JSON.stringify({ category, amount: parseFloat(amount) }),
    })
    setAmount('')
    onCreated()
  }

  return (
    <div data-testid="budget-panel" style={styles.panel}>
      <h2>Category Budgets</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={styles.input}
        >
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Budget amount"
          name="budget"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={styles.input}
        />
        <button type="submit" style={styles.btn}>Set Budget</button>
      </form>

      <div>
        {budgets.map((b) => {
          const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0
          const isOverspend = pct > 100
          const isWarning = !isOverspend && pct >= 80
          const barColor = isOverspend ? '#e74c3c' : isWarning ? '#f39c12' : '#27ae60'

          return (
            <div
              key={b.category}
              data-testid={`budget-${b.category}`}
              style={{ ...styles.card, borderLeft: `4px solid ${barColor}` }}
            >
              <strong>{b.category}</strong>
              <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                Budget: {fmt(b.amount)} | Spent: {fmt(b.spent)} | Remaining: {fmt(b.amount - b.spent)}
              </div>
              <div style={{ background: '#eee', borderRadius: 4, height: 8, marginTop: 4 }}>
                <div
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: barColor,
                    height: '100%',
                    borderRadius: 4,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              {isWarning && (
                <span data-testid={`warning-${b.category}`} style={{ color: '#f39c12', fontSize: 12 }}>
                  ⚠ Warning: {pct.toFixed(0)}% used
                </span>
              )}
              {isOverspend && (
                <span data-testid={`overspend-${b.category}`} style={{ color: '#e74c3c', fontSize: 12 }}>
                  🚨 Overspent! ({pct.toFixed(0)}%)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Projection Panel
// ---------------------------------------------------------------------------
function ProjectionPanel({ projection }) {
  if (!projection || projection.length === 0) return null

  return (
    <div data-testid="projection-panel" style={styles.panel}>
      <h2>30-Day Balance Projection</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              {projection.map((p) => (
                <th key={p.account.id} style={styles.th}>{p.account.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projection[0].days.map((_, i) => {
              const dateStr = projection[0].days[i].date
              return (
                <tr key={dateStr}>
                  <td style={styles.td}>{dateStr}</td>
                  {projection.map((p) => {
                    const { date: d, balance } = p.days[i]
                    const isCheckingOrSavings =
                      p.account.type === 'Checking' || p.account.type === 'Savings'
                    const isNeg = isCheckingOrSavings && balance < 0
                    return (
                      <td
                        key={p.account.id}
                        data-testid={`projection-${p.account.id}-${d}`}
                        style={{
                          ...styles.td,
                          background: isNeg ? '#ffd5d5' : undefined,
                          color: isNeg ? '#c0392b' : undefined,
                        }}
                      >
                        {isNeg && (
                          <span
                            data-testid={`negative-${p.account.id}-${d}`}
                            style={{ marginRight: 4, fontSize: 10 }}
                          >
                            ▼
                          </span>
                        )}
                        {fmt(balance)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [accounts, setAccounts] = useState([])
  const [netWorth, setNetWorth] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [recurring, setRecurring] = useState([])
  const [budgets, setBudgets] = useState([])
  const [projection, setProjection] = useState([])

  
  useEffect(() => {
    try {
      const [acRes, txRes, catRes, recRes, budRes, projRes] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/transactions'),
        apiFetch('/api/categories'),
        apiFetch('/api/recurring'),
        apiFetch('/api/budgets'),
        apiFetch('/api/projection'),
      ])
      setAccounts(acRes.accounts)
      setNetWorth(acRes.net_worth)
      setTransactions(txRes)
      setCategories(catRes)
      setRecurring(recRes)
      setBudgets(budRes)
      setProjection(projRes)
    } catch (err) {
      console.error('Load error:', err)
    }
  }, [])

  async function handleReset() {
    await apiFetch('/api/reset', { method: 'DELETE' })
    loadAll()
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Personal Finance Tracker</h1>
        <button data-testid="reset-btn" onClick={handleReset} style={{ ...styles.btn, background: '#e74c3c' }}>
          Delete All Data
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <AccountsPanel
          accounts={accounts}
          netWorth={netWorth}
          onCreated={loadAll}
        />
        <TransactionsPanel
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          onCreated={loadAll}
        />
        <RecurringPanel
          accounts={accounts}
          categories={categories}
          recurring={recurring}
          onCreated={loadAll}
          onChanged={loadAll}
        />
        <BudgetPanel
          categories={categories}
          budgets={budgets}
          onCreated={loadAll}
        />
      </div>

      <ProjectionPanel projection={projection} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function today() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

const styles = {
  panel: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  form: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    padding: '6px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: 14,
  },
  btn: {
    padding: '6px 14px',
    background: '#4a90e2',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
  },
  smallBtn: {
    padding: '3px 10px',
    background: '#7f8c8d',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  card: {
    padding: '8px 12px',
    border: '1px solid #eee',
    borderRadius: 6,
    marginBottom: 6,
    background: '#fafafa',
  },
  th: {
    padding: '6px 10px',
    background: '#f0f0f0',
    border: '1px solid #ddd',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '4px 10px',
    border: '1px solid #eee',
    whiteSpace: 'nowrap',
  },
}
