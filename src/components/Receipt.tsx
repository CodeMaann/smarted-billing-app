import { Invoice, Estimate, DeliveryChallan, BusinessProfile } from '../types';
import { Printer, Share2, ArrowLeft, X } from 'lucide-react';
import { useRef, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import QRCode from 'react-qr-code';
import { generateBillWhatsAppMessage, openWhatsApp } from '../utils/whatsapp';

interface ReceiptViewProps {
  invoice: Invoice | Estimate | DeliveryChallan;
  profile: BusinessProfile;
  onBack: () => void;
}

export function ReceiptView({ invoice, profile, onBack }: ReceiptViewProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [customPhone, setCustomPhone] = useState(invoice.customerPhone || '');
  const [statusMsg, setStatusMsg] = useState('');

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (invoice.customerPhone && invoice.customerPhone.trim()) {
      const msg = generateBillWhatsAppMessage(invoice, profile);
      openWhatsApp({ phone: invoice.customerPhone, message: msg });
      setStatusMsg('Opening WhatsApp...');
      setTimeout(() => setStatusMsg(''), 3000);
    } else {
      setShowPhoneModal(true);
    }
  };

  const handleSendWhatsAppWithPhone = (phoneToSend?: string) => {
    const msg = generateBillWhatsAppMessage(invoice, profile);
    openWhatsApp({ phone: phoneToSend || customPhone, message: msg });
    setShowPhoneModal(false);
    setStatusMsg('Opening WhatsApp...');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleShare = async () => {
    if (!receiptRef.current) return;
    try {
      setStatusMsg('Generating PDF...');
      const element = receiptRef.current;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 850,
        onclone: (clonedDoc) => {
          // Hide any overlays or print-hidden elements
          const printHiddenElements = clonedDoc.querySelectorAll('.print\\:hidden');
          printHiddenElements.forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });

          const clonedEl = clonedDoc.getElementById('printable-receipt');
          if (clonedEl) {
            // Remove parent constraints in clone to avoid any clipping
            let parent = clonedEl.parentElement;
            while (parent && parent !== clonedDoc.body) {
              parent.style.maxWidth = 'none';
              parent.style.width = '100%';
              parent.style.padding = '0';
              parent.style.margin = '0';
              parent = parent.parentElement;
            }

            // Set standard A4 desktop width (800px) so two-column layout is triggered reliably
            clonedEl.style.width = '800px';
            clonedEl.style.maxWidth = '800px';
            clonedEl.style.minWidth = '800px';
            clonedEl.style.margin = '0 auto';
            clonedEl.style.height = 'auto';
            clonedEl.style.maxHeight = 'none';
            clonedEl.style.overflow = 'visible';
            clonedEl.style.boxShadow = 'none';
            clonedEl.style.border = 'none';
            clonedEl.style.borderRadius = '0';
          }

          // Replace any unsupported oklch color strings if found
          const elements = clonedDoc.querySelectorAll('*');
          elements.forEach((node) => {
            const el = node as HTMLElement;
            if (el.style) {
              const comp = window.getComputedStyle(el);
              if (comp.color && comp.color.includes('oklch')) {
                el.style.color = '#0f172a';
              }
              if (comp.backgroundColor && comp.backgroundColor.includes('oklch')) {
                el.style.backgroundColor = '#ffffff';
              }
              if (comp.borderColor && comp.borderColor.includes('oklch')) {
                el.style.borderColor = '#e2e8f0';
              }
            }
          });
        }
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfPageWidth = 210; // A4 width in mm
      const pdfPageHeight = 297; // A4 height in mm

      // Height in canvas pixels that corresponds to one full A4 page (297mm)
      const pageHeightInCanvasPx = (canvas.width * pdfPageHeight) / pdfPageWidth;
      const totalCanvasHeight = canvas.height;

      // Allow a small threshold (up to 8% overflow, e.g. partially paid rows on standard receipts)
      // to scale gently and fit on 1 pristine page without an awkward 2nd page containing only a signature.
      const singlePageThreshold = pageHeightInCanvasPx * 1.08;

      if (totalCanvasHeight <= singlePageThreshold) {
        // Fits on a single A4 page
        const scale = totalCanvasHeight > pageHeightInCanvasPx 
          ? (pageHeightInCanvasPx - 8 * (canvas.width / pdfPageWidth)) / totalCanvasHeight 
          : 1;
        const renderedWidth = pdfPageWidth * scale;
        const renderedHeight = ((totalCanvasHeight * pdfPageWidth) / canvas.width) * scale;
        const xOffset = (pdfPageWidth - renderedWidth) / 2;
        const yOffset = 0;

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, yOffset, renderedWidth, renderedHeight);
      } else {
        // Multi-page invoice (e.g. 10+ line items)
        const totalPages = Math.ceil(totalCanvasHeight / pageHeightInCanvasPx);

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
          if (pageIndex > 0) {
            pdf.addPage('a4', 'portrait');
          }

          const srcY = pageIndex * pageHeightInCanvasPx;
          const sliceHeight = Math.min(pageHeightInCanvasPx, totalCanvasHeight - srcY);

          // Create temporary slice canvas
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = pageHeightInCanvasPx;
          const sliceCtx = sliceCanvas.getContext('2d');

          if (sliceCtx) {
            sliceCtx.fillStyle = '#ffffff';
            sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            sliceCtx.drawImage(
              canvas,
              0, srcY, canvas.width, sliceHeight,
              0, 0, canvas.width, sliceHeight
            );
          }

          const sliceData = sliceCanvas.toDataURL('image/png');
          pdf.addImage(sliceData, 'PNG', 0, 0, pdfPageWidth, pdfPageHeight);

          // Add subtle page numbers in the footer
          pdf.setFontSize(8);
          pdf.setTextColor(148, 163, 184); // slate-400
          pdf.text(`Page ${pageIndex + 1} of ${totalPages}`, pdfPageWidth - 25, pdfPageHeight - 4);
        }
      }

      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `${invoice.id}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoice.id}`,
          text: `Here is your invoice from ${profile.shopName}`,
        });
        setStatusMsg('PDF shared successfully.');
        setTimeout(() => setStatusMsg(''), 3000);
      } else {
        // Fallback to direct download
        pdf.save(`${invoice.id}.pdf`);
        setStatusMsg('PDF saved to downloads.');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
      setStatusMsg('Could not generate PDF.');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-2xl mx-auto bg-slate-50 min-h-screen print:bg-white print:p-0 print:m-0 print:max-w-full print:w-full">
      {statusMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-fade-in print:hidden">
          {statusMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-6 print:hidden">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:text-slate-900 active:bg-slate-200 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {/* WhatsApp Share Button */}
          <button
            onClick={handleWhatsAppShare}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#25D366] text-white rounded-lg text-sm font-bold hover:bg-[#20bd5a] active:scale-[0.98] shadow-sm transition-all"
            title="Share bill on WhatsApp"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
            </svg>
            Share on WhatsApp
          </button>

          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 active:bg-slate-100 shadow-sm transition-all">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={handleShare} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:scale-[0.98] shadow-sm transition-all">
            <Share2 className="w-4 h-4" /> Share
          </button>
        </div>
      </div>

      {/* WhatsApp Phone Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366]">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.766.001-3.182-2.586-5.768-5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-900 text-base">Share on WhatsApp</h3>
              </div>
              <button onClick={() => setShowPhoneModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Enter customer's WhatsApp mobile number, or open WhatsApp to choose any contact.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Customer WhatsApp Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/40"
                  autoFocus
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  onClick={() => handleSendWhatsAppWithPhone(customPhone)}
                  className="w-full py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.53 1.761.815 2.796.815 3.178 0 5.767-2.587 5.768-5.768zm0 10.37c-.887 0-1.636-.25-2.348-.68l-.168-.1-1.745.458.466-1.701-.111-.176c-.47-.747-.718-1.558-.717-2.404.001-2.54 2.068-4.607 4.613-4.607 2.544 0 4.612 2.067 4.613 4.608-.001 2.54-2.069 4.602-4.602 4.602zm7.042-4.604c-.004-3.882-3.161-7.039-7.042-7.039-3.883 0-7.042 3.159-7.044 7.042-.001 1.242.324 2.455.94 3.523l-1.001 3.655 3.743-.982c1.026.56 2.181.856 3.362.857h.003c3.881 0 7.04-3.159 7.042-7.042l-.003-.014z" />
                  </svg>
                  Send to this Number
                </button>

                <button
                  onClick={() => handleSendWhatsAppWithPhone('')}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
                >
                  Choose Contact in WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div 
        ref={receiptRef}
        id="printable-receipt"
        className="bg-white p-6 sm:p-10 rounded-2xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:rounded-none"
      >
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-800 pb-6 mb-6">
          <div className="flex flex-col">
            {profile.logoDataUrl && (
              <img src={profile.logoDataUrl} alt="Logo" className="h-16 w-auto mb-4 object-contain self-start" />
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">{profile.shopName || 'Shop Name'}</h1>
            <p className="text-sm text-slate-600 whitespace-pre-wrap mt-1 max-w-xs leading-relaxed">{profile.address}</p>
            {profile.phone && <p className="text-sm text-slate-600 mt-1">Ph: <span className="font-medium text-slate-800">{profile.phone}</span></p>}
            {profile.gstin && <p className="text-sm text-slate-600 mt-1">GSTIN: <span className="font-bold text-slate-800 tracking-wider uppercase">{profile.gstin}</span></p>}
          </div>
          <div className="mt-6 sm:mt-0 text-left sm:text-right">
            <h2 className="text-3xl font-black text-slate-200 uppercase tracking-widest mb-2 print:text-slate-300 print:color-adjust-exact">
              {invoice.id.startsWith('EST-') ? 'ESTIMATE' : invoice.id.startsWith('CHL-') ? 'DELIVERY CHALLAN' : 'INVOICE'}
            </h2>
            <div className="text-sm space-y-1">
              <p className="text-slate-500">
                {invoice.id.startsWith('EST-') ? 'Estimate No:' : invoice.id.startsWith('CHL-') ? 'Challan No:' : 'Invoice No:'} <span className="font-bold text-slate-900">{invoice.id}</span>
              </p>
              <p className="text-slate-500">Date: <span className="font-bold text-slate-900">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(invoice.timestamp)}</span></p>
              <p className="text-slate-500">Time: <span className="font-bold text-slate-900">{new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(invoice.timestamp)}</span></p>
            </div>
          </div>
        </div>

        {/* Customer & Bill Info */}
        <div className="flex justify-between items-start mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100 print:bg-transparent print:border-none print:p-0 print:mb-6">
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              {invoice.id.startsWith('CHL-') ? 'Delivered To' : 'Billed To'}
            </p>
            {(invoice.customerName || invoice.customerPhone) ? (
              <>
                <p className="font-bold text-slate-900 text-base">{invoice.customerName || 'Customer'}</p>
                {invoice.customerPhone && <p className="text-sm font-medium text-slate-600">{invoice.customerPhone}</p>}
              </>
            ) : (
              <p className="font-bold text-slate-900 text-base">Walk-in Customer</p>
            )}
            
            {invoice.id.startsWith('CHL-') && ('deliveryAddress' in invoice || 'vehicleDetails' in invoice) && (
              <div className="mt-2 text-sm text-slate-600 space-y-1">
                {('deliveryAddress' in invoice && invoice.deliveryAddress) && (
                  <p><span className="font-semibold text-slate-500">Address:</span> {invoice.deliveryAddress}</p>
                )}
                {('vehicleDetails' in invoice && invoice.vehicleDetails) && (
                  <p><span className="font-semibold text-slate-500">Vehicle:</span> {invoice.vehicleDetails}</p>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
               {invoice.id.startsWith('EST-') ? 'Status' : invoice.id.startsWith('CHL-') ? 'Status' : 'Payment Status'}
             </p>
             <div className="flex flex-col items-end gap-1">
               {(invoice.paymentStatus === 'partial' || invoice.paymentMode === 'Partially Paid') ? (
                 <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 rounded-md text-xs font-black tracking-wider uppercase border border-amber-300 shadow-sm print:bg-transparent print:border-slate-800 print:text-slate-900">
                   {(invoice.amountDue ?? 0) <= 0.01 ? 'PARTIALLY PAID (CLEARED)' : 'PARTIALLY PAID'}
                 </span>
               ) : (
                 <div className="inline-block px-3 py-1 bg-white rounded text-sm font-bold text-slate-800 border border-slate-200 shadow-sm print:shadow-none print:border-slate-300">
                   {invoice.id.startsWith('EST-') ? 'Quotation' : invoice.id.startsWith('CHL-') ? ('status' in invoice ? invoice.status : 'Pending') : ('paymentMode' in invoice ? invoice.paymentMode : 'N/A')}
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* Itemized Table */}
        <table className="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white print:bg-slate-200 print:text-slate-900 print:color-adjust-exact">
              <th className="py-2.5 px-3 text-left font-bold rounded-tl-lg print:rounded-none">Item Description</th>
              <th className="py-2.5 px-3 text-left font-bold w-16 hidden sm:table-cell">HSN</th>
              <th className="py-2.5 px-3 text-center font-bold w-12">Qty</th>
              <th className="py-2.5 px-3 text-right font-bold w-20">Rate</th>
              {invoice.applyGst && <th className="py-2.5 px-3 text-right font-bold w-14">GST%</th>}
              <th className="py-2.5 px-3 text-right font-bold w-28 rounded-tr-lg print:rounded-none">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 border-b border-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="even:bg-slate-50/50 print:even:bg-transparent">
                <td className="py-3 px-3 text-slate-900 font-medium">
                  {item.name} {item.isTaxInclusive && <span className="ml-1 text-[9px] bg-slate-200 text-slate-700 px-1 py-0.5 rounded uppercase font-bold tracking-wide print:bg-transparent print:border print:border-slate-300">MRP</span>}
                  <div className="sm:hidden text-xs text-slate-500 font-normal mt-0.5">HSN: {item.hsnCode || '-'}</div>
                </td>
                <td className="py-3 px-3 text-left text-slate-500 text-xs hidden sm:table-cell">{item.hsnCode || '-'}</td>
                <td className="py-3 px-3 text-center text-slate-900 font-medium">{item.quantity}</td>
                <td className="py-3 px-3 text-right text-slate-900 tabular-nums">₹{item.rate.toFixed(2)}</td>
                {invoice.applyGst && <td className="py-3 px-3 text-right text-slate-500 text-xs">{item.gstRate}%</td>}
                <td className="py-3 px-3 text-right text-slate-900 font-bold tabular-nums">₹{item.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 mb-8 border-b border-slate-200 pb-8">
          <div className="w-full sm:w-1/2 order-2 sm:order-1">
            {invoice.applyGst && invoice.gstBreakup && Object.keys(invoice.gstBreakup).length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs shadow-sm print:shadow-none">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 print:bg-slate-100 print:color-adjust-exact">
                    <tr>
                      <th className="py-1.5 px-2 font-bold">GST%</th>
                      <th className="py-1.5 px-2 font-bold text-right">Taxable</th>
                      <th className="py-1.5 px-2 font-bold text-right">CGST</th>
                      <th className="py-1.5 px-2 font-bold text-right">SGST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(invoice.gstBreakup).map(([rate, vals]) => (
                      <tr key={rate}>
                        <td className="py-1.5 px-2 text-slate-900 font-bold">{rate}%</td>
                        <td className="py-1.5 px-2 text-slate-700 text-right tabular-nums">₹{vals.taxableAmount.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-slate-700 text-right tabular-nums">₹{vals.cgst.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-slate-700 text-right tabular-nums">₹{vals.sgst.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="w-full sm:w-1/2 space-y-2 text-sm order-1 sm:order-2 ml-auto sm:max-w-xs">
            <div className="flex justify-between text-slate-600 px-2">
              <span className="font-medium">Subtotal</span>
              <span className="tabular-nums font-semibold text-slate-900">₹{invoice.subtotal.toFixed(2)}</span>
            </div>

            {(invoice.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-emerald-600 px-2">
                <span className="font-medium">Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}</span>
                <span className="tabular-nums font-bold">-₹{invoice.discountAmount!.toFixed(2)}</span>
              </div>
            )}

            {invoice.applyGst && (
              <>
                <div className="flex justify-between text-slate-600 px-2">
                  <span className="font-medium">Total CGST</span>
                  <span className="tabular-nums">₹{invoice.cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 px-2">
                  <span className="font-medium">Total SGST</span>
                  <span className="tabular-nums">₹{invoice.sgst.toFixed(2)}</span>
                </div>
              </>
            )}
            
            <div className="flex justify-between items-center text-xl font-black text-slate-900 bg-slate-100 p-3 rounded-xl mt-3 print:bg-transparent print:border-y-2 print:border-slate-800 print:rounded-none print:color-adjust-exact">
              <span>Grand Total</span>
              <span className="tabular-nums">₹{invoice.total.toFixed(2)}</span>
            </div>

            {(invoice.paymentStatus === 'partial' || invoice.paymentMode === 'Partially Paid' || invoice.amountDue !== undefined) && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="flex justify-between text-slate-700 px-2 font-semibold">
                  <span>Amount Paid</span>
                  <span className="tabular-nums text-emerald-700 font-bold">
                    ₹{(invoice.amountPaid ?? invoice.total).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-amber-950 font-bold print:bg-transparent print:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span>Balance Due</span>
                    {(invoice.amountDue ?? 0) > 0 && (
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300 print:hidden">
                        PARTIALLY PAID
                      </span>
                    )}
                  </div>
                  <span className="tabular-nums text-base font-black text-amber-800 print:text-slate-900">
                    ₹{(invoice.amountDue ?? 0).toFixed(2)}
                  </span>
                </div>
                {invoice.expectedRepaymentDate && (invoice.amountDue ?? 0) > 0 && (
                  <div className="text-right text-[11px] font-semibold text-slate-500 px-2">
                    Repayment due by: {invoice.expectedRepaymentDate}
                  </div>
                )}
              </div>
            )}
            
            <div className="text-right text-xs font-semibold text-slate-500 mt-1 uppercase tracking-widest px-2">
              {/* Note: numberToWords could go here in future */}
            </div>
          </div>
        </div>

        {/* Footer (QR, Terms, Signature) */}
        <div className="flex flex-col sm:flex-row justify-between items-end gap-8 pt-4">
          <div className="flex flex-col gap-4 w-full sm:w-2/3">
            {profile.upiId && (() => {
              const isPartial = (invoice.paymentStatus === 'partial' || invoice.paymentMode === 'Partially Paid');
              const remainingDue = invoice.amountDue !== undefined ? invoice.amountDue : invoice.total;
              const qrAmount = (isPartial && remainingDue > 0) ? remainingDue : invoice.total;

              return (
                <div className="flex items-start gap-4 p-3 border border-slate-200 rounded-xl bg-slate-50 w-fit print:border-slate-300 print:bg-transparent print:color-adjust-exact">
                  <div className="bg-white p-1 rounded-lg border border-slate-200 shrink-0">
                    <QRCode 
                      value={`upi://pay?pa=${profile.upiId}&pn=${encodeURIComponent(profile.shopName)}&am=${qrAmount.toFixed(2)}&cu=INR`} 
                      size={64}
                      level="L"
                    />
                  </div>
                  <div className="py-1">
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-0.5">
                      {isPartial && remainingDue > 0 ? 'Pay Balance via UPI' : 'Pay via UPI'}
                    </p>
                    <p className="text-xs text-slate-600 font-medium">{profile.upiId}</p>
                    {isPartial && remainingDue > 0 && (
                      <p className="text-xs font-black text-amber-700 mt-0.5">Balance: ₹{qrAmount.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              );
            })()}
            
            <div className="text-xs text-slate-500">
              <p className="font-bold text-slate-700 uppercase tracking-wider mb-1">Terms & Conditions</p>
              <p className="whitespace-pre-wrap leading-relaxed">{profile.termsText || 'Goods once sold will not be taken back.'}</p>
            </div>
          </div>

          <div className="w-48 text-center flex-shrink-0 ml-auto flex flex-col items-center justify-end">
            {profile.signatureDataUrl ? (
              <div className="h-16 flex items-end justify-center w-full pb-1">
                <img
                  src={profile.signatureDataUrl}
                  alt="Authorized Signature"
                  className="max-h-14 max-w-[180px] object-contain"
                />
              </div>
            ) : (
              <div className="h-14" />
            )}
            <div className="w-full border-t border-slate-800 pt-1.5 text-xs font-bold text-slate-800">
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
