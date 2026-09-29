import { useState, useMemo, useEffect } from 'react';
import { getInvoices, getExpenses, saveExpenses, getProfile, getPurchases } from '../store';
import { Expense } from '../types';
import { PieChart, Lock, Calendar, Plus, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

export function ProfitLossTab() {
  const { appUser } = useAuth();
  const profile = getProfile();
  
  if (appUser?.role === 'staff') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center mt-12">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm">Staff members do not have permission to view Profit & Loss.</p>
      </div>
    );
  }
  
  // Security lock
  const hasPin = Boolean(profile.pinCode);
  const [unlocked, setUnlocked] = useState(!hasPin);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Filters & State
  const [filter, setFilter] = useState<DateFilter>('today');
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [customDate, setCustomDate] = useState<string>(todayStr);
  
  // Data
  const [invoices, setInvoices] = useState(getInvoices());
  const [allExpenses, setAllExpenses] = useState<Expense[]>(getExpenses());
  const [allPurchases, setAllPurchases] = useState(getPurchases());

  useEffect(() => {
    const refresh = () => {
      setInvoices(getInvoices());
      setAllExpenses(getExpenses());
      setAllPurchases(getPurchases());
    };
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  // New Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');

  // Lock Screen Logic
  const handleUnlock = () => {
    if (pinInput === profile.pinCode) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  // Filter Logic
  const { filteredInvoices, filteredExpenses, filteredPurchases } = useMemo(() => {
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
      endTime = startTime + 7 * 24 * 60 * 60 * 1000; 
    } else if (filter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      startTime = start.getTime();
      endTime = startTime + 30 * 24 * 60 * 60 * 1000; 
    } else if (filter === 'custom' && customDate) {
      const [y, m, d] = customDate.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      startTime = start.getTime();
      endTime = startTime + 24 * 60 * 60 * 1000;
    }

    return {
      filteredInvoices: invoices.filter(inv => inv.timestamp >= startTime && inv.timestamp < endTime),
      filteredExpenses: allExpenses.filter(exp => exp.timestamp >= startTime && exp.timestamp < endTime),
      filteredPurchases: allPurchases.filter(p => p.timestamp >= startTime && p.timestamp < endTime)
    };
  }, [invoices, allExpenses, allPurchases, filter, customDate]);

  // Metrics Logic
  const metrics = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    let gstCollected = 0;
    
    filteredInvoices.forEach(inv => {
      // Revenue = subtotal - discount (before GST)
      const invRevenue = inv.subtotal - (inv.discountAmount || 0);
      revenue += invRevenue;
      
      // COGS = sum of costAmount for all items
      let invCogs = 0;
      inv.items.forEach(item => {
        invCogs += (item.costAmount || 0);
      });
      cogs += invCogs;
      
      // GST
      gstCollected += inv.cgst + inv.sgst;
    });

    const grossProfit = revenue - cogs;
    
    let expenses = 0;
    filteredExpenses.forEach(exp => {
      expenses += exp.amount;
    });

    let purchasesTotal = 0;
    filteredPurchases.forEach(p => {
      purchasesTotal += p.totalAmount;
    });

    const netProfit = grossProfit - expenses; // Keeping COGS for standard net profit, but we can display purchases
    
    // Most Profitable Items
    const itemProfits: Record<string, { name: string, profit: number, quantity: number }> = {};
    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const itemProfit = item.amount - (item.costAmount || 0);
        if (!itemProfits[item.id]) {
          itemProfits[item.id] = { name: item.name, profit: 0, quantity: 0 };
        }
        itemProfits[item.id].profit += itemProfit;
        itemProfits[item.id].quantity += item.quantity;
      });
    });
    
    const mostProfitableItems = Object.values(itemProfits)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    return { revenue, cogs, grossProfit, gstCollected, expenses, purchasesTotal, netProfit, mostProfitableItems };
  }, [filteredInvoices, filteredExpenses, filteredPurchases]);

  // Chart Data
  const chartData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Create last 7 days array
    const days = Array.from({length: 7}).map((_, i) => {
      const d = new Date(startOfToday.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
      return {
        timestamp: d.getTime(),
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        Revenue: 0,
        Profit: 0
      };
    });

    invoices.forEach(inv => {
      const invDate = new Date(inv.timestamp);
      const invDay = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate()).getTime();
      const dayNode = days.find(d => d.timestamp === invDay);
      if (dayNode) {
        const rev = inv.subtotal - (inv.discountAmount || 0);
        let cogs = 0;
        inv.items.forEach(i => cogs += (i.costAmount || 0));
        
        dayNode.Revenue += rev;
        dayNode.Profit += (rev - cogs);
      }
    });

    // Also deduct expenses from Profit line in chart? Better to just show Gross Profit vs Revenue
    return days;
  }, [invoices]);

  if (!unlocked) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-slate-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">P&L Locked</h2>
        <p className="text-sm text-slate-500 mb-8 text-center">Enter your App PIN to view financial insights.</p>
        
        <div className="w-full max-w-xs space-y-4">
          <input 
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="Enter PIN"
            className={`w-full bg-white border rounded-xl px-4 py-4 text-center text-2xl tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${pinError ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}
          />
          {pinError && <p className="text-red-500 text-xs text-center font-bold">Incorrect PIN</p>}
          <button 
            onClick={handleUnlock}
            disabled={!pinInput}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 lg:pb-12 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Profit & Loss</h2>
            <p className="text-xs text-slate-500">Real-time revenue, cost, and margin analytics</p>
          </div>
        </div>

        {/* Date Filters */}
        <div className="bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 flex overflow-x-auto gap-1.5 self-start sm:self-auto">
          <button 
            onClick={() => setFilter('today')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'today' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >Today</button>
          <button 
            onClick={() => setFilter('week')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >7 Days</button>
          <button 
            onClick={() => setFilter('month')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filter === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >30 Days</button>
          <button 
            onClick={() => setFilter('custom')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${filter === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Calendar className="w-3.5 h-3.5" /> Custom
          </button>
        </div>
      </div>

      {!hasPin && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium leading-snug">
            Your P&L is currently unprotected. Set a PIN in the Settings tab to lock this screen.
          </p>
        </div>
      )}

      {filter === 'custom' && (
        <div className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 max-w-sm">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Select Date</label>
          <input 
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium"
          />
        </div>
      )}

      {/* Responsive 2-column Grid on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Financial Breakdown & Expenses */}
        <div className="lg:col-span-5 space-y-6">
          {/* Metrics breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Period Revenue</h3>
              <p className="text-3xl font-black text-slate-900 tracking-tight">₹{metrics.revenue.toFixed(2)}</p>
            </div>
            
            <div className="bg-slate-50/70 p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-slate-600">Total Revenue</span>
                <span className="font-bold text-slate-900">₹{metrics.revenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-slate-200/80 pb-3">
                <span className="font-medium text-slate-600">Cost of Goods (COGS)</span>
                <span className="font-bold text-rose-600">-₹{metrics.cogs.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="font-bold text-slate-900">Gross Profit</span>
                <span className="font-black text-emerald-600">₹{metrics.grossProfit.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm border-b border-slate-200/80 pb-3">
                <span className="font-medium text-slate-600">Operating Expenses</span>
                <span className="font-bold text-rose-600">-₹{metrics.expenses.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-sm border-b border-slate-200/80 pb-3">
                <span className="font-medium text-slate-600">Total Purchases (Stock/Cash Out)</span>
                <span className="font-bold text-slate-600">₹{metrics.purchasesTotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-lg text-slate-900">Net Profit</span>
                <span className={`font-black text-2xl ${metrics.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                  ₹{metrics.netProfit.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-100/70 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">GST Collected (Liability)</span>
              <span className="text-sm font-black text-slate-700">₹{metrics.gstCollected.toFixed(2)}</span>
            </div>
          </div>

          {/* Expenses List */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Recorded Expenses</h3>
            </div>

            {filteredExpenses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                No operating expenses recorded for this period.
              </p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {filteredExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{exp.description}</p>
                      <p className="text-xs text-slate-400">{new Date(exp.timestamp).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-rose-600 text-sm">-₹{exp.amount.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Chart & Invoices count */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Revenue vs Gross Profit Trend</h3>
                <p className="text-xs text-slate-500">Last 7 days daily performance trajectory</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Revenue
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Gross Profit
                </span>
              </div>
            </div>
            
            <div className="h-72 w-full -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={60} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip 
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="#94a3b8" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bills in Period</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{filteredInvoices.length}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Bill Size</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">
                ₹{filteredInvoices.length > 0 ? (metrics.revenue / filteredInvoices.length).toFixed(1) : '0.00'}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Most Profitable Items</h3>
            {metrics.mostProfitableItems.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                No items sold in this period.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.mostProfitableItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                      <p className="text-xs text-slate-400">Sold: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-600 text-sm block">₹{item.profit.toFixed(2)} profit</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
