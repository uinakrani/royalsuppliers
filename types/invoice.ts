export interface InvoicePayment {
  id: string
  amount: number
  date: string // ISO date string
  note?: string
}

export interface Invoice {
  id?: string
  invoiceNumber: string // ROYAL + timestamp
  orderIds: string[] // Array of order IDs included in this invoice
  totalAmount: number // Total invoice amount
  paidAmount: number // Total amount paid so far
  partialPayments?: InvoicePayment[] // Array of partial payment records
  createdAt: string // ISO date string - invoice creation date
  dueDate: string // ISO date string - 1 week from creation
  paid: boolean // Whether invoice is fully paid
  overdue: boolean // Whether invoice is overdue
  partyName: string // Party name from orders
  siteName: string // Site name from orders
  archived: boolean // Whether orders are archived (when invoice is fully paid)
}

export interface InvoiceFilters {
  partyName?: string
  startDate?: string
  endDate?: string
  paid?: boolean
  overdue?: boolean
}

