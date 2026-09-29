import type { BusinessProfile, Invoice, CatalogItem, InvoiceItem, Expense, Estimate, DeliveryChallan, Supplier, Purchase, PurchaseItem, CustomerRecord, Loan, LoanRepayment } from './types';
import { enqueueSync, startSync, stopSync, syncDirectToFirestore } from './sync';
import { auth } from './firebase';

let currentTeamId = 'local';

export const setTeamId = (id: string) => {
  if (currentTeamId !== id) {
    currentTeamId = id;
    if (id && id !== 'local') {
      startSync(id);
    } else {
      stopSync();
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quickbill-data-updated'));
    }
  }
};

export const getEffectiveTeamId = (): string => {
  if (currentTeamId && currentTeamId !== 'local') {
    return currentTeamId;
  }
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  return 'local';
};

export const getTeamId = () => getEffectiveTeamId();

const getStorageKey = (key: string) => `${getEffectiveTeamId()}_${key}`;

const PROFILE_KEY = 'quickbill_profile';
const INVOICES_KEY = 'quickbill_invoices';
const CATALOG_KEY = 'quickbill_catalog';
const EXPENSES_KEY = 'quickbill_expenses';
const ESTIMATES_KEY = 'quickbill_estimates';
const SUPPLIERS_KEY = 'quickbill_suppliers';
const PURCHASES_KEY = 'quickbill_purchases';
const CHALLANS_KEY = 'quickbill_challans';
const CUSTOMERS_KEY = 'quickbill_customers';
const LOANS_KEY = 'quickbill_loans';

export type { CustomerRecord };

export const defaultProfile: BusinessProfile = {
  shopName: '',
  address: '',
  phone: '',
  gstin: '',
  defaultGstRate: 18,
  termsText: 'Goods once sold will not be taken back.',
};

export const getProfile = (): BusinessProfile => {
  const data = localStorage.getItem(getStorageKey(PROFILE_KEY));
  return data ? { ...defaultProfile, ...JSON.parse(data) } : defaultProfile;
};

export const saveProfile = (profile: BusinessProfile) => {
  const stamped = { ...profile, updatedAt: Date.now() };
  localStorage.setItem(getStorageKey(PROFILE_KEY), JSON.stringify(stamped));
  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    syncDirectToFirestore(targetId, 'profile', 'main', stamped).catch(console.warn);
  }
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'profile' } }));
};

export const getCatalog = (): CatalogItem[] => {
  const data = localStorage.getItem(getStorageKey(CATALOG_KEY));
  if (!data) return [];
  const items: CatalogItem[] = JSON.parse(data);
  return items.map(item => ({
    ...item,
    costPrice: item.costPrice ?? 0,
    stock: item.stock ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? 5
  }));
};

export const saveCatalog = (catalog: CatalogItem[]) => {
  const previousCatalog = getCatalog();
  const prevMap = new Map(previousCatalog.map(item => [item.id, item]));
  const currentIds = new Set(catalog.map(c => c.id));
  const targetId = getEffectiveTeamId();

  // Queue deletes for removed items
  previousCatalog.forEach(prev => {
    if (!currentIds.has(prev.id) && targetId && targetId !== 'local') {
      enqueueSync(targetId, 'catalog', prev.id, 'delete');
    }
  });

  const now = Date.now();
  const stampedCatalog = catalog.map(item => {
    const prev = prevMap.get(item.id);
    const hasChanged = !prev || JSON.stringify(prev) !== JSON.stringify(item);
    const updatedItem = hasChanged ? { ...item, updatedAt: (item as any).updatedAt || now } : item;
    if (hasChanged && targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'catalog', item.id, updatedItem).catch(console.warn);
    }
    return updatedItem;
  });

  localStorage.setItem(getStorageKey(CATALOG_KEY), JSON.stringify(stampedCatalog));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'catalog' } }));
};

export const decrementCatalogStock = (items: InvoiceItem[]) => {
  const catalog = getCatalog();
  let updated = false;
  items.forEach(item => {
    const catalogItem = catalog.find(c => c.id === item.catalogId || c.name === item.name);
    if (catalogItem) {
      catalogItem.stock -= item.quantity;
      (catalogItem as any).updatedAt = Date.now();
      updated = true;
    }
  });
  if (updated) saveCatalog(catalog);
};

