import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Package,
  Calendar,
  CreditCard,
  LifeBuoy,
  Plus,
  History,
  FileText,
  Printer,
  Edit,
  Trash2,
  CheckCircle,
  AlertCircle,
  Smartphone
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import CallButton from '../../components/common/CallButton';
import ReceiptModal from '../../components/common/ReceiptModal';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, formatCurrency } = useAuth();

  const [customer, setCustomer] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState(null);

  // Forms
  const [editFormData, setEditFormData] = useState({});
  const [pkgFormData, setPkgFormData] = useState({ package_id: '', monthly_price: '' });
  const [payFormData, setPayFormData] = useState({
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    billing_period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    reference_number: '',
    notes: ''
  });
  const [ticketFormData, setTicketFormData] = useState({
    category: 'Internet Down / No Light',
    description: '',
    priority: 'Medium',
    assigned_to: ''
  });
  const [users, setUsers] = useState([]);

  const fetchCustomerDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/customers/${id}`);
      setCustomer(res.customer);
      setSubscriptions(res.subscriptions || []);
      setPayments(res.payments || []);
      setTickets(res.tickets || []);

      setEditFormData(res.customer);
      setPkgFormData({
        package_id: res.customer.package_id,
        monthly_price: res.customer.monthly_price
      });
      setPayFormData(prev => ({ ...prev, amount: res.customer.monthly_price }));
    } catch (err) {
      alert('Failed to load customer profile.');
      navigate('/billing/customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterData = async () => {
    try {
      const pRes = await api.get('/packages', { active_only: true });
      setPackages(pRes || []);
      const uRes = await api.get('/users', { is_active: true });
      setUsers(uRes || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchCustomerDetails();
    fetchMasterData();
  }, [id]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/customers/${id}`, editFormData);
      setIsEditModalOpen(false);
      fetchCustomerDetails();
    } catch (err) {
      alert(err.message || 'Failed to update profile.');
    }
  };

  const handleChangePackage = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/customers/${id}`, {
        package_id: pkgFormData.package_id,
        monthly_price: pkgFormData.monthly_price
      });
      setIsPackageModalOpen(false);
      fetchCustomerDetails();
    } catch (err) {
      alert(err.message || 'Failed to change package.');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/payments', {
        customer_id: customer.id,
        ...payFormData
      });
      setIsPayModalOpen(false);
      fetchCustomerDetails();

      const rRes = await api.get(`/payments/${res.id}/receipt`);
      setReceiptModalData(rRes);
    } catch (err) {
      alert(err.message || 'Failed to record payment.');
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tickets', {
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        ...ticketFormData
      });
      setIsTicketModalOpen(false);
      fetchCustomerDetails();
    } catch (err) {
      alert(err.message || 'Failed to create ticket.');
    }
  };

  const viewReceipt = async (paymentId) => {
    try {
      const res = await api.get(`/payments/${paymentId}/receipt`);
      setReceiptModalData(res);
    } catch (err) {
      alert('Failed to load receipt.');
    }
  };

  const handleDeletePayment = async (paymentId, receiptNo) => {
    if (!window.confirm(`Are you sure you want to permanently delete payment record ${receiptNo || ''}? Balance will be readjusted.`)) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      fetchCustomerDetails();
    } catch (err) {
      alert(err.message || 'Failed to delete payment.');
    }
  };

  const handleDeleteTicket = async (ticketId, ticketNo) => {
    if (!window.confirm(`Are you sure you want to permanently delete ticket ${ticketNo || ''}?`)) return;
    try {
      await api.delete(`/tickets/${ticketId}`);
      fetchCustomerDetails();
    } catch (err) {
      alert(err.message || 'Failed to delete ticket.');
    }
  };

  if (loading || !customer) {
    return (
      <div className="p-12 text-center text-xs text-slate-400">
        Loading customer profile...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/billing/customers"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Back to Customers"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <Badge>{customer.status}</Badge>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Customer Code: <span className="font-bold text-sky-700">{customer.customer_code}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('payment_create') && (
            <button
              onClick={() => setIsPayModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" /> Enter Payment
            </button>
          )}
          {hasPermission('helpdesk_view') && (
            <button
              onClick={() => setIsTicketModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <LifeBuoy className="w-3.5 h-3.5" /> Log Complaint
            </button>
          )}
          {hasPermission('customer_manage') && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              <Edit className="w-3.5 h-3.5" /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Profile Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Contact Info */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact & Location</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Primary Phone:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800">{customer.phone}</span>
                <CallButton phone={customer.phone} size="xs" label="" />
              </div>
            </div>
            {customer.alt_phone && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Alt Phone:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700">{customer.alt_phone}</span>
                  <CallButton phone={customer.alt_phone} size="xs" label="" />
                </div>
              </div>
            )}
            {customer.cnic && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">CNIC / ID:</span>
                <span className="font-mono text-slate-700">{customer.cnic}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-slate-500 block mb-0.5">Area / Sector:</span>
              <p className="font-semibold text-slate-800">{customer.area}</p>
              <span className="text-slate-500 block mt-1.5 mb-0.5">Address:</span>
              <p className="text-slate-700 text-[11px] leading-relaxed">{customer.address}</p>
            </div>
          </div>
        </div>

        {/* Subscription / Plan Info */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Subscription</h3>
            {hasPermission('billing_manage') && (
              <button
                onClick={() => setIsPackageModalOpen(true)}
                className="text-[11px] font-semibold text-sky-600 hover:underline"
              >
                Change Plan
              </button>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Package:</span>
              <span className="font-bold text-slate-900">{customer.package_name} ({customer.package_speed})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Price:</span>
              <span className="font-bold text-sky-700">{formatCurrency(customer.monthly_price)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Billing Cycle:</span>
              <span className="capitalize text-slate-700">{customer.billing_cycle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Due Date:</span>
              <span className="font-semibold text-slate-800">{customer.due_date}th of every month</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Installation Date:</span>
              <span className="text-slate-700">{customer.installation_date || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Financial Balance Summary */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Balance</h3>
            <div className="mt-3">
              {customer.balance > 0 ? (
                <div>
                  <span className="text-2xl font-black text-rose-600">{formatCurrency(customer.balance)}</span>
                  <p className="text-xs text-rose-600 font-medium mt-0.5">Overdue balance pending</p>
                </div>
              ) : (
                <div>
                  <span className="text-2xl font-black text-emerald-600">Rs. 0</span>
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">All bills cleared</p>
                </div>
              )}
            </div>
          </div>
          {customer.notes && (
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
              <span className="font-semibold block text-slate-700 mb-0.5">Notes:</span>
              {customer.notes}
            </div>
          )}
        </div>
      </div>

      {/* TABBED SECTIONS */}
      <div className="space-y-6">
        {/* 1. PAYMENTS HISTORY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" /> Payment & Receipt History
            </h3>
            <span className="text-xs text-slate-500">{payments.length} transactions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Receipt No</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Period</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Received By</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6 text-slate-400">No payment records yet.</td>
                  </tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id} className={`hover:bg-slate-50/70 ${p.is_voided ? 'opacity-50 line-through bg-rose-50/30' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.receipt_number}</td>
                      <td className="py-3 px-4 text-slate-600">{p.payment_date}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{p.billing_period}</td>
                      <td className="py-3 px-4 text-slate-600">{p.payment_method}</td>
                      <td className="py-3 px-4 font-bold text-emerald-600">{formatCurrency(p.amount)}</td>
                      <td className="py-3 px-4 text-slate-600">{p.created_by_name || 'Staff'}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => viewReceipt(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-semibold"
                            title="View / Print Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" /> Slip
                          </button>
                          <button
                            onClick={() => viewReceipt(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold"
                            title="Send via WhatsApp"
                          >
                            <Smartphone className="w-3.5 h-3.5" /> WhatsApp
                          </button>
                          {hasPermission('payment_void') && (
                            <button
                              onClick={() => handleDeletePayment(p.id, p.receipt_number)}
                              className="inline-flex items-center gap-1 p-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-semibold"
                              title="Delete Payment Record"
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
        </div>

        {/* 2. COMPLAINT & TICKET HISTORY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-amber-600" /> Complete Complaint & Work History
            </h3>
            <span className="text-xs text-slate-500">{tickets.length} complaints recorded</span>
          </div>

          <div className="divide-y divide-slate-100">
            {tickets.length === 0 ? (
              <p className="text-center py-6 text-xs text-slate-400">No complaints reported for this customer.</p>
            ) : (
              tickets.map(t => (
                <div key={t.id} className="p-4 hover:bg-slate-50/60 transition-colors text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Link to={`/helpdesk/tickets/${t.id}`} className="font-mono font-bold text-sky-600 hover:underline">
                        {t.ticket_number}
                      </Link>
                      <Badge>{t.status}</Badge>
                      <Badge variant="default">{t.category}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px]">{new Date(t.created_at).toLocaleString()}</span>
                      {hasPermission('helpdesk_view') && (
                        <button
                          onClick={() => handleDeleteTicket(t.id, t.ticket_number)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Ticket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-800 font-medium">{t.description}</p>

                  {/* Technician work performed & resolution */}
                  {(t.work_performed || t.resolution) && (
                    <div className="bg-emerald-50/60 border border-emerald-200/70 p-3 rounded-xl space-y-1">
                      <p className="font-semibold text-emerald-900">
                        Technician: <span className="font-normal">{t.technician_name || 'Assigned Staff'}</span>
                      </p>
                      {t.fault_found && <p className="text-emerald-800"><span className="font-medium">Fault Found:</span> {t.fault_found}</p>}
                      {t.work_performed && <p className="text-emerald-800"><span className="font-medium">Work Done:</span> {t.work_performed}</p>}
                      {t.parts_used && <p className="text-emerald-800"><span className="font-medium">Parts Used:</span> {t.parts_used}</p>}
                      {t.resolution && <p className="text-emerald-900 font-semibold"><span className="font-medium">Resolution:</span> {t.resolution}</p>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. HISTORICAL SUBSCRIPTIONS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-sky-600" /> Plan & Package Change Audit
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Package</th>
                  <th className="py-2.5 px-4">Speed</th>
                  <th className="py-2.5 px-4">Start Date</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptions.map(s => (
                  <tr key={s.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{s.package_name}</td>
                    <td className="py-3 px-4 text-slate-600">{s.package_speed}</td>
                    <td className="py-3 px-4 text-slate-600">{s.start_date}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{formatCurrency(s.final_amount)}</td>
                    <td className="py-3 px-4"><Badge>{s.status}</Badge></td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">{s.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CHANGE PACKAGE MODAL */}
      <Modal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        title="Upgrade / Change Customer Package"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleChangePackage} className="space-y-4">
          <p className="text-xs text-slate-500">
            Changing the package creates a historical subscription record. Past billing history will remain permanently preserved.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select New Package *</label>
            <select
              required
              value={pkgFormData.package_id}
              onChange={(e) => {
                const sel = packages.find(p => p.id === parseInt(e.target.value));
                setPkgFormData({
                  package_id: e.target.value,
                  monthly_price: sel ? sel.price : pkgFormData.monthly_price
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Billing Price *</label>
            <input
              type="number"
              required
              value={pkgFormData.monthly_price}
              onChange={(e) => setPkgFormData({ ...pkgFormData, monthly_price: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPackageModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl"
            >
              Confirm Plan Update
            </button>
          </div>
        </form>
      </Modal>

      {/* QUICK PAYMENT MODAL */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title={`Record Payment for ${customer.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={payFormData.payment_method}
                onChange={(e) => setPayFormData({ ...payFormData, payment_method: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="Cash">Cash</option>
                <option value="JazzCash">JazzCash</option>
                <option value="Easypaisa">Easypaisa</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="SadaPay">SadaPay</option>
                <option value="Nayapay">Nayapay</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={payFormData.payment_date}
                onChange={(e) => setPayFormData({ ...payFormData, payment_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Period</label>
            <input
              type="text"
              value={payFormData.billing_period}
              onChange={(e) => setPayFormData({ ...payFormData, billing_period: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Slip Number</label>
            <input
              type="text"
              value={payFormData.reference_number}
              onChange={(e) => setPayFormData({ ...payFormData, reference_number: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPayModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
            >
              Save & Print Slip
            </button>
          </div>
        </form>
      </Modal>

      {/* LOG TICKET MODAL */}
      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title={`Log Complaint for ${customer.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Complaint Category *</label>
            <select
              value={ticketFormData.category}
              onChange={(e) => setTicketFormData({ ...ticketFormData, category: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="Internet Down / No Light">Internet Down / No Light</option>
              <option value="Slow Speed">Slow Speed</option>
              <option value="Fiber Cable Cut / Fault">Fiber Cable Cut / Fault</option>
              <option value="Router Configuration">Router Configuration</option>
              <option value="WiFi Password Reset">WiFi Password Reset</option>
              <option value="New Installation">New Installation</option>
              <option value="Relocation / Shifting">Relocation / Shifting</option>
              <option value="Billing / Payment Query">Billing / Payment Query</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Description *</label>
            <textarea
              required
              rows="3"
              value={ticketFormData.description}
              onChange={(e) => setTicketFormData({ ...ticketFormData, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              placeholder="e.g. Red LOS blinking on ONU since afternoon"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={ticketFormData.priority}
                onChange={(e) => setTicketFormData({ ...ticketFormData, priority: e.target.value })}
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
                value={ticketFormData.assigned_to}
                onChange={(e) => setTicketFormData({ ...ticketFormData, assigned_to: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTicketModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl"
            >
              Create Complaint Ticket
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer Profile"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={editFormData.phone || ''}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNIC</label>
              <input
                type="text"
                value={editFormData.cnic || ''}
                onChange={(e) => setEditFormData({ ...editFormData, cnic: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Area</label>
              <input
                type="text"
                value={editFormData.area || ''}
                onChange={(e) => setEditFormData({ ...editFormData, area: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Address</label>
              <input
                type="text"
                value={editFormData.address || ''}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={editFormData.status || 'Active'}
                onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Disconnected">Disconnected</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Due Date</label>
              <input
                type="number"
                value={editFormData.due_date || 10}
                onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* RECEIPT PREVIEW MODAL */}
      <ReceiptModal
        isOpen={!!receiptModalData}
        onClose={() => setReceiptModalData(null)}
        receiptData={receiptModalData}
      />
    </div>
  );
}
