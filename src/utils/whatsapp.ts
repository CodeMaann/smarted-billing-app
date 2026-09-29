/**
 * WhatsApp integration utilities for bills and payment reminders.
 * Direct wa.me deep linking without third-party API dependencies.
 */
import { Invoice, Estimate, DeliveryChallan, BusinessProfile } from '../types';

/**
 * Cleans and standardizes phone number for WhatsApp wa.me links.
 * Normalizes 10-digit Indian phone numbers with country code 91.
 */
export const cleanPhoneNumber = (phone?: string): string => {
  if (!phone) return '';
  // Remove non-digit characters
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // 10-digit Indian mobile number
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // 11 digits starting with 0 (e.g., 09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }

  // Already includes country code or international format
  return digits;
};

/**
 * Encodes bill & shop profile into a URL-safe compact string
 * so customers can view their bill without needing a login.
 */
export const encodeBillToUrl = (
  invoice: Invoice | Estimate | DeliveryChallan,
  profile: BusinessProfile
): string => {
  try {
    const minified = {
      i: invoice,
      p: {
        shopName: profile.shopName,
        phone: profile.phone,
        address: profile.address,
        gstin: profile.gstin,
        upiId: profile.upiId,
      }
    };
    const jsonStr = JSON.stringify(minified);
    return btoa(encodeURIComponent(jsonStr));
  } catch {
    return '';
  }
};

export const decodeBillFromUrl = (
  b64: string
): { invoice: Invoice | Estimate | DeliveryChallan; profile: BusinessProfile } | null => {
  try {
    const jsonStr = decodeURIComponent(atob(b64));
    const data = JSON.parse(jsonStr);
    if (data && data.i) {
      return {
        invoice: data.i,
        profile: data.p || {}
      };
    }
  } catch {
    // fallback
  }
  return null;
};

/**
 * Formats a professional WhatsApp text message for an invoice, estimate, or challan.
 */
export const generateBillWhatsAppMessage = (
  invoice: Invoice | Estimate | DeliveryChallan,
  profile: BusinessProfile,
  originUrl?: string
): string => {
  const isEstimate = invoice.id.startsWith('EST-');
  const isChallan = invoice.id.startsWith('CHL-');
  const docTitle = isEstimate ? 'ESTIMATE / QUOTATION' : isChallan ? 'DELIVERY CHALLAN' : 'TAX INVOICE';
  
  const shopName = profile.shopName || 'Our Store';
  const customerName = invoice.customerName || 'Valued Customer';
  const dateFormatted = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(invoice.timestamp);

  const itemsList = (invoice.items || [])
    .map(item => `• ${item.name} × ${item.quantity} = ₹${(item.rate * item.quantity).toFixed(2)}`)
    .join('\n');

  const baseOrigin = originUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const encodedPayload = encodeBillToUrl(invoice, profile);
  const digitalLink = baseOrigin 
    ? `${baseOrigin}/?bill=${encodeURIComponent(invoice.id)}${encodedPayload ? `&bdata=${encodeURIComponent(encodedPayload)}` : ''}` 
    : '';

  const lines: string[] = [
    `🧾 *${docTitle}*`,
    `🏪 *${shopName}*`,
    `━━━━━━━━━━━━━━━━━━`,
    `*Bill No:* ${invoice.id}`,
    `*Date:* ${dateFormatted}`,
    `*Customer:* ${customerName}`,
    ...(invoice.customerPhone ? [`*Phone:* ${invoice.customerPhone}`] : []),
    `━━━━━━━━━━━━━━━━━━`,
    `*Items:*`,
    itemsList || '• General Merchandise',
    `━━━━━━━━━━━━━━━━━━`,
    `*Subtotal:* ₹${invoice.subtotal.toFixed(2)}`,
  ];

  if (invoice.discountAmount && invoice.discountAmount > 0) {
    lines.push(`*Discount:* -₹${invoice.discountAmount.toFixed(2)}`);
  }

  if (invoice.applyGst) {
    const totalGst = (invoice.cgst || 0) + (invoice.sgst || 0);
    lines.push(`*GST:* ₹${totalGst.toFixed(2)}`);
  }

  lines.push(`*GRAND TOTAL:* ₹${invoice.total.toFixed(2)}`);

  if (invoice.paymentStatus === 'partial' || invoice.paymentMode === 'Partially Paid') {
    lines.push(`*Payment Status:* PARTIALLY PAID`);
    lines.push(`*Amount Paid:* ₹${(invoice.amountPaid ?? 0).toFixed(2)}`);
    lines.push(`*Balance Due:* ₹${(invoice.amountDue ?? 0).toFixed(2)}`);
    if (invoice.expectedRepaymentDate) {
      lines.push(`*Repayment Expected By:* ${invoice.expectedRepaymentDate}`);
    }
  } else if ('paymentMode' in invoice && invoice.paymentMode) {
    lines.push(`*Payment Mode:* ${invoice.paymentMode}`);
  }

  if (profile.upiId) {
    const isPartial = (invoice.paymentStatus === 'partial' || invoice.paymentMode === 'Partially Paid');
    const remainingDue = (invoice.amountDue !== undefined && invoice.amountDue > 0) ? invoice.amountDue : invoice.total;
    if (isPartial && (invoice.amountDue ?? 0) > 0) {
      lines.push(`\n💳 *Pay Balance via UPI:* ${profile.upiId} (Amount: ₹${remainingDue.toFixed(2)})`);
    } else {
      lines.push(`\n💳 *Pay via UPI:* ${profile.upiId}`);
    }
  }

  if (digitalLink) {
    lines.push(`\n📄 *View/Print Digital Bill:*`);
    lines.push(digitalLink);
  }

  lines.push(`\nThank you for your business! 🙏`);
  if (profile.phone) lines.push(`📞 Help: ${profile.phone}`);
  if (profile.address) lines.push(`📍 ${profile.address.replace(/\n/g, ', ')}`);

  return lines.join('\n');
};

