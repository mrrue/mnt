const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requirePermission, logAudit } = require('../middleware/auth');

// GET /api/payments - List payments with pagination, filters, and search
router.get('/', authenticateToken, (req, res) => {
  try {
    const {
      search,
      customer_id,
      payment_method,
      start_date,
      end_date,
      is_voided,
      page = 1,
      limit = 50
    } = req.query;

    let query = `
      SELECT p.*, c.name as customer_name, c.customer_code, c.phone as customer_phone,
             c.address as customer_address, c.area as customer_area,
             pkg.name as package_name,
             u.full_name as created_by_name, v.full_name as voided_by_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN packages pkg ON c.package_id = pkg.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users v ON p.voided_by = v.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (
        p.receipt_number LIKE ? OR
        p.reference_number LIKE ? OR
        c.customer_code LIKE ? OR
        c.name LIKE ? OR
        c.phone LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (customer_id) {
      query += ' AND p.customer_id = ?';
      params.push(customer_id);
    }

    if (payment_method) {
      query += ' AND p.payment_method = ?';
      params.push(payment_method);
    }

    if (start_date) {
      query += ' AND p.payment_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND p.payment_date <= ?';
      params.push(end_date);
    }

    if (is_voided !== undefined) {
      query += ' AND p.is_voided = ?';
      params.push(is_voided === 'true' || is_voided === '1' ? 1 : 0);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const totalCount = db.prepare(countQuery).get(...params).total;

    query += ' ORDER BY p.payment_date DESC, p.created_at DESC';

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    query += ' LIMIT ? OFFSET ?';
    params.push(parsedLimit, offset);

    const payments = db.prepare(query).all(...params);

    // Calculate sum of active payments matching filters
    const sumQuery = `
      SELECT SUM(p.amount) as total_amount
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.is_voided = 0
      ${start_date ? ' AND p.payment_date >= "' + start_date + '"' : ''}
      ${end_date ? ' AND p.payment_date <= "' + end_date + '"' : ''}
      ${payment_method ? ' AND p.payment_method = "' + payment_method + '"' : ''}
      ${customer_id ? ' AND p.customer_id = ' + customer_id : ''}
    `;
    const sumResult = db.prepare(sumQuery).get();

    res.json({
      data: payments,
      total_amount: sumResult ? (sumResult.total_amount || 0) : 0,
      pagination: {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(totalCount / parsedLimit)
      }
    });
  } catch (err) {
    console.error('Fetch payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments.' });
  }
});

// GET /api/payments/stats - Quick stats (today, this month)
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstDayOfMonth = today.substring(0, 7) + '-01';

    const todayStats = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE payment_date = ? AND is_voided = 0
    `).get(today);

    const monthStats = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE payment_date >= ? AND is_voided = 0
    `).get(firstDayOfMonth);

    const methodStats = db.prepare(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE payment_date >= ? AND is_voided = 0
      GROUP BY payment_method
    `).all(firstDayOfMonth);

    res.json({
      today: todayStats,
      month: monthStats,
      methods: methodStats
    });
  } catch (err) {
    console.error('Payment stats error:', err);
    res.status(500).json({ error: 'Failed to fetch payment stats.' });
  }
});

