const express = require('express');
const router = express.Router();
const path = require('path');
const { db } = require('../db');
const { authenticateToken, requirePermission, logAudit } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/tickets - List tickets with search and filters
router.get('/', authenticateToken, (req, res) => {
  try {
    const {
      search,
      status,
      category,
      priority,
      assigned_to,
      customer_id,
      date_from,
      date_to,
      my_tickets,
      page = 1,
      limit = 50
    } = req.query;

    let query = `
      SELECT t.*, c.customer_code, c.area as customer_area,
             u.full_name as technician_name, u.phone as technician_phone,
             cby.full_name as created_by_name,
             (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
             (SELECT COUNT(*) FROM ticket_attachments WHERE ticket_id = t.id) as attachment_count
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cby ON t.created_by = cby.id
      WHERE 1=1
    `;
    const params = [];

    // If technician or my_tickets requested
    if (my_tickets === 'true' || (req.user.role === 'employee' && !req.user.permissions.includes('helpdesk_manage'))) {
      query += ' AND t.assigned_to = ?';
      params.push(req.user.id);
    } else if (assigned_to) {
      query += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }

    if (search) {
      query += ` AND (
        t.ticket_number LIKE ? OR
        t.customer_name LIKE ? OR
        t.customer_phone LIKE ? OR
        t.customer_address LIKE ? OR
        t.description LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND t.category = ?';
      params.push(category);
    }

    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }

    if (customer_id) {
      query += ' AND t.customer_id = ?';
      params.push(customer_id);
    }

    if (date_from) {
      query += ' AND t.created_at >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND t.created_at <= ?';
      params.push(date_to + ' 23:59:59');
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const totalCount = db.prepare(countQuery).get(...params).total;

    query += " ORDER BY CASE t.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, t.created_at DESC";

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    query += ' LIMIT ? OFFSET ?';
    params.push(parsedLimit, offset);

    const tickets = db.prepare(query).all(...params);

    res.json({
      data: tickets,
      pagination: {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(totalCount / parsedLimit)
      }
    });
  } catch (err) {
    console.error('Fetch tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
});

// GET /api/tickets/stats - Ticket counts by status
router.get('/stats', authenticateToken, (req, res) => {
  try {
    let filterClause = '';
    const params = [];

    if (req.user.role === 'employee' && !req.user.permissions.includes('helpdesk_manage')) {
      filterClause = ' WHERE assigned_to = ?';
      params.push(req.user.id);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM tickets ${filterClause}`).get(...params).count;
    const newCount = db.prepare(`SELECT COUNT(*) as count FROM tickets ${filterClause ? filterClause + ' AND' : 'WHERE'} status = 'New'`).get(...params).count;
    const inProgress = db.prepare(`SELECT COUNT(*) as count FROM tickets ${filterClause ? filterClause + ' AND' : 'WHERE'} status IN ('Assigned', 'Accepted', 'In Progress', 'Waiting')`).get(...params).count;
    const completed = db.prepare(`SELECT COUNT(*) as count FROM tickets ${filterClause ? filterClause + ' AND' : 'WHERE'} status IN ('Resolved', 'Completed')`).get(...params).count;

    const byCategory = db.prepare(`SELECT category, COUNT(*) as count FROM tickets ${filterClause} GROUP BY category`).all(...params);
    const byPriority = db.prepare(`SELECT priority, COUNT(*) as count FROM tickets ${filterClause} GROUP BY priority`).all(...params);

    res.json({
      total,
      new: newCount,
      in_progress: inProgress,
      completed,
      by_category: byCategory,
      by_priority: byPriority
    });
  } catch (err) {
    console.error('Ticket stats error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket stats.' });
  }
});

