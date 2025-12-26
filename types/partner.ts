export interface Partner {
  id?: string
  name: string
  percentage: number // Profit share percentage (0-100)
  workspaceId: string
  createdAt?: string
  updatedAt?: string
}

export interface Withdrawal {
  id?: string
  partnerId: string
  amount: number
  date: string // ISO date string
  note?: string
  createdAt?: string
  updatedAt?: string
}
