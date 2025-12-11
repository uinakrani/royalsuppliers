export interface PaymentRecord {
  id: string
  amount: number
  date: string // ISO date string
  note?: string // Optional note for the payment
  ledgerEntryId?: string // ID of ledger entry that created this payment (for tracking)
  createdAt?: string // When the payment record was captured in the system
  updatedAt?: string // Last time the record was modified
}

export interface Order {
  id?: string
  workspaceId?: string
  orderCode?: string // Human-friendly incremental code (e.g., RS1, RS2)
  date: string // ISO date string
  challanNo?: number | null // Optional challan/lorry receipt number
  partyName: string
  siteName: string
  material: string | string[] // can be string (legacy) or array of selected materials
  weight: number
  rate: number
  total: number // calculated: weight * rate
  truckOwner: string
  truckNo: string
  supplier: string // Supplier of raw materials
  originalWeight: number
  originalRate: number
  originalTotal: number // calculated: originalWeight * originalRate
  additionalCost: number
  profit: number // calculated: total - (originalTotal + additionalCost)
  partialPayments?: PaymentRecord[] // array of individual payment records for raw materials (expense payments to supplier)
  customerPayments?: PaymentRecord[] // array of payment records received from customer for this order
  invoiced?: boolean // whether order has been invoiced
  invoiceId?: string // ID of the invoice this order belongs to
  archived?: boolean // whether order is archived (when invoice is fully paid)
  adjustmentAmount?: number // Manual adjustment to the profit (positive adds to profit, negative deducts)
  adjustmentNote?: string // Reason for the adjustment
  expenseAdjustment?: number // Auto adjustment from paying more/less for raw materials
  revenueAdjustment?: number // Auto adjustment from party paying more/less than total
  paid?: boolean // Supplier expense settled status
  paymentDue?: boolean // Whether supplier payment is still due
  paidAmount?: number // Track partial supplier payments
  partyPaid?: boolean // Whether customer/party has settled the order
  createdAt?: string
  updatedAt?: string
}

export interface OrderFilters {
  partyName?: string
  startDate?: string
  endDate?: string
  material?: string
  truckOwner?: string
  truckNo?: string
  supplier?: string
}

export interface DashboardStats {
  totalWeight: number
  totalCost: number
  totalProfit: number
  currentBalance: number
  totalOrders: number
  paidOrders: number
  unpaidOrders: number
  partialOrders: number
  estimatedProfit: number // Sum of profit from filtered orders
  paymentReceived: number // Sum of invoice payments within date range
  costAmount: number // Sum of originalTotal + additionalCost from filtered orders
  // New financial metrics
  moneyOut: number // Total expenses (originalTotal + additionalCost)
  rawMaterialPaymentsOutstanding: number // Yet to be paid for raw materials
  customerPaymentsReceived: number // Money received from customers (invoices)
  rawMaterialPaymentsReceived: number // Payments received for raw materials
  profitReceived: number // Profit received based on received money
  calculatedBalance: number // Current balance: Money received - Costs + Profits
  // Investment & Cash Flow Metrics (All Time)
  totalLedgerBalance?: number // All-time ledger balance (Income - Expenses)
  totalMoneyOutAllTime?: number // All-time money spent
  totalReceivables?: number // Total unpaid amount from all orders
  totalRevenueAllTime?: number // All-time total order value
}
