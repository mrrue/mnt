const express = require('express');
const router = express.Router();
const fs = require('fs');
const xlsx = require('xlsx');
const { db } = require('../db');
const { authenticateToken, requirePermission, logAudit } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/customers - List customers with filtering, search, and pagination
router.get('/', authenticateToken, (req, res) => {
  try {
    const {
      search,
      status,
      area,
      package_id,
      connection_status,
      due_date,
      page = 1,
      limit = 50,
      sort_by = 'name',
      sort_dir = 'ASC'
    } = req.query;

    let query = `
      SELECT c.*, p.name as package_name, p.speed as package_speed
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.is_deleted = 0
    `;
    const params = [];

    if (search) {
      query += ` AND (
        c.customer_code LIKE ? OR
        c.name LIKE ? OR
        c.phone LIKE ? OR
        c.alt_phone LIKE ? OR
        c.address LIKE ? OR
        c.area LIKE ? OR
        c.cnic LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term);
    }

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    if (area) {
      query += ' AND c.area = ?';
      params.push(area);
    }

    if (package_id) {
      query += ' AND c.package_id = ?';
      params.push(package_id);
    }

    if (connection_status) {
      query += ' AND c.connection_status = ?';
      params.push(connection_status);
    }

    if (due_date) {
      query += ' AND c.due_date = ?';
      params.push(parseInt(due_date));
    }

    // Count total before pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const totalCount = db.prepare(countQuery).get(...params).total;

    // Sorting and pagination
    const allowedSortFields = ['customer_code', 'name', 'phone', 'area', 'monthly_price', 'due_date', 'status', 'created_at', 'balance'];
    const validSort = allowedSortFields.includes(sort_by) ? sort_by : 'name';
    const validDir = sort_dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    query += ` ORDER BY c.${validSort} ${validDir}`;

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    query += ' LIMIT ? OFFSET ?';
    params.push(parsedLimit, offset);

    const customers = db.prepare(query).all(...params);

    // Get list of distinct areas for filter dropdown
    const areas = db.prepare("SELECT DISTINCT area FROM customers WHERE is_deleted = 0 AND area IS NOT NULL AND area != '' ORDER BY area ASC").all().map(r => r.area);

    res.json({
      data: customers,
      pagination: {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(totalCount / parsedLimit)
      },
      areas
    });
  } catch (err) {
    console.error('Fetch customers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
});

// GET /api/customers/stats - Quick dashboard metrics
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0').get().count;
    const active = db.prepare("SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0 AND status = 'Active'").get().count;
    const suspended = db.prepare("SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0 AND status = 'Suspended'").get().count;
    const pending = db.prepare("SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0 AND status = 'Pending'").get().count;
    const overdue = db.prepare('SELECT COUNT(*) as count FROM customers WHERE is_deleted = 0 AND balance > 0').get().count;

    res.json({
      total,
      active,
      suspended,
      pending,
      overdue
    });
  } catch (err) {
    console.error('Customer stats error:', err);
    res.status(500).json({ error: 'Failed to fetch customer stats.' });
  }
});

// GET /api/customers/import-template - Download sample Excel template for bulk import
router.get('/import-template', (req, res) => {
  try {
    const templateData = [
      {
        'Name': 'Muhammad Ali',
        'Phone': '03001234567',
        'Alt Phone': '03219876543',
        'CNIC': '35201-1234567-1',
        'Area': 'Gulberg Block A',
        'Address': 'House 14, Street 2',
        'Package': 'Fiber 20 Mbps',
        'Monthly Price': 2500,
        'Due Date': 10,
        'Status': 'Active',
        'Balance': 0,
        'Notes': 'Standard fiber connection'
      },
      {
        'Name': 'Sara Ahmed',
        'Phone': '03335558888',
        'Alt Phone': '',
        'CNIC': '35202-9876543-2',
        'Area': 'Model Town C',
        'Address': 'Flat 302, Green Heights',
        'Package': 'Fiber 10 Mbps',
        'Monthly Price': 1800,
        'Due Date': 15,
        'Status': 'Active',
        'Balance': 0,
        'Notes': ''
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Customers');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="customers_bulk_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({ error: 'Failed to generate customer template.' });
  }
});

// POST /api/customers/import - Bulk import customers from Excel or CSV
router.post('/import', authenticateToken, requirePermission('customer_manage'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an Excel (.xlsx/.xls) or CSV file.' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Cleanup temp file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty or has no data rows.' });
    }

    const packages = db.prepare('SELECT id, name, price FROM packages WHERE is_active = 1').all();
    const defaultPackage = packages[0] || { id: null, price: 0 };

    const lastCust = db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get();
    let currentIdSeq = lastCust ? lastCust.id : 1000;

    const today = new Date().toISOString().split('T')[0];
    const errors = [];
    let importedCount = 0;

    const importTx = db.transaction(() => {
      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2; // +1 for 0-index, +1 for header
        // Flexible key matching
        const findVal = (keys) => {
          for (const k of Object.keys(row)) {
            const cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const target of keys) {
              if (cleanK === target.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                return row[k];
              }
            }
          }
          return undefined;
        };

        const name = findVal(['name', 'customername', 'fullname', 'clientname']);
        const phone = findVal(['phone', 'phonenumber', 'mobile', 'contact', 'cell']);
        const altPhone = findVal(['altphone', 'alternatephone', 'secondaryphone']) || null;
        const cnic = findVal(['cnic', 'idcard', 'nic']) || null;
        const address = findVal(['address', 'street', 'location']) || 'Pending Address';
        const area = findVal(['area', 'sector', 'zone', 'city']) || 'Main Area';
        const pkgName = findVal(['package', 'packagename', 'plan', 'speed']);
        const priceVal = findVal(['monthlyprice', 'price', 'rate', 'fee', 'amount']);
        const dueDateVal = findVal(['duedate', 'billingday', 'due']);
        const statusVal = findVal(['status']) || 'Active';
        const balanceVal = findVal(['balance', 'dues', 'arrears', 'outstanding']) || 0;
        const notes = findVal(['notes', 'remarks', 'comment']) || 'Bulk Imported';

        if (!name || !phone) {
          errors.push(`Row ${rowNum}: Skipped because Name or Phone is missing.`);
          return;
        }

        // Match package
        let matchedPkg = defaultPackage;
        if (pkgName) {
          const found = packages.find(p => p.name.toLowerCase().includes(String(pkgName).trim().toLowerCase()));
          if (found) matchedPkg = found;
        }

        const finalPrice = priceVal !== undefined && priceVal !== '' && !isNaN(priceVal)
          ? parseFloat(priceVal)
          : (matchedPkg.price || 0);

        currentIdSeq += 1;
        const customer_code = `CUST-${String(currentIdSeq).padStart(4, '0')}`;

        const insertStmt = db.prepare(`
          INSERT INTO customers (
            customer_code, name, cnic, phone, alt_phone, email, address, area,
            package_id, monthly_price, installation_date, subscription_start_date,
            billing_cycle, due_date, status, connection_status, balance, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
          customer_code,
          String(name).trim(),
          cnic ? String(cnic).trim() : null,
          String(phone).trim(),
          altPhone ? String(altPhone).trim() : null,
          null,
          String(address).trim(),
          String(area).trim(),
          matchedPkg.id,
          finalPrice,
          today,
          today,
          'monthly',
          parseInt(dueDateVal) || 10,
          statusVal,
          'Connected',
          parseFloat(balanceVal) || 0,
          String(notes).trim()
        );

        const newCustId = result.lastInsertRowid;

        // Create initial subscription if package exists
        if (matchedPkg.id) {
          db.prepare(`
            INSERT INTO subscriptions (customer_id, package_id, start_date, amount, final_amount, status, notes)
            VALUES (?, ?, ?, ?, ?, 'Active', 'Bulk Excel Import')
          `).run(newCustId, matchedPkg.id, today, finalPrice, finalPrice);
        }

        importedCount++;
      });
    });

    importTx();

    logAudit(req.user.id, req.user.full_name, 'CUSTOMER_BULK_IMPORT', 'customers', null, {
      totalRows: rawRows.length,
      importedCount,
      errorsCount: errors.length
    }, req.ip);

    res.json({
      message: `Successfully imported ${importedCount} customers.`,
      importedCount,
      totalRows: rawRows.length,
      errors
    });
  } catch (err) {
    console.error('Bulk import error:', err);
    try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: err.message || 'Failed to process Excel file.' });
  }
});

