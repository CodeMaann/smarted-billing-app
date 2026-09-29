import React, { useState, useEffect, useMemo } from 'react';
import { 
  HandCoins, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Phone, 
  MessageSquare, 
  Trash2, 
  ArrowRight, 
  ChevronRight, 
  History, 
  DollarSign, 
  User, 
  FileText,
  X,
  CreditCard
} from 'lucide-react';
import { Loan, LoanRepayment } from '../types';
import { getLoans, saveLoan, deleteLoan, getNextLoanId, getProfile, recordLoanRepayment } from '../store';
import { generateLoanReminderWhatsAppMessage, openWhatsApp } from '../utils/whatsapp';

export function LoansTab({ initialSelectedLoanId }: { initialSelectedLoanId?: string }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'repaid'>('active');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cash' | 'bill'>('all');
  const [sortBy, setSortBy] = useState<'due_soon' | 'amount_high' | 'recent'>('due_soon');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [repayingLoan, setRepayingLoan] = useState<Loan | null>(null);
  const [detailsLoan, setDetailsLoan] = useState<Loan | null>(null);

  // New Loan Form State
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const defaultDueStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [borrowerName, setBorrowerName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [dateGiven, setDateGiven] = useState(todayStr);
  const [expectedRepaymentDate, setExpectedRepaymentDate] = useState(defaultDueStr);
  const [note, setNote] = useState('');

  // Repayment Form State
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState(todayStr);
  const [repaymentNote, setRepaymentNote] = useState('Cash payment');

  const profile = getProfile();

  const loadData = () => {
    const all = getLoans();
    setLoans(all);
    if (initialSelectedLoanId) {
      const match = all.find(l => l.id === initialSelectedLoanId);
      if (match) {
        setDetailsLoan(match);
      }
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('quickbill-data-updated', loadData);
    return () => window.removeEventListener('quickbill-data-updated', loadData);
  }, [initialSelectedLoanId]);

  // Helper calculations for a loan
  const getRepaidAmount = (loan: Loan): number => {
    return (loan.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  };

  const getRemainingAmount = (loan: Loan): number => {
    const rem = loan.amount - getRepaidAmount(loan);
    return rem > 0 ? rem : 0;
  };

  // Helper for due status & badge
  const getDueStatus = (expectedDate: string) => {
    if (!expectedDate) return { text: 'No due date', type: 'normal', daysDiff: 999 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [y, m, d] = expectedDate.split('-').map(Number);
    const dueDate = new Date(y, m - 1, d);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueBy = Math.abs(diffDays);
      return {
        text: `Overdue by ${overdueBy} day${overdueBy > 1 ? 's' : ''}`,
        type: 'overdue',
        daysDiff: diffDays
      };
    } else if (diffDays === 0) {
      return {
        text: 'Due Today',
        type: 'due_today',
        daysDiff: 0
      };
    } else if (diffDays <= 3) {
      return {
        text: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`,
        type: 'due_soon',
        daysDiff: diffDays
      };
    } else {
      return {
        text: `Due in ${diffDays} days`,
        type: 'normal',
        daysDiff: diffDays
      };
    }
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalCashLoaned = 0;
    let totalBillBalances = 0;
    let totalRepaid = 0;
    let totalOutstanding = 0;
    let cashOutstanding = 0;
    let billOutstanding = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    loans.forEach(loan => {
      const isBill = loan.source === 'Bill balance';
      if (isBill) {
        totalBillBalances += loan.amount || 0;
      } else {
        totalCashLoaned += loan.amount || 0;
      }

      const repaid = getRepaidAmount(loan);
      totalRepaid += repaid;
      const rem = getRemainingAmount(loan);

      if (loan.status === 'active' && rem > 0) {
        totalOutstanding += rem;
        if (isBill) {
          billOutstanding += rem;
        } else {
          cashOutstanding += rem;
        }

        const due = getDueStatus(loan.expectedRepaymentDate);
        if (due.type === 'overdue') overdueCount++;
        else if (due.type === 'due_soon' || due.type === 'due_today') dueSoonCount++;
      }
    });

    return {
      totalCashLoaned,
      totalBillBalances,
      totalRepaid,
      totalOutstanding,
      cashOutstanding,
      billOutstanding,
      overdueCount,
      dueSoonCount,
      activeCount: loans.filter(l => l.status === 'active' && getRemainingAmount(l) > 0).length,
      repaidCount: loans.filter(l => l.status === 'repaid' || getRemainingAmount(l) === 0).length,
      cashLoansCount: loans.filter(l => l.source !== 'Bill balance').length,
      billLoansCount: loans.filter(l => l.source === 'Bill balance').length,
    };
  }, [loans]);

  // Filtered and sorted loans
  const filteredLoans = useMemo(() => {
    return loans.filter(loan => {
      const isRepaid = loan.status === 'repaid' || getRemainingAmount(loan) === 0;
      if (activeTab === 'active' && isRepaid) return false;
      if (activeTab === 'repaid' && !isRepaid) return false;

      if (sourceFilter === 'cash' && loan.source === 'Bill balance') return false;
      if (sourceFilter === 'bill' && loan.source !== 'Bill balance') return false;

      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        loan.borrowerName.toLowerCase().includes(query) ||
        loan.phone.toLowerCase().includes(query) ||
        (loan.note && loan.note.toLowerCase().includes(query)) ||
        (loan.invoiceId && loan.invoiceId.toLowerCase().includes(query))
      );
    }).sort((a, b) => {
      if (sortBy === 'due_soon') {
        const diffA = getDueStatus(a.expectedRepaymentDate).daysDiff;
        const diffB = getDueStatus(b.expectedRepaymentDate).daysDiff;
        return diffA - diffB;
      } else if (sortBy === 'amount_high') {
        return getRemainingAmount(b) - getRemainingAmount(a);
      } else {
        return b.dateGiven - a.dateGiven;
      }
    });
  }, [loans, activeTab, sourceFilter, search, sortBy]);

  // Handlers
  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = parseFloat(amount);
    if (!borrowerName.trim()) {
      alert('Please enter borrower name.');
      return;
    }
    if (!phone.trim()) {
      alert('Please enter phone number.');
      return;
    }
    if (!principal || principal <= 0) {
      alert('Please enter a valid loan amount greater than zero.');
      return;
    }

    const [gy, gm, gd] = dateGiven.split('-').map(Number);
    const dateGivenTimestamp = new Date(gy, gm - 1, gd).getTime() || Date.now();

    const newLoan: Loan = {
      id: getNextLoanId(),
      borrowerName: borrowerName.trim(),
      phone: phone.trim(),
      amount: principal,
      dateGiven: dateGivenTimestamp,
      expectedRepaymentDate: expectedRepaymentDate || defaultDueStr,
      note: note.trim() || undefined,
      repayments: [],
      status: 'active',
      updatedAt: Date.now()
    };

    saveLoan(newLoan);
    setShowAddModal(false);

    // Reset form
    setBorrowerName('');
    setPhone('');
    setAmount('');
    setDateGiven(todayStr);
    setExpectedRepaymentDate(defaultDueStr);
    setNote('');
  };

  const handleOpenRepayModal = (loan: Loan) => {
    setRepayingLoan(loan);
    const remaining = getRemainingAmount(loan);
    setRepaymentAmount(remaining.toString());
    setRepaymentDate(todayStr);
    setRepaymentNote('Cash installment');
  };

  const handleSaveRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingLoan) return;

    const repayVal = parseFloat(repaymentAmount);
    if (!repayVal || repayVal <= 0) {
      alert('Please enter a valid repayment amount.');
      return;
    }

    const remaining = getRemainingAmount(repayingLoan);
    if (repayVal > remaining + 0.01) {
      alert(`Repayment amount cannot exceed remaining balance of ₹${remaining.toFixed(2)}.`);
      return;
    }

    const [ry, rm, rd] = repaymentDate.split('-').map(Number);
    const repayTimestamp = new Date(ry, rm - 1, rd).getTime() || Date.now();

    const newRepayment: LoanRepayment = {
      id: `RP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: repayTimestamp,
      amount: repayVal,
      note: repaymentNote.trim() || undefined
    };

    const { updatedLoan } = recordLoanRepayment(repayingLoan.id, newRepayment);
    setRepayingLoan(null);
    if (detailsLoan && detailsLoan.id === updatedLoan.id) {
      setDetailsLoan(updatedLoan);
    }
  };

  const handleDeleteLoan = (loan: Loan) => {
    if (confirm(`Are you sure you want to delete the loan record for ${loan.borrowerName} (₹${loan.amount})?`)) {
      deleteLoan(loan.id);
      if (detailsLoan && detailsLoan.id === loan.id) {
        setDetailsLoan(null);
      }
    }
  };

  const handleSendReminder = (loan: Loan) => {
    const remaining = getRemainingAmount(loan);
    const dueStatus = getDueStatus(loan.expectedRepaymentDate);
    const msg = generateLoanReminderWhatsAppMessage(
      loan.borrowerName,
      loan.amount,
      remaining,
      loan.expectedRepaymentDate,
      loan.dateGiven,
      profile,
      dueStatus.text
    );
    openWhatsApp({ phone: loan.phone, message: msg });
  };

  return (
    <div className="pb-28 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Loan Management</h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Cash Loans Given
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Track personal & staff cash loans, repayments & send WhatsApp reminders
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-md shadow-indigo-200 transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span>Give New Loan</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Loaned Out</span>
            <DollarSign className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-xl lg:text-2xl font-black text-slate-900 truncate">₹{metrics.totalCashLoaned.toFixed(2)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{metrics.cashLoansCount} cash loans given</p>
        </div>

        <div className="bg-white p-4 lg:p-5 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Bill Balances</span>
            <CreditCard className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl lg:text-2xl font-black text-amber-900 truncate">₹{metrics.totalBillBalances.toFixed(2)}</p>
          <p className="text-[11px] text-amber-700/80 mt-1 font-medium">{metrics.billLoansCount} partial bill balances</p>
        </div>

        <div className="bg-white p-4 lg:p-5 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Outstanding</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl lg:text-2xl font-black text-rose-600 truncate">₹{metrics.totalOutstanding.toFixed(2)}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] font-semibold text-slate-500 truncate">
            <span>Cash: ₹{metrics.cashOutstanding.toFixed(0)}</span>
            <span>•</span>
            <span>Bills: ₹{metrics.billOutstanding.toFixed(0)}</span>
          </div>
        </div>

        <div className="bg-white p-4 lg:p-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Repaid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl lg:text-2xl font-black text-emerald-700 truncate">₹{metrics.totalRepaid.toFixed(2)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Recovered so far</p>
        </div>
      </div>

      {/* Tabs & Search Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Active vs Repaid View Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'active' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Active</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'active' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'}`}>
                  {metrics.activeCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('repaid')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'repaid' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Repaid</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'repaid' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                  {metrics.repaidCount}
                </span>
              </button>
            </div>

            {/* Source Filter: Cash Loans vs Bill Balances */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sourceFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Sources
              </button>
              <button
                onClick={() => setSourceFilter('cash')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sourceFilter === 'cash' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Cash Loans ({metrics.cashLoansCount})
              </button>
              <button
                onClick={() => setSourceFilter('bill')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sourceFilter === 'bill' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Bill Balances ({metrics.billLoansCount})
              </button>
            </div>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="due_soon">Repayment Due Soonest</option>
              <option value="amount_high">Highest Amount Remaining</option>
              <option value="recent">Recently Given</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search loans by borrower name, phone number, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loans List */}
      {filteredLoans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <HandCoins className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {search ? 'No matching loan records found' : activeTab === 'active' ? 'No Active Loans' : 'No Repaid Loans Recorded'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'Try modifying your search query or check the other tab.'
              : activeTab === 'active'
              ? 'Give a cash loan to track money lent to employees, friends, or customers with automated repayment schedules.'
              : 'Loans that have been completely cleared will appear in this history view.'}
          </p>
          {!search && activeTab === 'active' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Give First Loan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLoans.map((loan) => {
            const repaid = getRepaidAmount(loan);
            const remaining = getRemainingAmount(loan);
            const percentRepaid = loan.amount > 0 ? Math.min(100, Math.round((repaid / loan.amount) * 100)) : 0;
            const dueStatus = getDueStatus(loan.expectedRepaymentDate);
            const isRepaid = loan.status === 'repaid' || remaining <= 0;

            return (
              <div
                key={loan.id}
                className={`bg-white rounded-2xl p-5 border transition-all shadow-sm hover:shadow-md flex flex-col justify-between gap-4 ${
                  isRepaid
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : dueStatus.type === 'overdue'
                    ? 'border-rose-300 ring-1 ring-rose-300/40'
                    : dueStatus.type === 'due_soon' || dueStatus.type === 'due_today'
                    ? 'border-amber-300 ring-1 ring-amber-300/40'
                    : 'border-slate-200'
                }`}
              >
                {/* Borrower Top Header */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-900 text-base truncate">{loan.borrowerName}</h3>
                        <span className="text-[10px] font-mono text-slate-400 font-semibold">{loan.id}</span>
                        {loan.source === 'Bill balance' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            Bill Balance • {loan.invoiceId || 'Bill'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Cash Loan
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">{loan.phone || 'No phone'}</span>
                      </div>
                    </div>

                    {/* Due Badge */}
                    <div>
                      {isRepaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Fully Repaid
                        </span>
                      ) : dueStatus.type === 'overdue' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          {dueStatus.text}
                        </span>
                      ) : dueStatus.type === 'due_today' || dueStatus.type === 'due_soon' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          {dueStatus.text}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {dueStatus.text}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Financial Overview & Progress */}
                  <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Given</p>
                        <p className="text-sm font-black text-slate-900 mt-0.5">₹{loan.amount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Repaid</p>
                        <p className="text-sm font-black text-emerald-700 mt-0.5">₹{repaid.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Remaining</p>
                        <p className="text-sm font-black text-rose-700 mt-0.5">₹{remaining.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                        <span>Recovery Progress</span>
                        <span>{percentRepaid}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            isRepaid ? 'bg-emerald-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${percentRepaid}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Date & Note Info */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Given: {new Date(loan.dateGiven).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span>Due: {loan.expectedRepaymentDate}</span>
                  </div>

                  {loan.note && (
                    <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg italic border border-slate-100">
                      "{loan.note}"
                    </p>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => setDetailsLoan(loan)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>History ({loan.repayments?.length || 0})</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {/* WhatsApp Reminder Button */}
                    {!isRepaid && (
                      <button
                        onClick={() => handleSendReminder(loan)}
                        title="Send WhatsApp Reminder"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          dueStatus.type === 'overdue' || dueStatus.type === 'due_soon' || dueStatus.type === 'due_today'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Send Reminder</span>
                      </button>
                    )}

                    {/* Record Repayment Button */}
                    {!isRepaid && (
                      <button
                        onClick={() => handleOpenRepayModal(loan)}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-sm shadow-indigo-100 transition-all active:scale-95"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Record Repayment</span>
                      </button>
                    )}

                    {/* Delete Icon */}
                    <button
                      onClick={() => handleDeleteLoan(loan)}
                      title="Delete Loan"
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Give New Loan */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Give New Cash Loan</h3>
                  <p className="text-xs text-slate-400">Record cash lent with due date</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Borrower Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar / Staff member"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Borrower Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210 (For WhatsApp reminders)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Loan Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    placeholder="e.g. 5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Date Given
                  </label>
                  <input
                    type="date"
                    required
                    value={dateGiven}
                    onChange={(e) => setDateGiven(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Expected Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={expectedRepaymentDate}
                    onChange={(e) => setExpectedRepaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Salary advance, Emergency loan, Friend"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100"
                >
                  Save Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Repayment */}
      {repayingLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Record Repayment</h3>
                  <p className="text-xs text-slate-400">{repayingLoan.borrowerName} • {repayingLoan.phone}</p>
                </div>
              </div>
              <button onClick={() => setRepayingLoan(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Status Box */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Remaining</p>
                <p className="text-lg font-black text-rose-600">₹{getRemainingAmount(repayingLoan).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Principal</p>
                <p className="text-sm font-bold text-slate-700">₹{repayingLoan.amount.toFixed(2)}</p>
              </div>
            </div>

            <form onSubmit={handleSaveRepayment} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Repayment Amount Received (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    max={getRemainingAmount(repayingLoan)}
                    required
                    value={repaymentAmount}
                    onChange={(e) => setRepaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRepaymentAmount(getRemainingAmount(repayingLoan).toString())}
                    className="text-[11px] font-bold text-indigo-600 hover:underline"
                  >
                    Set Full Balance (₹{getRemainingAmount(repayingLoan).toFixed(2)})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Date Received
                </label>
                <input
                  type="date"
                  required
                  value={repaymentDate}
                  onChange={(e) => setRepaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Payment Mode / Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash, GPay, UPI, Bank Transfer"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Closure Notice */}
              {parseFloat(repaymentAmount) >= getRemainingAmount(repayingLoan) - 0.01 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>This payment will clear the loan and mark it as <strong>Fully Repaid</strong>!</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRepayingLoan(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-100"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Loan Details & Repayment History Log */}
      {detailsLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{detailsLoan.borrowerName}</h3>
                  <span className="text-xs font-mono text-slate-400 font-bold">{detailsLoan.id}</span>
                </div>
                <p className="text-xs text-slate-500 font-mono">{detailsLoan.phone}</p>
              </div>
              <button onClick={() => setDetailsLoan(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Overview */}
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Principal</p>
                  <p className="text-base font-black text-slate-900">₹{detailsLoan.amount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Repaid</p>
                  <p className="text-base font-black text-emerald-700">₹{getRepaidAmount(detailsLoan).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Balance Due</p>
                  <p className="text-base font-black text-rose-700">₹{getRemainingAmount(detailsLoan).toFixed(2)}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs text-slate-600">
                <span>Date Given: {new Date(detailsLoan.dateGiven).toLocaleDateString('en-IN')}</span>
                <span>Expected Due: {detailsLoan.expectedRepaymentDate}</span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
                <span>Source:</span>
                {detailsLoan.source === 'Bill balance' ? (
                  <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Bill Balance (Invoice #{detailsLoan.invoiceId || 'N/A'})
                  </span>
                ) : (
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Direct Cash Loan
                  </span>
                )}
              </div>

              {detailsLoan.note && (
                <div className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200">
                  Note: {detailsLoan.note}
                </div>
              )}
            </div>

            {/* Repayments History Table */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Repayment Entries ({detailsLoan.repayments?.length || 0})
                </h4>
                {getRemainingAmount(detailsLoan) > 0 && (
                  <button
                    onClick={() => {
                      const l = detailsLoan;
                      setDetailsLoan(null);
                      handleOpenRepayModal(l);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Record Payment
                  </button>
                )}
              </div>

              {(!detailsLoan.repayments || detailsLoan.repayments.length === 0) ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">No repayments recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailsLoan.repayments.map((rep, idx) => (
                    <div key={rep.id || idx} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {new Date(rep.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {rep.note || 'Repayment'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-emerald-600">+₹{rep.amount.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              {getRemainingAmount(detailsLoan) > 0 && (
                <button
                  onClick={() => handleSendReminder(detailsLoan)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-2.5 rounded-xl font-bold text-xs"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp Reminder</span>
                </button>
              )}
              <button
                onClick={() => setDetailsLoan(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