export const increaseCatalogStock = (items: PurchaseItem[]) => {
  const catalog = getCatalog();
  let updated = false;
  items.forEach(item => {
    if (item.catalogId) {
      const catalogItem = catalog.find(c => c.id === item.catalogId);
      if (catalogItem) {
        catalogItem.stock += item.quantity;
        (catalogItem as any).updatedAt = Date.now();
        updated = true;
      }
    }
  });
  if (updated) saveCatalog(catalog);
};

export const getInvoices = (): Invoice[] => {
  const data = localStorage.getItem(getStorageKey(INVOICES_KEY));
  if (!data) return [];
  const invoices: Invoice[] = JSON.parse(data);
  return invoices.map(inv => ({
    ...inv,
    items: inv.items ? inv.items.map(item => ({
      ...item,
      costAmount: item.costAmount ?? 0,
    })) : []
  }));
};

export const saveInvoice = (invoice: Invoice) => {
  const invoices = getInvoices();
  const stamped: Invoice = {
    ...invoice,
    updatedAt: (invoice as any).updatedAt || invoice.timestamp || Date.now()
  } as Invoice;

  const existingIdx = invoices.findIndex(i => i.id === invoice.id);
  if (existingIdx !== -1) {
    invoices[existingIdx] = stamped;
  } else {
    invoices.push(stamped);
  }

  localStorage.setItem(getStorageKey(INVOICES_KEY), JSON.stringify(invoices));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'bills' } }));

  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    // Write directly to users/{targetId}/bills/{invoice.id} in Firestore
    syncDirectToFirestore(targetId, 'bills', invoice.id, stamped).catch(err => {
      console.error('[saveInvoice] Firestore direct write error:', err);
    });
  }
};

export const getNextInvoiceId = (): string => {
  const invoices = getInvoices();
  let maxNum = 0;
  for (const inv of invoices) {
    const match = inv.id.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : invoices.length + 1;
  return `INV-${nextNumber.toString().padStart(3, '0')}`;
};

export const getEstimates = (): Estimate[] => {
  const data = localStorage.getItem(getStorageKey(ESTIMATES_KEY));
  if (!data) return [];
  const estimates: Estimate[] = JSON.parse(data);
  return estimates;
};

export const saveEstimate = (estimate: Estimate) => {
  const estimates = getEstimates();
  const stamped = { ...estimate, updatedAt: (estimate as any).updatedAt || estimate.timestamp || Date.now() };
  const existingIdx = estimates.findIndex(e => e.id === estimate.id);
  if (existingIdx !== -1) {
    estimates[existingIdx] = stamped;
  } else {
    estimates.push(stamped);
  }
  localStorage.setItem(getStorageKey(ESTIMATES_KEY), JSON.stringify(estimates));
  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    syncDirectToFirestore(targetId, 'estimates', estimate.id, stamped).catch(console.warn);
  }
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'estimates' } }));
};

export const getNextEstimateId = (): string => {
  const estimates = getEstimates();
  let maxNum = 0;
  for (const est of estimates) {
    const match = est.id.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : estimates.length + 1;
  return `EST-${nextNumber.toString().padStart(3, '0')}`;
};

export const getExpenses = (): Expense[] => {
  const data = localStorage.getItem(getStorageKey(EXPENSES_KEY));
  return data ? JSON.parse(data) : [];
};

export const saveExpenses = (expenses: Expense[]) => {
  const previousExpenses = getExpenses();
  const prevMap = new Map(previousExpenses.map(item => [item.id, item]));
  const currentIds = new Set(expenses.map(e => e.id));
  const targetId = getEffectiveTeamId();

  previousExpenses.forEach(prev => {
    if (!currentIds.has(prev.id) && targetId && targetId !== 'local') {
      enqueueSync(targetId, 'expenses', prev.id, 'delete');
    }
  });

  const now = Date.now();
  const stampedExpenses = expenses.map(exp => {
    const prev = prevMap.get(exp.id);
    const hasChanged = !prev || JSON.stringify(prev) !== JSON.stringify(exp);
    const updatedExp = hasChanged ? { ...exp, updatedAt: (exp as any).updatedAt || exp.timestamp || now } : exp;
    if (hasChanged && targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'expenses', exp.id, updatedExp).catch(console.warn);
    }
    return updatedExp;
  });

  localStorage.setItem(getStorageKey(EXPENSES_KEY), JSON.stringify(stampedExpenses));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'expenses' } }));
};

