export interface PaymentRecord {
  id: string
  amount: number
  date: string // ISO date string
}

export interface Order {
  id?: string
  date: string // ISO date string
  partyName: string
  siteName: string
  material: string | string[] // can be string (legacy) or array of selected materials
  weight: number
  rate: number
  total: number // calculated: weight * rate
  truckOwner: string
  truckNo: string
  originalWeight: number
  originalRate: number
  originalTotal: number // calculated: originalWeight * originalRate
  additionalCost: number
  profit: number // calculated: total - (originalTotal + additionalCost)
  paymentDue: boolean
  paid: boolean
  paidAmount?: number // total amount paid (calculated from partialPayments for backward compatibility)
  partialPayments?: PaymentRecord[] // array of individual payment records
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
  paymentDue?: boolean
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
}

