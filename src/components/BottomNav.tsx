import { Receipt, History, Settings, Package, AlertTriangle, LayoutDashboard, PieChart, ShoppingCart, FileSpreadsheet, HandCoins } from 'lucide-react';
import { AppUser } from '../types';

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  appUser: AppUser | null;
}

export function BottomNav({ currentTab, onTabChange, appUser }: BottomNavProps) {
  const tabs = [
    { id: 'dashboard', label: 'Summary', icon: LayoutDashboard },
    { id: 'new', label: 'Bill', icon: Receipt },
    { id: 'catalog', label: 'Catalog', icon: Package },
    { id: 'loans', label: 'Loans', icon: HandCoins, hideStaff: true },
    { id: 'purchases', label: 'Purchases', icon: ShoppingCart, hideStaff: true },
    { id: 'pnl', label: 'P&L', icon: PieChart, hideStaff: true },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet, hideStaff: true },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings, hideStaff: true },
  ].filter(tab => !(appUser?.role === 'staff' && tab.hideStaff));

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-bottom z-50 lg:hidden shadow-lg">
      <div className="flex items-center h-16 max-w-lg mx-auto px-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center min-w-[58px] flex-1 h-full space-y-1 transition-colors px-1 shrink-0 ${
                isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-bold tracking-tight uppercase whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
