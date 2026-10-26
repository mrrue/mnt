import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LifeBuoy,
  Search,
  Filter,
  Plus,
  Eye,
  UserCheck,
  Clock,
  Phone,
  MessageSquare,
  Paperclip,
  Download,
  AlertTriangle,
  Trash2,
  X
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import { exportToCSV } from '../../services/export';

export default function TicketsList() {
  const { user, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedTech, setSelectedTech] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(searchParams.get('action') === 'new');
  const [formData, setFormData] = useState({
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    category: 'Internet Down / No Light',
    description: '',
    priority: 'Medium',
    assigned_to: ''
  });

  const fetchTickets = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/tickets', {
        page,
        limit: 20,
        search,
        status: selectedStatus,
        category: selectedCategory,
        priority: selectedPriority,
        assigned_to: selectedTech
      });
      setTickets(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (e) {
      console.error('Failed to load tickets:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterData = async () => {
    try {
      const sRes = await api.get('/settings');
      if (sRes.ticket_categories) setCategories(sRes.ticket_categories);
      if (sRes.ticket_statuses) setStatuses(sRes.ticket_statuses);

      const uRes = await api.get('/users', { is_active: true });
      setUsers(uRes || []);

      const cRes = await api.get('/customers', { limit: 200 });
      setCustomers(cRes.data || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTickets(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, selectedStatus, selectedCategory, selectedPriority, selectedTech]);

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  const handleSelectCustomer = (cust) => {
    if (cust) {
      setFormData(prev => ({
        ...prev,
        customer_id: cust.id,
        customer_name: cust.name,
        customer_phone: cust.phone,
        customer_address: cust.address
      }));
      setCustomerSearchQuery(`${cust.customer_code} - ${cust.name}`);
    } else {
      setFormData(prev => ({
        ...prev,
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        customer_address: ''
      }));
      setCustomerSearchQuery('');
    }
    setIsCustomerDropdownOpen(false);
  };

  const handleDeleteTicket = async (ticketId, ticketNumber) => {
    if (!window.confirm(`Are you sure you want to permanently delete ticket ${ticketNumber || ''}? This cannot be undone.`)) return;
    try {
      await api.delete(`/tickets/${ticketId}`);
      fetchTickets(pagination.page);
    } catch (err) {
      alert(err.message || 'Failed to delete ticket.');
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tickets', formData);
      setIsAddModalOpen(false);
      setCustomerSearchQuery('');
      setIsCustomerDropdownOpen(false);
      setFormData({
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        customer_address: '',
        category: categories[0]?.name || 'Internet Down / No Light',
        description: '',
        priority: 'Medium',
        assigned_to: ''
      });
      fetchTickets(1);
    } catch (err) {
      alert(err.message || 'Failed to create ticket.');
    }
  };

  const handleExportCSV = () => {
    const data = tickets.map(t => ({
      'Ticket No': t.ticket_number,
      'Date': t.created_at,
      'Customer Name': t.customer_name,
      'Phone': t.customer_phone,
      'Address': t.customer_address,
      'Category': t.category,
      'Priority': t.priority,
      'Technician': t.technician_name || 'Unassigned',
      'Status': t.status,
      'Description': t.description,
      'Resolution': t.resolution || ''
    }));
    exportToCSV(data, 'helpdesk_tickets_export');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-sky-600" /> Help Desk & Complaints Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {pagination.total} customer service requests and fiber repair tickets
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          {hasPermission('helpdesk_view') && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Ticket
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket #, name, address..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">All Technicians</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Ticket No</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Customer & Location</th>
                <th className="py-3 px-4">Category & Issue</th>
                <th className="py-3 px-4">Assigned Tech</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-slate-400">Loading complaints queue...</td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-slate-400">No tickets found matching filters.</td>
                </tr>
              ) : (
                tickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link to={`/helpdesk/tickets/${t.id}`} className="font-mono font-bold text-sky-700 hover:underline">
                        {t.ticket_number}
                      </Link>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={t.priority === 'Urgent' || t.priority === 'High' ? 'danger' : 'default'} size="sm">
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{t.customer_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-slate-600 font-medium">{t.customer_phone}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate max-w-xs mt-0.5">{t.customer_address}</p>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-semibold text-slate-800">{t.category}</p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">{t.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                        {t.message_count > 0 && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-sky-500" /> {t.message_count}</span>
                        )}
                        {t.attachment_count > 0 && (
                          <span className="flex items-center gap-1"><Paperclip className="w-3 h-3 text-amber-500" /> {t.attachment_count}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {t.technician_name ? (
                        <div className="flex items-center gap-1 text-slate-800 font-semibold">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t.technician_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge>{t.status}</Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/helpdesk/tickets/${t.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold rounded-lg text-xs transition-colors"
                          title="View Ticket"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                        {(user?.role === 'admin' || user?.role === 'manager' || hasPermission('helpdesk_manage')) && (
                          <button
                            onClick={() => handleDeleteTicket(t.id, t.ticket_number)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 transition-colors"
                            title="Delete Ticket (Manager/Admin Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          pagination={pagination}
          onPageChange={(p) => fetchTickets(p)}
        />
      </div>

      {/* CREATE TICKET MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create New Complaint Ticket"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          {/* Search Existing Customer */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Search Existing Customer (or enter manually below)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customerSearchQuery}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setIsCustomerDropdownOpen(true);
                }}
                placeholder="Type customer name, phone, code (e.g. CUST-1001), area..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {customerSearchQuery && (
                <button
                  type="button"
                  onClick={() => handleSelectCustomer(null)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Results */}
            {isCustomerDropdownOpen && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100">
                {customers.filter(c => {
                  if (!customerSearchQuery.trim()) return true;
                  const q = customerSearchQuery.toLowerCase();
                  return (
                    c.name?.toLowerCase().includes(q) ||
                    c.phone?.includes(q) ||
                    c.customer_code?.toLowerCase().includes(q) ||
                    c.area?.toLowerCase().includes(q) ||
                    c.address?.toLowerCase().includes(q)
                  );
                }).slice(0, 15).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-left p-2.5 hover:bg-sky-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-xs text-slate-900">
                        <span className="font-mono text-sky-600 mr-1.5">{c.customer_code}</span>
                        {c.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {c.phone} • {c.area} • {c.address}
                      </p>
                    </div>
                    {c.package_name && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {c.package_name}
                      </span>
                    )}
                  </button>
                ))}
                {customers.filter(c => {
                  if (!customerSearchQuery.trim()) return true;
                  const q = customerSearchQuery.toLowerCase();
                  return (
                    c.name?.toLowerCase().includes(q) ||
                    c.phone?.includes(q) ||
                    c.customer_code?.toLowerCase().includes(q) ||
                    c.area?.toLowerCase().includes(q)
                  );
                }).length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No matching customer found. You can enter details manually below.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Phone *</label>
              <input
                type="text"
                required
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Address *</label>
            <input
              type="text"
              required
              value={formData.customer_address}
              onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Complaint Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Technician</label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Complaint Description *</label>
            <textarea
              required
              rows="3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              placeholder="Detail what the customer is experiencing..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs"
            >
              Create Ticket
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
