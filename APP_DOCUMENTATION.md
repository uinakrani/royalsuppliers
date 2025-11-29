# Royal Suppliers - Complete Application Documentation

> **Purpose**: This document provides comprehensive documentation of all features, functionality, pages, components, services, and data models in the Royal Suppliers Order Management PWA. It serves as a reference for AI assistants and developers to quickly understand the application structure and capabilities.

## Table of Contents

1. [Application Overview](#application-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Pages & Routes](#pages--routes)
4. [Data Models](#data-models)
5. [Services](#services)
6. [Components](#components)
7. [Key Features](#key-features)
8. [Business Logic](#business-logic)
9. [Firebase Collections](#firebase-collections)

---

## Application Overview

**Royal Suppliers** is a Progressive Web App (PWA) for managing sand/construction material orders. It's designed as a mobile-first application for tracking orders, payments, invoices, and financial transactions in a construction materials supply business.

### Core Purpose
- Track orders with detailed material, weight, rates, and profit calculations
- Manage customer (party) payments and supplier payments
- Generate PDF invoices
- Track financial ledger (income and expenses)
- Monitor business metrics through dashboard analytics

### App Name
- **Full Name**: Royal Suppliers - Order Management
- **Short Name**: Royal Suppliers

---

## Architecture & Tech Stack

### Frontend Framework
- **Next.js 13+** (App Router)
- **React 18** with TypeScript
- **Client-side rendering** (all pages use `'use client'`)

### Styling
- **Tailwind CSS** for utility-first styling
- Custom CSS animations and transitions
- Mobile-optimized responsive design

### Backend & Database
- **Firebase Firestore** (NoSQL database)
- Real-time subscriptions for live updates
- Firestore collections for all data storage

### Key Libraries
- `firebase/firestore` - Database operations
- `jspdf` - PDF invoice generation
- `date-fns` - Date formatting and manipulation
- `lucide-react` - Icon library
- `sweetalert2` - Alert/prompt dialogs
- `next-pwa` - PWA functionality

### PWA Features
- Offline support
- Installable on mobile devices
- Service worker for caching
- App-like experience on mobile

---

## Pages & Routes

### 1. Dashboard (`/` or `/page.tsx`)

**Purpose**: Main landing page showing business overview and statistics.

#### Features:
- **Financial Overview Card**:
  - Money Going Out (total expenses)
  - Outstanding Raw Materials (unpaid supplier amounts)
  - Money Received (from customers/parties)
  
- **Profit Analysis Card**:
  - Estimated Profit (total profit from all orders)
  - Profit Received (profit based on received payments)
  - Realization Rate (percentage of profit received vs estimated)

- **Current Balance Card**:
  - Calculated balance: Money Received - Money Spent
  - Shows received amount and spent amount breakdown

- **Quick Stats**:
  - Total Orders
  - Paid Orders
  - Unpaid Orders
  - Partial Payments

- **Order Summary**:
  - Clickable cards to navigate to filtered order views

- **Quick Actions**:
  - New Order button
  - View Orders button

#### Filtering:
- **Duration Filter**: Current Month, Last 7 Days, Last Month, Last 3 Months, Last 6 Months, Last Year
- **Custom Date Range**: Start date and end date
- **Party Name Filter**: Multi-select checkbox list
- **Material Filter**: Multi-select checkbox list (Bodeli, Panetha, Nareshware, Kali, Chikhli Kapchi VSI, Chikhli Kapchi, Areth)

#### Calculations:
- All statistics are calculated from filtered orders based on date range and filters
- Integrates with ledger entries for accurate financial tracking
- Profit received calculation considers partial payments proportionally

---

### 2. Orders Page (`/orders`)

**Purpose**: Manage all orders with detailed views and operations.

#### View Modes:
1. **All Orders** (`allOrders`): List all orders sorted by date
2. **By Party** (`byParty`): Group orders by party name showing totals
3. **Suppliers** (`suppliers`): Group orders by supplier name showing payment status

#### Features:

##### Order Management:
- **Add New Order**: Form with all order attributes
- **Edit Order**: Modify existing order details
- **Delete Order**: Remove order with confirmation
- **View Order Details**: Full order information in drawer/popup

##### Payment Management:
- **View Payment History**: See all payments for an order
- **Add Payment**: Record partial payments
- **Edit Payment**: Modify payment amount, date, or notes
- **Delete Payment**: Remove payment record
- **Payment Status Indicators**:
  - Fully Paid (green)
  - Unpaid (red)
  - Partially Paid (yellow)

##### Filtering:
- Party Name (multi-select)
- Material (multi-select)
- Date Range (start/end dates)
- Truck Owner
- Truck Number
- Supplier

##### Grouping & Aggregation:
- **Party Groups**: Shows total selling, total paid, total profit, last payment info
- **Supplier Groups**: Shows total amount, total paid, remaining amount, last payment info

##### Invoice Integration:
- Link orders to invoices
- Show invoice status for each order
- Navigate to invoice details

##### Raw Material Payments:
- Track supplier payments per order
- View outstanding supplier amounts
- Record partial payments to suppliers

---

### 3. Ledger Page (`/ledger`)

**Purpose**: Track all financial transactions (income and expenses).

#### Tabs:
1. **Entries Tab**: View all ledger entries
2. **Activity Tab**: View activity log of ledger changes

#### Features:

##### Entry Types:
- **Credit** (Income): Money coming in
  - Party payments (linked to party name)
  - Other income sources
- **Debit** (Expenses): Money going out
  - Raw material payments (linked to supplier)
  - Other expenses

##### Ledger Entry Creation:
- **Wizard Flow**:
  1. Select entry type (credit/debit)
  2. Enter amount
  3. Select date
  4. Add description/category
  5. Link to party (credit) or supplier (debit)
  6. Review and confirm

##### Entry Management:
- **Add Entry**: Create new credit or debit entry
- **Edit Entry**: Modify existing entry
- **Delete Entry**: Remove entry with confirmation
- **View Entry Details**: Full entry information

##### Balance Calculation:
- Running balance displayed at top
- Separate totals for income and expenses
- Real-time updates via Firestore subscriptions

##### Filtering (Activity Tab):
- Date range filter for activity log
- Shows all create/update/delete operations

##### Integration:
- Credit entries can be linked to party payments
- Debit entries can be linked to supplier payments
- Automatic balance calculation from all entries

---

### 4. Invoices Page (`/invoices`)

**Purpose**: Create and manage invoices for orders.

#### Features:

##### Invoice Creation:
- Select multiple orders to include
- Auto-generate invoice number (ROYAL + timestamp)
- Calculate total amount from selected orders
- Set due date (default: 1 week from creation)

##### Invoice Management:
- **View Invoice**: Expand to see order details
- **Add Payment**: Record partial payments
- **Edit Payment**: Modify payment details
- **Delete Invoice**: Remove invoice with confirmation
- **Mark as Paid**: Update invoice status

##### Payment Tracking:
- Multiple partial payments supported
- Payment date and amount tracking
- Remaining balance calculation
- Overdue status (past due date and not fully paid)

##### PDF Generation:
- **Single Invoice**: Generate PDF for one invoice
- **Multiple Invoices**: Bulk PDF generation
- PDF includes:
  - Invoice number
  - Party and site information
  - Order details (material, weight, rate, total)
  - Payment summary
  - Due date

##### Filtering:
- Party Name
- Payment Status (Paid/Unpaid)
- Overdue Status (Overdue/Not Overdue)
- Date Range (invoice creation date)

##### Status Indicators:
- ✅ Paid: Fully paid invoices
- ⚠️ Overdue: Past due date and unpaid
- 🔵 Unpaid: Not yet due or partially paid

---

### 5. Admin Page (`/admin`)

**Purpose**: Administrative functions for development and testing.

#### Features:
- **Generate Dummy Orders**: Create test data with various party names, sites, materials, dates, and payment statuses
- Useful for testing features without real data
- Creates orders spread across last 6 months

---

### 6. Clean Page (`/clean`)

**Purpose**: Database cleanup utility (development/maintenance).

#### Features:
- **Delete Collections**: Remove all data from selected collections
- Collections that can be cleaned:
  - `orders`
  - `ledgerEntries`
  - `invoices`
  - `partyPayments`
- Safety confirmation required (type "DELETE" to confirm)
- Progress tracking during deletion
- Log output showing deletion progress

---

## Data Models

### Order (`types/order.ts`)

Core entity representing a material order.

```typescript
interface Order {
  id?: string                    // Firestore document ID
  date: string                   // ISO date string
  partyName: string              // Customer/party name
  siteName: string               // Delivery site name
  material: string | string[]    // Material type(s) - can be array for multiple
  weight: number                 // Selling weight
  rate: number                   // Selling rate per unit
  total: number                  // Calculated: weight * rate
  truckOwner: string             // Truck owner name
  truckNo: string                // Truck number
  supplier: string               // Raw material supplier name
  originalWeight: number         // Supplier weight
  originalRate: number           // Supplier rate per unit
  originalTotal: number          // Calculated: originalWeight * originalRate
  additionalCost: number         // Extra costs (transport, etc.)
  profit: number                 // Calculated: total - (originalTotal + additionalCost)
  partialPayments?: PaymentRecord[]  // Payment records for raw materials
  invoiced?: boolean             // Whether included in an invoice
  invoiceId?: string             // ID of invoice if invoiced
  archived?: boolean             // Archived when invoice fully paid
  createdAt?: string             // ISO timestamp
  updatedAt?: string             // ISO timestamp
}

interface PaymentRecord {
  id: string                     // Payment record ID
  amount: number                 // Payment amount
  date: string                   // ISO date string
  note?: string                  // Optional payment note
  ledgerEntryId?: string         // Link to ledger entry if created from ledger
}
```

**Key Calculations**:
- `total = weight × rate`
- `originalTotal = originalWeight × originalRate`
- `profit = total - (originalTotal + additionalCost)`

---

### Invoice (`types/invoice.ts`)

Represents an invoice grouping multiple orders.

```typescript
interface Invoice {
  id?: string                    // Firestore document ID
  invoiceNumber: string          // Format: "ROYAL" + timestamp
  orderIds: string[]             // Array of order IDs in this invoice
  totalAmount: number            // Sum of all order totals
  paidAmount: number             // Total payments received
  partialPayments?: InvoicePayment[]  // Payment records
  createdAt: string              // ISO date string
  dueDate: string                // ISO date string (1 week from creation)
  paid: boolean                  // Fully paid status
  overdue: boolean               // Past due date and not paid
  partyName: string              // Party name from orders
  siteName: string               // Site name from orders
  archived: boolean              // Archived when fully paid
}

interface InvoicePayment {
  id: string                     // Payment ID
  amount: number                 // Payment amount
  date: string                   // ISO date string
  note?: string                  // Optional note
}
```

---

### Ledger Entry (`lib/ledgerService.ts`)

Financial transaction record.

```typescript
interface LedgerEntry {
  id?: string                    // Firestore document ID
  type: 'credit' | 'debit'       // Income or expense
  amount: number                 // Transaction amount
  date: string                   // ISO date string
  description: string            // Transaction description
  category?: string              // Optional category
  partyName?: string             // For credit entries (income from party)
  supplier?: string              // For debit entries (payment to supplier)
  createdAt?: string             // ISO timestamp
  updatedAt?: string             // ISO timestamp
}
```

**Balance Calculation**:
- Balance = Sum of all credits - Sum of all debits
- Real-time calculation from all entries

---

### Party Payment (`lib/partyPaymentService.ts`)

Payment record at party level (separate from invoice payments).

```typescript
interface PartyPayment {
  id?: string                    // Firestore document ID
  partyName: string              // Party name
  amount: number                 // Payment amount
  date: string                   // ISO date string
  note?: string                  // Optional note
  createdAt?: string             // ISO timestamp
}
```

---

### Dashboard Statistics (`types/order.ts`)

Comprehensive statistics for dashboard display.

```typescript
interface DashboardStats {
  totalWeight: number            // Total material weight
  totalCost: number              // Total cost (legacy)
  totalProfit: number            // Total profit (legacy)
  currentBalance: number         // Payment balance (legacy)
  totalOrders: number            // Count of orders
  paidOrders: number             // Fully paid orders
  unpaidOrders: number           // Unpaid orders
  partialOrders: number          // Partially paid orders
  estimatedProfit: number        // Sum of profit from orders
  paymentReceived: number        // Payments received
  costAmount: number             // Total costs
  moneyOut: number               // Total expenses
  rawMaterialPaymentsOutstanding: number  // Unpaid supplier amounts
  customerPaymentsReceived: number        // Money from customers
  rawMaterialPaymentsReceived: number     // Payments to suppliers
  profitReceived: number         // Realized profit
  calculatedBalance: number      // Current balance: received - spent
}
```

---

## Services

### Order Service (`lib/orderService.ts`)

Manages all order-related operations.

**Methods**:
- `getAllOrders()`: Fetch all orders from Firestore
- `getOrderById(id)`: Get single order by ID
- `createOrder(orderData)`: Create new order
- `updateOrder(id, orderData)`: Update existing order
- `deleteOrder(id)`: Delete order
- `getUniquePartyNames()`: Get list of all unique party names
- `subscribe(callback)`: Real-time subscription to order changes
- `isOrderPaid(order)`: Check if order is fully paid

**Payment Management**:
- Add/update/delete payment records on orders
- Calculate payment status (paid/unpaid/partial)

---

### Invoice Service (`lib/invoiceService.ts`)

Manages invoice operations.

**Methods**:
- `getAllInvoices()`: Fetch all invoices
- `getInvoiceById(id)`: Get single invoice
- `createInvoice(orderIds, partyName, siteName)`: Create invoice from orders
- `updateInvoice(id, updates)`: Update invoice
- `deleteInvoice(id)`: Delete invoice
- `addPayment(invoiceId, amount, date, note)`: Add payment to invoice
- `updatePayment(invoiceId, paymentId, updates)`: Update payment
- `deletePayment(invoiceId, paymentId)`: Delete payment
- `getUniquePartyNames()`: Get unique party names from invoices
- `subscribe(callback)`: Real-time subscription

**Invoice Number Generation**:
- Format: `ROYAL{timestamp}`
- Ensures uniqueness

---

### Ledger Service (`lib/ledgerService.ts`)

Manages financial ledger entries.

**Methods**:
- `list()`: Get all ledger entries
- `getEntryById(id)`: Get single entry
- `create(entryData)`: Create new entry
- `update(id, updates)`: Update entry
- `delete(id)`: Delete entry
- `subscribe(callback)`: Real-time subscription

**Balance Calculation**:
- Calculates running balance from all entries
- Separate income (credit) and expense (debit) totals

---

### Party Payment Service (`lib/partyPaymentService.ts`)

Manages party-level payments.

**Methods**:
- `getAllPayments()`: Get all party payments
- `create(paymentData)`: Create payment
- `update(id, updates)`: Update payment
- `delete(id)`: Delete payment
- `subscribe(callback)`: Real-time subscription

---

### PDF Service (`lib/pdfService.ts`)

Generates PDF invoices.

**Methods**:
- `generateInvoicePDF(invoice, orders)`: Generate single invoice PDF
- `generateMultipleInvoicesPDF(invoices, ordersMap)`: Generate bulk PDF

**PDF Content**:
- Invoice header with number and date
- Party and site information
- Table of orders (material, weight, rate, total)
- Payment summary
- Total amount and due date
- Payment status

---

### Stats Service (`lib/statsService.ts`)

Calculates dashboard statistics.

**Methods**:
- `calculateStats(orders, ledgerEntries, startDate?, endDate?)`: Calculate all statistics
- `getDateRangeForDuration(duration)`: Get date range for duration filter

**Statistics Calculated**:
- Total weight, cost, profit
- Order counts (total, paid, unpaid, partial)
- Financial metrics (money out, received, balance)
- Profit analysis (estimated vs received)

---

### Ledger Activity Service (`lib/ledgerActivityService.ts`)

Tracks changes to ledger entries.

**Methods**:
- `getActivities(startDate?, endDate?)`: Get activity log
- `subscribe(callback, startDate?, endDate?)`: Real-time subscription

**Activity Types**:
- Created
- Updated
- Deleted

---

## Components

### Navigation

#### NavBar (`components/NavBar.tsx`)
- Fixed bottom navigation bar
- Links: Dashboard, Orders, Ledger, Invoices
- Active route highlighting
- Mobile-optimized with safe area insets

---

### Order Components

#### OrderForm (`components/OrderForm.tsx`)
- Form for creating/editing orders
- All order fields with validation
- Material selection (can be multiple)
- Auto-calculation of totals and profit
- Submit and cancel actions

#### OrderFormWizard (`components/OrderFormWizard.tsx`)
- Multi-step wizard for order creation
- Step-by-step form flow

#### OrderDetailDrawer (`components/OrderDetailDrawer.tsx`)
- Slide-up drawer showing full order details
- Payment history
- Edit and delete actions
- Payment management

#### OrderDetailPopup (`components/OrderDetailPopup.tsx`)
- Modal popup with order details
- Alternative to drawer for desktop

---

### Payment Components

#### PaymentEditPopup (`components/PaymentEditPopup.tsx`)
- Edit payment amount, date, notes
- Can modify ledger-linked payments
- Validation and error handling

#### ConfirmPaymentPopup (`components/ConfirmPaymentPopup.tsx`)
- Confirmation dialog for payment actions
- Shows payment summary before confirmation

---

### Party & Supplier Components

#### PartyDetailPopup (`components/PartyDetailPopup.tsx`)
- View party summary with all orders
- Total selling, paid, profit
- Last payment information
- Navigate to individual orders

#### SupplierDetailPopup (`components/SupplierDetailPopup.tsx`)
- View supplier summary
- Total amount, paid, remaining
- Linked orders and ledger payments
- Payment history

---

### Invoice Components

#### Invoice-related functionality embedded in InvoicesPage
- Invoice creation and management
- Payment tracking
- PDF generation buttons

---

### Ledger Components

#### LedgerEntryWizard (`components/LedgerEntryWizard.tsx`)
- Multi-step wizard for creating/editing ledger entries
- Type selection (credit/debit)
- Amount and date entry
- Party/supplier linking
- Description and category
- Review page before submission

#### LedgerEntryDrawer (`components/LedgerEntryDrawer.tsx`)
- Drawer for viewing/editing ledger entries
- Shows entry details
- Edit and delete actions

---

### UI Components

#### FilterPopup (`components/FilterPopup.tsx`)
- Reusable filter popup/modal
- Used across Dashboard, Orders, Invoices
- Date range, party, material filters

#### FilterDrawer (`components/FilterDrawer.tsx`)
- Alternative filter UI in drawer format

#### BottomSheet (`components/BottomSheet.tsx`)
- Reusable bottom sheet component
- Used for confirmations and actions

#### Toast (`components/Toast.tsx`)
- Toast notification system
- Success, error, info, warning types
- Auto-dismiss with timing

#### LoadingSpinner (`components/LoadingSpinner.tsx`)
- Loading indicator component

#### TruckLoading (`components/TruckLoading.tsx`)
- Custom animated loading component
- Truck-themed animation

#### DatePicker (`components/DatePicker.tsx`)
- Date selection component
- Mobile-optimized

#### NumberPad (`components/NumberPad.tsx`)
- Custom numeric input pad
- For mobile number entry

#### TextInputPad (`components/TextInputPad.tsx`)
- Text input with custom pad
- For mobile text entry

#### SelectList (`components/SelectList.tsx`)
- Dropdown/select list component
- Searchable options

#### Button (`components/Button.tsx`)
- Reusable button component
- Variants: primary, secondary, danger
- Sizes: sm, md, lg
- Loading state support

#### PWA Components

##### PWAInstallPrompt (`components/PWAInstallPrompt.tsx`)
- Prompts user to install PWA
- Shows install button when available

##### PWARegister (`components/PWARegister.tsx`)
- Service worker registration
- PWA setup

##### AndroidFullscreen (`components/AndroidFullscreen.tsx`)
- Android fullscreen mode handling

##### NativePopup (`components/NativePopup.tsx`)
- Native alert/prompt wrapper
- Mobile-specific popups

---

### Firebase Components

#### FirebaseSetupAlert (`components/FirebaseSetupAlert.tsx`)
- Warning when Firebase not configured
- Shows setup instructions

#### FirestoreRulesAlert (`components/FirestoreRulesAlert.tsx`)
- Alert for Firestore security rules
- Development warnings

---

## Key Features

### 1. Real-time Updates
- Firestore subscriptions for live data
- Automatic UI updates when data changes
- No manual refresh needed

### 2. Payment Tracking

#### Order Level:
- Track payments for raw materials (supplier payments)
- Partial payments supported
- Link to ledger entries

#### Invoice Level:
- Track customer payments
- Multiple partial payments
- Payment history
- Overdue detection

#### Party Level:
- Track payments at party level
- Separate from invoice payments
- For general account management

#### Ledger Level:
- All financial transactions
- Income (credit) and expenses (debit)
- Automatic balance calculation

### 3. Profit Calculation
- **Order Profit**: `total - (originalTotal + additionalCost)`
- **Estimated Profit**: Sum of all order profits
- **Profit Received**: Calculated based on payment proportions
- **Realization Rate**: Percentage of profit received vs estimated

### 4. Financial Metrics

#### Money Flow:
- **Money Out**: Total expenses (raw materials + additional costs)
- **Money Received**: Customer payments
- **Current Balance**: Received - Spent

#### Outstanding:
- **Raw Material Payments Outstanding**: Unpaid supplier amounts
- **Payment Balance**: Customer payments due

### 5. Filtering System
- **Multi-level filtering**: Date, party, material, truck, supplier
- **Duration presets**: Quick date range selection
- **Custom date ranges**: Flexible date filtering
- **Combined filters**: Multiple filters work together

### 6. PDF Generation
- Professional invoice PDFs
- Single or bulk generation
- Includes all order details
- Payment summary
- Print-ready format

### 7. Grouping & Aggregation

#### By Party:
- Total selling amount
- Total paid amount
- Total profit
- Last payment date and amount

#### By Supplier:
- Total amount to pay
- Total paid amount
- Remaining amount
- Payment history

### 8. Payment Status Indicators
- ✅ **Paid**: Fully paid (green)
- ⚠️ **Partial**: Partially paid (yellow)
- ❌ **Unpaid**: No payments (red)

### 9. Mobile Optimization
- Touch-friendly UI
- Bottom navigation
- Slide-up drawers
- Native-like interactions
- Safe area insets for notched devices
- PWA installation support

### 10. Data Validation
- Required field validation
- Date validation
- Number validation
- Amount calculations
- Error messages

---

## Business Logic

### Order Profit Calculation

```
total = weight × rate
originalTotal = originalWeight × originalRate
profit = total - (originalTotal + additionalCost)
```

### Payment Status

An order is considered:
- **Paid**: Sum of all payments ≥ total
- **Partial**: Sum of payments > 0 and < total
- **Unpaid**: No payments or sum = 0

### Invoice Status

An invoice is:
- **Paid**: `paidAmount ≥ totalAmount`
- **Overdue**: `paid === false` AND `dueDate < today`
- **Unpaid**: `paidAmount < totalAmount` AND not overdue

### Balance Calculation

```
Current Balance = Customer Payments Received - All Expenses
```

From ledger:
```
Balance = Sum of Credits - Sum of Debits
```

### Profit Realization

When an order receives partial payment:
```
Payment Ratio = Amount Received / Order Total
Realized Profit = Estimated Profit × Payment Ratio
```

---

## Firebase Collections

### Collections Structure

#### `orders`
- Document ID: Auto-generated
- Fields: All Order interface fields
- Indexes: Date, partyName, material, supplier

#### `invoices`
- Document ID: Auto-generated
- Fields: All Invoice interface fields
- Indexes: partyName, createdAt, dueDate

#### `ledgerEntries`
- Document ID: Auto-generated
- Fields: All LedgerEntry interface fields
- Indexes: date, type, partyName, supplier

#### `partyPayments`
- Document ID: Auto-generated
- Fields: All PartyPayment interface fields
- Indexes: partyName, date

### Real-time Subscriptions

All services support real-time subscriptions:
```typescript
const unsubscribe = service.subscribe((items) => {
  // Update UI with latest data
})
```

Subscriptions automatically update UI when:
- Documents are created
- Documents are updated
- Documents are deleted

---

## Key File Locations

### Pages
- `/app/page.tsx` - Dashboard
- `/app/orders/page.tsx` - Orders management
- `/app/ledger/page.tsx` - Ledger entries
- `/app/invoices/page.tsx` - Invoices
- `/app/admin/page.tsx` - Admin utilities
- `/app/clean/page.tsx` - Database cleanup

### Services
- `/lib/orderService.ts` - Order operations
- `/lib/invoiceService.ts` - Invoice operations
- `/lib/ledgerService.ts` - Ledger operations
- `/lib/partyPaymentService.ts` - Party payments
- `/lib/pdfService.ts` - PDF generation
- `/lib/statsService.ts` - Statistics calculation

### Types
- `/types/order.ts` - Order and related types
- `/types/invoice.ts` - Invoice types

### Components
- `/components/` - All reusable components

### Constants
- `/lib/constants.ts` - Material options and constants

---

## Common Patterns

### State Management
- React `useState` for local state
- Firestore subscriptions for real-time data
- No global state management library

### Data Fetching
- Initial load in `useEffect`
- Real-time subscriptions for updates
- Error handling with try-catch
- Loading states for async operations

### Form Handling
- Controlled components with `useState`
- Validation on submit
- Error display inline or via toast

### Navigation
- Next.js `useRouter` for programmatic navigation
- URL parameters for filters and highlighting
- Query strings for state

### Mobile Interactions
- Ripple effects on button presses
- Slide-up drawers for details
- Bottom sheets for actions
- Native-like animations

---

## Environment Variables

Required Firebase configuration:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Optional for development:
```env
NEXT_PUBLIC_FIREBASE_DEV_API_KEY=
NEXT_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_DEV_APP_ID=
NEXT_PUBLIC_ENVIRONMENT=development
```

---

## Important Notes for AI Assistants

1. **All calculations are client-side** - No server-side validation
2. **Firestore is the single source of truth** - All data persisted there
3. **Real-time updates** - Use subscriptions, not polling
4. **Mobile-first design** - UI optimized for touch and small screens
5. **No authentication** - Currently open access (development)
6. **Type safety** - TypeScript interfaces strictly followed
7. **Error handling** - Always wrap async operations in try-catch
8. **Loading states** - Show loading indicators during async operations
9. **Toast notifications** - Use for user feedback (success/error)
10. **Confirmation dialogs** - Use sweetAlert for destructive actions

---

## Future Enhancements (Potential)

- User authentication and authorization
- Multi-user support with roles
- Export/import functionality (already has backup system)
- Advanced reporting and analytics
- Email invoice sending
- SMS notifications
- Barcode/QR code scanning
- Offline mode improvements
- Data synchronization conflicts handling

---

**Last Updated**: 2025-01-XX
**Documentation Version**: 1.0
**App Version**: 1.0.0