// GET /api/payments/:id/receipt - Fetch complete receipt data
router.get('/:id/receipt', authenticateToken, (req, res) => {
  try {
    const payment = db.prepare(`
      SELECT p.*, c.name as customer_name, c.customer_code, c.phone as customer_phone,
             c.address as customer_address, c.area as customer_area, c.cnic as customer_cnic,
             c.balance as current_balance,
             pkg.name as package_name, pkg.speed as package_speed,
             u.full_name as collector_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN packages pkg ON c.package_id = pkg.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    // Fetch receipt settings and business info
    const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('business_info', 'receipt_settings', 'branding')").all();
    const settings = {};
    settingsRows.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch (e) {
        settings[row.key] = row.value;
      }
    });

    res.json({
      payment,
      settings
    });
  } catch (err) {
    console.error('Receipt fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch receipt.' });
  }
});

// POST /api/payments - Enter manual payment
router.post('/', authenticateToken, requirePermission('payment_create'), (req, res) => {
  try {
    const {
      customer_id,
      amount,
      payment_method,
      payment_date,
      billing_period,
      reference_number,
      notes
    } = req.body;

    if (!customer_id || !amount || !payment_method) {
      return res.status(400).json({ error: 'Customer, amount, and payment method are required.' });
    }

    const cust = db.prepare('SELECT * FROM customers WHERE id = ? AND is_deleted = 0').get(customer_id);
    if (!cust) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const payDate = payment_date || new Date().toISOString().split('T')[0];
    const dateStr = payDate.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receipt_number = `REC-${dateStr}-${randomSuffix}`;

    const numAmount = parseFloat(amount);
    const prevBalance = cust.balance || 0;
    const newBalance = Math.max(prevBalance - numAmount, 0);

    // Insert payment in transaction
    const insertPayment = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO payments (
          receipt_number, customer_id, amount, payment_method,
          payment_date, billing_period, reference_number, notes,
          previous_balance, remaining_balance, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        receipt_number,
        customer_id,
        numAmount,
        payment_method,
        payDate,
        billing_period || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        reference_number || null,
        notes || null,
        prevBalance,
        newBalance,
        req.user.id
      );

      // Update customer balance (reduce overdue balance)
      db.prepare(`
        UPDATE customers
        SET balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newBalance, customer_id);

      return result.lastInsertRowid;
    });

    const paymentId = insertPayment();

    logAudit(req.user.id, req.user.full_name, 'PAYMENT_CREATE', 'payments', paymentId, { receipt_number, customer_id, amount: numAmount, payment_method }, req.ip);

    res.status(201).json({
      message: 'Payment recorded successfully.',
      id: paymentId,
      receipt_number
    });
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

// POST /api/payments/:id/void - Void payment with audit trail
router.post('/:id/void', authenticateToken, requirePermission('payment_void'), (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Reason for voiding payment is required.' });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found.' });
    }

    if (payment.is_voided) {
      return res.status(400).json({ error: 'Payment has already been voided.' });
    }

    // Void transaction: set voided flag and restore customer balance
    const voidTx = db.transaction(() => {
      db.prepare(`
        UPDATE payments
        SET is_voided = 1, void_reason = ?, voided_by = ?, voided_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, req.user.id, payment.id);

      // Add amount back to customer balance
      db.prepare(`
        UPDATE customers
        SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(payment.amount, payment.customer_id);
    });

    voidTx();

    logAudit(req.user.id, req.user.full_name, 'PAYMENT_VOID', 'payments', payment.id, { receipt_number: payment.receipt_number, reason, amount: payment.amount }, req.ip);

    res.json({ message: 'Payment voided successfully. Audit trail recorded.' });
  } catch (err) {
    console.error('Void payment error:', err);
    res.status(500).json({ error: 'Failed to void payment.' });
  }
});

// DELETE /api/payments/:id - Hard delete payment and readjust customer balance
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const isAllowed = req.user.role === 'admin' || req.user.role === 'manager' || (req.user.permissions && req.user.permissions.includes('payment_void'));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to delete payments.' });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    const deleteTx = db.transaction(() => {
      // If payment was not already voided, restore customer balance
      if (!payment.is_voided) {
        db.prepare(`
          UPDATE customers
          SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(payment.amount, payment.customer_id);
      }

      db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
    });

    deleteTx();

    logAudit(req.user.id, req.user.full_name, 'PAYMENT_DELETE', 'payments', payment.id, {
      receipt_number: payment.receipt_number,
      customer_id: payment.customer_id,
      amount: payment.amount
    }, req.ip);

    res.json({ message: 'Payment record deleted and customer balance adjusted.' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({ error: 'Failed to delete payment.' });
  }
});

module.exports = router;
