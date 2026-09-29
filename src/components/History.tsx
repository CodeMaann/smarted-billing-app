import { useState, useEffect, useMemo } from 'react';
import { Invoice, Estimate, DeliveryChallan } from '../types';
import { getInvoices, getEstimates, getChallans, saveChallan, getProfile } from '../store';
import { Search, FileText, ChevronRight, FileSignature, Truck, CheckCircle2 } from 'lucide-react';
import { generateBillWhatsAppMessage, openWhatsApp } from '../utils/whatsapp';

interface HistoryTabProps {
  onViewInvoice: (invoice: Invoice) => void;
  onConvertEstimate: (estimate: Estimate) => void;
  onConvertChallan: (challan: DeliveryChallan) => void;
}

export function HistoryTab({ onViewInvoice, onConvertEstimate, onConvertChallan }: HistoryTabProps) {
  const [activeTab, setActiveTab] = useState<'invoices' | 'estimates' | 'challans'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [challans, setChallans] = useState<DeliveryChallan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'date' | 'profit-desc' | 'profit-asc'>('date');
  const profile = useMemo(() => getProfile(), []);

  useEffect(() => {
    const refreshData = () => {
      setInvoices(getInvoices().sort((a, b) => b.timestamp - a.timestamp));
      setEstimates(getEstimates().sort((a, b) => b.timestamp - a.timestamp));
      setChallans(getChallans().sort((a, b) => b.timestamp - a.timestamp));
    };
    refreshData();
    window.addEventListener('quickbill-data-updated', refreshData);
    return () => window.removeEventListener('quickbill-data-updated', refreshData);
  }, []);

  const getInvoiceProfit = (inv: Invoice) => {
    const cogs = inv.items.reduce((sum, item) => sum + (item.costAmount || 0), 0);
    const revenue = inv.subtotal - (inv.discountAmount || 0);
    return revenue - cogs;
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.customerPhone?.includes(searchTerm)
  ).sort((a, b) => {
    if (sortOrder === 'profit-desc') return getInvoiceProfit(b) - getInvoiceProfit(a);
    if (sortOrder === 'profit-asc') return getInvoiceProfit(a) - getInvoiceProfit(b);
    return b.timestamp - a.timestamp; // default date sort
  });

  const filteredEstimates = estimates.filter(est => 
    est.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    est.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    est.customerPhone?.includes(searchTerm)
  );

  const filteredChallans = challans.filter(chl => 
    chl.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    chl.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chl.customerPhone?.includes(searchTerm)
  );

  const handleMarkDelivered = (challan: DeliveryChallan) => {
    const updatedChallan = { ...challan, status: 'Delivered' as const };
    saveChallan(updatedChallan);
    setChallans(prev => prev.map(c => c.id === updatedChallan.id ? updatedChallan : c));
  };

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">History</h2>
            <p className="text-xs text-slate-500 mt-0.5">Search and manage past bills and estimates</p>
          </div>
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search by ID or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex bg-slate-200/60 p-1 rounded-xl w-full lg:w-96 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('invoices')}
              className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'invoices' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Invoices
            </button>
            <button 
              onClick={() => setActiveTab('estimates')}
              className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'estimates' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Estimates
            </button>
            <button 
              onClick={() => setActiveTab('challans')}
              className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'challans' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Challans
            </button>
          </div>
          
          {activeTab === 'invoices' && (
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="date">Sort by Date</option>
              <option value="profit-desc">Highest Profit</option>
              <option value="profit-asc">Lowest Profit</option>
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {activeTab === 'invoices' ? (
          filteredInvoices.length === 0 ? (
            <div className="lg:col-span-2 text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No bills found</p>
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div
                key={inv.id}
                role="button"
                tabIndex={0}
                onClick={() => onViewInvoice(inv)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onViewInvoice(inv);
                  }
                }}
                className="w-full bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex items-center justify-between text-left hover:border-indigo-300 hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{inv.id}</span>
                    {inv.paymentStatus === 'partial' || inv.paymentMode === 'Partially Paid' ? (
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                        (inv.amountDue ?? 0) <= 0.01 || inv.paymentStatus === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {(inv.amountDue ?? 0) <= 0.01 || inv.paymentStatus === 'paid'
                          ? 'Partially Paid (Cleared)'
                          : `Partial (Due: ₹${(inv.amountDue ?? 0).toFixed(0)})`}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                        {inv.paymentMode}
                      </span>
                    )}
                    {inv.items && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        ({inv.items.length} {inv.items.length === 1 ? 'item' : 'items'})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(inv.timestamp)}
                    {inv.customerName && <span className="font-semibold text-slate-700"> • {inv.customerName}</span>}
                  </div>
                  {inv.createdBy && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      By: {inv.createdBy.split('@')[0]}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-black text-slate-900 text-lg tabular-nums">₹{inv.total.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      Profit: ₹{getInvoiceProfit(inv).toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const msg = generateBillWhatsAppMessage(inv, profile);
                      openWhatsApp({ phone: inv.customerPhone, message: msg });
                    }}
                    className="p-2 text-[#25D366] hover:bg-[#25D366]/10 rounded-xl transition-all"
                    title="Share on WhatsApp"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                    </svg>
                  </button>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))
          )
        ) : activeTab === 'estimates' ? (
          filteredEstimates.length === 0 ? (
            <div className="lg:col-span-2 text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileSignature className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No estimates found</p>
            </div>
          ) : (
            filteredEstimates.map((est) => (
              <div
                key={est.id}
                className="w-full bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-left gap-4 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{est.id}</span>
                    {est.convertedToInvoiceId ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                        Converted ({est.convertedToInvoiceId})
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">
                        Draft
                      </span>
                    )}
                    {est.items && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        ({est.items.length} {est.items.length === 1 ? 'item' : 'items'})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(est.timestamp)}
                    {est.customerName && <span className="font-semibold text-slate-700"> • {est.customerName}</span>}
                  </div>
                  {est.createdBy && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      By: {est.createdBy.split('@')[0]}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 mt-1 sm:mt-0">
                  <span className="font-black text-slate-900 text-lg tabular-nums">₹{est.total.toFixed(2)}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onViewInvoice(est as any)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors"
                    >
                      View
                    </button>
                    {!est.convertedToInvoiceId && (
                      <button
                        onClick={() => onConvertEstimate(est)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 text-xs font-bold rounded-lg transition-colors"
                      >
                        Convert to Invoice
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )
        ) : activeTab === 'challans' ? (
          filteredChallans.length === 0 ? (
            <div className="lg:col-span-2 text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Truck className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No challans found</p>
            </div>
          ) : (
            filteredChallans.map((chl) => (
              <div
                key={chl.id}
                className="w-full bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-left gap-4 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{chl.id}</span>
                    {chl.convertedToInvoiceId ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                        Invoiced ({chl.convertedToInvoiceId})
                      </span>
                    ) : chl.status === 'Delivered' ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                        Delivered
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">
                        Pending
                      </span>
                    )}
                    {chl.items && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        ({chl.items.length} {chl.items.length === 1 ? 'item' : 'items'})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(chl.timestamp)}
                    {chl.customerName && <span className="font-semibold text-slate-700"> • {chl.customerName}</span>}
                  </div>
                  {chl.createdBy && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      By: {chl.createdBy.split('@')[0]}
                    </div>
                  )}
                  {(chl.deliveryAddress || chl.vehicleDetails) && (
                    <div className="text-xs text-slate-400 mt-1 truncate max-w-[250px]">
                      {chl.deliveryAddress && `📍 ${chl.deliveryAddress} `}
                      {chl.vehicleDetails && `🚛 ${chl.vehicleDetails}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 mt-1 sm:mt-0">
                  <div className="flex flex-wrap gap-2 justify-end w-full">
                    {chl.status === 'Pending' && !chl.convertedToInvoiceId && (
                      <button
                        onClick={() => handleMarkDelivered(chl)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Delivered
                      </button>
                    )}
                    <button
                      onClick={() => onViewInvoice(chl as any)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors"
                    >
                      View
                    </button>
                    {!chl.convertedToInvoiceId && (
                      <button
                        onClick={() => onConvertChallan(chl)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 text-xs font-bold rounded-lg transition-colors"
                      >
                        Convert to Invoice
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )
        ) : null}
      </div>
    </div>
  );
}