export const getSuppliers = (): Supplier[] => {
  const data = localStorage.getItem(getStorageKey(SUPPLIERS_KEY));
  return data ? JSON.parse(data) : [];
};

export const saveSuppliers = (suppliers: Supplier[]) => {
  const previousSuppliers = getSuppliers();
  const prevMap = new Map(previousSuppliers.map(item => [item.id, item]));
  const currentIds = new Set(suppliers.map(s => s.id));
  const targetId = getEffectiveTeamId();

  previousSuppliers.forEach(prev => {
    if (!currentIds.has(prev.id) && targetId && targetId !== 'local') {
      enqueueSync(targetId, 'suppliers', prev.id, 'delete');
    }
  });

  const now = Date.now();
  const stampedSuppliers = suppliers.map(sup => {
    const prev = prevMap.get(sup.id);
    const hasChanged = !prev || JSON.stringify(prev) !== JSON.stringify(sup);
    const updatedSup = hasChanged ? { ...sup, updatedAt: (sup as any).updatedAt || now } : sup;
    if (hasChanged && targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'suppliers', sup.id, updatedSup).catch(console.warn);
    }
    return updatedSup;
  });

  localStorage.setItem(getStorageKey(SUPPLIERS_KEY), JSON.stringify(stampedSuppliers));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'suppliers' } }));
};

export const getPurchases = (): Purchase[] => {
  const data = localStorage.getItem(getStorageKey(PURCHASES_KEY));
  return data ? JSON.parse(data) : [];
};

export const savePurchases = (purchases: Purchase[]) => {
  const previousPurchases = getPurchases();
  const prevMap = new Map(previousPurchases.map(item => [item.id, item]));
  const currentIds = new Set(purchases.map(p => p.id));
  const targetId = getEffectiveTeamId();

  previousPurchases.forEach(prev => {
    if (!currentIds.has(prev.id) && targetId && targetId !== 'local') {
      enqueueSync(targetId, 'purchases', prev.id, 'delete');
    }
  });

  const now = Date.now();
  const stampedPurchases = purchases.map(po => {
    const prev = prevMap.get(po.id);
    const hasChanged = !prev || JSON.stringify(prev) !== JSON.stringify(po);
    const updatedPo = hasChanged ? { ...po, updatedAt: (po as any).updatedAt || po.timestamp || now } : po;
    if (hasChanged && targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'purchases', po.id, updatedPo).catch(console.warn);
    }
    return updatedPo;
  });

  localStorage.setItem(getStorageKey(PURCHASES_KEY), JSON.stringify(stampedPurchases));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'purchases' } }));
};

export const getNextPurchaseId = (): string => {
  const purchases = getPurchases();
  let maxNum = 0;
  for (const po of purchases) {
    const match = po.id.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : purchases.length + 1;
  return `PO-${nextNumber.toString().padStart(3, '0')}`;
};

export const getChallans = (): DeliveryChallan[] => {
  const data = localStorage.getItem(getStorageKey(CHALLANS_KEY));
  if (!data) return [];
  return JSON.parse(data);
};

export const saveChallan = (challan: DeliveryChallan) => {
  const challans = getChallans();
  const stamped = { ...challan, updatedAt: (challan as any).updatedAt || challan.timestamp || Date.now() };
  const existingIdx = challans.findIndex(c => c.id === challan.id);
  if (existingIdx !== -1) {
    challans[existingIdx] = stamped;
  } else {
    challans.push(stamped);
  }
  localStorage.setItem(getStorageKey(CHALLANS_KEY), JSON.stringify(challans));
  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    syncDirectToFirestore(targetId, 'challans', challan.id, stamped).catch(console.warn);
  }
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'challans' } }));
};

