/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { NewBillTab } from './components/NewBill';
import { HistoryTab } from './components/History';
import { SettingsTab } from './components/Settings';
import { CatalogTab } from './components/Catalog';
import { LowStockTab } from './components/LowStock';
import { DashboardTab } from './components/Dashboard';
import { ProfitLossTab } from './components/ProfitLoss';
import { ReportsTab } from './components/Reports';
import { ExpensesPurchasesTab } from './components/ExpensesPurchases';
import { LoansTab } from './components/Loans';
import { ReceiptView } from './components/Receipt';
import { PWAInstallButton } from './components/PWAInstallButton';
import { Invoice, Estimate, DeliveryChallan, BusinessProfile } from './types';
import { getProfile, getInvoices, getEstimates, getChallans } from './store';
import { useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Loader2, Lock, AlertCircle } from 'lucide-react';
import { useSubscribe } from './hooks/useSubscribe';
import { createCloudBackup } from './backup';
import { decodeBillFromUrl } from './utils/whatsapp';
import { AppLogo } from './components/AppLogo';

function Paywall({ status }: { status?: string }) {
  const { handleSubscribe, loading, loadingText } = useSubscribe();

  const isCancelled = status === 'cancelled';
  const isPaymentFailed = status === 'payment_failed';
  const title = isCancelled 
    ? 'Subscription Cancelled' 
    : isPaymentFailed 
    ? 'Payment Required' 
    : status === 'expired' 
    ? 'Subscription Expired' 
    : 'Trial Ended';

  const description = isCancelled
    ? 'Your subscription has been cancelled. Resubscribe to continue creating new bills and receipts. You still have read-only access to your records.'
    : isPaymentFailed
    ? 'Your latest subscription payment could not be processed. Update your subscription to restore billing access.'
    : 'Your 3-day trial or active period has ended. Subscribe to continue creating new bills and receipts. You still have read-only access to your history, catalog, and settings.';

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center mt-12">
      <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mb-6">
         <Lock className="w-10 h-10 text-rose-600" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-600 mb-8 max-w-sm text-sm leading-relaxed">
        {description}
      </p>
      <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
         <div className="text-3xl font-black text-slate-900 mb-1">₹2000<span className="text-sm font-medium text-slate-500">/month</span></div>
         <p className="text-xs text-slate-500 font-medium mb-6">Unlimited billing & inventory access</p>
         <button 
           onClick={handleSubscribe} 
           disabled={loading}
           className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 disabled:opacity-75 flex items-center justify-center gap-2"
         >
           {loading ? (
             <>
               <Loader2 className="w-5 h-5 animate-spin" />
               {loadingText}
             </>
           ) : (
             'Subscribe Now'
           )}
         </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentTab, setCurrentTab] = useState('new');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | Estimate | DeliveryChallan | null>(null);
  const [externalProfile, setExternalProfile] = useState<BusinessProfile | null>(null);
  const [estimateToConvert, setEstimateToConvert] = useState<Estimate | null>(null);
  const [challanToConvert, setChallanToConvert] = useState<DeliveryChallan | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | undefined>(undefined);
  const [isBillInProgress, setIsBillInProgress] = useState(false);
  
  const { currentUser, appUser, loading } = useAuth();

  // Automatic Daily Backup
  useEffect(() => {
    const runAutoBackup = () => {
      // Automatic backup is an owner feature — only run when authenticated owner is active
      if (!currentUser || appUser?.role !== 'owner') {
        return;
      }
      if (!navigator.onLine) {
        return;
      }

      const today = new Date().toDateString();
      const lastBackup = localStorage.getItem('quickbill_last_backup_date');
      
      if (lastBackup !== today) {
        createCloudBackup(currentUser.uid).then(() => {
          localStorage.setItem('quickbill_last_backup_date', today);
          console.log('Daily backup completed.');
        }).catch(err => {
          console.error('Daily backup failed', err);
        });
      }
    };

    runAutoBackup();
    window.addEventListener('online', runAutoBackup);
    return () => window.removeEventListener('online', runAutoBackup);
  }, [currentUser, appUser]);

  // Handle deep-link to view bill from WhatsApp link (?bill=INV-xxx or ?bdata=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const bdata = params.get('bdata');
      if (bdata) {
        const decoded = decodeBillFromUrl(bdata);
        if (decoded && decoded.invoice) {
          setViewingInvoice(decoded.invoice);
          if (decoded.profile && decoded.profile.shopName) {
            setExternalProfile(decoded.profile);
          }
          return;
        }
      }

      const billId = params.get('bill') || params.get('view_bill');
      if (billId) {
        const inv = getInvoices().find(i => i.id === billId);
        if (inv) {
          setViewingInvoice(inv);
          return;
        }
        const est = getEstimates().find(e => e.id === billId);
        if (est) {
          setViewingInvoice(est);
          return;
        }
        const chl = getChallans().find(c => c.id === billId);
        if (chl) {
          setViewingInvoice(chl);
          return;
        }
      }
    } catch {
      // Safe fallback
    }
  }, []);

  const handleBillCreated = (invoice: Invoice) => {
    setIsBillInProgress(false);
    setViewingInvoice(invoice);
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setViewingInvoice(invoice);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
          <AppLogo size="lg" />
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Smarted Billing</h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Retail POS & Cloud</p>
          </div>
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mt-2" />
        </div>
      </div>
    );
  }

  // Allow customers to view their digital bill directly from WhatsApp link without logging in
  if (viewingInvoice) {
    return (
      <ReceiptView 
        invoice={viewingInvoice} 
        profile={externalProfile || getProfile()} 
        onBack={() => {
          setViewingInvoice(null);
          setExternalProfile(null);
          try {
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } catch {
            // Safe fallback
          }
        }} 
      />
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  // Subscription & Trial status logic
  let isLocked = false;
  let daysRemaining = 0;
  if (appUser) {
    if (appUser.subscription_status === 'active') {
      isLocked = false;
    } else if (appUser.subscription_status === 'trial') {
      const trialDays = 3;
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceStart = (now - appUser.trial_start_date) / msPerDay;
      daysRemaining = Math.max(0, Math.ceil(trialDays - daysSinceStart));
      if (daysSinceStart > trialDays) {
        isLocked = true;
      }
    } else {
      // Inactive: 'expired', 'cancelled', 'payment_failed', etc.
      isLocked = true;
    }
  }

  // Prevent interrupting user mid-bill creation:
  // Apply lock immediately if idle or on next bill creation.
  const showPaywall = isLocked && !isBillInProgress;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-lg lg:max-w-none mx-auto bg-slate-50 min-h-screen relative shadow-2xl lg:shadow-none lg:flex lg:flex-row">
        {/* Desktop Persistent Sidebar (1024px / lg and above) */}
        <Sidebar 
          currentTab={currentTab} 
          onTabChange={setCurrentTab} 
          appUser={appUser} 
          daysRemaining={daysRemaining} 
        />

        {/* Content Wrapper for Mobile & Desktop */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          {/* Mobile Header (hidden on lg) */}
          <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-40 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <AppLogo size="sm" />
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900 leading-tight">Smarted Billing</h1>
                {appUser && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 font-medium truncate max-w-[100px] sm:max-w-[150px]">
                      {appUser.email ? appUser.email.split('@')[0] : 'User'}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none ${
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
                )}
              </div>
            </div>
            <PWAInstallButton />
          </header>

          {/* Trial Notice Banner */}
          {appUser?.subscription_status === 'trial' && !isLocked && (
            <div className="bg-amber-100 px-4 py-2 text-center text-amber-800 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b border-amber-200 shrink-0">
              <AlertCircle className="w-4 h-4" />
              Trial: {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
            </div>
          )}

          {/* Main Content Area */}
          <main className="flex-1 min-h-[calc(100vh-64px)] pb-16 lg:pb-8">
            {currentTab === 'dashboard' && <DashboardTab />}
            {currentTab === 'new' && (showPaywall ? (
              <Paywall status={appUser?.subscription_status} />
            ) : (
              <NewBillTab 
                onBillCreated={handleBillCreated} 
                estimateToConvert={estimateToConvert}
                onEstimateConverted={() => setEstimateToConvert(null)}
                challanToConvert={challanToConvert}
                onChallanConverted={() => setChallanToConvert(null)}
                onBillInProgressChange={setIsBillInProgress}
              />
            ))}
            {currentTab === 'catalog' && <CatalogTab />}
            {currentTab === 'loans' && <LoansTab initialSelectedLoanId={selectedLoanId} />}
            {currentTab === 'pnl' && <ProfitLossTab />}
            {currentTab === 'reports' && <ReportsTab />}
            {currentTab === 'purchases' && <ExpensesPurchasesTab />}
            {currentTab === 'alerts' && (
              <LowStockTab
                onNavigateToLoan={(loanId) => {
                  setSelectedLoanId(loanId);
                  setCurrentTab('loans');
                }}
              />
            )}
            {currentTab === 'history' && <HistoryTab 
              onViewInvoice={handleViewInvoice} 
              onConvertEstimate={(estimate) => {
                setEstimateToConvert(estimate);
                setCurrentTab('new');
              }}
              onConvertChallan={(challan) => {
                setChallanToConvert(challan);
                setCurrentTab('new');
              }}
            />}
            {currentTab === 'settings' && <SettingsTab />}
          </main>
        </div>

        {/* Mobile Bottom Navigation (hidden on lg) */}
        <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} appUser={appUser} />
      </div>
    </div>
  );
}
