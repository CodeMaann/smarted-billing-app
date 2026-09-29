export interface BusinessProfile {
  shopName: string;
  address: string;
  phone: string;
  gstin: string;
  logoDataUrl?: string;
  signatureDataUrl?: string;
  defaultGstRate: number;
  pinCode?: string;
  upiId?: string;
  termsText?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  rate: number;
  costPrice: number;
  gstRate: number;
  hsnCode: string;
  stock: number;
  lowStockThreshold: number;
  barcode?: string;
  isTaxInclusive?: boolean;
}

export interface InvoiceItem {
  id: string;
  catalogId?: string;
  name: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  costAmount: number;
  amount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  isTaxInclusive?: boolean;
}

export interface Expense {
  id: string;
  timestamp: number;
  amount: number;
  description: string;
  category: 'Rent' | 'Electricity' | 'Salaries' | 'Transport' | 'Other';
  isRecurring: boolean;
  recurringFrequency?: 'monthly' | 'yearly';
  createdBy?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalPurchased: number;
  amountPaid: number;
  balanceDue: number;
}

export interface PurchaseItem {
  id: string;
  catalogId?: string;
  name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Purchase {
  id: string;
  timestamp: number;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  totalAmount: number;
  amountPaid: number;
  paymentStatus: 'Paid' | 'Unpaid' | 'Partial';
  paymentMode?: PaymentMode;
  createdBy?: string;
}

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'payment_failed';

export type UserRole = 'owner' | 'staff';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  ownerId?: string; // If staff, points to the owner's ID
  account_created_date: number;
  trial_start_date: number;
  subscription_status: SubscriptionStatus;
}

export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Credit' | 'Partially Paid';

export interface CustomerRecord {
  id?: string;
  name: string;
  phone?: string;
  totalSpent?: number;
  lastVisit?: number;
  balanceDue?: number;
  invoiceCount?: number;
  latestInvoiceId?: string;
}

export interface Estimate {
  id: string;
  timestamp: number;
  customerName: string;
  customerPhone: string;
  paymentMode?: PaymentMode;
  items: InvoiceItem[];
  applyGst: boolean;
  gstRate: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  gstBreakup?: GstBreakup;
  discountType?: 'flat' | 'percentage';
  discountValue?: number;
  discountAmount?: number;
  convertedToInvoiceId?: string;
  createdBy?: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  amountPaid?: number;
  amountDue?: number;
  expectedRepaymentDate?: string;
  loanId?: string;
}


export interface DeliveryChallan {
  id: string;
  timestamp: number;
  customerName: string;
  customerPhone: string;
  paymentMode?: PaymentMode;
  deliveryAddress?: string;
  vehicleDetails?: string;
  status: 'Pending' | 'Delivered';
  items: InvoiceItem[];
  applyGst: boolean;
  gstRate: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  gstBreakup?: GstBreakup;
  discountType?: 'flat' | 'percentage';
  discountValue?: number;
  discountAmount?: number;
  convertedToInvoiceId?: string;
  createdBy?: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  amountPaid?: number;
  amountDue?: number;
  expectedRepaymentDate?: string;
  loanId?: string;
}

export interface GstBreakup {
  [rate: number]: {
    taxableAmount: number;
    cgst: number;
    sgst: number;
  }
}

export interface Invoice {
  id: string;
  timestamp: number;
  customerName: string;
  customerPhone: string;
  paymentMode: PaymentMode;
  items: InvoiceItem[];
  applyGst: boolean;
  gstRate: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  gstBreakup?: GstBreakup;
  discountType?: 'flat' | 'percentage';
  discountValue?: number;
  discountAmount?: number;
  createdBy?: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  amountPaid?: number;
  amountDue?: number;
  loanId?: string;
  expectedRepaymentDate?: string;
  updatedAt?: number;
}

export interface CloudBackup {
  id?: string;
  timestamp: number;
  ownerId: string;
  data: any;
}

export interface LoanRepayment {
  id: string;
  date: number;
  amount: number;
  note?: string;
}

export interface Loan {
  id: string;
  borrowerName: string;
  phone: string;
  amount: number;
  dateGiven: number;
  expectedRepaymentDate: string;
  note?: string;
  repayments: LoanRepayment[];
  status: 'active' | 'repaid';
  updatedAt: number;
  createdBy?: string;
  source?: 'Bill balance' | 'Cash loan' | 'Direct loan';
  invoiceId?: string;
}

