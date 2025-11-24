# Supplier Payment Verification & Display

## Overview

The supplier detail view now clearly shows payment breakdown for each order, distinguishing between:
1. **Direct Payments** (non-ledger) - Payments to driver/other parties added directly to order
2. **Supplier Payments** (ledger) - Payments to supplier via ledger expense entries

## What's Displayed

### For Each Order:
- **Total Paid**: Sum of all payments (direct + supplier)
- **Paid Directly**: Payments to driver/other parties (non-ledger payments)
- **Paid to Supplier**: Payments to supplier via ledger (ledger payments)
- **Remaining**: Amount still to be paid

### Supplier Summary:
- **Total Amount to Supplier**: Sum of (originalTotal - direct payments) for each order
- **Paid to Supplier (Ledger)**: Total of all ledger expense entries for this supplier
- **Total Paid (All Payments)**: Sum of all payments (direct + supplier)
- **Remaining to Supplier**: Amount still owed to supplier

## Calculation Formulas

### Per Order:
```typescript
// Direct payments (to driver, etc.)
directPayments = partialPayments.filter(p => !p.ledgerEntryId)
paidDirectly = sum of directPayments

// Supplier payments (via ledger)
supplierPayments = partialPayments.filter(p => p.ledgerEntryId)
paidToSupplier = sum of supplierPayments

// Total paid
totalPaid = paidDirectly + paidToSupplier

// Remaining
remaining = originalTotal - totalPaid
```

### Supplier Totals:
```typescript
// Total amount to supplier (excludes direct payments)
totalAmount = sum of (originalTotal - directPayments) for each order

// Total paid to supplier (from ledger)
totalPaidToSupplier = sum of all ledger payments across all orders

// Remaining to supplier
remainingAmount = totalAmount - totalPaidToSupplier
```

## Verification Logic

The system now includes automatic verification that:
1. ✅ `totalPaid` = `totalPaidDirectly` + `totalPaidToSupplier`
2. ✅ `remainingAmount` = `totalAmount` - `totalPaidToSupplier`
3. ✅ Ledger entry amounts match partial payments with `ledgerEntryId`

Any mismatches are logged as warnings in the console for debugging.

## Example Scenario

**Order 1:**
- Original Total: ₹10,000
- Direct Payment (to driver): ₹2,000
- Supplier Payment (ledger): ₹3,000
- **Total Paid**: ₹5,000
- **Remaining**: ₹5,000

**Order 2:**
- Original Total: ₹5,000
- Direct Payment: ₹0
- Supplier Payment (ledger): ₹2,000
- **Total Paid**: ₹2,000
- **Remaining**: ₹3,000

**Supplier Summary:**
- **Total Amount to Supplier**: (₹10,000 - ₹2,000) + (₹5,000 - ₹0) = ₹13,000
- **Paid to Supplier (Ledger)**: ₹3,000 + ₹2,000 = ₹5,000
- **Total Paid (All)**: ₹5,000 + ₹2,000 = ₹7,000
- **Remaining to Supplier**: ₹13,000 - ₹5,000 = ₹8,000

## UI Improvements

1. **Clear Payment Breakdown**: Each order shows separate sections for:
   - Direct payments (blue background)
   - Supplier payments (green background)

2. **Better Labels**: Summary section clearly explains what each amount represents

3. **Visual Distinction**: Different colors for different payment types

4. **Verification**: Console logs help verify calculations are correct

