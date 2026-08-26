require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeExpenseDateInput(value) {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'spendwise',
  charset: 'utf8mb4',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
    const conn = await db.getConnection();
    console.log('MySQL connected to database:', process.env.DB_NAME || 'spendwise');
    conn.release();
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    console.error('Check your .env file and make sure MySQL is running.');
  }
})();

app.get('/api/health', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.json({
      success: true,
      server: 'running',
      database: 'connected',
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, server: 'running', database: 'error', error: err.message });
  }
});

app.get('/api/users/:user_id', async (req, res) => {
  const { user_id } = req.params;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

  try {
    const [rows] = await db.execute(
      'SELECT user_id, name, email, currency, monthly_budget FROM users WHERE user_id = ?',
      [user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/users/email/:email', async (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ success: false, error: 'email required' });

  try {
    const [rows] = await db.execute(
      'SELECT user_id, name, email, currency, monthly_budget FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email, currency = 'INR', monthly_budget = 0 } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  if (!email) return res.status(400).json({ success: false, error: 'email is required' });

  try {
    const [result] = await db.execute(
      'INSERT INTO users (name, email, currency, monthly_budget) VALUES (?, ?, ?, ?)',
      [name, email, currency, parseFloat(monthly_budget)]
    );

    const newUserId = result.insertId;

    const defaultCategories = [
      { name: 'Food & Dining', icon: '🍔', color: '#f5c518' },
      { name: 'Transport', icon: '🚗', color: '#4ecdc4' },
      { name: 'Shopping', icon: '🛍️', color: '#a78bfa' },
      { name: 'Entertainment', icon: '🎬', color: '#ff6b6b' },
      { name: 'Health', icon: '💊', color: '#22c55e' },
      { name: 'Bills', icon: '💡', color: '#f59e0b' },
      { name: 'Education', icon: '📚', color: '#60a5fa' },
      { name: 'Other', icon: '📦', color: '#94a3b8' }
    ];

    for (const cat of defaultCategories) {
      await db.execute(
        'INSERT INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)',
        [newUserId, cat.name, cat.icon, cat.color]
      );
    }

    res.status(201).json({
      success: true,
      insertedId: newUserId,
      message: 'User created successfully',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { name, currency = 'INR', monthly_budget = 0 } = req.body;

  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  const normalizedBudget = parseFloat(monthly_budget);
  if (Number.isNaN(normalizedBudget) || normalizedBudget < 0) {
    return res.status(400).json({ success: false, error: 'monthly_budget must be 0 or more' });
  }

  try {
    const [result] = await db.execute(
      'UPDATE users SET name = ?, currency = ?, monthly_budget = ? WHERE user_id = ?',
      [name, currency, normalizedBudget, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const [rows] = await db.execute(
      'SELECT user_id, name, email, currency, monthly_budget FROM users WHERE user_id = ?',
      [user_id]
    );

    res.json({ success: true, data: rows[0], message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/categories', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required' });

  try {
    const [rows] = await db.execute(
      'SELECT category_id, user_id, name, icon, color, budget_limit FROM categories WHERE user_id = ? ORDER BY name',
      [user_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { user_id, name, icon = '📦', color = '#94a3b8', budget_limit = null } = req.body;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required' });
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  try {
    const [result] = await db.execute(
      'INSERT INTO categories (user_id, name, icon, color, budget_limit) VALUES (?, ?, ?, ?, ?)',
      [user_id, name, icon, color, budget_limit ? parseFloat(budget_limit) : null]
    );
    res.status(201).json({
      success: true,
      insertedId: result.insertId,
      message: 'Category created successfully',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

  try {
    const [rows] = await db.execute(
      `SELECT
         e.expense_id,
         e.amount,
         e.description,
         e.expense_date,
         e.expense_time,
         e.payment_mode,
         e.created_at,
         c.name AS category_name,
         c.icon AS category_icon,
         c.color AS category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = ?
       ORDER BY e.expense_date DESC, e.expense_time DESC`,
      [user_id]
    );
    const data = rows.map((row) => ({
      ...row,
      expense_date: normalizeDateOnly(row.expense_date),
    }));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses/today', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

  try {
    const [rows] = await db.execute(
      `SELECT e.*, c.name AS category_name
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = ? AND e.expense_date = CURDATE()
       ORDER BY e.expense_time DESC`,
      [user_id]
    );
    const data = rows.map((row) => ({
      ...row,
      expense_date: normalizeDateOnly(row.expense_date),
    }));
    const total = data.reduce((sum, row) => sum + parseFloat(row.amount), 0);
    res.json({ success: true, data, total, count: data.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses/summary', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

  try {
    const [rows] = await db.execute(
      `SELECT
         COALESCE(c.name, 'Other') AS category,
         COALESCE(c.icon, '📦') AS icon,
         COALESCE(c.color, '#94a3b8') AS color,
         SUM(e.amount) AS total,
         COUNT(*) AS transaction_count,
         MAX(e.amount) AS highest_single,
         AVG(e.amount) AS average_spend
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = ?
         AND MONTH(e.expense_date) = MONTH(CURDATE())
         AND YEAR(e.expense_date) = YEAR(CURDATE())
       GROUP BY
         COALESCE(c.category_id, 0),
         COALESCE(c.name, 'Other'),
         COALESCE(c.icon, '📦'),
         COALESCE(c.color, '#94a3b8')
       ORDER BY total DESC`,
      [user_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses/daily', async (req, res) => {
  const { user_id, days = 14 } = req.query;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

  try {
    const dayCount = Number.parseInt(days, 10);
    const safeDays = Number.isNaN(dayCount) || dayCount <= 0 ? 14 : dayCount;
    const [rows] = await db.execute(
      `SELECT
         expense_date,
         SUM(amount) AS daily_total,
         COUNT(*) AS transaction_count
       FROM expenses
       WHERE user_id = ?
         AND expense_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY expense_date
       ORDER BY expense_date ASC`,
      [user_id, safeDays]
    );
    const data = rows.map((row) => ({
      ...row,
      expense_date: normalizeDateOnly(row.expense_date),
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { user_id, category_id, amount, description, expense_date, payment_mode } = req.body;
  const normalizedExpenseDate = normalizeExpenseDateInput(expense_date);

  if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required' });
  if (!amount) return res.status(400).json({ success: false, error: 'amount is required' });
  if (!normalizedExpenseDate) {
    return res.status(400).json({ success: false, error: 'expense_date must be in YYYY-MM-DD format' });
  }
  if (parseFloat(amount) <= 0) return res.status(400).json({ success: false, error: 'amount must be positive' });

  try {
    const [result] = await db.execute(
      `INSERT INTO expenses (user_id, category_id, amount, description, expense_date, payment_mode)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        category_id || null,
        parseFloat(amount),
        description || '',
        normalizedExpenseDate,
        payment_mode || 'UPI',
      ]
    );
    res.status(201).json({
      success: true,
      insertedId: result.insertId,
      message: 'Expense added successfully',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, description, category_id, expense_date, payment_mode } = req.body;
  const normalizedExpenseDate = normalizeExpenseDateInput(expense_date);
  if (!normalizedExpenseDate) {
    return res.status(400).json({ success: false, error: 'expense_date must be in YYYY-MM-DD format' });
  }

  try {
    await db.execute(
      `UPDATE expenses
       SET amount = ?, description = ?, category_id = ?, expense_date = ?, payment_mode = ?
       WHERE expense_id = ?`,
      [parseFloat(amount), description, category_id || null, normalizedExpenseDate, payment_mode, id]
    );
    res.json({ success: true, message: 'Expense updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.execute(
      'DELETE FROM expenses WHERE expense_id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted', deletedId: parseInt(id, 10) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('Spendwise backend running');
  console.log(`URL:  http://localhost:${PORT}`);
  console.log(`API:  http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('Endpoints:');
  console.log('GET  /api/health');
  console.log('GET  /api/expenses?user_id=1');
  console.log('GET  /api/expenses/today?user_id=1');
  console.log('GET  /api/expenses/summary?user_id=1');
  console.log('GET  /api/expenses/daily?user_id=1&days=14');
  console.log('POST /api/expenses');
  console.log('PUT  /api/expenses/:id');
  console.log('DELETE /api/expenses/:id');
  console.log('');
});