export const getNextChallanId = (): string => {
  const challans = getChallans();
  let maxNum = 0;
  for (const chl of challans) {
    const match = chl.id.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : challans.length + 1;
  return `CHL-${nextNumber.toString().padStart(3, '0')}`;
};

export const getCustomers = (): CustomerRecord[] => {
  const data = localStorage.getItem(getStorageKey(CUSTOMERS_KEY));
  let savedCustomers: CustomerRecord[] = [];
  if (data) {
    try {
      savedCustomers = JSON.parse(data);
    } catch {
      // fallback
    }
  }

  // Synthesize from invoices and merge with saved customers
  const invoices = getInvoices();
  const map = new Map<string, CustomerRecord>();

  savedCustomers.forEach(c => {
    const key = (c.phone || c.name).trim().toLowerCase();
    if (key) {
      map.set(key, { ...c });
    }
  });

  invoices.forEach(inv => {
    if (inv.customerName || inv.customerPhone) {
      const key = (inv.customerPhone || inv.customerName).trim().toLowerCase();
      const existing = map.get(key);
      const isCredit = inv.paymentMode === 'Credit';
      const isPartial = inv.paymentMode === 'Partially Paid' || inv.paymentStatus === 'partial';
      const addedDue = isCredit ? (inv.amountDue ?? inv.total ?? 0) : (isPartial ? (inv.amountDue ?? 0) : 0);
      const total = (existing?.totalSpent || 0) + (inv.total || 0);
      const lastVisit = Math.max(existing?.lastVisit || 0, inv.timestamp || 0);
      const count = (existing?.invoiceCount || 0) + 1;
      const existingDue = existing?.balanceDue ?? 0;

      map.set(key, {
        id: existing?.id || `CUST-${map.size + 1}`,
        name: inv.customerName || existing?.name || 'Customer',
        phone: inv.customerPhone || existing?.phone || '',
        totalSpent: total,
        lastVisit,
        invoiceCount: count,
        balanceDue: existingDue + addedDue,
        latestInvoiceId: inv.timestamp === lastVisit ? inv.id : (existing?.latestInvoiceId || inv.id)
      });
    }
  });

  return Array.from(map.values());
};

export const saveCustomers = (customers: CustomerRecord[]) => {
  const now = Date.now();
  const targetId = getEffectiveTeamId();
  const stampedCustomers = customers.map(cust => {
    const stamped = { ...cust, updatedAt: (cust as any).updatedAt || now };
    if (cust.id && targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'customers', cust.id, stamped).catch(console.warn);
    }
    return stamped;
  });

  localStorage.setItem(getStorageKey(CUSTOMERS_KEY), JSON.stringify(stampedCustomers));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'customers' } }));
};

export const getLoans = (): Loan[] => {
  const data = localStorage.getItem(getStorageKey(LOANS_KEY));
  if (!data) return [];
  try {
    const loans: Loan[] = JSON.parse(data);
    return loans.map(l => ({
      ...l,
      repayments: Array.isArray(l.repayments) ? l.repayments : [],
      status: l.status || 'active'
    }));
  } catch {
    return [];
  }
};

export const saveLoan = (loan: Loan) => {
  const loans = getLoans();
  const stamped: Loan = {
    ...loan,
    repayments: loan.repayments || [],
    updatedAt: (loan as any).updatedAt || Date.now()
  };

  const existingIdx = loans.findIndex(l => l.id === loan.id);
  if (existingIdx !== -1) {
    loans[existingIdx] = stamped;
  } else {
    loans.push(stamped);
  }

  localStorage.setItem(getStorageKey(LOANS_KEY), JSON.stringify(loans));
  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    syncDirectToFirestore(targetId, 'loans', loan.id, stamped).catch(console.warn);
  }
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'loans' } }));
};

