import React, { useState, useEffect } from 'react';
import { Expense, Purchase, Supplier, CatalogItem } from '../types';
import { getExpenses, saveExpenses, getPurchases, savePurchases, getSuppliers, saveSuppliers, getCatalog, getNextPurchaseId, increaseCatalogStock } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Calendar, FileText, ShoppingCart, Users, CheckCircle2 } from 'lucide-react';

export function ExpensesPurchasesTab() {
  const [activeTab, setActiveTab] = useState<'purchases' | 'expenses' | 'suppliers'>('purchases');
  const { appUser } = useAuth();
  
  if (appUser?.role === 'staff') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center mt-12">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm">Staff members do not have permission to view Purchases & Expenses.</p>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Expenses & Purchases</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage money going out of the business</p>
        </div>

        <div className="flex bg-slate-200/60 p-1 rounded-xl w-full lg:w-96 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('purchases')}
            className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'purchases' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Purchases
          </button>
          <button 
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'expenses' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Expenses
          </button>
          <button 
            onClick={() => setActiveTab('suppliers')}
            className={`flex-1 text-[11px] sm:text-xs font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'suppliers' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Suppliers
          </button>
        </div>
      </div>
      
      {activeTab === 'purchases' && <PurchasesList />}
      {activeTab === 'expenses' && <ExpensesList />}
      {activeTab === 'suppliers' && <SuppliersList />}
    </div>
  );
}

function PurchasesList() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const refresh = () => setPurchases(getPurchases().sort((a, b) => b.timestamp - a.timestamp));
    refresh();
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Purchase Orders</h3>
        <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {showForm ? (
        <PurchaseForm onClose={() => { setShowForm(false); setPurchases(getPurchases().sort((a, b) => b.timestamp - a.timestamp)); }} />
      ) : (
        <div className="grid gap-3">
          {purchases.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No purchases recorded</p>
            </div>
          ) : (
            purchases.map(p => (
              <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{p.id}</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                      p.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      p.paymentStatus === 'Partial' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {p.paymentStatus}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(p.timestamp)} • {p.supplierName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{p.totalAmount.toFixed(2)}</div>
                  {p.paymentStatus === 'Partial' && <div className="text-xs text-slate-500">Paid: ₹{p.amountPaid.toFixed(2)}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PurchaseForm({ onClose }: { onClose: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const { appUser } = useAuth();
  
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  
  const [items, setItems] = useState<{catalogId?: string, name: string, quantity: number, rate: number, amount: number}[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newCatalogId, setNewCatalogId] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newRate, setNewRate] = useState('');

  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Unpaid' | 'Partial'>('Unpaid');
  const [amountPaid, setAmountPaid] = useState('');

  useEffect(() => {
    setSuppliers(getSuppliers());
    setCatalog(getCatalog());
  }, []);

  const handleAddItem = () => {
    if (!newItemName) return;
    const qty = parseFloat(newQty) || 1;
    const rate = parseFloat(newRate) || 0;
    setItems([...items, { catalogId: newCatalogId || undefined, name: newItemName, quantity: qty, rate, amount: qty * rate }]);
    setNewItemName('');
    setNewCatalogId('');
    setNewQty('1');
    setNewRate('');
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const handleSave = () => {
    if (items.length === 0) return alert('Add at least one item');
    if (!supplierName) return alert('Supplier name is required');
    
    let sid = supplierId;
    if (!sid) {
      sid = Date.now().toString();
      const newSup: Supplier = { id: sid, name: supplierName, phone: '', totalPurchased: 0, amountPaid: 0, balanceDue: 0 };
      const sups = [...suppliers, newSup];
      saveSuppliers(sups);
      setSuppliers(sups);
    }

    const paid = paymentStatus === 'Paid' ? totalAmount : paymentStatus === 'Unpaid' ? 0 : parseFloat(amountPaid) || 0;
    
    const purchase: Purchase = {
      id: getNextPurchaseId(),
      timestamp: Date.now(),
      supplierId: sid,
      supplierName,
      items: items.map(i => ({ id: Date.now().toString() + Math.random(), ...i })),
      totalAmount,
      paymentStatus,
      amountPaid: paid,
      createdBy: appUser?.email
    };

    const purchases = getPurchases();
    purchases.push(purchase);
    savePurchases(purchases);

    // Update supplier
    const sups = getSuppliers();
    const sup = sups.find(s => s.id === sid);
    if (sup) {
      sup.totalPurchased += totalAmount;
      sup.amountPaid += paid;
      sup.balanceDue += (totalAmount - paid);
      saveSuppliers(sups);
    }

    // Increase stock
    increaseCatalogStock(purchase.items);

    onClose();
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
        <h4 className="font-bold text-slate-800">New Purchase</h4>
        <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded-md"><Trash2 className="w-4 h-4" /></button>
      </div>
      
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Supplier</label>
        <input 
          type="text" 
          value={supplierName}
          onChange={(e) => {
            setSupplierName(e.target.value);
            const found = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
            if (found) setSupplierId(found.id);
            else setSupplierId('');
          }}
          placeholder="Supplier Name" 
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" 
        />
        {suppliers.length > 0 && !supplierId && supplierName.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {suppliers.filter(s => s.name.toLowerCase().includes(supplierName.toLowerCase())).map(s => (
              <button key={s.id} onClick={() => { setSupplierName(s.name); setSupplierId(s.id); }} className="text-[10px] bg-slate-100 px-2 py-1 rounded">
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50 space-y-2">
        <h5 className="text-xs font-bold text-slate-600">Add Items</h5>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input 
              type="text" 
              placeholder="Item Name (from catalog or new)" 
              value={newItemName}
              onChange={e => {
                setNewItemName(e.target.value);
                const found = catalog.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                if (found) {
                  setNewCatalogId(found.id);
                  setNewRate(found.costPrice > 0 ? found.costPrice.toString() : found.rate.toString());
                } else {
                  setNewCatalogId('');
                }
              }}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm" 
            />
            {catalog.length > 0 && !newCatalogId && newItemName.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {catalog.filter(c => c.name.toLowerCase().includes(newItemName.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => { setNewItemName(c.name); setNewCatalogId(c.id); setNewRate(c.costPrice > 0 ? c.costPrice.toString() : c.rate.toString()); }} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="number" placeholder="Qty" value={newQty} onChange={e => setNewQty(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="Rate" value={newRate} onChange={e => setNewRate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={handleAddItem} className="w-full bg-slate-800 text-white text-xs font-bold py-2 rounded-lg">Add Item</button>
      </div>

      {items.length > 0 && (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          {items.map((it, idx) => (
            <div key={idx} className="flex justify-between items-center p-2 text-sm border-b border-slate-50 last:border-0">
              <div>
                <span className="font-semibold text-slate-800">{it.name}</span>
                <div className="text-xs text-slate-500">{it.quantity} x ₹{it.rate}</div>
              </div>
              <div className="font-bold">₹{it.amount}</div>
            </div>
          ))}
          <div className="bg-slate-50 p-2 flex justify-between font-black text-slate-900 border-t border-slate-200">
            <span>Total</span>
            <span>₹{totalAmount.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Status</label>
        <div className="flex gap-2">
          {['Paid', 'Partial', 'Unpaid'].map(s => (
            <button 
              key={s} 
              onClick={() => setPaymentStatus(s as any)}
              className={`flex-1 text-xs py-2 font-bold rounded-lg border ${paymentStatus === s ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              {s}
            </button>
          ))}
        </div>
        {paymentStatus === 'Partial' && (
          <input 
            type="number" 
            placeholder="Amount Paid (₹)" 
            value={amountPaid} 
            onChange={e => setAmountPaid(e.target.value)} 
            className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" 
          />
        )}
      </div>

      <button onClick={handleSave} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <CheckCircle2 className="w-5 h-5" /> Save Purchase
      </button>
    </div>
  );
}

