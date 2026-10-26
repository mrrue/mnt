const path = require('path');
const fs = require('fs');

// Ensure data and upload directories exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'isp_system.db');

let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
} catch (e) {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
}

// Add transaction helper if not natively present
if (!db.transaction) {
  db.transaction = function(fn) {
    return function(...args) {
      db.exec('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch(e){}
        throw err;
      }
    };
  };
}

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  db.exec(`
    -- Application Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'employee')),
      designation TEXT,
      is_active INTEGER DEFAULT 1,
      permissions TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payment Methods
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customer Statuses
    CREATE TABLE IF NOT EXISTS customer_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#10b981',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ticket Categories
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ticket Statuses
    CREATE TABLE IF NOT EXISTS ticket_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      is_closed INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Expense Categories
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Packages Table
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      speed TEXT NOT NULL,
      price REAL NOT NULL,
      billing_cycle TEXT DEFAULT 'monthly',
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers Table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cnic TEXT,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      email TEXT,
      address TEXT NOT NULL,
      area TEXT NOT NULL,
      package_id INTEGER REFERENCES packages(id),
      monthly_price REAL NOT NULL,
      installation_date DATE,
      subscription_start_date DATE,
      billing_cycle TEXT DEFAULT 'monthly',
      due_date INTEGER DEFAULT 10,
      status TEXT DEFAULT 'Active',
      connection_status TEXT DEFAULT 'Connected',
      balance REAL DEFAULT 0,
      notes TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Subscriptions History
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      package_id INTEGER NOT NULL REFERENCES packages(id),
      start_date DATE NOT NULL,
      renewal_date DATE,
      due_date DATE,
      amount REAL NOT NULL,
      discount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      status TEXT DEFAULT 'Active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payments Table
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      subscription_id INTEGER REFERENCES subscriptions(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_date DATE NOT NULL,
      billing_period TEXT NOT NULL,
      reference_number TEXT,
      notes TEXT,
      is_voided INTEGER DEFAULT 0,
      void_reason TEXT,
      voided_by INTEGER REFERENCES users(id),
      voided_at DATETIME,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tickets Table
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')),
      assigned_to INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'New',
      arrival_time DATETIME,
      departure_time DATETIME,
      fault_found TEXT,
      work_performed TEXT,
      parts_used TEXT,
      customer_comments TEXT,
      technician_notes TEXT,
      resolution TEXT,
      completion_date DATETIME,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ticket Messages
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ticket Attachments / Photos
    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      uploaded_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Expenses Table
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATE NOT NULL,
      employee_id INTEGER REFERENCES users(id),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      classification TEXT DEFAULT 'Business' CHECK(classification IN ('Business', 'Employee-related', 'Personal', 'Family', 'Other')),
      receipt_url TEXT,
      notes TEXT,
      entered_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Attendance Table
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES users(id),
      date DATE NOT NULL,
      clock_in_time TEXT,
      clock_out_time TEXT,
      clock_in_selfie TEXT,
      clock_out_selfie TEXT,
      clock_in_lat REAL,
      clock_in_lng REAL,
      clock_in_address TEXT,
      clock_out_lat REAL,
      clock_out_lng REAL,
      clock_out_address TEXT,
      status TEXT DEFAULT 'Present',
      hours_worked REAL DEFAULT 0,
      clock_in_permission_denied INTEGER DEFAULT 0,
      clock_out_permission_denied INTEGER DEFAULT 0,
      device_info TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, date)
    );

    -- Notifications Table
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Files Table
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      entity_type TEXT,
      entity_id TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_class ON expenses(classification);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
  `);

  // Migrations for payments table to track balance progression
  try {
    db.prepare('ALTER TABLE payments ADD COLUMN previous_balance REAL DEFAULT 0').run();
  } catch (e) {
    // Column already exists
  }
  try {
    db.prepare('ALTER TABLE payments ADD COLUMN remaining_balance REAL DEFAULT 0').run();
  } catch (e) {
    // Column already exists
  }
}

initDatabase();

module.exports = {
  db,
  initDatabase
};
