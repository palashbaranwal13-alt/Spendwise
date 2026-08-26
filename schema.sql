CREATE DATABASE IF NOT EXISTS spendwise
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE spendwise;


CREATE TABLE IF NOT EXISTS users (
  user_id        INT           AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)  NOT NULL,
  email          VARCHAR(150)  UNIQUE NOT NULL,
  currency       CHAR(3)       DEFAULT 'INR',
  monthly_budget DECIMAL(12,2) DEFAULT 0.00 CHECK (monthly_budget >= 0),
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  category_id  INT          AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NOT NULL,
  name         VARCHAR(80)  NOT NULL,
  icon         VARCHAR(10)  DEFAULT '📦',
  color        VARCHAR(10)  DEFAULT '#94a3b8',
  budget_limit DECIMAL(12,2) DEFAULT NULL CHECK (budget_limit IS NULL OR budget_limit > 0),
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_category (user_id, name),
  INDEX idx_user_id (user_id)
);


CREATE TABLE IF NOT EXISTS expenses (
  expense_id   INT            AUTO_INCREMENT PRIMARY KEY,
  user_id      INT            NOT NULL,
  category_id  INT            DEFAULT NULL,
  amount       DECIMAL(12,2)  NOT NULL CHECK (amount > 0),
  description  VARCHAR(255)   DEFAULT '',
  expense_date DATE           NOT NULL,
  expense_time TIME           DEFAULT '00:00:00',
  payment_mode ENUM('Cash','Card','UPI','Net Banking','Other') DEFAULT 'UPI',
  notes        TEXT           DEFAULT NULL,
  created_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)     REFERENCES users(user_id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL,
  INDEX idx_user_date (user_id, expense_date),
  INDEX idx_category  (category_id)
);


CREATE OR REPLACE VIEW v_daily_totals AS
  SELECT
    user_id,
    expense_date,
    SUM(amount)  AS total_spent,
    COUNT(*)     AS transaction_count
  FROM expenses
  GROUP BY user_id, expense_date;

CREATE OR REPLACE VIEW v_monthly_category AS
  SELECT
    e.user_id,
    DATE_FORMAT(e.expense_date, '%Y-%m') AS month,
    c.name   AS category,
    c.icon,
    c.color,
    SUM(e.amount)   AS total,
    COUNT(*)        AS txn_count,
    AVG(e.amount)   AS avg_amount
  FROM expenses e
  JOIN categories c ON e.category_id = c.category_id
  GROUP BY e.user_id, DATE_FORMAT(e.expense_date, '%Y-%m'), c.category_id, c.name, c.icon, c.color;


INSERT INTO users (name, email, currency, monthly_budget)
VALUES ('Rahul Sharma', 'rahul@example.com', 'INR', 15000.00);

INSERT INTO categories (user_id, name, icon, color) VALUES
  (1, 'Food & Dining',  '🍔', '#f5c518'),
  (1, 'Transport',      '🚗', '#4ecdc4'),
  (1, 'Shopping',       '🛍️', '#a78bfa'),
  (1, 'Entertainment',  '🎬', '#ff6b6b'),
  (1, 'Health',         '💊', '#22c55e'),
  (1, 'Bills',          '💡', '#f59e0b'),
  (1, 'Education',      '📚', '#60a5fa'),
  (1, 'Other',          '📦', '#94a3b8');


INSERT INTO expenses (user_id, category_id, amount, description, expense_date, payment_mode) VALUES
  (1, 1, 320.00,  'Swiggy Dinner',        CURDATE(),                        'UPI'),
  (1, 2, 200.00,  'Metro Card Recharge',  CURDATE(),                        'UPI'),
  (1, 1, 850.00,  'Grocery Store',        DATE_SUB(CURDATE(), INTERVAL 1 DAY),  'Cash'),
  (1, 2, 145.00,  'Uber Ride',            DATE_SUB(CURDATE(), INTERVAL 1 DAY),  'UPI');
