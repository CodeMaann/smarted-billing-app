import React, { useState, useMemo, useEffect } from 'react';
import { getInvoices, getPurchases, getCatalog, getSuppliers, getCustomers, saveCustomers, getProfile } from '../store';
import { CustomerRecord, Supplier } from '../types';
import { 
  FileSpreadsheet, 
  Download, 
  Search, 
  User, 
  Truck, 
  CheckCircle2, 
  Clock, 
  X, 
  Edit3, 
  ArrowUpRight 
} from 'lucide-react';
import { 
  generatePaymentReminderWhatsAppMessage, 
  openWhatsApp, 
  cleanPhoneNumber,
  encodeBillToUrl
} from '../utils/whatsapp';

type DateFilter = 'today' | 'week' | 'month' | 'custom' | 'all';
type ReportType = 'sales' | 'purchases' | 'stock' | 'party' | 'gst';

export function ReportsTab() {
  const [activeTab, setActiveTab] = useState<ReportType>('sales');
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  const [invoices, setInvoices] = useState(getInvoices());
  const [purchases, setPurchases] = useState(getPurchases());
  const [catalog, setCatalog] = useState(getCatalog());
  const [suppliers, setSuppliers] = useState(getSuppliers());
  const [profile, setProfile] = useState(getProfile());

  // Customer Ledger State
  const [customers, setCustomers] = useState<CustomerRecord[]>(() => getCustomers());

  useEffect(() => {
    const refresh = () => {
      setInvoices(getInvoices());
      setPurchases(getPurchases());
      setCatalog(getCatalog());
      setSuppliers(getSuppliers());
      setProfile(getProfile());
      setCustomers(getCustomers());
    };
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);
  const [partySubTab, setPartySubTab] = useState<'customers' | 'suppliers'>('customers');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'all' | 'due' | 'cleared'>('all');

  // WhatsApp Reminder Modal State
  const [reminderModalCustomer, setReminderModalCustomer] = useState<CustomerRecord | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderPhone, setReminderPhone] = useState('');

  // Balance Adjustment Modal State
  const [editingBalanceCustomer, setEditingBalanceCustomer] = useState<CustomerRecord | null>(null);
  const [balanceInput, setBalanceInput] = useState('');

  // Status message
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // Filter Data by Date
  const { filteredInvoices, filteredPurchases } = useMemo(() => {
    const now = new Date();
    let startTime = 0;
    let endTime = Infinity;

    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startTime = start.getTime();
      endTime = startTime + 24 * 60 * 60 * 1000;
    } else if (dateFilter === 'week') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startTime = start.getTime();
      endTime = startTime + 7 * 24 * 60 * 60 * 1000; 
    } else if (dateFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      startTime = start.getTime();
      endTime = startTime + 30 * 24 * 60 * 60 * 1000; 
    } else if (dateFilter === 'custom') {
      if (customStartDate) {
        const [y, m, d] = customStartDate.split('-').map(Number);
        startTime = new Date(y, m - 1, d).getTime();
      }
      if (customEndDate) {
        const [y, m, d] = customEndDate.split('-').map(Number);
        endTime = new Date(y, m - 1, d).getTime() + 24 * 60 * 60 * 1000;
      }
    }

    return {
      filteredInvoices: invoices.filter(inv => inv.timestamp >= startTime && inv.timestamp < endTime),
      filteredPurchases: purchases.filter(p => p.timestamp >= startTime && p.timestamp < endTime)
    };
  }, [invoices, purchases, dateFilter, customStartDate, customEndDate]);

  // Export CSV Helper
  const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSalesCSV = () => {
    const headers = ['Date', 'Invoice ID', 'Customer Name', 'Payment Mode', 'Subtotal', 'Discount', 'CGST', 'SGST', 'Total'];
    const rows = filteredInvoices.map(inv => [
      new Intl.DateTimeFormat('en-IN', { dateStyle: 'short' }).format(inv.timestamp),
      inv.id,
      inv.customerName || 'Cash Sale',
      inv.paymentMode,
      inv.subtotal.toFixed(2),
      inv.discountAmount ? inv.discountAmount.toFixed(2) : '0.00',
      inv.cgst.toFixed(2),
      inv.sgst.toFixed(2),
      inv.total.toFixed(2)
    ]);
    downloadCSV(`Sales_Report_${new Date().getTime()}`, headers, rows);
  };

  const renderPurchasesCSV = () => {
    const headers = ['Date', 'PO Number', 'Supplier Name', 'Total Amount', 'Paid Amount', 'Status'];
    const rows = filteredPurchases.map(p => [
      new Intl.DateTimeFormat('en-IN', { dateStyle: 'short' }).format(p.timestamp),
      p.id,
      p.supplierName,
      p.totalAmount.toFixed(2),
      p.paidAmount.toFixed(2),
      p.status
    ]);
    downloadCSV(`Purchases_Report_${new Date().getTime()}`, headers, rows);
  };

  const renderStockCSV = () => {
    const headers = ['Item Name', 'HSN Code', 'Selling Rate', 'Cost Price', 'Current Stock', 'Low Stock Threshold'];
    const rows = catalog.map(c => [
      c.name,
      c.hsnCode || '-',
      c.rate.toFixed(2),
      c.costPrice?.toFixed(2) || '0.00',
      c.stock,
      c.lowStockThreshold
    ]);
    downloadCSV(`Inventory_Report_${new Date().getTime()}`, headers, rows);
  };

  const renderPartyCSV = () => {
    const headers = ['Type', 'Party Name', 'Phone', 'Total Amount', 'Transaction Count', 'Balance Due'];
    const rows: any[][] = [];
    
    customers.forEach(c => {
      rows.push(['Customer', c.name, c.phone || '-', (c.totalSpent || 0).toFixed(2), c.invoiceCount || 1, (c.balanceDue || 0).toFixed(2)]);
    });
    
    suppliers.forEach(s => {
      rows.push(['Supplier', s.name, s.phone || '-', s.totalPurchased.toFixed(2), '-', s.balanceDue.toFixed(2)]);
    });

    downloadCSV(`Party_Ledger_Report_${new Date().getTime()}`, headers, rows);
  };

  const renderGstCSV = () => {
    const gstData: Record<number, { taxableValue: number, cgst: number, sgst: number }> = {};
    
    filteredInvoices.forEach(inv => {
      if (!inv.applyGst) return;
      if (inv.gstBreakup) {
        Object.entries(inv.gstBreakup).forEach(([rateStr, data]) => {
          const rate = parseFloat(rateStr);
          const typedData = data as { taxableAmount: number, cgst: number, sgst: number };
          if (!gstData[rate]) gstData[rate] = { taxableValue: 0, cgst: 0, sgst: 0 };
          gstData[rate].taxableValue += typedData.taxableAmount;
          gstData[rate].cgst += typedData.cgst;
          gstData[rate].sgst += typedData.sgst;
        });
      } else {
        const rate = inv.gstRate || 0;
        if (!gstData[rate]) gstData[rate] = { taxableValue: 0, cgst: 0, sgst: 0 };
        gstData[rate].taxableValue += inv.subtotal;
        gstData[rate].cgst += inv.cgst;
        gstData[rate].sgst += inv.sgst;
      }
    });

    const headers = ['GST Slab Rate', 'Total Taxable Value', 'Total CGST', 'Total SGST', 'Total GST Tax'];
    const rows = Object.entries(gstData).map(([rate, val]) => [
      `${rate}%`,
      val.taxableValue.toFixed(2),
      val.cgst.toFixed(2),
      val.sgst.toFixed(2),
      (val.cgst + val.sgst).toFixed(2)
    ]);
    downloadCSV(`GST_Summary_${new Date().getTime()}`, headers, rows);
  };

  const getExportHandler = () => {
    switch (activeTab) {
      case 'sales': return renderSalesCSV;
      case 'purchases': return renderPurchasesCSV;
      case 'stock': return renderStockCSV;
      case 'party': return renderPartyCSV;
      case 'gst': return renderGstCSV;
    }
  };

  // Filtered customers for Ledger
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = customerSearch.trim().toLowerCase();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
      if (!matchesSearch) return false;

      if (customerFilter === 'due') {
        return (c.balanceDue || 0) > 0;
      }
      if (customerFilter === 'cleared') {
        return (c.balanceDue || 0) <= 0;
      }
      return true;
    });
  }, [customers, customerSearch, customerFilter]);

  const totalCustomerReceivables = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balanceDue || 0), 0);
  }, [customers]);

  const totalCustomerSales = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
  }, [customers]);

  // Open WhatsApp Modal for customer
  const handleOpenWhatsAppModal = (customer: CustomerRecord) => {
    setReminderModalCustomer(customer);
    setReminderPhone(customer.phone || '');

    const latestInv = customer.latestInvoiceId 
      ? invoices.find(i => i.id === customer.latestInvoiceId) 
      : undefined;

    const dueAmount = customer.balanceDue || 0;
    if (dueAmount > 0) {
      const msg = generatePaymentReminderWhatsAppMessage(
        customer.name,
        dueAmount,
        profile,
        customer.latestInvoiceId,
        typeof window !== 'undefined' ? window.location.origin : '',
        latestInv
      );
      setReminderMessage(msg);
    } else {
      // General customer appreciation / statement message
      const shopName = profile.shopName || 'Our Store';
      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      let billLink = '';
      if (latestInv && baseOrigin) {
        const encoded = encodeBillToUrl(latestInv, profile);
        billLink = `${baseOrigin}/?bill=${latestInv.id}${encoded ? `&bdata=${encodeURIComponent(encoded)}` : ''}`;
      } else if (customer.latestInvoiceId && baseOrigin) {
        billLink = `${baseOrigin}/?bill=${customer.latestInvoiceId}`;
      }
      
      const lines = [
        `🧾 *CUSTOMER STATEMENT*`,
        `━━━━━━━━━━━━━━━━━━`,
        `Dear *${customer.name}*,`,
        ``,
        `Thank you for shopping at *${shopName}*!`,
        `• *Total Purchases:* ₹${(customer.totalSpent || 0).toFixed(2)}`,
        `• *Invoices:* ${customer.invoiceCount || 1}`,
        `• *Account Balance:* All Cleared (₹0.00)`,
        ...(customer.latestInvoiceId ? [`• *Latest Bill:* ${customer.latestInvoiceId}`] : []),
        ...(billLink ? [`\n📄 *View Latest Bill:* ${billLink}`] : []),
        ``,
        `We truly appreciate your continued support! 🙏`,
        `*${shopName}*`,
        ...(profile.phone ? [`📞 ${profile.phone}`] : []),
      ];
      setReminderMessage(lines.join('\n'));
    }
  };

  const handleSendWhatsAppReminder = () => {
    if (!reminderMessage) return;
    openWhatsApp({
      phone: reminderPhone,
      message: reminderMessage
    });
    setReminderModalCustomer(null);
    showToast('Opening WhatsApp with payment reminder...');
  };

  const handleSaveBalance = () => {
    if (!editingBalanceCustomer) return;
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid amount.');
      return;
    }

    const updated = customers.map(c => {
      const keyC = (c.phone || c.name).trim().toLowerCase();
      const keyTarget = (editingBalanceCustomer.phone || editingBalanceCustomer.name).trim().toLowerCase();
      if (keyC === keyTarget) {
        return { ...c, balanceDue: val };
      }
      return c;
    });

    setCustomers(updated);
    saveCustomers(updated);
    setEditingBalanceCustomer(null);
    showToast('Customer balance updated successfully.');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reports & Ledger</h2>
          <p className="text-xs text-slate-500">Customer ledger, payment reminders, sales & GST reports</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="lg:w-64 shrink-0 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 space-y-1">
            {[
              { id: 'party', label: 'Party-wise Ledger' },
              { id: 'sales', label: 'Sales Report' },
              { id: 'purchases', label: 'Purchases Report' },
              { id: 'stock', label: 'Inventory / Stock' },
              { id: 'gst', label: 'GST Summary' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportType)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                  activeTab === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'party' && totalCustomerReceivables > 0 && (
                  <span className="text-[10px] font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                    Due
                  </span>
                )}
              </button>
            ))}
          </div>
          
          <button 
            onClick={getExportHandler()}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Date range filter (for sales, purchases, gst) */}
          {activeTab !== 'stock' && activeTab !== 'party' && (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Date Range</label>
              <div className="flex flex-wrap gap-2">
                {(['all', 'today', 'week', 'month', 'custom'] as DateFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                      dateFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'All Time' : f === 'week' ? '7 Days' : f === 'month' ? '30 Days' : f}
                  </button>
                ))}
              </div>
              
              {dateFilter === 'custom' && (
                <div className="flex gap-4 mt-4 items-center">
                  <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                  <span className="text-slate-400 font-bold">to</span>
                  <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                </div>
              )}
            </div>
          )}

          {/* PARTY-WISE LEDGER (Customer Ledger & Supplier Ledger) */}
          {activeTab === 'party' && (
            <div className="space-y-6">
              {/* Ledger Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Customers</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{customers.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Recorded across all bills</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales Volume</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">₹{totalCustomerSales.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Customer transactions</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm">
                  <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">Outstanding Receivables</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">₹{totalCustomerReceivables.toFixed(2)}</p>
                  <p className="text-xs text-rose-500 mt-0.5">Pending customer dues</p>
                </div>
              </div>

              {/* Sub-tab switcher: Customers vs Suppliers */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    <button
                      onClick={() => setPartySubTab('customers')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        partySubTab === 'customers' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      <span>Customer Ledger ({customers.length})</span>
                    </button>
                    <button
                      onClick={() => setPartySubTab('suppliers')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        partySubTab === 'suppliers' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      <span>Supplier Ledger ({suppliers.length})</span>
                    </button>
                  </div>

                  {partySubTab === 'customers' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">Filter:</span>
                      {(['all', 'due', 'cleared'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setCustomerFilter(f)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${
                            customerFilter === f 
                              ? 'bg-slate-900 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {f === 'due' ? 'Has Due Balance' : f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* CUSTOMER LEDGER VIEW */}
                {partySubTab === 'customers' && (
                  <div className="space-y-4">
                    {/* Search box */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search customers by name or phone..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                    </div>

                    {/* Customer Cards List */}
                    {filteredCustomers.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-sm">No customer records found</p>
                        <p className="text-xs mt-1">Customer entries are automatically tracked from your bills.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredCustomers.map((cust) => {
                          const hasDue = (cust.balanceDue || 0) > 0;
                          return (
                            <div 
                              key={cust.id || cust.name} 
                              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 p-3 rounded-xl transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                                  {cust.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-900 text-sm">{cust.name}</h4>
                                    {hasDue ? (
                                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Due: ₹{(cust.balanceDue || 0).toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Cleared
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {cust.phone ? `Ph: ${cust.phone}` : 'No phone recorded'} • {cust.invoiceCount || 1} bills
                                    {cust.latestInvoiceId && <span className="font-medium text-slate-700"> • Latest: {cust.latestInvoiceId}</span>}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                <div className="text-right">
                                  <p className="text-xs text-slate-400 font-bold uppercase">Total Purchases</p>
                                  <p className="text-sm font-black text-slate-900">₹{(cust.totalSpent || 0).toFixed(2)}</p>
                                </div>

                                {/* Edit Balance Button */}
                                <button
                                  onClick={() => {
                                    setEditingBalanceCustomer(cust);
                                    setBalanceInput(String(cust.balanceDue || 0));
                                  }}
                                  className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                  title="Adjust outstanding balance"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                {/* WhatsApp Reminder / Share Button */}
                                <button
                                  onClick={() => handleOpenWhatsAppModal(cust)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm active:scale-[0.98] ${
                                    hasDue 
                                      ? 'bg-[#25D366] hover:bg-[#20bd5a]' 
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                  title={hasDue ? 'Send WhatsApp payment reminder' : 'Share WhatsApp summary'}
                                >
                                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                                  </svg>
                                  <span>{hasDue ? 'Payment Reminder' : 'Share on WhatsApp'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* SUPPLIER LEDGER VIEW */}
                {partySubTab === 'suppliers' && (
                  <div className="space-y-4">
                    {suppliers.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-sm">No suppliers logged yet</p>
                        <p className="text-xs mt-1">Suppliers are recorded when you log purchases.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {suppliers.map((sup: Supplier) => (
                          <div 
                            key={sup.id} 
                            className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 p-3 rounded-xl transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900 text-sm">{sup.name}</h4>
                                {sup.balanceDue > 0 ? (
                                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                    You Owe: ₹{sup.balanceDue.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    All Settled
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {sup.phone ? `Ph: ${sup.phone}` : 'No phone'} • Paid: ₹{sup.amountPaid.toFixed(2)}
                              </p>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-xs text-slate-400 font-bold uppercase">Total Purchased</p>
                                <p className="text-sm font-black text-slate-900">₹{sup.totalPurchased.toFixed(2)}</p>
                              </div>

                              {sup.phone && (
                                <button
                                  onClick={() => {
                                    const msg = `Hello ${sup.name},\nRegarding purchase account reconciliation with ${profile.shopName || 'our shop'}:\nTotal Purchased: ₹${sup.totalPurchased.toFixed(2)}\nCurrent Outstanding: ₹${sup.balanceDue.toFixed(2)}\nThank you!`;
                                    openWhatsApp({ phone: sup.phone, message: msg });
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#25D366] hover:bg-[#20bd5a] transition-all shadow-sm"
                                  title="WhatsApp Supplier"
                                >
                                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                                  </svg>
                                  Message
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SALES REPORT */}
          {activeTab === 'sales' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Sales Report Overview</h3>
              <p className="text-sm text-slate-500 mb-4">Export detailed line-by-line sales data including invoice totals, discounts, and payment methods for the selected date range. Found {filteredInvoices.length} records.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Sales</p>
                  <p className="text-2xl font-black text-slate-900">₹{filteredInvoices.reduce((s, i) => s + i.total, 0).toFixed(2)}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Invoices Count</p>
                  <p className="text-2xl font-black text-slate-900">{filteredInvoices.length}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* PURCHASES REPORT */}
          {activeTab === 'purchases' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Purchases Report Overview</h3>
              <p className="text-sm text-slate-500 mb-4">Export detailed purchase orders logged from your suppliers for the selected date range. Found {filteredPurchases.length} records.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Purchases</p>
                  <p className="text-2xl font-black text-slate-900">₹{filteredPurchases.reduce((s, p) => s + p.totalAmount, 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* STOCK REPORT */}
          {activeTab === 'stock' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Inventory Report</h3>
              <p className="text-sm text-slate-500">Export your complete catalog with current stock levels, rate, cost price, and low stock thresholds. (Date filter does not apply to current stock).</p>
              <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Items in Catalog</p>
                <p className="text-2xl font-black text-slate-900">{catalog.length}</p>
              </div>
            </div>
          )}
          
          {/* GST SUMMARY */}
          {activeTab === 'gst' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-900 mb-2">GST Summary Report</h3>
              <p className="text-sm text-slate-500 mb-4">Export a slab-wise breakdown (e.g. 5%, 12%, 18%) of taxable values and tax collected, formatted for easy manual GST return filing.</p>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <p className="text-xs text-emerald-600 font-bold uppercase mb-1">Total GST Collected (Period)</p>
                <p className="text-2xl font-black text-emerald-700">
                  ₹{filteredInvoices.filter(i => i.applyGst).reduce((s, i) => s + i.cgst + i.sgst, 0).toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WHATSAPP PAYMENT REMINDER MODAL */}
      {reminderModalCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366]">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">WhatsApp Payment Reminder</h3>
                  <p className="text-xs text-slate-500">{reminderModalCustomer.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setReminderModalCustomer(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Customer Mobile / WhatsApp Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210 (10 digits)"
                  value={reminderPhone}
                  onChange={(e) => setReminderPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Message Preview (Editable)</label>
                <textarea
                  rows={8}
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-mono leading-relaxed bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:bg-white resize-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => setReminderModalCustomer(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendWhatsAppReminder}
                  className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-bold text-sm transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                  </svg>
                  <span>Open in WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST CUSTOMER BALANCE MODAL */}
      {editingBalanceCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">Adjust Customer Due Balance</h3>
              <button onClick={() => setEditingBalanceCustomer(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Customer: <span className="font-bold text-slate-800">{editingBalanceCustomer.name}</span>
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Outstanding Balance (₹)</label>
              <input
                type="number"
                step="any"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 mt-1">Set to 0 if the customer has fully cleared all pending dues.</p>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setEditingBalanceCustomer(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBalance}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors shadow-sm"
              >
                Save Balance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
