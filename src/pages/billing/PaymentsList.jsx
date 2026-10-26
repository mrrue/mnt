import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  Search,
  Filter,
  Plus,
  Printer,
  Ban,
  Download,
  Calendar,
  DollarSign,
  Smartphone,
  Trash2
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import ReceiptModal from '../../components/common/ReceiptModal';
import { exportToCSV, exportToExcel } from '../../services/export';

export default function PaymentsList() {
  const { hasPermission, formatCurrency } = useAuth();
  const [searchParams] = useSearchParams();

  const [payments, setPayments] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showVoided, setShowVoided] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(searchParams.get('action') === 'new');
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [selectedPaymentForVoid, setSelectedPaymentForVoid] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [receiptModalData, setReceiptModalData] = useState(null);

  // Form State
  const [customers, setCustomers] = useState([]);
  const [formData, setFormData] = useState({
    customer_id: '',
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    billing_period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    reference_number: '',
    notes: ''
  });

  const fetchPayments = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/payments', {
        page,
        limit: 20,
        search,
        payment_method: paymentMethod,
        start_date: startDate,
        end_date: endDate,
        is_voided: showVoided ? undefined : 'false'
      });
      setPayments(res.data || []);
      setTotalAmount(res.total_amount || 0);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (e) {
      console.error('Failed to load payments:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersList = async () => {
    try {
      const res = await api.get('/customers', { limit: 200 });
      setCustomers(res.data || []);
      if (res.data && res.data.length > 0 && !formData.customer_id) {
        setFormData(prev => ({ ...prev, customer_id: res.data[0].id, amount: res.data[0].monthly_price }));
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchCustomersList();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, paymentMethod, startDate, endDate, showVoided]);

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/payments', formData);
      setIsAddModalOpen(false);
      fetchPayments(1);

      // Open receipt automatically
      const rRes = await api.get(`/payments/${res.id}/receipt`);
      setReceiptModalData(rRes);
    } catch (err) {
      alert(err.message || 'Failed to record payment.');
    }
  };

  const handleVoidPayment = async (e) => {
    e.preventDefault();
    if (!selectedPaymentForVoid) return;
    try {
      await api.post(`/payments/${selectedPaymentForVoid.id}/void`, { reason: voidReason });
      setIsVoidModalOpen(false);
      setSelectedPaymentForVoid(null);
      setVoidReason('');
      fetchPayments(pagination.page);
    } catch (err) {
      alert(err.message || 'Failed to void payment.');
    }
  };

  const handleDeletePayment = async (paymentId, receiptNo) => {
    if (!window.confirm(`Are you sure you want to permanently delete payment record ${receiptNo || ''}? If it was not voided, the customer's balance will be adjusted back.`)) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      fetchPayments(pagination.page);
    } catch (err) {
      alert(err.message || 'Failed to delete payment.');
    }
  };

  const viewReceipt = async (paymentId) => {
    try {
      const res = await api.get(`/payments/${paymentId}/receipt`);
      setReceiptModalData(res);
    } catch (e) {
      alert('Failed to load receipt.');
    }
  };

  const handleExportCSV = () => {
    const exportData = payments.map(p => ({
      'Receipt No': p.receipt_number,
      'Date': p.payment_date,
      'Customer ID': p.customer_code,
      'Customer Name': p.customer_name,
      'Phone': p.customer_phone,
      'Area': p.customer_area,
      'Billing Period': p.billing_period,
      'Payment Method': p.payment_method,
      'Amount': p.amount,
      'Reference No': p.reference_number || '',
      'Status': p.is_voided ? 'VOIDED' : 'PAID',
      'Entered By': p.created_by_name || ''
    }));
    exportToCSV(exportData, 'isp_payments_export');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-sky-600" /> Payments & Thermal Receipts
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total filtered collected: <span className="font-bold text-emerald-600">{formatCurrency(totalAmount)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          {hasPermission('payment_create') && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Enter Payment
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, name, phone..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">All Payment Modes</option>
              <option value="Cash">Cash</option>
              <option value="JazzCash">JazzCash</option>
              <option value="Easypaisa">Easypaisa</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="SadaPay">SadaPay</option>
              <option value="Nayapay">Nayapay</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              title="Start Date"
            />
          </div>

          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              title="End Date"
            />
          </div>

          <div className="flex items-center gap-2 px-2">
            <input
              type="checkbox"
              id="showVoided"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
              className="rounded text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="showVoided" className="text-xs font-semibold text-slate-700">Include Voided</label>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt No</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Billing Period</th>
                <th className="py-3 px-4">Mode / Ref</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Paid Amount</th>
                <th className="py-3 px-4">Rem. Balance</th>
                <th className="py-3 px-4">Collected By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="text-center py-10 text-slate-400">Loading payment records...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-10 text-slate-400">No payment records found.</td>
                </tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className={`hover:bg-slate-50/70 transition-colors ${p.is_voided ? 'bg-rose-50/40 text-slate-400 line-through' : ''}`}>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {p.receipt_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{p.customer_name}</p>
                      <p className="text-[11px] text-slate-500">{p.customer_code} • {p.customer_area}</p>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {p.billing_period}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="default">{p.payment_method}</Badge>
                      {p.reference_number && (
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{p.reference_number}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.payment_date}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-bold text-sm ${p.is_voided ? 'text-slate-400' : 'text-emerald-600'}`}>
                        {formatCurrency(p.amount)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {(p.remaining_balance !== undefined && p.remaining_balance !== null) ? (
                        p.remaining_balance > 0 ? (
                          <span className="font-bold text-rose-600">{formatCurrency(p.remaining_balance)}</span>
                        ) : (
                          <span className="font-medium text-emerald-600">Cleared (0)</span>
                        )
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.created_by_name || 'Staff'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewReceipt(p.id)}
                          className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg border border-sky-200 transition-colors flex items-center gap-1 font-semibold text-xs"
                          title="Print Thermal Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" /> Thermal
                        </button>
                        <button
                          onClick={() => viewReceipt(p.id)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1 font-semibold text-xs"
                          title="Send Receipt via WhatsApp"
                        >
                          <Smartphone className="w-3.5 h-3.5" /> WhatsApp
                        </button>
                        {!p.is_voided && hasPermission('payment_void') && (
                          <button
                            onClick={() => {
                              setSelectedPaymentForVoid(p);
                              setIsVoidModalOpen(true);
                            }}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg border border-amber-200 transition-colors"
                            title="Void Payment"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasPermission('payment_void') && (
                          <button
                            onClick={() => handleDeletePayment(p.id, p.receipt_number)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 transition-colors"
                            title="Permanently Delete Payment Record"
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
          onPageChange={(p) => fetchPayments(p)}
        />
      </div>

      {/* ENTER PAYMENT MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record New Manual Payment"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
            <select
              required
              value={formData.customer_id}
              onChange={(e) => {
                const sel = customers.find(c => c.id === parseInt(e.target.value));
                setFormData({
                  ...formData,
                  customer_id: e.target.value,
                  amount: sel ? sel.monthly_price : formData.amount
                });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} - {c.name} ({c.area}) - {formatCurrency(c.monthly_price)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Received *</label>
            <input
              type="number"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
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
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Period</label>
            <input
              type="text"
              value={formData.billing_period}
              onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Transaction ID</label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="e.g. JazzCash TID, Bank Cheque / Slip"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
            >
              Save & Print Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* VOID PAYMENT MODAL */}
      <Modal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        title="Void Payment with Audit Trail"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleVoidPayment} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
            <p className="font-bold">Are you sure you want to void this payment?</p>
            <p>Receipt: {selectedPaymentForVoid?.receipt_number}</p>
            <p>Customer: {selectedPaymentForVoid?.customer_name}</p>
            <p>Amount: {formatCurrency(selectedPaymentForVoid?.amount || 0)}</p>
            <p className="text-[11px] text-rose-700 pt-1">
              Voiding will adjust the customer's balance back and record a permanent audit trail.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Voiding *</label>
            <textarea
              required
              rows="3"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong amount entered, customer cheque bounced, duplicate entry"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsVoidModalOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl"
            >
              Confirm Void Payment
            </button>
          </div>
        </form>
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
