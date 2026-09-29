# Smarted Billing System

**Smart Retail Billing & Inventory — built for Indian shops, on any device.**

A mobile-first, installable billing and business management app designed for small and mid-sized Indian retailers — created to run from a phone at the counter just as well as from a computer in the back office, fully GST-compliant, and usable offline.

🔗 **Live App:** 

---

## Features

### Billing & Invoicing
- Fast item entry with numeric keypad-style inputs, built for one-handed counter use
- Automatic GST calculation with per-item CGST/SGST breakup, toggleable per bill
- MRP (tax-inclusive) billing mode alongside standard tax-exclusive pricing
- Flat or percentage discounts, applied before GST
- Multiple payment modes: Cash, UPI, Card, Credit/Udhaar, and **Partially Paid** (split payment, with the remaining balance automatically tracked as a loan)
- Auto-incrementing invoice numbers and full bill history, searchable by invoice number, customer, or date
- Premium, print-ready invoice design — clean header, itemized GST breakup table, UPI QR code for instant payment, shop's own uploaded signature, and customizable terms & conditions
- One-tap **Print** (thermal or A4) and **PDF export**, with the exact same professional layout on screen, in print, and in the PDF
- Share bills directly to WhatsApp with a pre-filled message

### Inventory & Catalog
- Product catalog with per-item GST rate, HSN/SAC code, cost price, and stock quantity
- Automatic stock deduction on every sale
- Low-stock threshold alerts, with a dedicated Alerts screen
- Barcode generation and camera-based barcode scanning for fast checkout

### Customer Ledger & Loans
- **Customer Ledger (Udhaar/Khata):** track goods sold on credit, record repayments, see running balances per customer
- **Loan Management:** track cash loans given to customers, repayment due dates, due-soon/overdue flags, and one-tap WhatsApp repayment reminders
- Partially paid bills automatically create a linked loan entry for the unpaid balance — repaying the loan updates the original bill's payment status

### Business Insights
- Dashboard with Total Sales, Bills Made, GST Collected, Discounts, and Outstanding balances, filterable by day/week/month/custom range
- Profit & Loss tracking: revenue, cost of goods sold, gross profit, categorized expenses, and net profit — PIN-protected for privacy
- Bill-wise and item-wise profit breakdowns, "Top Selling" and "Most Profitable" item rankings
- Full Reports suite: sales, purchases, stock, party-wise, and GST-filing-ready summaries, exportable as PDF/CSV

### Accounts, Subscriptions & Security
- Email/password and Google sign-in, with a 3-day free trial per account
- ₹2000/month subscription via Razorpay, with secure server-side payment verification (never trusted from the frontend)
- Automatic recurring billing via Razorpay Subscriptions, with webhook-driven renewal/cancellation handling
- Periodic background re-verification of subscription status, so access updates immediately if a subscription lapses — not just at login
- Firestore Security Rules enforce that subscription status can only be changed by the verified backend, never by the client
- Shop owner can upload their own business signature and logo, shown directly on every invoice

### Cross-Device & Offline
- Installable Progressive Web App (PWA) — works on Android, iOS, and desktop with no app store required
- Fully responsive: mobile-first layout on phones, a proper multi-column desktop layout with sidebar navigation on larger screens
- All business data (bills, catalog, customers, loans, purchases, expenses) syncs in real time across every device on the same account via Firestore
- Local caching keeps the app instant and fully usable offline, syncing automatically once back online

---

## Tech Stack

- **Frontend:** React + TypeScript, Vite, Tailwind CSS
- **Backend / Data:** Firebase Authentication, Cloud Firestore (Spark/free tier)
- **Payments:** Razorpay Subscriptions, verified via serverless functions on Vercel
- **Hosting:** Vercel (both the main app and the payment verification functions)
- **PDF/Print:** jsPDF, html2canvas
- **PWA:** vite-plugin-pwa, Workbox

---

## Project Structure

This app is deployed as two separate Vercel projects:
1. **Main app** — this repository, the billing/inventory PWA itself
2. **Payment functions** — a small serverless backend (`create-subscription`, `verify-payment`, `razorpay-webhook`) that securely handles all Razorpay payment verification, kept separate so the payment secret keys never touch the frontend

---

## Status

Actively developed and deployed. Built and maintained by **Smarted System**.