/**
 * Formats a courteous, professional payment reminder WhatsApp message.
 */
export const generatePaymentReminderWhatsAppMessage = (
  customerName: string,
  amountDue: number,
  profile: BusinessProfile,
  latestInvoiceId?: string,
  originUrl?: string,
  latestInvoice?: Invoice
): string => {
  const shopName = profile.shopName || 'Our Store';
  const baseOrigin = originUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  let digitalLink = '';
  if (latestInvoice && baseOrigin) {
    const encodedPayload = encodeBillToUrl(latestInvoice, profile);
    digitalLink = `${baseOrigin}/?bill=${encodeURIComponent(latestInvoice.id)}${encodedPayload ? `&bdata=${encodeURIComponent(encodedPayload)}` : ''}`;
  } else if (latestInvoiceId && baseOrigin) {
    digitalLink = `${baseOrigin}/?bill=${encodeURIComponent(latestInvoiceId)}`;
  }

  const lines: string[] = [
    `🔔 *PAYMENT REMINDER*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Dear *${customerName || 'Customer'}*,`,
    ``,
    `Warm greetings from *${shopName}*!`,
    ``,
    `This is a gentle reminder regarding your outstanding bill amount:`,
    `💰 *Balance Due:* ₹${amountDue.toFixed(2)}`,
    ...(latestInvoiceId ? [`📄 *Bill Reference:* ${latestInvoiceId}`] : []),
    ``,
    `Kindly arrange for the payment at your earliest convenience.`,
  ];

  if (profile.upiId) {
    lines.push(`💳 *Pay directly via UPI ID:* ${profile.upiId}`);
  }

  if (digitalLink) {
    lines.push(`\n📄 *View Bill Online:* ${digitalLink}`);
  }

  lines.push(``);
  lines.push(`If you have already made the payment, please disregard this message.`);
  lines.push(`Thank you for your valued support! 🙏`);
  lines.push(`*${shopName}*`);
  if (profile.phone) lines.push(`📞 Contact: ${profile.phone}`);

  return lines.join('\n');
};

/**
 * Formats a polite, professional reminder for a cash loan repayment.
 */
export const generateLoanReminderWhatsAppMessage = (
  borrowerName: string,
  loanAmount: number,
  remainingAmount: number,
  expectedRepaymentDate: string,
  dateGiven: number,
  profile: BusinessProfile,
  dueStatusText?: string,
  invoiceId?: string,
  source?: string
): string => {
  const shopName = profile.shopName || 'Our Shop';
  const isBillBalance = source === 'Bill balance' || Boolean(invoiceId);
  const givenDateStr = new Date(dateGiven).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  
  let dueDateStr = expectedRepaymentDate;
  try {
    const [y, m, d] = expectedRepaymentDate.split('-').map(Number);
    if (y && m && d) {
      dueDateStr = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  } catch {}

  const headerTitle = isBillBalance 
    ? `🧾 *BILL BALANCE REPAYMENT REMINDER*` 
    : `🤝 *LOAN REPAYMENT REMINDER*`;

  const contextText = isBillBalance
    ? `This is a gentle reminder regarding the unpaid balance of ₹${remainingAmount.toFixed(2)} for Bill #${invoiceId || ''} dated ${givenDateStr}.`
    : `This is a gentle reminder regarding the cash loan given to you on ${givenDateStr}.`;

  const lines: string[] = [
    headerTitle,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Dear *${borrowerName || 'Customer'}*,`,
    ``,
    `Greetings from *${shopName}*!`,
    ``,
    contextText,
    ``,
    ...(isBillBalance && invoiceId ? [`🧾 *Invoice No:* ${invoiceId}`] : []),
    `💵 *Original ${isBillBalance ? 'Bill Balance' : 'Loan Amount'}:* ₹${loanAmount.toFixed(2)}`,
    `💰 *Remaining Outstanding:* ₹${remainingAmount.toFixed(2)}`,
    `📅 *Expected Repayment Date:* ${dueDateStr}${dueStatusText ? ` (${dueStatusText})` : ''}`,
    ``,
    `Kindly arrange for the repayment of the remaining balance at your earliest convenience.`
  ];

  if (profile.upiId) {
    lines.push(`\n💳 *Pay via UPI:* ${profile.upiId}`);
  }

  lines.push(``);
  lines.push(`If you have already settled this amount, please let us know to update the record.`);
  lines.push(`Thank you for your cooperation! 🙏`);
  lines.push(`*${shopName}*`);
  if (profile.phone) lines.push(`📞 Contact: ${profile.phone}`);

  return lines.join('\n');
};

/**
 * Opens WhatsApp Web or mobile application via a pre-filled wa.me deep link.
 * Uses a safe link element click without window.open or window.alert.
 */
export const openWhatsApp = ({
  phone,
  message
}: {
  phone?: string;
  message: string;
}) => {
  const cleaned = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  
  const url = cleaned
    ? `https://wa.me/${cleaned}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