// GET /api/tickets/:id - Detailed ticket view
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const ticket = db.prepare(`
      SELECT t.*, c.customer_code, c.area as customer_area, c.package_id,
             pkg.name as package_name, pkg.speed as package_speed,
             u.full_name as technician_name, u.phone as technician_phone,
             cby.full_name as created_by_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN packages pkg ON c.package_id = pkg.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cby ON t.created_by = cby.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    // Check permission if employee
    if (req.user.role === 'employee' && !req.user.permissions.includes('helpdesk_manage') && ticket.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to view this ticket.' });
    }

    // Ticket messages
    const messages = db.prepare(`
      SELECT m.*, u.full_name as sender_name, u.role as sender_role
      FROM ticket_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC
    `).all(ticket.id);

    // Ticket attachments
    const attachments = db.prepare(`
      SELECT a.*, u.full_name as uploaded_by_name
      FROM ticket_attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.ticket_id = ?
      ORDER BY a.created_at DESC
    `).all(ticket.id);

    // Customer previous ticket history if customer linked
    let customerHistory = [];
    if (ticket.customer_id) {
      customerHistory = db.prepare(`
        SELECT id, ticket_number, category, description, status, resolution, created_at, completion_date
        FROM tickets
        WHERE customer_id = ? AND id != ?
        ORDER BY created_at DESC
      `).all(ticket.customer_id, ticket.id);
    }

    res.json({
      ticket,
      messages,
      attachments,
      customer_history: customerHistory
    });
  } catch (err) {
    console.error('Fetch ticket details error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket.' });
  }
});

// POST /api/tickets - Create new ticket
router.post('/', authenticateToken, requirePermission('helpdesk_view'), (req, res) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_phone,
      customer_address,
      category,
      description,
      priority,
      assigned_to
    } = req.body;

    let finalName = customer_name;
    let finalPhone = customer_phone;
    let finalAddress = customer_address;

    if (customer_id) {
      const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
      if (cust) {
        finalName = cust.name;
        finalPhone = cust.phone;
        finalAddress = cust.address;
      }
    }

    if (!finalName || !finalPhone || !finalAddress || !category || !description) {
      return res.status(400).json({ error: 'Customer name, phone, address, category, and description are required.' });
    }

    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ticket_number = `TCK-${todayStr}-${rand}`;

    const stmt = db.prepare(`
      INSERT INTO tickets (
        ticket_number, customer_id, customer_name, customer_phone,
        customer_address, category, description, priority, assigned_to,
        status, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      ticket_number,
      customer_id || null,
      finalName.trim(),
      finalPhone.trim(),
      finalAddress.trim(),
      category,
      description.trim(),
      priority || 'Medium',
      assigned_to || null,
      assigned_to ? 'Assigned' : 'New',
      req.user.id
    );

    const ticketId = result.lastInsertRowid;

    // Create in-app notification if technician assigned
    if (assigned_to) {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, link, type)
        VALUES (?, ?, ?, ?, 'ticket')
      `).run(
        assigned_to,
        'New Ticket Assigned',
        `You have been assigned ticket #${ticket_number}: ${category} for ${finalName}`,
        `/helpdesk/tickets/${ticketId}`
      );
    }

    logAudit(req.user.id, req.user.full_name, 'TICKET_CREATE', 'tickets', ticketId, { ticket_number, category, priority, assigned_to }, req.ip);

    res.status(201).json({
      message: 'Ticket created successfully.',
      id: ticketId,
      ticket_number
    });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

// PUT /api/tickets/:id - Update ticket assignment, priority, status
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const {
      category,
      description,
      priority,
      assigned_to,
      status,
      customer_name,
      customer_phone,
      customer_address
    } = req.body;

    const newAssignedTo = assigned_to !== undefined ? (assigned_to ? parseInt(assigned_to) : null) : ticket.assigned_to;
    const newStatus = status !== undefined ? status : ticket.status;

    // If technician assignment changed, notify new technician
    if (newAssignedTo && newAssignedTo !== ticket.assigned_to) {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, link, type)
        VALUES (?, ?, ?, ?, 'ticket')
      `).run(
        newAssignedTo,
        'Ticket Assigned',
        `Ticket #${ticket.ticket_number} has been assigned to you.`,
        `/helpdesk/tickets/${ticket.id}`
      );
    }

    db.prepare(`
      UPDATE tickets
      SET
        category = ?, description = ?, priority = ?, assigned_to = ?,
        status = ?, customer_name = ?, customer_phone = ?, customer_address = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      category !== undefined ? category : ticket.category,
      description !== undefined ? description : ticket.description,
      priority !== undefined ? priority : ticket.priority,
      newAssignedTo,
      newStatus,
      customer_name !== undefined ? customer_name : ticket.customer_name,
      customer_phone !== undefined ? customer_phone : ticket.customer_phone,
      customer_address !== undefined ? customer_address : ticket.customer_address,
      req.user.id,
      req.params.id
    );

    logAudit(req.user.id, req.user.full_name, 'TICKET_UPDATE', 'tickets', ticket.id, { status: newStatus, assigned_to: newAssignedTo }, req.ip);

    res.json({ message: 'Ticket updated successfully.' });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ error: 'Failed to update ticket.' });
  }
});

// POST /api/tickets/:id/worklog - Technician records work & completion
router.post('/:id/worklog', authenticateToken, (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const {
      arrival_time,
      departure_time,
      fault_found,
      work_performed,
      parts_used,
      customer_comments,
      technician_notes,
      resolution,
      status
    } = req.body;

    const isCompleted = status === 'Completed' || status === 'Resolved';
    const completionDate = isCompleted ? (new Date().toISOString()) : ticket.completion_date;

    db.prepare(`
      UPDATE tickets
      SET
        arrival_time = ?,
        departure_time = ?,
        fault_found = ?,
        work_performed = ?,
        parts_used = ?,
        customer_comments = ?,
        technician_notes = ?,
        resolution = ?,
        status = ?,
        completion_date = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      arrival_time || ticket.arrival_time,
      departure_time || ticket.departure_time,
      fault_found || ticket.fault_found,
      work_performed || ticket.work_performed,
      parts_used || ticket.parts_used,
      customer_comments || ticket.customer_comments,
      technician_notes || ticket.technician_notes,
      resolution || ticket.resolution,
      status || ticket.status,
      completionDate,
      req.user.id,
      ticket.id
    );

    logAudit(req.user.id, req.user.full_name, 'TICKET_WORKLOG', 'tickets', ticket.id, { status, resolution }, req.ip);

    res.json({ message: 'Work log recorded successfully.' });
  } catch (err) {
    console.error('Work log error:', err);
    res.status(500).json({ error: 'Failed to record work log.' });
  }
});

