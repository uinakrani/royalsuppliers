# AI Quick Reference Guide - Royal Suppliers

> **Quick lookup guide for AI assistants** - Find the right context fast

## 🎯 What is this app?
Progressive Web App for managing construction material orders, payments, invoices, and financial ledger. Mobile-first design for tracking sand/construction material supply business.

## 📁 Key File Locations

| What | Where |
|------|-------|
| **Dashboard** | `app/page.tsx` |
| **Orders Page** | `app/orders/page.tsx` |
| **Ledger Page** | `app/ledger/page.tsx` |
| **Invoices Page** | `app/invoices/page.tsx` |
| **Order Service** | `lib/orderService.ts` |
| **Invoice Service** | `lib/invoiceService.ts` |
| **Ledger Service** | `lib/ledgerService.ts` |
| **Order Type** | `types/order.ts` |
| **Invoice Type** | `types/invoice.ts` |

## 🔍 Common Questions & Answers

### How do I add a new order?
**File**: `components/OrderForm.tsx` or use `orderService.createOrder()`
**Process**: Form with fields → validation → save to Firestore `orders` collection

### How do orders relate to invoices?
- Orders can be grouped into invoices
- `Order.invoiceId` links order to invoice
- `Order.invoiced` boolean flag
- Multiple orders can share one invoice

### How are payments tracked?
**Three levels**:
1. **Order level**: `Order.partialPayments[]` - raw material supplier payments
2. **Invoice level**: `Invoice.partialPayments[]` - customer payments
3. **Ledger level**: `LedgerEntry` - all financial transactions (credit/debit)

### How is profit calculated?
```typescript
profit = total - (originalTotal + additionalCost)
// where:
// total = weight × rate
// originalTotal = originalWeight × originalRate
```

### How to filter orders?
**Service**: `orderService.getAllOrders()` then filter client-side
**Filters**: Party name, material, date range, truck, supplier
**UI**: `components/FilterPopup.tsx`

### How to generate PDF invoice?
**Service**: `pdfService.generateInvoicePDF(invoice, orders)`
**Uses**: jsPDF library
**Location**: `lib/pdfService.ts`

### How does real-time updates work?
All services have `subscribe()` method:
```typescript
const unsubscribe = service.subscribe((items) => {
  // Update state with latest data
})
```

### What collections exist in Firestore?
- `orders` - All orders
- `invoices` - All invoices
- `ledgerEntries` - Financial transactions
- `partyPayments` - Party-level payments

### How to calculate dashboard stats?
**Service**: `statsService.calculateStats(orders, ledgerEntries, startDate?, endDate?)`
**Location**: `lib/statsService.ts`
**Returns**: `DashboardStats` object with all metrics

## 🏗️ Architecture Quick Facts

- **Framework**: Next.js 13+ (App Router), React 18, TypeScript
- **Database**: Firebase Firestore (NoSQL)
- **Styling**: Tailwind CSS
- **State**: React useState + Firestore subscriptions (no Redux/Context)
- **All pages**: Client-side (`'use client'`)
- **Real-time**: Yes, via Firestore subscriptions

## 📊 Data Flow Patterns

### Creating an Order
1. User fills `OrderForm`
2. Validate fields
3. Calculate `total`, `originalTotal`, `profit`
4. Call `orderService.createOrder(orderData)`
5. Save to Firestore `orders` collection
6. Subscription updates UI automatically

### Creating an Invoice
1. Select orders from Orders page
2. Call `invoiceService.createInvoice(orderIds, partyName, siteName)`
3. Generate invoice number: `ROYAL{timestamp}`
4. Calculate `totalAmount` from orders
5. Set `dueDate` to 1 week from now
6. Save to Firestore `invoices` collection
7. Update orders with `invoiceId` and `invoiced: true`

### Adding Ledger Entry
1. Use `LedgerEntryWizard` component
2. Select type: `credit` (income) or `debit` (expense)
3. Enter amount, date, description
4. Link to party (credit) or supplier (debit)
5. Call `ledgerService.create(entryData)`
6. Balance automatically recalculates

