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
 * Calculates the estimated profit for an order.
 * This is the theoretical profit based on order values, before considering cash flows.
 */
export const getEstimatedProfit = (order: Order): number => {
  const total = Math.max(0, toNumber(order.total)) // Selling price
  const originalTotal = Math.max(0, toNumber(order.originalTotal)) // Cost price
  const additionalCost = Math.max(0, toNumber(order.additionalCost)) // Extra costs

  // Validate that we have meaningful values
  if (total <= 0 || originalTotal <= 0) {
    return 0 // Can't calculate meaningful profit without proper pricing
  }

  // Basic profit calculation: Revenue - (Cost + Additional Costs)
  const estimatedProfit = total - (originalTotal + additionalCost)

  return Math.round(estimatedProfit * 100) / 100
}

/**
 * Calculates the realized profit based on actual cash flows.
 * This considers what money has actually been received vs spent.
 */
export const getRealizedProfit = (order: Order): number => {
  const total = Math.max(0, toNumber(order.total))
  const originalTotal = Math.max(0, toNumber(order.originalTotal))
  const additionalCost = Math.max(0, toNumber(order.additionalCost))

  // Money received from customer (actual revenue realized)
  const customerPayments = order.customerPayments || []
  const totalReceived = customerPayments.reduce((sum, payment) => sum + Math.max(0, toNumber(payment.amount)), 0)

  // Money paid to supplier (actual costs incurred)
  const partialPayments = order.partialPayments || []
  const totalPaidToSupplier = partialPayments.reduce((sum, payment) => sum + Math.max(0, toNumber(payment.amount)), 0)

  // Realized profit = Money Received - Money Paid - Additional Costs
  // We only count additional costs as realized if we've received some payment from customer
  const realizedAdditionalCost = totalReceived > 0 ? additionalCost : 0

  const realizedProfit = totalReceived - totalPaidToSupplier - realizedAdditionalCost

  return Math.round(realizedProfit * 100) / 100
}

/**
 * Intelligent profit calculation that adapts based on the order's payment status.
 *
 * Strategy:
 * 1. If order has been fully paid by customer AND fully paid to supplier: Use realized profit (but cap at 0 if negative)
 * 2. If order has some payments: Use a weighted average of estimated and realized profit
 * 3. If no payments: Use estimated profit but cap negative values at 0 (show as break-even)
 * 4. Always ensure profit is never negative for incomplete orders
 */
export const getIntelligentProfit = (order: Order): number => {
  const estimatedProfit = getEstimatedProfit(order)
  const realizedProfit = getRealizedProfit(order)

  const total = Math.max(0, toNumber(order.total))
  const originalTotal = Math.max(0, toNumber(order.originalTotal))
  const additionalCost = Math.max(0, toNumber(order.additionalCost))

  // Get payment status
  const customerPayments = order.customerPayments || []
  const totalReceived = customerPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const partialPayments = order.partialPayments || []
  const totalPaidToSupplier = partialPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)

  // Calculate payment completion ratios
  const paymentRatio = total > 0 ? Math.min(1, totalReceived / total) : 0
  const costPaymentRatio = originalTotal > 0 ? Math.min(1, totalPaidToSupplier / originalTotal) : 0

  // Intelligent profit logic:
  if (paymentRatio >= 0.95 && costPaymentRatio >= 0.95) {
    // Order is essentially complete - use realized profit, but don't show negative
    return Math.max(0, realizedProfit)
  } else if (paymentRatio > 0.1 || costPaymentRatio > 0.1) {
    // Order has some activity - blend estimated and realized profit, but ensure non-negative
    const blendRatio = Math.max(paymentRatio, costPaymentRatio)
    const blendedProfit = Math.round((estimatedProfit * (1 - blendRatio) + realizedProfit * blendRatio) * 100) / 100
    return Math.max(0, blendedProfit)
  } else {
    // No significant payments - use estimated profit but never show negative
    // This prevents showing losses on orders that haven't started yet
    return Math.max(0, estimatedProfit)
  }
}

/**
 * Returns the profit to display, applying all adjustments.
 * Uses intelligent profit as base, then applies manual adjustments.
 */
export const getAdjustedProfit = (order: Order): number => {
  const baseProfit = getIntelligentProfit(order)

  const expenseAdjustment = toNumber(order.expenseAdjustment)
  const revenueAdjustment = toNumber(order.revenueAdjustment)
  const manualAdjustment = toNumber(order.adjustmentAmount)

  const adjusted = baseProfit + expenseAdjustment + revenueAdjustment + manualAdjustment
  return Math.round(adjusted * 100) / 100
}

/**
 * Indicates if an order has any adjustment impacting the profit display.
 */
export const hasProfitAdjustments = (order: Order): boolean => {
  const adjusted = getAdjustedProfit(order)
  const original = getEstimatedProfit(order)
  return Math.abs(adjusted - original) > 0.01
}

/**
 * Debug function to analyze profit calculation for an order.
 * Returns detailed breakdown of profit components.
 */
export const debugProfitCalculation = (order: Order) => {
  const total = Math.max(0, toNumber(order.total))
  const originalTotal = Math.max(0, toNumber(order.originalTotal))
  const additionalCost = Math.max(0, toNumber(order.additionalCost))

  const customerPayments = order.customerPayments || []
  const totalReceived = customerPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)

  const partialPayments = order.partialPayments || []
  const totalPaidToSupplier = partialPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)

  const estimatedProfit = getEstimatedProfit(order)
  const realizedProfit = getRealizedProfit(order)
  const intelligentProfit = getIntelligentProfit(order)
  const adjustedProfit = getAdjustedProfit(order)

  return {
    orderId: order.id,
    values: {
      total, // Selling price
      originalTotal, // Cost price
      additionalCost,
      totalReceived, // Customer payments
      totalPaidToSupplier, // Supplier payments
    },
    calculations: {
      estimatedProfit, // total - (originalTotal + additionalCost)
      realizedProfit, // totalReceived - totalPaidToSupplier - additionalCost (if payments received)
      intelligentProfit, // Smart blend based on payment status
      adjustedProfit, // intelligentProfit + adjustments
    },
    adjustments: {
      expenseAdjustment: toNumber(order.expenseAdjustment),
      revenueAdjustment: toNumber(order.revenueAdjustment),
      manualAdjustment: toNumber(order.adjustmentAmount),
    },
    paymentRatios: {
      revenueReceivedRatio: total > 0 ? totalReceived / total : 0,
      costPaidRatio: originalTotal > 0 ? totalPaidToSupplier / originalTotal : 0,
    }
  }
}



