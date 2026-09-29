import { useState, useEffect } from 'react';
import { CatalogItem } from '../types';
import { getCatalog, saveCatalog, getProfile } from '../store';
import { Plus, Edit2, Trash2, Package, Printer, X } from 'lucide-react';
import Barcode from 'react-barcode';

export function CatalogTab() {
  const profile = getProfile();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [gstRate, setGstRate] = useState(profile.defaultGstRate.toString());
  const [hsnCode, setHsnCode] = useState('');
  const [stock, setStock] = useState('0');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);
  const [showPrintBarcodes, setShowPrintBarcodes] = useState(false);

  useEffect(() => {
    const refreshData = () => setItems(getCatalog());
    refreshData();
    window.addEventListener('quickbill-data-updated', refreshData);
    return () => window.removeEventListener('quickbill-data-updated', refreshData);
  }, []);

  const handleSave = () => {
    if (!name || !rate) return;

    const rateNum = parseFloat(rate) || 0;
    const costNum = parseFloat(costPrice) || 0;
    const gstNum = parseFloat(gstRate) || 0;
    const stockNum = parseInt(stock) || 0;
    const lowStockNum = parseInt(lowStockThreshold) || 0;

    if (rateNum < 0 || costNum < 0 || gstNum < 0 || stockNum < 0 || lowStockNum < 0) {
      alert("Please enter non-negative values for pricing and stock.");
      return;
    }

    if (name.trim().length === 0) {
      alert("Please enter a valid item name.");
      return;
    }

    let updatedItems = [...items];
    const itemData: CatalogItem = {
      id: editingId || Date.now().toString(),
      name: name.trim(),
      rate: rateNum,
      costPrice: costNum,
      gstRate: gstNum,
      hsnCode,
      stock: stockNum,
      lowStockThreshold: lowStockNum,
      barcode: barcode.trim(),
      isTaxInclusive,
    };

    if (editingId) {
      updatedItems = updatedItems.map(item => item.id === editingId ? itemData : item);
    } else {
      updatedItems.push(itemData);
    }

    setItems(updatedItems);
    saveCatalog(updatedItems);
    resetForm();
  };

  const handleEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setName(item.name);
    setRate(item.rate.toString());
    setCostPrice((item.costPrice || 0).toString());
    setGstRate(item.gstRate.toString());
    setHsnCode(item.hsnCode);
    setStock(item.stock.toString());
    setLowStockThreshold(item.lowStockThreshold.toString());
    setBarcode(item.barcode || '');
    setIsTaxInclusive(!!item.isTaxInclusive);
    setIsEditing(true);
  };

  const handleDelete = (id: string) => {
    const updatedItems = items.filter(item => item.id !== id);
    setItems(updatedItems);
    saveCatalog(updatedItems);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName('');
    setRate('');
    setCostPrice('');
    setGstRate(profile.defaultGstRate.toString());
    setHsnCode('');
    setStock('0');
    setLowStockThreshold('5');
    setBarcode('');
    setIsTaxInclusive(false);
  };

  const handleRestock = (id: string) => {
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) return;

    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, stock: item.stock + qty };
      }
      return item;
    });

    setItems(updated);
    saveCatalog(updated);
    setRestockId(null);
    setRestockQty('');
  };

  if (isEditing) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {editingId ? 'Edit Item' : 'New Catalog Item'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Configure pricing, GST rates, and inventory alerts</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Item Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Samsung Galaxy S23"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cost Price (₹)</label>
              <input 
                type="number" 
                inputMode="decimal"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Selling Rate (₹)</label>
              <input 
                type="number" 
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">GST Rate (%)</label>
              <input 
                type="number" 
                inputMode="decimal"
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                placeholder="18"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">HSN/SAC Code</label>
              <input 
                type="text" 
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="e.g. 8517"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Current Stock</label>
              <input 
                type="number" 
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Low Stock Alert At</label>
              <input 
                type="number" 
                inputMode="numeric"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                placeholder="5"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
              />
            </div>
            
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Barcode</label>
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type barcode"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all font-mono"
                />
                <button 
                  onClick={() => setBarcode(Date.now().toString().slice(-10))}
                  className="px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors shrink-0 text-sm"
                >
                  Generate
                </button>
              </div>
            </div>

            <div className="sm:col-span-2 pt-2">
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isTaxInclusive}
                    onChange={(e) => setIsTaxInclusive(e.target.checked)}
                    className="w-5 h-5 appearance-none border-2 border-slate-300 rounded text-indigo-600 checked:bg-indigo-600 checked:border-indigo-600 transition-colors cursor-pointer"
                  />
                  {isTaxInclusive && <svg className="w-3.5 h-3.5 text-white absolute pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Price includes GST (MRP Mode)</div>
                  <div className="text-xs text-slate-500">Back-calculate tax from the selling rate instead of adding on top</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-6">
          <button 
            onClick={resetForm}
            className="flex-1 py-3.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!name || !rate}
            className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-sm hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            Save Item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Product Catalog</h2>
          <p className="text-xs text-slate-500 mt-1 hidden sm:block">Manage your inventory, pricing, and tax details</p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button 
              onClick={() => setShowPrintBarcodes(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 active:scale-[0.98] shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print Labels</span>
            </button>
          )}
          <button 
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Item</span>
          </button>
        </div>
      </div>

      {showPrintBarcodes && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Print Barcode Labels</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={() => setShowPrintBarcodes(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto print:p-0 print:overflow-visible">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3">
                {items.filter(i => i.barcode).map(item => (
                  <div key={item.id} className="border border-slate-200 rounded-xl p-3 flex flex-col items-center text-center print:break-inside-avoid">
                    <p className="font-bold text-slate-900 text-sm truncate w-full mb-1">{item.name}</p>
                    <p className="text-xs text-slate-500 mb-2">₹{item.rate.toFixed(2)}</p>
                    <div className="w-full flex justify-center scale-90 origin-top">
                      <Barcode value={item.barcode!} width={1.5} height={40} fontSize={12} margin={0} />
                    </div>
                  </div>
                ))}
                {items.filter(i => i.barcode).length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    <p>No items have barcodes configured.</p>
                    <p className="text-sm mt-1">Edit items in your catalog to add barcodes before printing.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">No items in catalog</p>
          <p className="text-sm text-slate-400 mt-1">Add your common products for quick billing.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table Layout (hidden on mobile, visible on lg and above) */}
          <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Item Name</th>
                  <th className="py-3.5 px-3">HSN/SAC</th>
                  <th className="py-3.5 px-3 text-right">Cost Price</th>
                  <th className="py-3.5 px-3 text-right">Selling Rate</th>
                  <th className="py-3.5 px-3 text-center">GST %</th>
                  <th className="py-3.5 px-4 text-center">Stock Level</th>
                  <th className="py-3.5 px-4">Quick Restock</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {items.map((item) => {
                  const isLow = item.stock <= item.lowStockThreshold;
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/70 transition-colors ${isLow ? 'bg-amber-50/20' : ''}`}>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          {item.name}
                          {isLow && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md shrink-0">
                              Low Stock
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-500 font-mono text-xs">
                        {item.hsnCode ? `HSN ${item.hsnCode}` : '—'}
                        {item.barcode && <div className="mt-0.5 text-[10px] text-slate-400">BC: {item.barcode}</div>}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-600 tabular-nums">
                        ₹{(item.costPrice || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                        ₹{item.rate.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-indigo-600">
                        {item.gstRate}%
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center justify-center font-black px-2.5 py-1 rounded-lg text-xs ${
                          isLow ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.stock}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {restockId === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <input 
                              type="number"
                              inputMode="numeric"
                              value={restockQty}
                              onChange={(e) => setRestockQty(e.target.value)}
                              placeholder="+Qty"
                              className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <button 
                              onClick={() => handleRestock(item.id)}
                              className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 active:scale-95"
                            >
                              Add
                            </button>
                            <button 
                              onClick={() => setRestockId(null)}
                              className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              setRestockId(item.id);
                              setRestockQty('');
                            }}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                          >
                            + Restock
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button 
                            onClick={() => handleEdit(item)} 
                            title="Edit"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)} 
                            title="Delete"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards Layout (visible on mobile, hidden on lg and above) */}
          <div className="space-y-3 lg:hidden">
            {items.map((item) => (
              <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border flex flex-col gap-3 ${item.stock <= item.lowStockThreshold ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900 flex items-center gap-2">
                      {item.name}
                      {item.stock <= item.lowStockThreshold && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md">Low Stock</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs font-medium text-slate-500">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">₹{item.rate.toFixed(2)}</span>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">GST {item.gstRate}%</span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">Stock: {item.stock}</span>
                      {item.barcode && <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">{item.barcode}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 border-l border-slate-100 pl-3 ml-2">
                    <button onClick={() => handleEdit(item)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {restockId === item.id ? (
                  <div className="flex items-center gap-2 mt-2 border-t border-slate-100 pt-3">
                    <input 
                      type="number"
                      inputMode="numeric"
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      placeholder="Qty to add"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                      onClick={() => setRestockId(null)}
                      className="px-3 py-2 text-slate-500 text-sm font-medium hover:bg-slate-100 rounded-md"
                    >Cancel</button>
                    <button 
                      onClick={() => handleRestock(item.id)}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-md hover:bg-indigo-700 active:scale-95"
                    >Add</button>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 pt-3">
                     <button 
                      onClick={() => {
                        setRestockId(item.id);
                        setRestockQty('');
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                    >
                      + Quick Restock
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