## 🎨 UI Component Patterns

### Drawers (Mobile)
- `OrderDetailDrawer` - Order details
- `LedgerEntryDrawer` - Ledger entry details
- Slides up from bottom

### Popups/Modals
- `FilterPopup` - Filtering UI
- `OrderDetailPopup` - Order details (desktop)
- `PartyDetailPopup` - Party summary
- `SupplierDetailPopup` - Supplier summary

### Forms
- `OrderForm` - Create/edit orders
- `LedgerEntryWizard` - Multi-step ledger entry creation
- Controlled components with validation

## 🔧 Common Tasks

### Task: Add a new filter option
1. Update filter state in page component
2. Add UI in `FilterPopup` or `FilterDrawer`
3. Apply filter in data loading function
4. Update `OrderFilters` interface if needed

### Task: Add a new order field
1. Update `Order` interface in `types/order.ts`
2. Update `OrderForm` component
3. Update order display components
4. Update `orderService` if needed
5. Update dashboard stats if field affects calculations

### Task: Create a new page
1. Create file in `app/[pageName]/page.tsx`
2. Add `'use client'` directive
3. Use `NavBar` component for navigation
4. Follow existing page patterns (loading states, error handling)
5. Add route to navigation if needed

### Task: Modify profit calculation
1. Update calculation in `OrderForm` when creating/editing
2. Update `orderService` if calculation logic there
3. Check `statsService` for dashboard calculations
4. Update any display components showing profit

## 🐛 Common Issues & Solutions

### Issue: Real-time updates not working
**Solution**: Check Firestore subscription is set up, check Firebase config

### Issue: Calculations wrong
**Solution**: Check calculation formulas, ensure all fields present, check data types

### Issue: Payment status incorrect
**Solution**: Check `isOrderPaid()` function, verify payment sum logic

### Issue: Filters not applying
**Solution**: Check filter state management, verify filter logic in load function

### Issue: PDF generation fails
**Solution**: Check jsPDF library loaded, verify invoice/order data structure

## 📝 Code Style Patterns

### Loading States
```typescript
const [loading, setLoading] = useState(true)
// ... async operation
setLoading(false)
```

### Error Handling
```typescript
try {
  await operation()
} catch (error: any) {
  console.error('Error:', error)
  showToast(error.message || 'Operation failed', 'error')
}
```

### Real-time Subscriptions
```typescript
useEffect(() => {
  const unsubscribe = service.subscribe((items) => {
    setData(items)
  })
  return () => unsubscribe()
}, [])
```

### Toast Notifications
```typescript
import { showToast } from '@/components/Toast'
showToast('Success message', 'success')
showToast('Error message', 'error')
```

## 🎯 When to Look Where

| Need | Look Here |
|------|-----------|
| **Order structure** | `types/order.ts` |
| **Order operations** | `lib/orderService.ts` |
| **Invoice structure** | `types/invoice.ts` |
| **Invoice operations** | `lib/invoiceService.ts` |
| **Financial calculations** | `lib/statsService.ts` |
| **PDF generation** | `lib/pdfService.ts` |
| **UI components** | `components/` directory |
| **Constants** | `lib/constants.ts` |
| **Firebase config** | `lib/firebase.ts` |

## 🔗 Related Documentation

- **Full Documentation**: See `APP_DOCUMENTATION.md`
- **Setup Guide**: See `SETUP.md`
- **Quick Start**: See `QUICKSTART.md`
- **Database Backup**: See `DATABASE_BACKUP.md`

## 💡 Quick Tips for AI

1. **Always check existing patterns** - This codebase follows consistent patterns
2. **Use TypeScript interfaces** - They're well-defined and should be followed
3. **Real-time > Polling** - Use subscriptions, not setInterval
4. **Mobile-first** - Design for touch, small screens, bottom navigation
5. **Error boundaries** - Wrap async operations, show user-friendly errors
6. **State management** - Local state with useState, real-time with subscriptions
7. **Form validation** - Always validate before submit, show clear errors

---

**For detailed information, see `APP_DOCUMENTATION.md`**

