import { useState, useEffect, useRef, useMemo } from 'react';
import { Invoice, InvoiceItem, PaymentMode, GstBreakup, CatalogItem, Estimate, DeliveryChallan, Loan } from '../types';
import { getProfile, getNextInvoiceId, saveInvoice, getCatalog, decrementCatalogStock, getNextEstimateId, saveEstimate, getEstimates, getNextChallanId, saveChallan, getChallans, saveLoan, getNextLoanId } from '../store';
import { Plus, Trash2, Edit2, FileText, CheckCircle2, ScanBarcode, X, FileSignature, Truck, Calendar, AlertCircle } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../contexts/AuthContext';

interface NewBillTabProps {
  onBillCreated: (invoice: Invoice) => void;
  estimateToConvert?: Estimate | null;
  onEstimateConverted?: () => void;
  challanToConvert?: DeliveryChallan | null;
  onChallanConverted?: () => void;
  onBillInProgressChange?: (inProgress: boolean) => void;
}

export function NewBillTab({ 
  onBillCreated, 
  estimateToConvert, 
  onEstimateConverted, 
  challanToConvert, 
  onChallanConverted,
  onBillInProgressChange 
}: NewBillTabProps) {
  const [profile, setProfile] = useState(getProfile());
  const [catalog, setCatalog] = useState(getCatalog());
  const { appUser } = useAuth();

  useEffect(() => {
    const refresh = () => {
      setProfile(getProfile());
      setCatalog(getCatalog());
    };
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);
  
  const [docType, setDocType] = useState<'invoice' | 'estimate' | 'challan'>('invoice');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [applyGst, setApplyGst] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  
  const defaultRepaymentDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [expectedRepaymentDate, setExpectedRepaymentDate] = useState(defaultRepaymentDateStr);

  const [convertedEstimateId, setConvertedEstimateId] = useState<string | undefined>(undefined);
  const [convertedChallanId, setConvertedChallanId] = useState<string | undefined>(undefined);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [discountValue, setDiscountValue] = useState('');

  // Notify parent whether user has active work in progress
  useEffect(() => {
    const hasWork = items.length > 0 || customerName.trim().length > 0 || customerPhone.trim().length > 0 || amountPaidNow.trim().length > 0;
    onBillInProgressChange?.(hasWork);
  }, [items.length, customerName, customerPhone, amountPaidNow, onBillInProgressChange]);

  useEffect(() => {
    if (estimateToConvert) {
      setDocType('invoice');
      setItems(estimateToConvert.items);
      setApplyGst(estimateToConvert.applyGst);
      setCustomerName(estimateToConvert.customerName);
      setCustomerPhone(estimateToConvert.customerPhone);
      setConvertedEstimateId(estimateToConvert.id);
      
      if (estimateToConvert.discountType) {
        setDiscountType(estimateToConvert.discountType);
        setDiscountValue(estimateToConvert.discountValue?.toString() || '');
      }
      
      // Clear the prop immediately if possible, or just ignore it after mount
      if (onEstimateConverted) onEstimateConverted();
    }
  }, [estimateToConvert]);

  useEffect(() => {
    if (challanToConvert) {
      setDocType('invoice');
      setItems(challanToConvert.items);
      setApplyGst(challanToConvert.applyGst);
      setCustomerName(challanToConvert.customerName);
      setCustomerPhone(challanToConvert.customerPhone);
      setConvertedChallanId(challanToConvert.id);
      
      if (challanToConvert.discountType) {
        setDiscountType(challanToConvert.discountType);
        setDiscountValue(challanToConvert.discountValue?.toString() || '');
      }
      
      if (onChallanConverted) onChallanConverted();
    }
  }, [challanToConvert]);
  
  // Barcode Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Item entry state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [catalogId, setCatalogId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState('1');
  const [rate, setRate] = useState('');
  const [costPrice, setCostPrice] = useState(0);
  const [gstRate, setGstRate] = useState(profile.defaultGstRate.toString());
  const [hsnCode, setHsnCode] = useState('');
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);

  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredCatalog = catalog.filter(c => 
    c.name.toLowerCase().includes(itemName.toLowerCase()) || 
    (c.barcode && c.barcode.includes(itemName))
  );

  useEffect(() => {
    if (isScanning) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 100} },
        /* verbose= */ false
      );
      
      scannerRef.current.render((decodedText) => {
        // Find item by barcode
        const matchedItem = catalog.find(c => c.barcode === decodedText);
        if (matchedItem) {
          // Play a tiny beep (optional, standard behavior for POS)
          // Add item instantly
          setItemName(matchedItem.name);
          setCatalogId(matchedItem.id);
          setRate(matchedItem.rate.toString());
          setCostPrice(matchedItem.costPrice || 0);
          setGstRate(matchedItem.gstRate.toString());
          setHsnCode(matchedItem.hsnCode || '');
          setIsTaxInclusive(!!matchedItem.isTaxInclusive);
          setQuantity('1');
          
          // Stop scanning automatically after a successful read
          scannerRef.current?.clear();
          setIsScanning(false);
          
          // We can optionally trigger handleAddItem here or let the user click Add.
          // Since we might not want to instantly submit if they want to change quantity, let's just populate the fields.
          // Let's instantly submit it for a real POS feel:
          setTimeout(() => {
            document.getElementById('add-item-btn')?.click();
          }, 100);
        }
      }, (error) => {
        // ignore errors (it scans many times a second)
      });
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, [isScanning, catalog]);

  const handleAddItem = () => {
    if (!itemName || !rate) return;
    
    const qtyNum = parseFloat(quantity) || 1;
    const rateNum = parseFloat(rate) || 0;
    const gstNum = parseFloat(gstRate) || profile.defaultGstRate;
    
    if (qtyNum <= 0 || rateNum < 0 || gstNum < 0) {
      alert("Please enter valid positive numbers for quantity, rate, and GST.");
      return;
    }
    
    const costAmount = qtyNum * costPrice;
    
    let amount = 0;
    let itemCgst = 0;
    let itemSgst = 0;
    
    if (isTaxInclusive) {
      const totalItemAmount = qtyNum * rateNum;
      amount = totalItemAmount / (1 + gstNum / 100);
      const gstAmount = totalItemAmount - amount;
      itemCgst = gstAmount / 2;
      itemSgst = gstAmount / 2;
    } else {
      amount = qtyNum * rateNum;
      itemCgst = (amount * (gstNum / 100)) / 2;
      itemSgst = itemCgst;
    }
    
    if (editingId) {
      setItems(items.map(item => item.id === editingId ? {
        ...item,
        name: itemName,
        catalogId,
        hsnCode,
        quantity: qtyNum,
        rate: rateNum,
        costAmount,
        amount,
        gstRate: gstNum,
        cgst: itemCgst,
        sgst: itemSgst,
        isTaxInclusive
      } : item));
      setEditingId(null);
    } else {
      setItems([...items, {
        id: Date.now().toString(),
        name: itemName,
        catalogId,
        hsnCode,
        quantity: qtyNum,
        rate: rateNum,
        costAmount,
        amount,
        gstRate: gstNum,
        cgst: itemCgst,
        sgst: itemSgst,
        isTaxInclusive
      }]);
    }
    
    setItemName('');
    setCatalogId(undefined);
    setQuantity('1');
    setRate('');
    setCostPrice(0);
    setGstRate(profile.defaultGstRate.toString());
    setHsnCode('');
    setIsTaxInclusive(false);
  };

  const handleEditItem = (item: InvoiceItem) => {
    setEditingId(item.id);
    setItemName(item.name);
    setCatalogId(item.catalogId);
    setHsnCode(item.hsnCode || '');
    setQuantity(item.quantity.toString());
    setRate(item.rate.toString());
    setCostPrice(item.costAmount ? item.costAmount / item.quantity : 0);
    setGstRate(item.gstRate.toString());
    setIsTaxInclusive(!!item.isTaxInclusive);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    
    items.forEach(item => {
      subtotal += item.amount;
    });

    let discountAmount = 0;
    const discountValNum = parseFloat(discountValue) || 0;
    if (discountType === 'flat') {
      discountAmount = discountValNum;
    } else {
      discountAmount = subtotal * (discountValNum / 100);
    }
    
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }

    const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

    let totalCgst = 0;
    let totalSgst = 0;
    let total = 0;
    const breakup: GstBreakup = {};

    items.forEach(item => {
      const discountedAmount = item.amount * (1 - discountRatio);
      
      if (applyGst) {
        const itemCgst = (discountedAmount * (item.gstRate / 100)) / 2;
        const itemSgst = itemCgst;
        
        totalCgst += itemCgst;
        totalSgst += itemSgst;
        
        if (!breakup[item.gstRate]) {
          breakup[item.gstRate] = { taxableAmount: 0, cgst: 0, sgst: 0 };
        }
        breakup[item.gstRate].taxableAmount += discountedAmount;
        breakup[item.gstRate].cgst += itemCgst;
        breakup[item.gstRate].sgst += itemSgst;
      }
    });

    total = subtotal - discountAmount + (applyGst ? totalCgst + totalSgst : 0);

    return { subtotal, discountAmount, cgst: totalCgst, sgst: totalSgst, total, breakup };
  };

  const { subtotal, discountAmount, cgst, sgst, total, breakup } = calculateTotals();

  const handleFinalize = () => {
    if (items.length === 0) return;

    const discountValNum = parseFloat(discountValue) || 0;
    if (discountValNum < 0) {
      alert("Discount cannot be negative.");
      return;
    }
    if (discountType === 'percentage' && discountValNum > 100) {
      alert("Discount percentage cannot exceed 100%.");
      return;
    }

    if (docType === 'estimate') {
      const estimate: Estimate = {
        id: getNextEstimateId(),
        timestamp: Date.now(),
        customerName,
        customerPhone,
        items,
        applyGst,
        gstRate: profile.defaultGstRate,
        subtotal,
        cgst,
        sgst,
        total,
        gstBreakup: breakup,
        discountType,
        discountValue: discountValNum,
        discountAmount,
        createdBy: appUser?.email,
      };
      
      // Need to cast because Estimate doesn't require paymentMode but we might need to satisfy type checking for receipt
      // Or just cast to Invoice when viewing.
      // Wait, let's just save it.
      saveEstimate(estimate);
      alert(`Estimate ${estimate.id} created successfully!`);
      // Reset form
      setItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setApplyGst(false);
      setDiscountType('flat');
      setDiscountValue('');
      return;
    }

    if (docType === 'challan') {
      const challan: DeliveryChallan = {
        id: getNextChallanId(),
        timestamp: Date.now(),
        customerName,
        customerPhone,
        deliveryAddress,
        vehicleDetails,
        status: 'Pending',
        items,
        applyGst,
        gstRate: profile.defaultGstRate,
        subtotal,
        cgst,
        sgst,
        total,
        gstBreakup: breakup,
        discountType,
        discountValue: discountValNum,
        discountAmount,
        createdBy: appUser?.email,
      };
      saveChallan(challan);
      alert(`Delivery Challan ${challan.id} created successfully!`);
      // Reset form
      setItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setVehicleDetails('');
      setApplyGst(false);
      setDiscountType('flat');
      setDiscountValue('');
      return;
    }

    let finalPaymentStatus: 'paid' | 'partial' | 'unpaid' = 'paid';
    let finalAmountPaid = total;
    let finalAmountDue = 0;
    let linkedLoanId: string | undefined = undefined;

    if (paymentMode === 'Credit') {
      finalPaymentStatus = 'unpaid';
      finalAmountPaid = 0;
      finalAmountDue = total;
    } else if (paymentMode === 'Partially Paid') {
      if (!customerName.trim()) {
        alert('Customer Name is required for Partially Paid bills (needed for reminders & ledger).');
        return;
      }
      if (!customerPhone.trim()) {
        alert('Customer Phone number is required for Partially Paid bills (needed for reminders).');
        return;
      }
      const paidNum = parseFloat(amountPaidNow);
      if (isNaN(paidNum) || paidNum <= 0) {
        alert('Please enter an Amount Paid Now greater than 0.');
        return;
      }
      if (paidNum > total) {
        alert(`Amount Paid Now (₹${paidNum.toFixed(2)}) cannot exceed Grand Total (₹${total.toFixed(2)}).`);
        return;
      }
      if (!expectedRepaymentDate) {
        alert('Please select an expected repayment date for the balance.');
        return;
      }

      if (Math.abs(paidNum - total) < 0.01) {
        // Equal to total - treat as normal fully paid bill
        finalPaymentStatus = 'paid';
        finalAmountPaid = total;
        finalAmountDue = 0;
      } else {
        finalPaymentStatus = 'partial';
        finalAmountPaid = paidNum;
        finalAmountDue = Number((total - paidNum).toFixed(2));
      }
    }

    const nextInvoiceId = getNextInvoiceId();

    if (finalPaymentStatus === 'partial' && finalAmountDue > 0) {
      linkedLoanId = getNextLoanId();
      const newLoan: Loan = {
        id: linkedLoanId,
        borrowerName: customerName.trim(),
        phone: customerPhone.trim(),
        amount: finalAmountDue,
        dateGiven: Date.now(),
        expectedRepaymentDate: expectedRepaymentDate || defaultRepaymentDateStr,
        note: `Bill #${nextInvoiceId} balance`,
        repayments: [],
        status: 'active',
        updatedAt: Date.now(),
        createdBy: appUser?.email,
        source: 'Bill balance',
        invoiceId: nextInvoiceId
      };
      saveLoan(newLoan);
    }

    const invoice: Invoice = {
      id: nextInvoiceId,
      timestamp: Date.now(),
      customerName,
      customerPhone,
      paymentMode,
      paymentStatus: finalPaymentStatus,
      amountPaid: finalAmountPaid,
      amountDue: finalAmountDue,
      loanId: linkedLoanId,
      expectedRepaymentDate: finalPaymentStatus === 'partial' ? expectedRepaymentDate : undefined,
      items,
      applyGst,
      gstRate: profile.defaultGstRate, // legacy overall field
      subtotal,
      cgst,
      sgst,
      total,
      gstBreakup: breakup,
      discountType,
      discountValue: discountValNum,
      discountAmount,
      createdBy: appUser?.email,
    };

    saveInvoice(invoice);
    decrementCatalogStock(items);
    
    // If converted from an estimate, update that estimate
    if (convertedEstimateId) {
      const allEstimates = getEstimates(); // we'll need to import getEstimates
      const estToUpdate = allEstimates.find(e => e.id === convertedEstimateId);
      if (estToUpdate) {
        estToUpdate.convertedToInvoiceId = invoice.id;
        saveEstimate(estToUpdate);
      }
    }

    // If converted from a challan, update that challan
    if (convertedChallanId) {
      const allChallans = getChallans();
      const chlToUpdate = allChallans.find(c => c.id === convertedChallanId);
      if (chlToUpdate) {
        chlToUpdate.convertedToInvoiceId = invoice.id;
        saveChallan(chlToUpdate);
      }
    }
    
    onBillCreated(invoice);
    
    setItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setVehicleDetails('');
    setApplyGst(false);
    setDiscountType('flat');
    setDiscountValue('');
    setAmountPaidNow('');
    setExpectedRepaymentDate(defaultRepaymentDateStr);
    setPaymentMode('Cash');
    setConvertedEstimateId(undefined);
    setConvertedChallanId(undefined);
    setDocType('invoice');
  };

  return (
    <div className="pb-28 lg:pb-12 pt-4 px-4 max-w-lg lg:max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {docType === 'estimate' ? 'New Estimate' : docType === 'challan' ? 'New Delivery Challan' : 'New Bill'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {docType === 'estimate' ? `Estimate #${getNextEstimateId()}` : docType === 'challan' ? `Challan #${getNextChallanId()}` : `Invoice #${getNextInvoiceId()}`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Document Type Toggle */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl shrink-0 overflow-x-auto">
            <button 
              onClick={() => {
                setDocType('invoice');
                setConvertedEstimateId(undefined); // Clear conversion state if user manually switches
                setConvertedChallanId(undefined);
              }}
              className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                docType === 'invoice' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Invoice
            </button>
            <button 
              onClick={() => {
                setDocType('estimate');
                setConvertedEstimateId(undefined); // Clear conversion state
                setConvertedChallanId(undefined);
              }}
              className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                docType === 'estimate' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileSignature className="w-3.5 h-3.5" />
              Estimate
            </button>
            <button 
              onClick={() => {
                setDocType('challan');
                setConvertedEstimateId(undefined);
                setConvertedChallanId(undefined);
              }}
              className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                docType === 'challan' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Challan
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl">
            <ScanBarcode className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-700">POS</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Customer info & Item Entry form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer Card */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Name (Optional)</label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Kumar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Phone (Optional)</label>
                <input 
                  type="tel" 
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all text-sm"
                />
              </div>
            </div>
            
            {docType === 'challan' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Delivery Address</label>
                  <input 
                    type="text" 
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter delivery address"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Vehicle / Transport</label>
                  <input 
                    type="text" 
                    value={vehicleDetails}
                    onChange={(e) => setVehicleDetails(e.target.value)}
                    placeholder="e.g. Truck No. MH01AB1234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Item Entry Form */}
          <div className="bg-indigo-50/70 p-5 rounded-2xl border border-indigo-100 shadow-sm space-y-4 relative">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                {editingId ? 'Edit Bill Item' : 'Add Item to Bill'}
              </h3>
              {editingId && (
                <button 
                  onClick={() => {
                    setEditingId(null);
                    setItemName('');
                    setCatalogId(undefined);
                    setQuantity('1');
                    setRate('');
                    setHsnCode('');
                    setGstRate(profile.defaultGstRate.toString());
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 relative">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={itemName}
                  onChange={(e) => {
                    setItemName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Scan barcode or type to search catalog..."
                  className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-sm"
                />
                <button
                  onClick={() => setIsScanning(!isScanning)}
                  className={`px-4 py-3 rounded-xl font-bold transition-colors flex items-center justify-center shrink-0 ${
                    isScanning ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                  }`}
                  title={isScanning ? "Stop scanning" : "Scan Barcode"}
                >
                  {isScanning ? <X className="w-5 h-5" /> : <ScanBarcode className="w-5 h-5" />}
                </button>
              </div>
              
              {isScanning && (
                <div className="w-full bg-white border border-indigo-200 rounded-xl overflow-hidden mt-1 p-2">
                  <div id="reader" className="w-full h-full"></div>
                  <p className="text-center text-xs text-slate-500 mt-2">Point camera at barcode</p>
                </div>
              )}

              {showSuggestions && itemName && !isScanning && filteredCatalog.length > 0 && (
                <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-56 overflow-y-auto top-[52px] left-0">
                  {filteredCatalog.map(c => (
                    <div 
                      key={c.id} 
                      className="p-3 border-b border-slate-100 last:border-0 hover:bg-indigo-50/70 active:bg-indigo-100 cursor-pointer transition-colors"
                      onClick={() => {
                        setItemName(c.name);
                        setCatalogId(c.id);
                        setRate(c.rate.toString());
                        setCostPrice(c.costPrice || 0);
                        setGstRate(c.gstRate.toString());
                        setHsnCode(c.hsnCode || '');
                        setIsTaxInclusive(!!c.isTaxInclusive);
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-900 text-sm">{c.name}</p>
                        <span className="font-black text-indigo-600 text-sm">₹{c.rate}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">GST {c.gstRate}% {c.hsnCode && `• HSN ${c.hsnCode}`} • In Stock: {c.stock}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Quantity</label>
                <input 
                  type="number" 
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Qty"
                  className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Selling Rate (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="Rate"
                    className="w-full bg-white border border-indigo-200 rounded-xl pl-8 pr-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">HSN/SAC (Optional)</label>
                <input 
                  type="text" 
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="HSN/SAC Code"
                  className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">GST Rate (%)</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-2.5 text-slate-400 text-sm font-bold">%</span>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    placeholder="GST Rate"
                    className="w-full bg-white border border-indigo-200 rounded-xl pl-4 pr-8 py-2.5 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isTaxInclusive}
                    onChange={(e) => setIsTaxInclusive(e.target.checked)}
                    className="w-4 h-4 appearance-none border-2 border-indigo-300 rounded text-indigo-600 checked:bg-indigo-600 checked:border-indigo-600 transition-colors cursor-pointer"
                  />
                  {isTaxInclusive && <svg className="w-3 h-3 text-white absolute pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div className="text-xs font-bold text-indigo-900">Price includes GST (MRP Mode)</div>
              </label>
            </div>

            <button 
              id="add-item-btn"
              onClick={handleAddItem}
              disabled={!itemName || !rate}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm text-sm"
            >
              {editingId ? 'Update Bill Item' : <><Plus className="w-4 h-4" /> Add Item to Bill</>}
            </button>
          </div>

          {/* Quick Catalog Shortcuts for Desktop */}
          {catalog.length > 0 && (
            <div className="hidden lg:block bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Quick Add from Catalog</h3>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {catalog.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setItemName(c.name);
                      setCatalogId(c.id);
                      setRate(c.rate.toString());
                      setCostPrice(c.costPrice || 0);
                      setGstRate(c.gstRate.toString());
                      setHsnCode(c.hsnCode || '');
                      setIsTaxInclusive(!!c.isTaxInclusive);
                      setQuantity('1');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
                  >
                    <span>{c.name}</span>
                    <span className="font-bold text-indigo-600">₹{c.rate}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Running Bill Items, Totals & Payment (Sticky on Desktop) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Running Bill</span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-500">#{getNextInvoiceId()}</span>
            </div>

            {/* Added Items List */}
            <div className="space-y-2.5 max-h-64 lg:max-h-72 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-xs font-medium">No items added to this bill yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Use the item form on the left to add items.</p>
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-100/60 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span>{item.quantity} × ₹{item.rate} {item.isTaxInclusive && <span className="text-[9px] font-bold uppercase text-indigo-500">MRP</span>}</span>
                        <span className="text-[10px] font-bold bg-white border border-slate-200 px-1 rounded text-slate-600">
                          GST {item.gstRate}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="font-bold text-slate-900 text-sm">₹{(item.isTaxInclusive ? item.amount + item.cgst + item.sgst : item.amount).toFixed(2)}</span>
                        {item.isTaxInclusive && <div className="text-[9px] text-slate-400">Incl. GST</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleEditItem(item)} 
                          title="Edit"
                          className="text-indigo-600 p-1 hover:bg-indigo-50 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleRemoveItem(item.id)} 
                          title="Delete"
                          className="text-rose-500 p-1 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Discount Section */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Discount</label>
                <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                  <button 
                    onClick={() => setDiscountType('flat')} 
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${discountType === 'flat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >₹ Flat</button>
                  <button 
                    onClick={() => setDiscountType('percentage')} 
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${discountType === 'percentage' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >% Percent</button>
                </div>
              </div>
              <input 
                type="number"
                inputMode="decimal"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === 'flat' ? "Discount Amount (₹)" : "Discount Percentage (%)"}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>

            {/* GST Toggle */}
            <div className="border-t border-slate-100 pt-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-semibold text-slate-800">Show GST (CGST/SGST)</span>
                <div className={`w-12 h-7 rounded-full p-1 transition-colors ${applyGst ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                  <input type="checkbox" className="hidden" checked={applyGst} onChange={() => setApplyGst(!applyGst)} />
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${applyGst ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
            </div>
            
            {/* Totals Summary */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-sm font-medium">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="text-slate-900 font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              {applyGst && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Total CGST</span>
                    <span className="text-slate-900 font-semibold">₹{cgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Total SGST</span>
                    <span className="text-slate-900 font-semibold">₹{sgst.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xl font-black text-slate-900 pt-2.5 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-indigo-600">₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Mode */}
            {docType === 'invoice' && (
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['Cash', 'UPI', 'Card', 'Credit', 'Partially Paid'] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all text-center ${
                        paymentMode === mode 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' 
                          : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Partially Paid Configuration Details */}
                {paymentMode === 'Partially Paid' && (
                  <div className="mt-3 p-3.5 bg-amber-50/70 border border-amber-200/90 rounded-2xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between text-amber-900">
                      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Partially Paid Setup
                      </span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full">
                        Auto-creates linked loan
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Amount Paid Now <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={amountPaidNow}
                            onChange={(e) => setAmountPaidNow(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Balance Remaining
                        </label>
                        <div className="py-2 px-3 bg-white border border-slate-200 rounded-xl text-sm font-black flex items-center justify-between min-h-[38px]">
                          <span className="text-xs font-bold text-slate-500">Unpaid:</span>
                          <span className={
                            (parseFloat(amountPaidNow) || 0) > total 
                              ? 'text-rose-600 font-bold text-xs' 
                              : 'text-amber-800 font-black'
                          }>
                            {(parseFloat(amountPaidNow) || 0) > total
                              ? 'Exceeds Total'
                              : `₹${Math.max(0, total - (parseFloat(amountPaidNow) || 0)).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Expected Repayment Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={expectedRepaymentDate}
                        onChange={(e) => setExpectedRepaymentDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    </div>

                    {(!customerName.trim() || !customerPhone.trim()) && (
                      <p className="text-[11px] font-semibold text-amber-800 bg-amber-100/70 p-2.5 rounded-xl leading-tight">
                        ⚠️ Please enter Customer Name & Phone at the top so this remaining balance can be linked to their loan record and WhatsApp reminders.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Desktop Inline Finalize Button */}
            <button
              onClick={handleFinalize}
              disabled={items.length === 0}
              className="hidden lg:flex w-full py-4 bg-slate-900 text-white rounded-xl font-bold items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-slate-900/10 text-base"
            >
              <CheckCircle2 className="w-5 h-5" />
              {docType === 'estimate' ? `Save Estimate (₹${total.toFixed(2)})` : docType === 'challan' ? `Save Challan (₹${total.toFixed(2)})` : `Finalize Bill (₹${total.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Finalize Bar */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/85 backdrop-blur-md border-t border-slate-200 max-w-lg mx-auto safe-area-bottom-btn z-40 lg:hidden">
        <button
          onClick={handleFinalize}
          disabled={items.length === 0}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition-all shadow-lg shadow-slate-900/20"
        >
          <CheckCircle2 className="w-5 h-5" />
          {docType === 'estimate' ? `Save Estimate (₹${total.toFixed(2)})` : docType === 'challan' ? `Save Challan (₹${total.toFixed(2)})` : `Finalize Bill (₹${total.toFixed(2)})`}
        </button>
      </div>
      
      {/* Invisible overlay to close suggestions */}
      {showSuggestions && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
