import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  History, 
  Settings, 
  Package, 
  AlertTriangle, 
  LayoutDashboard, 
  PieChart, 
  ShoppingCart,
  LogOut, 
  User, 
  Download,
  CreditCard,
  FileSpreadsheet,
  HandCoins
} from 'lucide-react';
import { AppUser } from '../types';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getCatalog, getLoans } from '../store';
import { AppLogo } from './AppLogo';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  appUser: AppUser | null;
  daysRemaining: number;
}

export function Sidebar({ currentTab, onTabChange, appUser, daysRemaining }: SidebarProps) {
  const { isInstallable, install } = usePWAInstall();
  const [totalAlertsCount, setTotalAlertsCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const items = getCatalog();
        const lowStock = items.filter(item => item.stock <= item.lowStockThreshold).length;

        // Loan alerts: due in <= 3 days or overdue
        const allLoans = getLoans();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let loanAlerts = 0;
        allLoans.forEach(l => {
          if (l.status !== 'repaid' && l.expectedRepaymentDate) {
            const repaid = (l.repayments || []).reduce((s, r) => s + (r.amount || 0), 0);
            if (l.amount - repaid > 0) {
              const [y, m, d] = l.expectedRepaymentDate.split('-').map(Number);
              const due = new Date(y, m - 1, d);
              due.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays <= 3) {
                loanAlerts++;
              }
            }
          }
        });

        setTotalAlertsCount(lowStock + loanAlerts);
      } catch {
        // safe fallback
      }
    };
    updateCount();
    window.addEventListener('quickbill-data-updated', updateCount);
    return () => window.removeEventListener('quickbill-data-updated', updateCount);
  }, [currentTab]);

  const tabs = [
    { id: 'dashboard', label: 'Summary', icon: LayoutDashboard },
    { id: 'new', label: 'Bill', icon: Receipt },
    { id: 'catalog', label: 'Catalog', icon: Package },
    { id: 'loans', label: 'Loans', icon: HandCoins, hideStaff: true },
    { id: 'purchases', label: 'Purchases', icon: ShoppingCart, hideStaff: true },
    { id: 'pnl', label: 'P&L', icon: PieChart, hideStaff: true },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet, hideStaff: true },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: totalAlertsCount > 0 ? totalAlertsCount : undefined },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings, hideStaff: true },
  ].filter(tab => !(appUser?.role === 'staff' && tab.hideStaff));

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 xl:w-72 bg-white border-r border-slate-200 h-screen sticky top-0 shrink-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center gap-3">
        <AppLogo size="md" />
        <div>
          <h1 className="text-base font-black text-slate-900 tracking-tight leading-none">Smarted Billing</h1>
          <p className="text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">Retail POS & Cloud</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Menu
        </div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-bold text-sm transition-all ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} strokeWidth={isActive ? 2.5 : 2} />
                <span>{tab.label}</span>
              </div>
              {tab.badge !== undefined && (
                <span className="px-2 py-0.5 text-xs font-black rounded-full bg-amber-100 text-amber-700">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* PWA Install Button (Desktop) */}
      {isInstallable && (
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={install}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            Install Desktop App
          </button>
        </div>
      )}

      {/* Account & Subscription Footer */}
      {appUser && (
        <div className="p-3 border-t border-slate-200 bg-slate-50/70">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 font-bold text-xs">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate" title={appUser.email}>
                    {appUser.email ? appUser.email.split('@')[0] : 'User'}
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium truncate">
                    {appUser.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Subscription status pill */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-semibold text-slate-600">
                  {appUser.subscription_status === 'active' 
                    ? 'Active Plan' 
                    : appUser.subscription_status === 'trial' 
                    ? `${daysRemaining}d Trial Left` 
                    : appUser.subscription_status === 'cancelled'
                    ? 'Cancelled'
                    : appUser.subscription_status === 'payment_failed'
                    ? 'Payment Failed'
                    : 'Expired'}
                </span>
              </div>
              <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                appUser.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                appUser.subscription_status === 'trial' ? 'bg-amber-100 text-amber-700' :
                'bg-rose-100 text-rose-700'
              }`}>
                {appUser.subscription_status === 'active' 
                  ? 'PRO' 
                  : appUser.subscription_status === 'trial' 
                  ? 'TRIAL' 
                  : appUser.subscription_status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