// GET /api/customers/:id - Detailed customer profile with complete history
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const customer = db.prepare(`
      SELECT c.*, p.name as package_name, p.speed as package_speed
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.id = ? AND c.is_deleted = 0
    `).get(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Historical Subscriptions
    const subscriptions = db.prepare(`
      SELECT s.*, p.name as package_name, p.speed as package_speed
      FROM subscriptions s
      LEFT JOIN packages p ON s.package_id = p.id
      WHERE s.customer_id = ?
      ORDER BY s.created_at DESC
    `).all(req.params.id);

    // Historical Payments
    const payments = db.prepare(`
      SELECT p.*, u.full_name as created_by_name, v.full_name as voided_by_name
      FROM payments p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users v ON p.voided_by = v.id
      WHERE p.customer_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC
    `).all(req.params.id);

    // Historical Complaints / Tickets
    const tickets = db.prepare(`
      SELECT t.*, u.full_name as technician_name, cby.full_name as created_by_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cby ON t.created_by = cby.id
      WHERE t.customer_id = ?
      ORDER BY t.created_at DESC
    `).all(req.params.id);

    // Fetch attachments and messages for these tickets
    const ticketsWithDetails = tickets.map(ticket => {
      const messages = db.prepare(`
        SELECT m.*, u.full_name as sender_name, u.role as sender_role
        FROM ticket_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.ticket_id = ?
        ORDER BY m.created_at ASC
      `).all(ticket.id);

      const attachments = db.prepare(`
        SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at DESC
      `).all(ticket.id);

      return {
        ...ticket,
        messages,
        attachments
      };
    });

    res.json({
      customer,
      subscriptions,
      payments,
      tickets: ticketsWithDetails
    });
  } catch (err) {
    console.error('Fetch customer profile error:', err);
    res.status(500).json({ error: 'Failed to fetch customer profile.' });
  }
});

