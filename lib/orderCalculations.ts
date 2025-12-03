import { Order } from '@/types/order'

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Returns the projected profit after applying expense, revenue, and manual adjustments.
 */
export const getAdjustedProfit = (order: Order): number => {
  const expenseAdjustment = toNumber(order.expenseAdjustment)
  const revenueAdjustment = toNumber(order.revenueAdjustment)
  const manualAdjustment = toNumber(order.adjustmentAmount)
  const adjusted = order.profit + expenseAdjustment + revenueAdjustment + manualAdjustment
  return Math.round(adjusted * 100) / 100
}

/**
 * Indicates if an order has any adjustment impacting the profit display.
 */
export const hasProfitAdjustments = (order: Order): boolean => {
  const adjusted = getAdjustedProfit(order)
  return Math.abs(adjusted - order.profit) > 0.01
}


