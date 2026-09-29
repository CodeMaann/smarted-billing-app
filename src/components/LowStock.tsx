import { useState, useEffect, useMemo } from 'react';
import { CatalogItem, Loan } from '../types';
import { getCatalog, saveCatalog, getLoans, getProfile } from '../store';
import { AlertTriangle, Plus, Package, HandCoins, Clock, MessageSquare, ArrowRight, CheckCircle2 } from 'lucide-react';
import { generateLoanReminderWhatsAppMessage, openWhatsApp } from '../utils/whatsapp';

interface LowStockTabProps {
  onNavigateToLoan?: (loanId: string) => void;
}

export function LowStockTab({ onNavigateToLoan }: LowStockTabProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'stock' | 'loans'>('all');
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('');

  const profile = getProfile();

  useEffect(() => {
    loadData();
    window.addEventListener('quickbill-data-updated', loadData);
    return () => window.removeEventListener('quickbill-data-updated', loadData);
  }, []);

  const loadData = () => {
    const allItems = getCatalog();
    setItems(allItems.filter(item => item.stock <= item.lowStockThreshold));
    setLoans(getLoans());
  };

  const handleRestock = (id: string) => {
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) return;

    const catalog = getCatalog();
    const updated = catalog.map(item => {
      if (item.id === id) {
        return { ...item, stock: item.stock + qty };
      }
      return item;
    });

    saveCatalog(updated);
    setRestockId(null);
    setRestockQty('');
    setItems(updated.filter(item => item.stock <= item.lowStockThreshold));
  };

  // Compute Loan Alerts (Overdue or Due Soon <= 3 days)
  const loanAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts: Array<{
      loan: Loan;
      remaining: number;
      dueStatusText: string;
      isOverdue: boolean;
      daysDiff: number;
    }> = [];

    loans.forEach(loan => {
      if (loan.status === 'repaid') return;
      const repaid = (loan.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
      const remaining = Math.max(0, loan.amount - repaid);
      if (remaining <= 0) return;

      if (!loan.expectedRepaymentDate) return;
      const [y, m, d] = loan.expectedRepaymentDate.split('-').map(Number);
      const dueDate = new Date(y, m - 1, d);
      dueDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 3) {
        const isOverdue = diffDays < 0;
        let dueStatusText = '';
        if (diffDays < 0) {
          dueStatusText = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
        } else if (diffDays === 0) {
          dueStatusText = 'Due Today';
        } else {
          dueStatusText = `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        }

        alerts.push({
          loan,
          remaining,
          dueStatusText,
          isOverdue,
          daysDiff: diffDays
        });
      }
    });

    return alerts.sort((a, b) => a.daysDiff - b.daysDiff);
  }, [loans]);

  const handleSendReminder = (item: typeof loanAlerts[0]) => {
    const msg = generateLoanReminderWhatsAppMessage(
      item.loan.borrowerName,
      item.loan.amount,
      item.remaining,
      item.loan.expectedRepaymentDate,
      item.loan.dateGiven,
      profile,
      item.dueStatusText
    );
    openWhatsApp({ phone: item.loan.phone, message: msg });
  };

  const totalAlertsCount = items.length + loanAlerts.length;

  return (
    <div className="pb-28 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Business Alerts & Reminders</h2>
            <p className="text-xs text-slate-500 font-medium">
              Actionable notifications for low stock inventory and upcoming/overdue loan repayments
            </p>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 w-fit">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Alerts ({totalAlertsCount})
          </button>
          <button
            onClick={() => setActiveFilter('loans')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'loans' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>Loans Due ({loanAlerts.length})</span>
          </button>
          <button
            onClick={() => setActiveFilter('stock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'stock' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Low Stock ({items.length})</span>
          </button>
        </div>
      </div>

      {totalAlertsCount === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <p className="text-slate-900 font-bold text-lg">Everything is in Order!</p>
          <p className="text-sm text-slate-500 mt-1">No items are below low-stock threshold and no loans are overdue or due soon.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: Loan Repayment Alerts */}
          {(activeFilter === 'all' || activeFilter === 'loans') && loanAlerts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <HandCoins className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Loan Repayments Due Soon or Overdue ({loanAlerts.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loanAlerts.map(alert => (
                  <div
                    key={alert.loan.id}
                    className={`bg-white p-5 rounded-2xl shadow-sm border flex flex-col justify-between gap-4 ${
                      alert.isOverdue ? 'border-rose-300 bg-rose-50/20' : 'border-amber-300 bg-amber-50/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-black text-slate-900 text-base">{alert.loan.borrowerName}</h4>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{alert.loan.phone}</p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                            alert.isOverdue
                              ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {alert.isOverdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {alert.dueStatusText}
                        </span>
                      </div>

                      <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remaining Balance</p>
                          <p className="text-base font-black text-rose-600">₹{alert.remaining.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Original Loan</p>
                          <p className="text-xs font-bold text-slate-700">₹{alert.loan.amount.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleSendReminder(alert)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl font-bold text-xs shadow-sm transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp Reminder</span>
                      </button>

                      {onNavigateToLoan && (
                        <button
                          onClick={() => onNavigateToLoan(alert.loan.id)}
                          className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl font-bold text-xs border border-indigo-200 transition-all"
                        >
                          <span>View Details</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 2: Low Stock Alerts */}
          {(activeFilter === 'all' || activeFilter === 'stock') && items.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Low Stock Catalog Items ({items.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200/80 bg-gradient-to-br from-amber-50/40 to-white flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-slate-900 text-base">{item.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Rate: ₹{item.rate} • GST {item.gstRate}%</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold">
                            Current Stock: {item.stock}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            Threshold: {item.lowStockThreshold}
                          </span>
                        </div>
                      </div>
                    </div>

                    {restockId === item.id ? (
                      <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-amber-300 shadow-sm">
                        <input 
                          type="number"
                          inputMode="numeric"
                          value={restockQty}
                          onChange={(e) => setRestockQty(e.target.value)}
                          placeholder="Qty to add"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 font-bold"
                        />
                        <button 
                          onClick={() => setRestockId(null)}
                          className="px-3 py-2 text-slate-500 text-xs font-bold hover:bg-slate-100 rounded-lg"
                        >Cancel</button>
                        <button 
                          onClick={() => handleRestock(item.id)}
                          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 active:scale-95"
                        >Add Stock</button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          setRestockId(item.id);
                          setRestockQty('');
                        }}
                        className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-amber-300 text-amber-800 rounded-xl text-xs font-bold shadow-sm hover:bg-amber-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Quick Restock
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
