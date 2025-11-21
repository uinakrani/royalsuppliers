'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order } from '@/types/order'
import { InvoicePayment } from '@/types/invoice'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import { X, Edit, Trash2, Plus, User, DollarSign, TrendingUp, FileText, Calendar } from 'lucide-react'
import { sweetAlert } from '@/lib/sweetalert'
import { showToast } from '@/components/Toast'
import { partyPaymentService } from '@/lib/partyPaymentService'
import { createRipple } from '@/lib/rippleEffect'

interface PartyGroup {
  partyName: string
  totalSelling: number
  totalPaid: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  orders: Order[]
  payments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment }>
}

interface PartyDetailPopupProps {
  group: PartyGroup | null
  isOpen: boolean
  onClose: () => void
  onEditOrder: (order: Order) => void
  onDeleteOrder: (id: string) => void
  onOrderClick?: (order: Order) => void
  onPaymentAdded?: () => Promise<void>
  onPaymentRemoved?: () => Promise<void>
}

const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return null
  }
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

export default function PartyDetailPopup({
  group,
  isOpen,
  onClose,
  onEditOrder,
  onDeleteOrder,
  onOrderClick,
  onPaymentAdded,
  onPaymentRemoved,
}: PartyDetailPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Check if app is in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.documentElement.classList.contains('standalone')
      setIsStandalone(isStandaloneMode)
    }
    checkStandalone()
    // Re-check on class changes
    const observer = new MutationObserver(checkStandalone)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
      setIsMounted(false)
      requestAnimationFrame(() => {
        setIsMounted(true)
      })
      document.body.style.overflow = 'hidden'
    } else {
      setIsMounted(false)
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
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
        message: `Remaining balance: ${formatIndianCurrency(balance)}`,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputType: 'text',
        formatCurrencyInr: true,
        confirmText: 'Add Payment',
        cancelText: 'Cancel'
      })
      
      if (!amountStr) return

      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
      if (isNaN(amount) || amount <= 0) {
        showToast('Invalid amount', 'error')
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'Add a note (optional)',
        inputType: 'text',
        required: false,
        confirmText: 'Save',
        cancelText: 'Skip',
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

    const confirmed = await sweetAlert.confirm({
      title: 'Remove Payment?',
      message: 'Are you sure you want to remove this payment? This action cannot be undone.',
      icon: 'warning',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    })

    if (!confirmed) return

    try {
      setIsProcessing(true)
      await partyPaymentService.removePayment(paymentId)
      showToast('Payment removed successfully!', 'success')
      if (onPaymentRemoved) {
        await onPaymentRemoved()
      }
    } catch (error: any) {
      showToast(`Failed to remove payment: ${error?.message || 'Unknown error'}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen || !group) return null

  const balance = group.totalSelling - group.totalPaid
  const lastPaymentDateObj = safeParseDate(group.lastPaymentDate)

  const popupContent = (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 z-[99999] popup-backdrop ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{
          willChange: 'opacity',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
        }}
      />

      {/* Popup */}
      <div
        className="fixed z-[99999] flex items-center justify-center pointer-events-none popup-container"
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          position: 'fixed',
          top: 'calc(70px + env(safe-area-inset-top, 0px))',
          bottom: '4rem',
          left: 0,
          right: 0,
          padding: '1rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
          zIndex: isStandalone ? 99999 : 99999,
        }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-2xl shadow-2xl max-w-lg w-full pointer-events-auto flex flex-col ${
            isClosing
              ? 'native-modal-exit'
              : isMounted
              ? 'native-modal-enter'
              : 'opacity-0 scale-95 translate-y-4'
          }`}
          style={{
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            maxHeight: 'calc(100dvh - 70px - 4rem - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <User size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{group.partyName}</h2>
                {group.orders.length > 0 && group.orders[0].siteName && (
                  <p className="text-xs text-gray-500 mt-0.5">{group.orders[0].siteName}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg active:bg-gray-100 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Close"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Summary Section */}
            <div className="bg-primary-50 rounded-lg p-3 border border-primary-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-primary-600" />
                <h3 className="font-semibold text-gray-900">Summary</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Selling</span>
                  <span className="text-sm font-bold text-gray-900">{formatIndianCurrency(group.totalSelling)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Paid</span>
                  <span className="text-sm font-bold text-green-600">{formatIndianCurrency(group.totalPaid)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-primary-200">
                  <span className="text-sm font-medium text-gray-700">Balance</span>
                  <span className={`text-sm font-bold ${
                    balance > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {formatIndianCurrency(Math.abs(balance))}
                    {balance > 0 ? ' (Due)' : ' (Overpaid)'}
                  </span>
                </div>
                {lastPaymentDateObj && group.lastPaymentAmount !== null && (
                  <div className="flex justify-between items-center pt-2 border-t border-primary-200">
                    <span className="text-sm text-gray-600">Last Payment</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {format(lastPaymentDateObj, 'dd MMM yyyy')} ({formatIndianCurrency(group.lastPaymentAmount)})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Orders Section */}
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Orders ({group.orders.length})</h3>
                </div>
              </div>
              <div className="space-y-2">
                {group.orders.map((order, index) => {
                  const orderDate = safeParseDate(order.date)
                  const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
                  const expenseAmount = Number(order.originalTotal || 0)
                  const existingPayments = order.partialPayments || []
                  let totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0)
                  if (order.paid && totalPaid === 0 && expenseAmount > 0) {
                    totalPaid = expenseAmount
                  }
                  const remainingAmount = expenseAmount - totalPaid

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-lg p-2.5 border border-blue-300 transition-all duration-200 hover:shadow-md native-press"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        position: 'relative',
                        overflow: 'hidden',
                        animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`,
                      }}
                      onClick={(e) => {
                        if (onOrderClick) {
                          createRipple(e)
                          handleClose()
                          setTimeout(() => onOrderClick(order), 300)
                        }
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          {orderDate && (
                            <div className="flex items-center gap-1 mb-1">
                              <Calendar size={12} className="text-gray-400" />
                              <span className="text-xs text-gray-500">{format(orderDate, 'dd MMM yyyy')}</span>
                            </div>
                          )}
                          <p className="text-sm font-semibold text-gray-900">{order.siteName}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {materials.slice(0, 2).join(', ')}{materials.length > 2 ? ` +${materials.length - 2} more` : ''}
                          </p>
                        </div>
                        <div className="text-right ml-2">
                          <p className="text-sm font-bold text-primary-600">{formatIndianCurrency(order.total)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Weight: {order.weight.toFixed(2)}</p>
                        </div>
                      </div>
                      {expenseAmount > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-600">Expense:</span>
                            <span className="font-medium text-gray-900">{formatIndianCurrency(expenseAmount)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-600">Paid:</span>
                            <span className={`font-medium ${totalPaid > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                              {formatIndianCurrency(totalPaid)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-600">Remaining:</span>
                            <span className={`font-medium ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatIndianCurrency(remainingAmount)}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2" onClick={(e) => e.stopPropagation()}>
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
                            onClick={(e) => {
                              createRipple(e)
                              handleClose()
                              setTimeout(() => onEditOrder(order), 300)
                            }}
                            className="p-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation native-press"
                            title="Edit"
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              createRipple(e)
                              handleClose()
                              setTimeout(() => onDeleteOrder(order.id!), 300)
                            }}
                            className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 active:bg-red-200 transition-colors touch-manipulation native-press"
                            title="Delete"
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment History Section */}
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-green-600" />
                  <h3 className="font-semibold text-gray-900">Payment History ({group.payments.length})</h3>
                </div>
                <button
                  onClick={(e) => {
                    createRipple(e)
                    handleAddPayment()
                  }}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-2 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 active:bg-green-800 transition-colors touch-manipulation native-press disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <Plus size={14} />
                  Add Payment
                </button>
              </div>
              {group.payments.length > 0 ? (
                <div className="space-y-2">
                  {group.payments.map((paymentItem, idx) => {
                    const paymentDate = safeParseDate(paymentItem.payment.date)
                    return (
                      <div
                        key={`${paymentItem.invoiceId}-${paymentItem.payment.id}-${idx}`}
                        className="bg-white rounded-lg p-2.5 border border-green-300 transition-all duration-200 hover:shadow-md"
                        style={{
                          animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both`,
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">
                              {formatIndianCurrency(paymentItem.payment.amount)}
                            </p>
                            {paymentDate && (
                              <div className="flex items-center gap-1 mt-1">
                                <Calendar size={12} className="text-gray-400" />
                                <p className="text-xs text-gray-500">
                                  {format(paymentDate, 'dd MMM yyyy HH:mm')}
                                </p>
                              </div>
                            )}
                            {paymentItem.payment.note && (
                              <p className="text-xs text-gray-600 mt-1">
                                {paymentItem.payment.note}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              createRipple(e)
                              handleRemovePayment(paymentItem.payment.id)
                            }}
                            disabled={isProcessing}
                            className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 active:bg-red-200 transition-colors touch-manipulation native-press disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Remove Payment"
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-white border border-green-300 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500">No payments recorded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

