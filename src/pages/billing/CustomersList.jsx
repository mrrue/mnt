import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  Plus,
  Eye,
  CreditCard,
  Phone,
  MapPin,
  Package,
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import CallButton from '../../components/common/CallButton';
import ReceiptModal from '../../components/common/ReceiptModal';
import { exportToCSV, exportToExcel } from '../../services/export';

export default function CustomersList() {
  const { hasPermission, formatCurrency } = useAuth();
  const [searchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [areas, setAreas] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(searchParams.get('action') === 'new');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [selectedCustomerForPay, setSelectedCustomerForPay] = useState(null);
  const [receiptModalData, setReceiptModalData] = useState(null);

  // New Customer Form State
  const [formData, setFormData] = useState({
    name: '',
    cnic: '',
    phone: '',
    alt_phone: '',
    email: '',
    address: '',
    area: '',
    package_id: '',
    monthly_price: '',
    installation_date: new Date().toISOString().split('T')[0],
    billing_cycle: 'monthly',
    due_date: '10',
    status: 'Active',
    notes: ''
  });

  // Quick Payment Form State
  const [payFormData, setPayFormData] = useState({
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    billing_period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    reference_number: '',
    notes: ''
  });

  const fetchCustomers = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/customers', {
        page,
        limit: 20,
        search,
        status: selectedStatus,
        area: selectedArea,
        package_id: selectedPackage
      });
      setCustomers(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
      if (res.areas) setAreas(res.areas);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const res = await api.get('/packages', { active_only: true });
      setPackages(res || []);
      if (res.length > 0 && !formData.package_id) {
        setFormData(prev => ({ ...prev, package_id: res[0].id, monthly_price: res[0].price }));
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, selectedStatus, selectedArea, selectedPackage]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/customers', formData);
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        cnic: '',
        phone: '',
        alt_phone: '',
        email: '',
        address: '',
        area: '',
        package_id: packages[0]?.id || '',
        monthly_price: packages[0]?.price || '',
        installation_date: new Date().toISOString().split('T')[0],
        billing_cycle: 'monthly',
        due_date: '10',
        status: 'Active',
        notes: ''
      });
      fetchCustomers(1);
    } catch (err) {
      alert(err.message || 'Failed to create customer.');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedCustomerForPay) return;
    try {
      const res = await api.post('/payments', {
        customer_id: selectedCustomerForPay.id,
        amount: payFormData.amount,
        payment_method: payFormData.payment_method,
        payment_date: payFormData.payment_date,
        billing_period: payFormData.billing_period,
        reference_number: payFormData.reference_number,
        notes: payFormData.notes
      });

      setIsPayModalOpen(false);
      fetchCustomers(pagination.page);

      // Open printable receipt automatically
      const receiptRes = await api.get(`/payments/${res.id}/receipt`);
      setReceiptModalData(receiptRes);
    } catch (err) {
      alert(err.message || 'Failed to record payment.');
    }
  };

  const openQuickPay = (customer) => {
    setSelectedCustomerForPay(customer);
    setPayFormData({
      amount: customer.monthly_price || '',
      payment_method: 'Cash',
      payment_date: new Date().toISOString().split('T')[0],
      billing_period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      reference_number: '',
      notes: ''
    });
    setIsPayModalOpen(true);
  };

  const handleExportCSV = () => {
    const exportData = customers.map(c => ({
      'Customer ID': c.customer_code,
      'Name': c.name,
      'CNIC': c.cnic || '',
      'Phone': c.phone,
      'Area': c.area,
      'Address': c.address,
      'Package': c.package_name,
      'Speed': c.package_speed,
      'Monthly Price': c.monthly_price,
      'Status': c.status,
      'Balance Due': c.balance,
      'Due Date': `Day ${c.due_date}`
    }));
    exportToCSV(exportData, 'isp_customers_list');
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      alert('Please select an Excel (.xlsx/.xls) or CSV file.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await api.post('/customers/import', formData);
      setImportResult(res);
      fetchCustomers(1);
    } catch (err) {
      alert(err.message || 'Failed to import customers from file.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-600" /> Customer Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {pagination.total} registered broadband subscribers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          {hasPermission('customer_manage') && (
            <button
              onClick={() => {
                setIsImportModalOpen(true);
                setImportFile(null);
                setImportResult(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import Excel
            </button>
          )}
          {hasPermission('customer_manage') && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Add New Customer
            </button>
          )}
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, Name, Phone, CNIC..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Disconnected">Disconnected</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {/* Area Filter */}
          <div>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Areas</option>
              {areas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Package Filter */}
          <div>
            <select
              value={selectedPackage}
              onChange={(e) => setSelectedPackage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Packages</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.speed})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Customer ID</th>
                <th className="py-3 px-4">Name & Contact</th>
                <th className="py-3 px-4">Area / Address</th>
                <th className="py-3 px-4">Package & Monthly</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Balance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-slate-400">
                    Loading customer records...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-slate-400">
                    No customers found matching search filters.
                  </td>
                </tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-sky-700">
                      {c.customer_code}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-slate-600">{c.phone}</span>
                        <CallButton phone={c.phone} size="xs" label="" />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-semibold text-slate-800">{c.area}</p>
                      <p className="text-[11px] text-slate-500 truncate">{c.address}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{c.package_name}</p>
                      <p className="text-[11px] font-bold text-slate-600">{formatCurrency(c.monthly_price)} /mo</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge>{c.status}</Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.balance > 0 ? (
                        <span className="font-bold text-rose-600">{formatCurrency(c.balance)}</span>
                      ) : (
                        <span className="font-medium text-emerald-600">Paid (0)</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {hasPermission('payment_create') && (
                          <button
                            onClick={() => openQuickPay(c)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors"
                            title="Enter Payment"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link
                          to={`/billing/customers/${c.id}`}
                          className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg border border-sky-200 transition-colors"
                          title="View Profile & History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
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
          onPageChange={(p) => fetchCustomers(p)}
        />
      </div>

      {/* ADD CUSTOMER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Customer"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="e.g. Muhammad Usman"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNIC / ID (Optional)</label>
              <input
                type="text"
                value={formData.cnic}
                onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="42201-XXXXXXX-X"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="+92 300 1234567"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alternate Phone</label>
              <input
                type="text"
                value={formData.alt_phone}
                onChange={(e) => setFormData({ ...formData, alt_phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="+92 321 7654321"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Area / Sector *</label>
              <input
                type="text"
                required
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="e.g. Block 6, PECHS"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Installation Address *</label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                placeholder="House / Flat / Street address"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ISP Package *</label>
              <select
                required
                value={formData.package_id}
                onChange={(e) => {
                  const selPkg = packages.find(p => p.id === parseInt(e.target.value));
                  setFormData({
                    ...formData,
                    package_id: e.target.value,
                    monthly_price: selPkg ? selPkg.price : formData.monthly_price
                  });
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              >
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name} - {p.speed} ({formatCurrency(p.price)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Price ({formatCurrency(formData.monthly_price)})</label>
              <input
                type="number"
                required
                value={formData.monthly_price}
                onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date (Day of Month)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
              placeholder="e.g. Router ONU serial number, port number, etc."
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 text-white text-xs font-semibold rounded-xl hover:bg-sky-700 shadow-xs transition-colors"
            >
              Save Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* QUICK PAYMENT ENTRY MODAL */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title={`Enter Payment for ${selectedCustomerForPay?.name || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Customer Code:</span>
              <span className="font-bold">{selectedCustomerForPay?.customer_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Monthly Package:</span>
              <span>{selectedCustomerForPay?.package_name} ({formatCurrency(selectedCustomerForPay?.monthly_price)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Current Balance Due:</span>
              <span className="font-bold text-rose-600">{formatCurrency(selectedCustomerForPay?.balance || 0)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Paid *</label>
            <input
              type="number"
              required
              value={payFormData.amount}
              onChange={(e) => setPayFormData({ ...payFormData, amount: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method *</label>
              <select
                value={payFormData.payment_method}
                onChange={(e) => setPayFormData({ ...payFormData, payment_method: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Cash">Cash</option>
                <option value="JazzCash">JazzCash</option>
                <option value="Easypaisa">Easypaisa</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="SadaPay">SadaPay</option>
                <option value="Nayapay">Nayapay</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={payFormData.payment_date}
                onChange={(e) => setPayFormData({ ...payFormData, payment_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Period</label>
            <input
              type="text"
              value={payFormData.billing_period}
              onChange={(e) => setPayFormData({ ...payFormData, billing_period: e.target.value })}
              placeholder="e.g. September 2026"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Transaction ID</label>
            <input
              type="text"
              value={payFormData.reference_number}
              onChange={(e) => setPayFormData({ ...payFormData, reference_number: e.target.value })}
              placeholder="e.g. JazzCash TID / Slip No"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPayModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
            >
              Save & Print Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* BULK EXCEL IMPORT MODAL */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFile(null);
          setImportResult(null);
        }}
        title="Bulk Import Customers from Excel / CSV"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          {/* Instructions and Download Template Link */}
          <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2">
            <p className="font-bold text-sky-900 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-sky-600" /> Excel Template Format
            </p>
            <p className="text-slate-600 leading-relaxed">
              Upload an Excel (.xlsx/.xls) or CSV sheet containing your customer records. Columns like <strong>Name</strong> and <strong>Phone</strong> are required. Customer IDs will be generated automatically.
            </p>
            <div className="pt-1">
              <a
                href="/api/customers/import-template"
                download="customers_bulk_template.xlsx"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-sky-700 hover:text-sky-800 font-semibold rounded-lg border border-sky-200 shadow-xs hover:bg-sky-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Sample Excel Template (.xlsx)
              </a>
            </div>
          </div>

          {/* Import Result Feedback */}
          {importResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>{importResult.message || `Successfully imported ${importResult.importedCount} customers!`}</span>
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-2 p-2 bg-white/80 rounded-lg text-slate-700 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-semibold text-rose-600">Warnings / Skipped Rows:</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-[11px] text-slate-600">• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Form */}
          <form onSubmit={handleImportSubmit} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-2">Select Spreadsheet File</label>
              <label className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-sky-50/50 transition-all">
                <Upload className="w-8 h-8 text-sky-600 mb-2" />
                <span className="font-semibold text-slate-800">
                  {importFile ? importFile.name : "Click to browse or drop Excel file here"}
                </span>
                <span className="text-[11px] text-slate-400 mt-1">
                  Supports .xlsx, .xls, and .csv files (up to 25MB)
                </span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setImportFile(e.target.files[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200"
              >
                {importResult ? 'Close' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isImporting || !importFile}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                {isImporting ? (
                  <span>Importing Customers...</span>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Upload & Import Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* RECEIPT MODAL */}
      <ReceiptModal
        isOpen={!!receiptModalData}
        onClose={() => setReceiptModalData(null)}
        receiptData={receiptModalData}
      />
    </div>
  );
}
