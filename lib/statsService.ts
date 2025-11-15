import { Order } from '@/types/order'
import { DashboardStats } from '@/types/order'
import { startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from 'date-fns'

export const calculateStats = (orders: Order[]): DashboardStats => {
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
  }

  orders.forEach((order) => {
    stats.totalWeight += order.weight
    const orderCost = order.originalTotal + order.additionalCost
    stats.totalCost += orderCost
    stats.costAmount += orderCost // Same as totalCost for filtered orders
    stats.totalProfit += order.profit
    stats.estimatedProfit += order.profit // Estimated profit from filtered orders

    if (order.paid) {
      stats.currentBalance += order.total
      stats.paidOrders++
    } else {
      // Calculate total from partialPayments array if available, otherwise use paidAmount
      const partialTotal = order.partialPayments && order.partialPayments.length > 0
        ? order.partialPayments.reduce((sum, p) => sum + p.amount, 0)
        : (order.paidAmount || 0)
      
      if (partialTotal > 0) {
        // Include partial payments in balance
        stats.currentBalance += partialTotal
        stats.partialOrders++
        stats.unpaidOrders++
      } else {
        stats.unpaidOrders++
      }
    }
  })

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