function ExpensesList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const refresh = () => setExpenses(getExpenses().sort((a, b) => b.timestamp - a.timestamp));
    refresh();
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Expenses</h3>
        <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {showForm ? (
        <ExpenseForm onClose={() => { setShowForm(false); setExpenses(getExpenses().sort((a, b) => b.timestamp - a.timestamp)); }} />
      ) : (
        <div className="grid gap-3">
          {expenses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No expenses recorded</p>
            </div>
          ) : (
            expenses.map(e => (
              <div key={e.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-900 mb-0.5">{e.description}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{e.category || 'Other'}</span>
                    <span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(e.timestamp)}</span>
                  </div>
                </div>
                <div className="font-black text-rose-600">₹{e.amount.toFixed(2)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Rent' | 'Electricity' | 'Salaries' | 'Transport' | 'Other'>('Other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const { appUser } = useAuth();

  const handleSave = () => {
    if (!amount || !description) return alert('Amount and description required');
    const expenses = getExpenses();
    expenses.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      amount: parseFloat(amount),
      description,
      category,
      isRecurring,
      recurringFrequency: isRecurring ? recurringFrequency : undefined,
      createdBy: appUser?.email
    });
    saveExpenses(expenses);
    onClose();
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
        <h4 className="font-bold text-slate-800">New Expense</h4>
        <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded-md"><Trash2 className="w-4 h-4" /></button>
      </div>

      <input 
        type="number" 
        placeholder="Amount (₹)" 
        value={amount} 
        onChange={e => setAmount(e.target.value)} 
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 font-bold" 
      />
      
      <input 
        type="text" 
        placeholder="Description (e.g., Office Rent)" 
        value={description} 
        onChange={e => setDescription(e.target.value)} 
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" 
      />

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
        <select 
          value={category} 
          onChange={e => setCategory(e.target.value as any)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="Other">Other</option>
          <option value="Rent">Rent</option>
          <option value="Electricity">Electricity</option>
          <option value="Salaries">Salaries</option>
          <option value="Transport">Transport</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
        <span className="font-semibold">Recurring Expense</span>
      </label>

      {isRecurring && (
        <select 
          value={recurringFrequency} 
          onChange={e => setRecurringFrequency(e.target.value as any)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      )}

      <button onClick={handleSave} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <CheckCircle2 className="w-5 h-5" /> Save Expense
      </button>
    </div>
  );
}

function SuppliersList() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    const refresh = () => setSuppliers(getSuppliers());
    refresh();
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">Suppliers (Accounts Payable)</h3>
      <div className="grid gap-3">
        {suppliers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No suppliers yet</p>
          </div>
        ) : (
          suppliers.map(s => (
            <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-900 mb-0.5">{s.name}</div>
                {s.phone && <div className="text-xs text-slate-500">{s.phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Balance Due</div>
                <div className={`font-black ${s.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  ₹{s.balanceDue.toFixed(2)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
