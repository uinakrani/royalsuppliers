import { Order } from '@/types/order'
import { DashboardStats } from '@/types/order'
import { LedgerEntry } from '@/lib/ledgerService'
import { startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from 'date-fns'
import { getAdjustedProfit } from '@/lib/orderCalculations'

export const calculateStats = (orders: Order[], ledgerEntries?: LedgerEntry[], dateRangeStart?: Date, dateRangeEnd?: Date): DashboardStats => {
  const stats: DashboardStats = {
    totalWeight: 0,
    totalCost: 0,
    totalProfit: 0,
    currentBalance: 0,
    totalOrders: orders.length,
    paidOrders: 0,
    unpaidOrders: 0,
    partialOrders: 0,
    estimatedProfit: 0,
    paymentReceived: 0, // Will be calculated separately with invoice data
    costAmount: 0,
    // New financial metrics
    moneyOut: 0,
    rawMaterialPaymentsOutstanding: 0,
    customerPaymentsReceived: 0,
    rawMaterialPaymentsReceived: 0,
    profitReceived: 0,
    calculatedBalance: 0, // Will be calculated separately
  }

  orders.forEach((order) => {
    stats.totalWeight += order.weight
    const orderCost = order.originalTotal + order.additionalCost
    stats.totalCost += orderCost
    stats.costAmount += orderCost // Same as totalCost for filtered orders
    const adjustedProfit = getAdjustedProfit(order)
    stats.totalProfit += adjustedProfit
    stats.estimatedProfit += adjustedProfit // Estimated profit from filtered orders
    
    // Raw material payments (payments MADE for raw materials - expenses)
    // Note: This is money going OUT, not money received
    const rawMaterialPayments = order.partialPayments || []
    const totalRawMaterialPaid = rawMaterialPayments.reduce((sum, p) => sum + p.amount, 0)
    stats.rawMaterialPaymentsReceived += totalRawMaterialPaid // This tracks payments made, not received
    
    // Outstanding raw material payments (what's still owed for raw materials)
    const rawMaterialOutstanding = Math.max(0, order.originalTotal - totalRawMaterialPaid)
    stats.rawMaterialPaymentsOutstanding += rawMaterialOutstanding

    // Determine order payment status based on partialPayments
    // Order is considered paid if total payments are within 250 of original total
    const tolerance = 250
    if (totalRawMaterialPaid >= (order.originalTotal - tolerance) && order.originalTotal > 0) {
      // Fully paid if total payments are within 250 of original total
      stats.paidOrders++
    } else if (totalRawMaterialPaid > 0) {
      // Partially paid if there are payments but less than (original total - tolerance)
      stats.partialOrders++
      stats.unpaidOrders++
    } else {
      // Unpaid if no payments
      stats.unpaidOrders++
    }
  })

  // Calculate income and expenses from ledger entries if provided
  if (ledgerEntries) {
    let totalIncomeFromLedger = 0
    let totalIncomeWithPartyName = 0 // Money received from parties (credit entries with partyName)
    let totalExpensesFromLedger = 0
    
    ledgerEntries.forEach((entry) => {
      const entryDate = new Date(entry.date)
      
      // Check if entry is within date range
      let isInRange = true
      if (dateRangeStart && entryDate < dateRangeStart) {
        isInRange = false
      }
      if (dateRangeEnd && entryDate > dateRangeEnd) {
        isInRange = false
      }
      
      if (isInRange) {
        if (entry.type === 'credit') {
          // All credit entries are income
          totalIncomeFromLedger += entry.amount
          // Money received is only credit entries with a party name
          if (entry.partyName && entry.partyName.trim()) {
            totalIncomeWithPartyName += entry.amount
          }
        } else if (entry.type === 'debit') {
          // All debit entries are money going out (expenses)
          totalExpensesFromLedger += entry.amount
        }
      }
    })
    
    // Use ledger entries as the source of truth for money flow
    // Money Received = Credit entries with party name (customer payments)
    stats.customerPaymentsReceived = totalIncomeWithPartyName
    
    // Money Out = All debit entries (expenses including raw materials, additional costs, etc.)
    stats.moneyOut = totalExpensesFromLedger
    
    // Calculate balance from ledger: Income (with party) - Expenses
    stats.calculatedBalance = totalIncomeWithPartyName - totalExpensesFromLedger
  }

  return stats
}

export const getDateRangeForDuration = (duration: string): { start: Date; end: Date } => {
  const now = new Date()
  let start: Date
  let end: Date = now

  switch (duration) {
    case '7days':
      start = subDays(now, 7)
      break
    case 'lastMonth':
      start = startOfMonth(subMonths(now, 1))
      end = endOfMonth(subMonths(now, 1))
      break
    case 'last3Months':
      start = subMonths(now, 3)
      break
    case 'last6Months':
      start = subMonths(now, 6)
      break
    case 'lastYear':
      start = startOfYear(subMonths(now, 12))
      end = subMonths(now, 12)
      break
    case 'currentMonth':
    default:
      start = startOfMonth(now)
      end = endOfMonth(now)
      break
  }

  return { start, end }
}

