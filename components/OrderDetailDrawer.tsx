'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Edit, Trash2, Plus } from 'lucide-react'
import Button from '@/components/Button'
import { Order } from '@/types/order'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import { orderService, isOrderPaid } from '@/lib/orderService'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import PaymentEditDrawer from '@/components/PaymentEditDrawer'
import { ledgerService } from '@/lib/ledgerService'
import { getDb } from '@/lib/firebase'
import { updateDoc, doc } from 'firebase/firestore'

interface OrderDetailDrawerProps {
  order: Order | null
  isOpen: boolean
  onClose: () => void
  onEdit: (order: Order) => void
  onDelete: (id: string) => void
  onOrderUpdated?: () => void
}

export default function OrderDetailDrawer({ order, isOpen, onClose, onEdit, onDelete, onOrderUpdated }: OrderDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [editingPayment, setEditingPayment] = useState<{ order: Order; paymentId: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  // Calculate expense amount and remaining payment
  const getExpenseInfo = (order: Order) => {
    // Expense amount is just originalTotal (raw material cost)
    const expenseAmount = Number(order.originalTotal || 0)
    const existingPayments = order.partialPayments || []
    let totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    const remainingAmount = expenseAmount - totalPaid
    return { expenseAmount, totalPaid, remainingAmount }
  }

  const handleAddPayment = async () => {
    if (!order) return
    
    // Check if order is already paid
    if (isOrderPaid(order)) {
      showToast('Order is already paid', 'error')
      return
    }
    
    const { remainingAmount } = getExpenseInfo(order)

    setAddingPayment(true)
    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Add Payment',
        message: `Remaining amount: ${formatIndianCurrency(remainingAmount)}`,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputType: 'text',
        formatCurrencyInr: true,
        confirmText: 'Add Payment',
        cancelText: 'Cancel',
      })
      
      if (!amountStr) {
        setAddingPayment(false)
        return
      }
      
      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Invalid amount', 'error')
        setAddingPayment(false)
        return
      }
      
      // Get the expense amount (originalTotal)
      const { expenseAmount } = getExpenseInfo(order)
      
      // Check if payment exceeds the original total (expense amount)
      if (amount > expenseAmount) {
        showToast(`Payment amount cannot exceed original total (${formatIndianCurrency(expenseAmount)})`, 'error')
        setAddingPayment(false)
        return
      }
      
      // Check if payment exceeds remaining amount
      if (amount > remainingAmount) {
        showToast(`Payment amount cannot exceed remaining amount (${formatIndianCurrency(remainingAmount)})`, 'error')
        setAddingPayment(false)
        return
      }
      
      // Ask user what they want to do: Add Payment or Add and Mark as Paid
      const actionChoice = await sweetAlert.confirm({
        title: 'Add Payment',
        message: `Payment amount: ${formatIndianCurrency(amount)}\nRemaining: ${formatIndianCurrency(remainingAmount)}\n\nWhat would you like to do?`,
        icon: 'question',
        confirmText: 'Add and Mark as Paid',
        cancelText: 'Just Add Payment',
      })
      const markAsPaid = actionChoice || false
      
      const note = await sweetAlert.prompt({
        title: 'Add Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. Cash payment / Bank transfer',
        inputType: 'text',
        required: false,
        confirmText: 'Save',
        cancelText: 'Skip',
      })
      
      await orderService.addPaymentToOrder(order.id!, amount, note || undefined, markAsPaid)
      showToast('Payment added successfully!', 'success')
      
      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (error: any) {
      console.error('Error adding payment:', error)
      showToast(error.message || 'Failed to add payment', 'error')
    } finally {
      setAddingPayment(false)
    }
  }

  if (!isOpen || !order) return null

  const { expenseAmount, totalPaid, remainingAmount } = getExpenseInfo(order)

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black z-[90] ${
          isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter'
        }`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[100] overflow-y-auto max-h-[90vh] ${
          isClosing ? 'animate-drawer-exit' : 'animate-drawer-enter'
        }`}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center z-10 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Order Details</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pb-6 space-y-4">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Date</span>
              <span className="text-sm font-semibold text-gray-900">
                {format(new Date(order.date), 'dd MMM yyyy')}
              </span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Party Name</span>
              <span className="text-sm font-semibold text-gray-900 text-right">{order.partyName}</span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Site Name</span>
              <span className="text-sm font-semibold text-gray-900 text-right">{order.siteName}</span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Material</span>
              <span className="text-sm font-semibold text-gray-900 text-right">
                {Array.isArray(order.material) ? order.material.join(', ') : order.material}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Order Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Weight</span>
                <span className="text-sm font-semibold text-gray-900">{order.weight.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Rate</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.rate)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Total</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Original Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Weight</span>
                <span className="text-sm font-semibold text-gray-900">{order.originalWeight.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Rate</span>
                <span className={`text-sm font-semibold ${
                  order.originalRate > order.rate && order.rate > 0 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {formatIndianCurrency(order.originalRate)}
                </span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Total</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.originalTotal)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Financial Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Additional Cost</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.additionalCost)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Profit</span>
                <span className={`text-sm font-semibold ${
                  order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatIndianCurrency(order.profit)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Transport Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Truck Owner</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{order.truckOwner}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Truck No</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{order.truckNo}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Expense Payment</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Total Expense</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(expenseAmount)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Paid Amount</span>
                <span className="text-sm font-semibold text-green-600">{formatIndianCurrency(totalPaid)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Remaining</span>
                <span className={`text-sm font-semibold ${
                  remainingAmount > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {formatIndianCurrency(remainingAmount)}
                </span>
              </div>
              
              {order.partialPayments && order.partialPayments.length > 0 && (() => {
                const { expenseAmount } = getExpenseInfo(order)
                return (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="text-xs font-medium text-gray-500 block mb-2">Payment History</span>
                    <div className="space-y-2">
                      {order.partialPayments.map((payment) => {
                        // Calculate max amount for this payment (original total - other payments)
                        const otherPaymentsTotal = order.partialPayments!
                          .filter(p => p.id !== payment.id)
                          .reduce((sum, p) => sum + p.amount, 0)
                        const maxAmount = expenseAmount - otherPaymentsTotal
                        const isFromLedger = !!payment.ledgerEntryId
                        
                        return (
                          <div key={payment.id} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded">
                            <div className="flex-1">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-600">{format(new Date(payment.date), 'dd MMM yyyy')}</span>
                                  {isFromLedger && (
                                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                      From Ledger
                                    </span>
                                  )}
                                  {payment.note && (
                                    <span className="text-gray-500 text-[10px]">• {payment.note}</span>
                                  )}
                                </div>
                                <span className="font-semibold text-gray-900">{formatIndianCurrency(payment.amount)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-2">
                              <button
                                onClick={() => setEditingPayment({ order, paymentId: payment.id })}
                                className="p-1 bg-blue-50 text-blue-600 rounded active:bg-blue-100 transition-colors touch-manipulation"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                                title="Edit payment"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={async () => {
                                  if (!order.id) return
                                  try {
                                    const confirmed = await sweetAlert.confirm({
                                      title: 'Remove Payment?',
                                      message: isFromLedger 
                                        ? 'This payment is linked to a ledger entry. Removing it will free up funds to be redistributed to other unpaid orders. Continue?' 
                                        : 'Are you sure you want to remove this payment?',
                                      icon: 'warning',
                                      confirmText: 'Remove',
                                      cancelText: 'Cancel'
                                    })
                                    if (!confirmed) return
                                    
                                    await orderService.removePartialPayment(order.id, payment.id)
                                    
                                    // If it was a ledger payment, trigger redistribution
                                    if (isFromLedger && payment.ledgerEntryId) {
                                       try {
                                         const ledgerEntry = await ledgerService.getEntryById(payment.ledgerEntryId)
                                         if (ledgerEntry && ledgerEntry.supplier) {
                                            // Trigger redistribution for this supplier and ledger entry
                                            // This will use the now-freed-up amount to pay other orders
                                            await orderService.distributePaymentToSupplierOrders(
                                              ledgerEntry.supplier,
                                              ledgerEntry.amount, // Pass full amount, logic will calculate what's already used? 
                                              // Wait, distributePaymentToSupplierOrders adds NEW payments.
                                              // We need a way to say "Re-evaluate distribution for this ledger ID"
                                              // Actually, distributePaymentToSupplierOrders calculates remaining based on amount passed.
                                              // But here we want to use the *original* ledger amount and ensure it's fully utilized across orders.
                                              
                                              // Better approach:
                                              // 1. Get all payments for this ledgerEntryId across all orders.
                                              // 2. Calculate sum.
                                              // 3. Remaining = LedgerAmount - Sum.
                                              // 4. Call distribute with Remaining.
                                              
                                              // However, we just removed one payment, so we know there is 'payment.amount' free.
                                              // But strictly speaking, distributePaymentToSupplierOrders takes an amount to ADD.
                                              // So we can just call it with the amount we just removed!
                                              payment.ledgerEntryId,
                                              "Redistributed from removed payment"
                                            )
                                            // Wait, the function signature is: (supplier, amount, ledgerEntryId, note)
                                            // So:
                                            await orderService.distributePaymentToSupplierOrders(
                                              ledgerEntry.supplier,
                                              payment.amount, // The amount we just freed up
                                              payment.ledgerEntryId,
                                              "Redistributed from removed payment"
                                            )
                                            showToast('Payment removed and funds redistributed', 'success')
                                         }
                                       } catch (err) {
                                         console.error('Failed to redistribute after removal:', err)
                                         showToast('Payment removed but redistribution failed', 'error')
                                       }
                                    } else {
                                      showToast('Payment removed successfully', 'success')
                                    }

                                    if (onOrderUpdated) {
                                      await onOrderUpdated()
                                    }
                                  } catch (error: any) {
                                    console.error('Failed to remove payment:', error)
                                    showToast(error.message || 'Failed to remove payment', 'error')
                                  }
                                }}
                                className="p-1 bg-red-50 text-red-600 rounded active:bg-red-100 transition-colors touch-manipulation"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                                title="Remove payment"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              
              {remainingAmount > 0 && (
                <Button
                  onClick={handleAddPayment}
                  variant="primary"
                  size="sm"
                  fullWidth
                  loading={addingPayment}
                  icon={<Plus size={16} />}
                  className="mt-3"
                >
                  Add Payment
                </Button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Invoiced</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  order.invoiced 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {order.invoiced ? 'Yes' : 'No'}
                </span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Payment Status</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  isOrderPaid(order)
                    ? 'bg-green-100 text-green-700' 
                    : totalPaid > 0
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {isOrderPaid(order) ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 flex gap-2">
            <button
              onClick={() => {
                handleClose()
                setTimeout(() => onEdit(order), 300)
              }}
              className="flex-1 bg-primary-600 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Edit size={18} />
              Edit Order
            </button>
            <button
              onClick={() => {
                handleClose()
                setTimeout(() => onDelete(order.id!), 300)
              }}
              className="flex-1 bg-red-600 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Payment Edit Drawer */}
      {editingPayment && editingPayment.order.partialPayments && (() => {
        const payment = editingPayment.order.partialPayments!.find(p => p.id === editingPayment.paymentId)
        if (!payment) return null
        
        const isLedgerPayment = !!payment.ledgerEntryId
        
        // Calculate max amount (original total - other payments)
        const otherPaymentsTotal = editingPayment.order.partialPayments!
          .filter(p => p.id !== editingPayment.paymentId)
          .reduce((sum, p) => sum + p.amount, 0)
        const { expenseAmount } = getExpenseInfo(editingPayment.order)
        const maxAmount = expenseAmount - otherPaymentsTotal
        
        return (
          <PaymentEditDrawer
            isOpen={!!editingPayment}
            onClose={() => setEditingPayment(null)}
            onSave={async (data) => {
              if (!editingPayment.order.id) return
              try {
                // Check if amount changed (only for ledger payments)
                const amountChanged = isLedgerPayment && payment
                  ? Math.abs(Number(data.amount) - Number(payment.amount)) > 0.01
                  : false
                
                // Update payment (preserve ledgerEntryId if it exists)
                await orderService.updatePartialPayment(
                  editingPayment.order.id, 
                  editingPayment.paymentId, 
                  data,
                  payment.ledgerEntryId
                )
                
                // If this is a ledger payment AND the amount changed, redistribute the ledger entry
                if (isLedgerPayment && payment.ledgerEntryId && amountChanged) {
                  try {
                    // Get the ledger entry
                    const ledgerEntry = await ledgerService.getEntryById(payment.ledgerEntryId)
                    if (ledgerEntry && ledgerEntry.type === 'debit' && ledgerEntry.supplier) {
                      // Wait a bit for the payment update to propagate
                      await new Promise(resolve => setTimeout(resolve, 500))
                      
                      // Get all orders for this supplier (fresh data)
                      const allOrders = await orderService.getAllOrders({ supplier: ledgerEntry.supplier })
                      
                      // Calculate total amount currently allocated to orders from this ledger entry
                      // Account for the payment we just updated
                      let totalAllocated = 0
                      allOrders.forEach(order => {
                        if (order.id === editingPayment.order.id) {
                          // For the order we just updated, use the new payment amount
                          const otherLedgerPayments = (order.partialPayments || [])
                            .filter(p => p.ledgerEntryId === payment.ledgerEntryId && p.id !== payment.id)
                          const otherAmount = otherLedgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                          totalAllocated += otherAmount + data.amount // Add the updated amount
                        } else {
                          // For other orders, use their current payments
                          const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === payment.ledgerEntryId)
                          totalAllocated += ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                        }
                      })
                      
                      console.log(`🔄 Redistributing ledger entry ${payment.ledgerEntryId}: ledger entry amount=${ledgerEntry.amount}, currently allocated=${totalAllocated}`)

                      // NOTE: We do NOT automatically update the ledger entry amount
                      // The ledger entry amount should only be changed manually by the user
                      // We use the original ledger entry amount for redistribution

                      // Redistribute using the same logic as in app/ledger/page.tsx
                      // Get all orders and redistribute using the original ledger entry amount
                      const ordersWithOutstanding = allOrders
                        .map(order => {
                          const existingPayments = order.partialPayments || []
                          // Exclude payments from this ledger entry
                          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== payment.ledgerEntryId)
                          // For the order we just updated, we need to account for the fact that the payment was already updated
                          // So we don't need to add it back here
                          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                          const originalTotal = Number(order.originalTotal || 0)
                          const remaining = Math.max(0, originalTotal - totalPaid)
                          
                          const tempOrder: Order = {
                            ...order,
                            partialPayments: paymentsExcludingThis
                          }
                          
                          return { order, remaining, currentPayments: existingPayments, tempOrder }
                        })
                        .filter(({ remaining, tempOrder }) => {
                          const shouldInclude = remaining > 0 && !isOrderPaid(tempOrder)
                          if (!shouldInclude) {
                            console.log(`  ⏭️  Skipping order ${tempOrder.id} (remaining=${remaining}, isPaid=${isOrderPaid(tempOrder)})`)
                          }
                          return shouldInclude
                        })
                        .sort((a, b) => {
                          const aDate = new Date(a.order.date).getTime()
                          const bDate = new Date(b.order.date).getTime()
                          if (aDate !== bDate) return aDate - bDate
                          const aTime = new Date(a.order.createdAt || a.order.updatedAt || a.order.date).getTime()
                          const bTime = new Date(b.order.createdAt || b.order.updatedAt || b.order.date).getTime()
                          return aTime - bTime
                        })
                      
                      console.log(`📦 Found ${ordersWithOutstanding.length} orders with outstanding payments for redistribution`)

                      // Use the original ledger entry amount for redistribution, not the calculated totalAllocated
                      let remainingExpense = ledgerEntry.amount
                      const paymentsToAdd: Array<{ orderId: string; payment: any[] }> = []

                      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
                        if (remainingExpense <= 0) break
                        if (!order.id) continue
                        
                        const paymentAmount = Math.min(remainingExpense, remaining)
                        let paymentDate = data.date
                        if (paymentDate && !paymentDate.includes('T')) {
                          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
                        }
                        
                        const newPayment = {
                          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                          amount: paymentAmount,
                          date: paymentDate,
                          note: `From ledger entry`,
                          ledgerEntryId: payment.ledgerEntryId,
                        }
                        
                        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== payment.ledgerEntryId)
                        const updatedPayments = [...paymentsWithoutThisEntry, newPayment]
                        
                        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
                        remainingExpense -= paymentAmount
                      }

                      // Update orders with new payment distributions
                      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
                        await orderService.updateOrder(orderId, {
                          partialPayments: updatedPayments,
                        })
                        console.log(`  ✅ Updated order ${orderId} with redistributed payment`)
                      }
                      
                      if (remainingExpense > 0) {
                        console.warn(`⚠️ Could not fully redistribute. Remaining: ${remainingExpense}`)
                      } else {
                        console.log(`✅ Successfully redistributed ledger entry ${payment.ledgerEntryId}`)
                      }
                    }
                  } catch (redistError) {
                    console.error('Error redistributing ledger entry:', redistError)
                    // Don't fail the payment update if redistribution fails
                  }
                }
                
                setEditingPayment(null)
                if (onOrderUpdated) {
                  await onOrderUpdated()
                }
              } catch (error: any) {
                console.error('Failed to update payment:', error)
                showToast(error.message || 'Failed to update payment', 'error')
                setEditingPayment(null)
              }
            }}
            initialData={{ amount: payment.amount, date: payment.date }}
            maxAmount={maxAmount}
          />
        )
      })()}
    </>
  )
}