// POST /api/customers - Create new customer
router.post('/', authenticateToken, requirePermission('customer_manage'), (req, res) => {
  try {
    const {
      customer_code: customCustomerCode,
      name,
      cnic,
      phone,
      alt_phone,
      email,
      address,
      area,
      package_id,
      monthly_price,
      installation_date,
      subscription_start_date,
      billing_cycle,
      due_date,
      status,
      connection_status,
      balance,
      notes
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required.' });
    }

    // Auto-generate or format custom customer ID, e.g. CUST-1001
    let customer_code = customCustomerCode ? customCustomerCode.trim() : '';
    if (!customer_code) {
      const lastCust = db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get();
      const nextId = lastCust ? lastCust.id + 1 : 1001;
      customer_code = `CUST-${String(nextId).padStart(4, '0')}`;
    }

    // Find default package if not provided
    const packages = db.prepare('SELECT id, name, price FROM packages WHERE is_active = 1').all();
    const defaultPackage = packages[0] || { id: null, price: 0 };
    const finalPackageId = package_id || defaultPackage.id;

    // Get package details for price if not custom
    let finalPrice = monthly_price;
    if (finalPackageId) {
      const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(finalPackageId);
      if (finalPrice === undefined || finalPrice === null || finalPrice === '') {
        finalPrice = pkg ? pkg.price : 0;
      }
    } else {
      finalPrice = finalPrice || 0;
    }

    const today = new Date().toISOString().split('T')[0];
    const subStart = subscription_start_date || today;
    const initialBalance = balance !== undefined && balance !== null && balance !== '' ? parseFloat(balance) : 0;

    const insertStmt = db.prepare(`
      INSERT INTO customers (
        customer_code, name, cnic, phone, alt_phone, email, address, area,
        package_id, monthly_price, installation_date, subscription_start_date,
        billing_cycle, due_date, status, connection_status, balance, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      customer_code,
      name.trim(),
      cnic ? cnic.trim() : null,
      phone ? phone.trim() : '',
      alt_phone ? alt_phone.trim() : null,
      email ? email.trim() : null,
      address.trim(),
      (area || 'Main Area').trim(),
      finalPackageId,
      parseFloat(finalPrice) || 0,
      installation_date || today,
      subStart,
      billing_cycle || 'monthly',
      parseInt(due_date) || 10,
      status || 'Active',
      connection_status || 'Connected',
      initialBalance,
      notes || null
    );

    const customerId = result.lastInsertRowid;

    // Create initial subscription record
    db.prepare(`
      INSERT INTO subscriptions (customer_id, package_id, start_date, renewal_date, amount, final_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      package_id,
      subStart,
      null,
      parseFloat(finalPrice),
      parseFloat(finalPrice),
      'Active',
      'Initial Subscription'
    );

    logAudit(req.user.id, req.user.full_name, 'CUSTOMER_CREATE', 'customers', customerId, { customer_code, name, phone, package_id }, req.ip);

    res.status(201).json({
      message: 'Customer created successfully.',
      id: customerId,
      customer_code
    });
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Failed to create customer.' });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', authenticateToken, requirePermission('customer_manage'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND is_deleted = 0').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const {
      name,
      cnic,
      phone,
      alt_phone,
      email,
      address,
      area,
      package_id,
      monthly_price,
      installation_date,
      subscription_start_date,
      billing_cycle,
      due_date,
      status,
      connection_status,
      notes,
      balance
    } = req.body;

    const newPackageId = package_id !== undefined ? parseInt(package_id) : existing.package_id;
    const newPrice = monthly_price !== undefined ? parseFloat(monthly_price) : existing.monthly_price;

    // Check if package changed to record subscription history
    if (newPackageId !== existing.package_id || newPrice !== existing.monthly_price) {
      const today = new Date().toISOString().split('T')[0];
      // Mark previous active subscriptions as historical/changed
      db.prepare("UPDATE subscriptions SET status = 'Replaced' WHERE customer_id = ? AND status = 'Active'").run(existing.id);

      // Create new subscription record
      db.prepare(`
        INSERT INTO subscriptions (customer_id, package_id, start_date, amount, final_amount, status, notes)
        VALUES (?, ?, ?, ?, ?, 'Active', 'Package updated')
      `).run(existing.id, newPackageId, today, newPrice, newPrice);
    }

    db.prepare(`
      UPDATE customers
      SET
        name = ?, cnic = ?, phone = ?, alt_phone = ?, email = ?,
        address = ?, area = ?, package_id = ?, monthly_price = ?,
        installation_date = ?, subscription_start_date = ?, billing_cycle = ?,
        due_date = ?, status = ?, connection_status = ?, notes = ?, balance = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      cnic !== undefined ? cnic : existing.cnic,
      phone !== undefined ? phone.trim() : existing.phone,
      alt_phone !== undefined ? alt_phone : existing.alt_phone,
      email !== undefined ? email : existing.email,
      address !== undefined ? address.trim() : existing.address,
      area !== undefined ? area.trim() : existing.area,
      newPackageId,
      newPrice,
      installation_date !== undefined ? installation_date : existing.installation_date,
      subscription_start_date !== undefined ? subscription_start_date : existing.subscription_start_date,
      billing_cycle !== undefined ? billing_cycle : existing.billing_cycle,
      due_date !== undefined ? parseInt(due_date) : existing.due_date,
      status !== undefined ? status : existing.status,
      connection_status !== undefined ? connection_status : existing.connection_status,
      notes !== undefined ? notes : existing.notes,
      balance !== undefined ? parseFloat(balance) : existing.balance,
      req.params.id
    );

    logAudit(req.user.id, req.user.full_name, 'CUSTOMER_UPDATE', 'customers', req.params.id, { name, status, package_id: newPackageId }, req.ip);

    res.json({ message: 'Customer updated successfully.' });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer.' });
  }
});

// DELETE /api/customers/:id - Soft delete
router.delete('/:id', authenticateToken, requirePermission('customer_manage'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    db.prepare('UPDATE customers SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, req.user.full_name, 'CUSTOMER_DELETE', 'customers', req.params.id, { customer_code: existing.customer_code }, req.ip);

    res.json({ message: 'Customer deleted successfully (historical records retained).' });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: 'Failed to delete customer.' });
  }
});

module.exports = router;