// POST /api/tickets/:id/messages - In-ticket messaging
router.post('/:id/messages', authenticateToken, upload.single('attachment'), (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const { message } = req.body;
    if (!message && !req.file) {
      return res.status(400).json({ error: 'Message text or attachment is required.' });
    }

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const attachmentName = req.file ? req.file.originalname : null;

    const stmt = db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_id, message, attachment_url, attachment_name)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(ticket.id, req.user.id, message || '', attachmentUrl, attachmentName);

    // If attached file, also add to ticket_attachments
    if (req.file) {
      db.prepare(`
        INSERT INTO ticket_attachments (ticket_id, file_name, file_path, file_type, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.file.originalname, attachmentUrl, req.file.mimetype, req.file.size, req.user.id);
    }

    res.status(201).json({
      message: 'Message posted.',
      id: result.lastInsertRowid,
      attachment_url: attachmentUrl
    });
  } catch (err) {
    console.error('Post message error:', err);
    res.status(500).json({ error: 'Failed to post message.' });
  }
});

// POST /api/tickets/:id/attachments - Upload photos/documents
router.post('/:id/attachments', authenticateToken, upload.array('files', 10), (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const insertAttachment = db.transaction(() => {
      req.files.forEach(file => {
        db.prepare(`
          INSERT INTO ticket_attachments (ticket_id, file_name, file_path, file_type, file_size, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(file.originalname, `/uploads/${file.filename}`, file.mimetype, file.size, req.user.id);
      });
    });

    insertAttachment();

    logAudit(req.user.id, req.user.full_name, 'TICKET_UPLOAD', 'tickets', ticket.id, { filesCount: req.files.length }, req.ip);

    res.status(201).json({ message: 'Files uploaded successfully.' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload attachments.' });
  }
});

// DELETE /api/tickets/:id - Delete ticket and associated messages/attachments
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const isAllowed = req.user.role === 'admin' || req.user.role === 'manager' || (req.user.permissions && req.user.permissions.includes('helpdesk_manage'));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to delete tickets.' });
    }

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    // Delete ticket in transaction (ON DELETE CASCADE handles messages and attachments)
    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(ticket.id);
      db.prepare('DELETE FROM ticket_attachments WHERE ticket_id = ?').run(ticket.id);
      db.prepare('DELETE FROM tickets WHERE id = ?').run(ticket.id);
    });

    deleteTx();

    logAudit(req.user.id, req.user.full_name, 'TICKET_DELETE', 'tickets', ticket.id, {
      ticket_number: ticket.ticket_number,
      customer_name: ticket.customer_name,
      category: ticket.category
    }, req.ip);

    res.json({ message: 'Ticket deleted successfully.' });
  } catch (err) {
    console.error('Delete ticket error:', err);
    res.status(500).json({ error: 'Failed to delete ticket.' });
  }
});

module.exports = router;
