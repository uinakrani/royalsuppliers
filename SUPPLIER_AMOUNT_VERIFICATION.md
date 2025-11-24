# Supplier List Amount Verification

## What is Displayed on Suppliers List

The suppliers list page shows three key amounts for each supplier:

1. **Total Amount** (`group.totalAmount`)
2. **Paid** (`group.totalPaid`)
3. **Remaining** (`group.remainingAmount`)

---

## Current Formulas

### 1. Total Amount
```typescript
totalAmount = sum of (originalTotal - non-ledger partial payments) for each order
```

**Formula Breakdown:**
- For each order:
  - `orderRemaining = originalTotal - nonLedgerPaid`
  - `totalAmount += Math.max(0, orderRemaining)`

**Example:**
- Order 1: originalTotal = ₹10,000, non-ledger payments = ₹2,000 → contributes ₹8,000
- Order 2: originalTotal = ₹5,000, non-ledger payments = ₹0 → contributes ₹5,000
- Order 3: originalTotal = ₹3,000, non-ledger payments = ₹3,500 → contributes ₹0 (overpaid)
- **Total Amount = ₹8,000 + ₹5,000 + ₹0 = ₹13,000**

### 2. Total Paid
```typescript
totalPaid = sum of ALL partial payments (both ledger and non-ledger) for all orders
```

**Formula Breakdown:**
- For each order:
  - `totalPaid += sum of all partialPayments (regardless of ledgerEntryId)`

**Example:**
- Order 1: non-ledger = ₹2,000, ledger = ₹3,000 → contributes ₹5,000
- Order 2: non-ledger = ₹0, ledger = ₹2,000 → contributes ₹2,000
- Order 3: non-ledger = ₹3,500, ledger = ₹0 → contributes ₹3,500
- **Total Paid = ₹5,000 + ₹2,000 + ₹3,500 = ₹10,500**

### 3. Remaining Amount
```typescript
remainingAmount = totalAmount - ledger payments
```

**Formula Breakdown:**
- `totalLedgerPayments = sum of all ledger expense entries for this supplier`
- `remainingAmount = Math.max(0, totalAmount - totalLedgerPayments)`

**Example (continuing from above):**
- Total Amount = ₹13,000
- Ledger Payments = ₹3,000 + ₹2,000 = ₹5,000
- **Remaining Amount = ₹13,000 - ₹5,000 = ₹8,000**

---

## Requirement Verification

According to the requirement:
> "on the suppliers list, in the amount of total amount to be paid to supplier is the only amount of their each order's (original total - partial payment added (non-ledger) on that order)."

**✅ Current Implementation Matches Requirement:**
- `totalAmount` = sum of (originalTotal - non-ledger partial payments) for each order ✓

---

## Potential Issues

### Issue 1: Inconsistency Between Total Amount and Total Paid

**Problem:**
- `totalAmount` excludes non-ledger payments (represents what needs to be paid)
- `totalPaid` includes both ledger and non-ledger payments (represents what has been paid)
- These two values are calculated from different bases, which can be confusing

**Example Scenario:**
- Order: originalTotal = ₹10,000
- Non-ledger payment = ₹2,000
- Ledger payment = ₹3,000
- **Total Amount** = ₹10,000 - ₹2,000 = ₹8,000
- **Total Paid** = ₹2,000 + ₹3,000 = ₹5,000
- **Remaining** = ₹8,000 - ₹3,000 = ₹5,000

**Analysis:**
- The order needs ₹10,000 total
- We've paid ₹5,000 total (₹2,000 manual + ₹3,000 ledger)
- Remaining should be ₹10,000 - ₹5,000 = ₹5,000 ✓ (This matches!)

### Issue 2: Remaining Amount Calculation

**Current Formula:**
```
remainingAmount = totalAmount - ledger payments
```

**This means:**
- `remainingAmount` = (sum of originalTotal - non-ledger) - ledger payments
- Which equals: sum of originalTotal - non-ledger - ledger
- Which equals: sum of originalTotal - (non-ledger + ledger)
- Which equals: sum of originalTotal - totalPaid ✓

**✅ The formula is mathematically correct!**

---

## Verification Summary

| Field | Formula | Status |
|-------|---------|--------|
| **Total Amount** | sum of (originalTotal - non-ledger payments) | ✅ Correct per requirement |
| **Total Paid** | sum of ALL partial payments | ✅ Correct (for display) |
| **Remaining** | totalAmount - ledger payments | ✅ Mathematically correct |

---

## Conclusion

The formulas are **correct** according to the requirement. The calculation logic properly:
1. Calculates total amount as sum of (originalTotal - non-ledger payments) ✓
2. Tracks all payments (ledger + non-ledger) in totalPaid ✓
3. Calculates remaining as totalAmount - ledger payments ✓

The remaining amount correctly represents: **Total amount that still needs to be paid after accounting for all payments (both ledger and non-ledger)**.

