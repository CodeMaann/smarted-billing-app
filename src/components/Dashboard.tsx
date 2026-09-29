import { useState, useMemo, useEffect } from 'react';
import { getInvoices, getLoans, getCustomers } from '../store';
import { LayoutDashboard, Calendar, DollarSign, ReceiptText, Percent, Tag, TrendingUp, Package, HandCoins, Users, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

export function DashboardTab() {
  const [filter, setFilter] = useState<DateFilter>('today');
  
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  
  const [customDate, setCustomDate] = useState<string>(todayStr);
  const [invoices, setInvoices] = useState(getInvoices());
  const [loans, setLoans] = useState(getLoans());
  const [customers, setCustomers] = useState(getCustomers());

  useEffect(() => {
    const refresh = () => {
      setInvoices(getInvoices());
      setLoans(getLoans());
      setCustomers(getCustomers());
    };
    refresh();
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  const filteredData = useMemo(() => {
    const now = new Date();
    let startTime = 0;
    let endTime = Infinity;

    if (filter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startTime = start.getTime();
      endTime = startTime + 24 * 60 * 60 * 1000;
    } else if (filter === 'week') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startTime = start.getTime();
      endTime = startTime + 7 * 24 * 60 * 60 * 1000; // last 7 days till end of today
    } else if (filter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      startTime = start.getTime();
      endTime = startTime + 30 * 24 * 60 * 60 * 1000; // last 30 days till end of today
    } else if (filter === 'custom' && customDate) {
      const [y, m, d] = customDate.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      startTime = start.getTime();
      endTime = startTime + 24 * 60 * 60 * 1000;
    }

    return invoices.filter(inv => {
      const time = typeof inv.timestamp === 'number' && !isNaN(inv.timestamp)
        ? inv.timestamp
        : Number(inv.timestamp) || (inv as any).date || 0;
      return time >= startTime && time < endTime;
    });
  }, [invoices, filter, customDate]);

  const metrics = useMemo(() => {
    let sales = 0;
    let collected = 0;
    let pending = 0;
    let gst = 0;
    let discount = 0;

    filteredData.forEach(inv => {
      const invTotal = inv.total || 0;
      sales += invTotal;
      gst += (inv.cgst || 0) + (inv.sgst || 0);
      discount += inv.discountAmount || 0;

      // Calculate collected vs pending for this invoice
      if (inv.paymentStatus === 'partial' || inv.paymentMode === 'Partially Paid') {
        const paid = typeof inv.amountPaid === 'number' ? inv.amountPaid : 0;
        const due = typeof inv.amountDue === 'number' ? inv.amountDue : Math.max(0, invTotal - paid);
        collected += paid;
        pending += due;
      } else if (inv.paymentMode === 'Credit' || inv.paymentStatus === 'unpaid') {
        const paid = typeof inv.amountPaid === 'number' ? inv.amountPaid : 0;
        const due = typeof inv.amountDue === 'number' ? inv.amountDue : Math.max(0, invTotal - paid);
        collected += paid;
        pending += due;
      } else {
        // Fully paid bill
        collected += invTotal;
      }
    });

    return {
      sales,
      collected,
      pending,
      count: filteredData.length,
      gst,
      discount
    };
  }, [filteredData]);

  // Credit and Loans summary
  const creditLoanMetrics = useMemo(() => {
    const totalUdhaar = customers.reduce((sum, c) => sum + (c.balanceDue || 0), 0);

    let totalCashLoaned = 0;
    let totalCashOutstanding = 0;
    let totalBillLoaned = 0;
    let totalBillOutstanding = 0;

    loans.forEach(loan => {
      const isBill = loan.source === 'Bill balance';
      const repaid = (loan.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
      const remaining = Math.max(0, (loan.amount || 0) - repaid);

      if (isBill) {
        totalBillLoaned += loan.amount || 0;
        if (loan.status !== 'repaid' && remaining > 0) {
          totalBillOutstanding += remaining;
        }
      } else {
        totalCashLoaned += loan.amount || 0;
        if (loan.status !== 'repaid' && remaining > 0) {
          totalCashOutstanding += remaining;
        }
      }
    });

    return {
      totalUdhaar,
      totalCashLoaned, // Note: ONLY cash loans, NOT inflated by unpaid bills!
      totalCashOutstanding,
      totalBillLoaned,
      totalBillOutstanding,
      cashLoansCount: loans.filter(l => l.source !== 'Bill balance').length,
      billLoansCount: loans.filter(l => l.source === 'Bill balance').length
    };
  }, [customers, loans]);

  const trendData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Create last 7 days array
    const days = Array.from({length: 7}).map((_, i) => {
      const d = new Date(startOfToday.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
      return {
        timestamp: d.getTime(),
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        sales: 0
      };
    });

    invoices.forEach(inv => {
      const invTime = typeof inv.timestamp === 'number' && !isNaN(inv.timestamp)
        ? inv.timestamp
        : Number(inv.timestamp) || (inv as any).date || 0;
      if (!invTime) return;
      const invDate = new Date(invTime);
      const invDay = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate()).getTime();
      const dayNode = days.find(d => d.timestamp === invDay);
      if (dayNode) {
        dayNode.sales += inv.total || 0;
      }
    });

    return days;
  }, [invoices]);

  const topItems = useMemo(() => {
    const itemCounts: Record<string, number> = {};
    filteredData.forEach(inv => {
      inv.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });

    return Object.entries(itemCounts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredData]);

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h2>
        </div>

        <div className="bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 flex overflow-x-auto gap-1">
          <button 
            onClick={() => setFilter('today')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'today' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >Today</button>
          <button 
            onClick={() => setFilter('week')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >7 Days</button>
          <button 
            onClick={() => setFilter('month')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >30 Days</button>
          <button 
            onClick={() => setFilter('custom')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${filter === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Calendar className="w-3.5 h-3.5" /> Custom
          </button>
        </div>
      </div>

      {filter === 'custom' && (
        <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 max-w-sm">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Select Date</label>
          <input 
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      )}

      {/* Responsive Metrics Grid: 2 cols on mobile, 4 cols on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-4">
        <div className="bg-indigo-50/70 hover:bg-indigo-50 p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-center transition-all">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <DollarSign className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">Total Sales</h3>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-indigo-900 truncate">₹{metrics.sales.toFixed(2)}</p>
        </div>
        
        <div className="bg-emerald-50/70 hover:bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-center transition-all">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <ReceiptText className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">Bills Made</h3>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-emerald-900">{metrics.count}</p>
        </div>
        
        <div className="bg-amber-50/70 hover:bg-amber-50 p-5 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-center transition-all">
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <Percent className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">GST Collected</h3>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-amber-900 truncate">₹{metrics.gst.toFixed(2)}</p>
        </div>

        <div className="bg-rose-50/70 hover:bg-rose-50 p-5 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-center transition-all">
          <div className="flex items-center gap-2 text-rose-600 mb-2">
            <Tag className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">Discounts</h3>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-rose-900 truncate">₹{metrics.discount.toFixed(2)}</p>
        </div>
      </div>

      {/* Realization: Collected vs Pending */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-emerald-50/80 hover:bg-emerald-50 p-4 rounded-2xl border border-emerald-200/80 shadow-xs flex items-center justify-between transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-xs">
              ✓
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Collected Amount</p>
              <p className="text-xl lg:text-2xl font-black text-emerald-950">₹{metrics.collected.toFixed(2)}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-lg">
            {metrics.sales > 0 ? `${Math.round((metrics.collected / metrics.sales) * 100)}% of sales` : '100%'}
          </span>
        </div>

        <div className="bg-amber-50/80 hover:bg-amber-50 p-4 rounded-2xl border border-amber-200/80 shadow-xs flex items-center justify-between transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black shadow-xs">
              ⏳
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">Pending Amount (Balance Due)</p>
              <p className="text-xl lg:text-2xl font-black text-amber-950">₹{metrics.pending.toFixed(2)}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-lg">
            {metrics.sales > 0 ? `${Math.round((metrics.pending / metrics.sales) * 100)}% pending` : '₹0.00'}
          </span>
        </div>
      </div>

      {/* Credit & Cash Loan Overview (Distinct Udhaar vs. Cash Loans vs. Bill Balances) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Outstanding Balances: Customer Udhaar vs. Cash Loans vs. Bill Balances
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400">Ledger & Loans</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Outstanding (Udhaar) from Customer Ledger */}
          <div className="bg-white p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-700 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Customer Udhaar (Ledger)</span>
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-amber-800">₹{creditLoanMetrics.totalUdhaar.toFixed(2)}</p>
            <p className="text-xs text-amber-700/80 mt-1 font-medium">Customer Ledger • Goods on credit</p>
          </div>

          {/* Card 2: Total Loaned Out (Cash Loans only - NOT inflated by bills!) */}
          <div className="bg-white p-5 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-indigo-700 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Loaned Out</span>
              <HandCoins className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-black text-indigo-900">₹{creditLoanMetrics.totalCashLoaned.toFixed(2)}</p>
            <p className="text-xs text-indigo-700/80 mt-1 font-medium">Cash lent out • {creditLoanMetrics.cashLoansCount} cash loans</p>
          </div>

          {/* Card 3: Bill Balances (Loans from Partial Bills) */}
          <div className="bg-white p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-800 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Bill Balances Pending</span>
              <ReceiptText className="w-4 h-4 text-amber-700" />
            </div>
            <p className="text-2xl font-black text-amber-900">₹{creditLoanMetrics.totalBillOutstanding.toFixed(2)}</p>
            <p className="text-xs text-amber-800/80 mt-1 font-medium">Unpaid bill balances in loans ({creditLoanMetrics.billLoansCount})</p>
          </div>

          {/* Card 4: Total Outstanding (Cash Loans) */}
          <div className="bg-white p-5 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/40 via-white to-rose-50/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-700 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Cash Loans Outstanding</span>
              <DollarSign className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-2xl font-black text-rose-700">₹{creditLoanMetrics.totalCashOutstanding.toFixed(2)}</p>
            <p className="text-xs text-rose-700/80 mt-1 font-medium">Cash loans remaining to recover</p>
          </div>
        </div>
      </div>

      {/* Side-by-side or stacked trend & top items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 7-Day Trend Chart */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-slate-500" />
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">7-Day Sales Trend</h3>
          </div>
          <div className="h-56 lg:h-72 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={60} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Sales']}
                  labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                />
                <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-slate-500" />
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Top Selling Items</h3>
          </div>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No items sold in this period.
            </p>
          ) : (
            <div className="space-y-3">
              {topItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black border border-indigo-100 shrink-0">
                      {idx + 1}
                    </div>
                    <p className="font-bold text-slate-900 text-sm truncate max-w-[140px] sm:max-w-none">{item.name}</p>
                  </div>
                  <p className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">
                    {item.qty} sold
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