export const recordLoanRepayment = (
  loanId: string,
  repayment: LoanRepayment
): { updatedLoan: Loan; updatedInvoice?: Invoice } => {
  const loans = getLoans();
  const loanIndex = loans.findIndex(l => l.id === loanId);
  if (loanIndex === -1) {
    throw new Error('Loan not found');
  }

  const loan = loans[loanIndex];
  const updatedRepayments = [...(loan.repayments || []), repayment];
  const totalRepaid = updatedRepayments.reduce((sum, r) => sum + r.amount, 0);
  const isFullyRepaid = totalRepaid >= (loan.amount - 0.01);

  const updatedLoan: Loan = {
    ...loan,
    repayments: updatedRepayments,
    status: isFullyRepaid ? 'repaid' : 'active',
    updatedAt: Date.now()
  };

  saveLoan(updatedLoan);

  let updatedInvoice: Invoice | undefined;

  // If the loan was created from a bill balance, sync the repayment back to the bill
  if (updatedLoan.invoiceId) {
    const invoices = getInvoices();
    const inv = invoices.find(i => i.id === updatedLoan.invoiceId);
    if (inv) {
      // The original amount paid at bill creation time was inv.total - loan.amount
      const initialPaidAtBillCreation = Math.max(0, (inv.total || 0) - (loan.amount || 0));
      const currentPaid = initialPaidAtBillCreation + totalRepaid;
      const currentDue = Math.max(0, (inv.total || 0) - currentPaid);
      const isBillPaid = currentDue <= 0.01 || isFullyRepaid;

      updatedInvoice = {
        ...inv,
        amountPaid: currentPaid,
        amountDue: isBillPaid ? 0 : currentDue,
        paymentStatus: isBillPaid ? 'paid' : 'partial',
        updatedAt: Date.now()
      };

      saveInvoice(updatedInvoice);
    }
  }

  return { updatedLoan, updatedInvoice };
};

export const saveLoans = (loans: Loan[]) => {
  const previousLoans = getLoans();
  const currentIds = new Set(loans.map(l => l.id));
  const targetId = getEffectiveTeamId();

  previousLoans.forEach(prev => {
    if (!currentIds.has(prev.id) && targetId && targetId !== 'local') {
      enqueueSync(targetId, 'loans', prev.id, 'delete');
    }
  });

  const now = Date.now();
  const stampedLoans = loans.map(l => {
    const stamped = { ...l, updatedAt: (l as any).updatedAt || now };
    if (targetId && targetId !== 'local') {
      syncDirectToFirestore(targetId, 'loans', l.id, stamped).catch(console.warn);
    }
    return stamped;
  });

  localStorage.setItem(getStorageKey(LOANS_KEY), JSON.stringify(stampedLoans));
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'loans' } }));
};

export const deleteLoan = (id: string) => {
  const loans = getLoans().filter(l => l.id !== id);
  localStorage.setItem(getStorageKey(LOANS_KEY), JSON.stringify(loans));
  const targetId = getEffectiveTeamId();
  if (targetId && targetId !== 'local') {
    enqueueSync(targetId, 'loans', id, 'delete');
  }
  window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'loans' } }));
};

export const getNextLoanId = (): string => {
  const loans = getLoans();
  let maxNum = 0;
  for (const l of loans) {
    const match = l.id.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : loans.length + 1;
  return `LN-${nextNumber.toString().padStart(3, '0')}`;
};

export const exportAllData = () => {
  return {
    version: 1,
    exportedAt: Date.now(),
    profile: getProfile(),
    invoices: getInvoices(),
    catalog: getCatalog(),
    customers: getCustomers(),
    expenses: getExpenses(),
    estimates: getEstimates(),
    challans: getChallans(),
    suppliers: getSuppliers(),
    purchases: getPurchases(),
    loans: getLoans()
  };
};

export const importAllData = (data: any) => {
  if (!data || typeof data !== 'object') return;
  if (data.profile) saveProfile(data.profile);
  if (data.invoices && Array.isArray(data.invoices)) {
    data.invoices.forEach((inv: Invoice) => saveInvoice(inv));
  }
  if (data.catalog) saveCatalog(data.catalog);
  if (data.customers) saveCustomers(data.customers);
  if (data.expenses) saveExpenses(data.expenses);
  if (data.estimates && Array.isArray(data.estimates)) {
    data.estimates.forEach((est: Estimate) => saveEstimate(est));
  }
  if (data.challans && Array.isArray(data.challans)) {
    data.challans.forEach((chl: DeliveryChallan) => saveChallan(chl));
  }
  if (data.suppliers) saveSuppliers(data.suppliers);
  if (data.purchases) savePurchases(data.purchases);
  if (data.loans && Array.isArray(data.loans)) {
    saveLoans(data.loans);
  }
};
