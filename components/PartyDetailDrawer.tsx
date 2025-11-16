'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Edit, Trash2, Plus } from 'lucide-react'
import { Order } from '@/types/order'
import { InvoicePayment } from '@/types/invoice'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { partyPaymentService } from '@/lib/partyPaymentService'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import { format } from 'date-fns'

interface PartyGroup {
  partyName: string
  totalSelling: number
  totalPaid: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  orders: Order[]
  payments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment }>
}

interface PartyDetailDrawerProps {
  group: PartyGroup | null
  isOpen: boolean
  onClose: () => void
  onEditOrder: (order: Order) => void
  onDeleteOrder: (id: string) => void
  onOrderClick?: (order: Order) => void
  onPaymentAdded?: () => Promise<void>
  onPaymentRemoved?: () => Promise<void>
}

export default function PartyDetailDrawer({ group, isOpen, onClose, onEditOrder, onDeleteOrder, onOrderClick, onPaymentAdded, onPaymentRemoved }: PartyDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

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

  const handleAddPayment = async () => {
    if (!group || isProcessing) return

    const balance = group.totalSelling - group.totalPaid
    
    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Add Payment',
        text: `Remaining balance: ${formatIndianCurrency(balance)}`,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputValue: balance > 0 ? balance.toString() : '',
        inputType: 'number',
        confirmText: 'Add Payment',
        cancelText: 'Cancel'
      })
      
      if (!amountStr) return

      const amount = parseFloat(amountStr)
      if (isNaN(amount) || amount <= 0) {
        showToast('Invalid amount', 'error')
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'Add a note (optional)',
        inputType: 'text',
        confirmText: 'Save',
        cancelText: 'Skip'
      })

      setIsProcessing(true)
      await partyPaymentService.addPayment(group.partyName, amount, note || undefined)
      showToast('Payment added successfully!', 'success')
      
      if (onPaymentAdded) {
        await onPaymentAdded()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to add payment: ${error?.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRemovePayment = async (paymentId: string) => {
    if (!group || isProcessing) return

    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Remove Payment?',
        text: 'Are you sure you want to remove this payment? This action cannot be undone.',
        icon: 'warning',
        confirmText: 'Remove',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      setIsProcessing(true)
      await partyPaymentService.removePayment(paymentId)
      showToast('Payment removed successfully!', 'success')
      
      if (onPaymentRemoved) {
        await onPaymentRemoved()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to remove payment: ${error?.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen || !group) return null

  const balance = group.totalSelling - group.totalPaid

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
          <h2 className="text-lg font-bold text-gray-900">{group.partyName}</h2>
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
          {/* Summary Section */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Total Selling</span>
                <span className="text-sm font-bold text-gray-900">{formatIndianCurrency(group.totalSelling)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Total Paid</span>
                <span className="text-sm font-bold text-green-600">{formatIndianCurrency(group.totalPaid)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Balance</span>
                <span className={`text-sm font-bold ${
                  balance > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {formatIndianCurrency(Math.abs(balance))}
                  {balance > 0 ? ' (Due)' : ' (Overpaid)'}
                </span>
              </div>
              {group.lastPaymentDate && group.lastPaymentAmount !== null && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Last Payment</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {format(new Date(group.lastPaymentDate), 'dd MMM yyyy')}
                    {(() => {
                      const last = group.payments.find((p) => p.payment && p.payment.date === group.lastPaymentDate)
                      return last?.payment?.note ? ` – ${last.payment.note}` : ''
                    })()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Orders Section */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Orders ({group.orders.length})</h3>
            <div className="space-y-2">
              {group.orders.map((order) => (
                <div
                  key={order.id}
                  className={`bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors ${
                    onOrderClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (onOrderClick) {
                      handleClose()
                      setTimeout(() => onOrderClick(order), 300)
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500">
                        {format(new Date(order.date), 'dd MMM yyyy')}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{order.siteName}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                      </p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-sm font-bold text-gray-900">{formatIndianCurrency(order.total)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Weight: {order.weight.toFixed(2)}</p>
                    </div>
                  </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {order.invoiced ? (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[9px] font-medium">
                            Invoiced
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-400">Not Invoiced</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            handleClose()
                            setTimeout(() => onEditOrder(order), 300)
                          }}
                          className="p-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => {
                            handleClose()
                            setTimeout(() => onDeleteOrder(order.id!), 300)
                          }}
                          className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment History Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Payment History ({group.payments.length})</h3>
              <button
                onClick={handleAddPayment}
                disabled={isProcessing}
                className="px-2 py-1 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                Add Payment
              </button>
            </div>
            {group.payments.length > 0 ? (
              <div className="space-y-2">
                {group.payments.map((paymentItem, idx) => (
                  <div
                    key={`${paymentItem.invoiceId}-${paymentItem.payment.id}-${idx}`}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">
                          {formatIndianCurrency(paymentItem.payment.amount)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(paymentItem.payment.date), 'dd MMM yyyy HH:mm')}
                        </p>
                        {paymentItem.payment.note && (
                          <p className="text-xs text-gray-600 mt-1">
                            {paymentItem.payment.note}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemovePayment(paymentItem.payment.id)}
                        disabled={isProcessing}
                        className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove Payment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500 mb-3">No payments recorded</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

