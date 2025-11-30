'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order, PaymentRecord } from '@/types/order'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import { X, Edit, Trash2, Plus, Calendar, User, Truck, Package, DollarSign, TrendingUp, FileText } from 'lucide-react'
import { sweetAlert } from '@/lib/sweetalert'
import { showToast } from '@/components/Toast'
import { orderService, isOrderPaid } from '@/lib/orderService'

interface OrderDetailPopupProps {
  order: Order | null
  isOpen: boolean
  onClose: () => void
  onEdit: (order: Order) => void
  onDelete: (orderId: string) => void
  onAddPayment: (order: Order) => void
  onEditPayment: (order: Order, paymentId: string) => void
  onRemovePayment: (order: Order, paymentId: string) => void
  onOrderUpdated?: () => Promise<void>
}

const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return null
  }
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

export default function OrderDetailPopup({
  order,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onAddPayment,
  onEditPayment,
  onRemovePayment,
  onOrderUpdated,
}: OrderDetailPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [actualPaidAmount, setActualPaidAmount] = useState('')
  const [isEditingAdjustment, setIsEditingAdjustment] = useState(false)

  useEffect(() => {
    if (order) {
      const adj = order.adjustmentAmount || 0
      setActualPaidAmount((order.total + adj).toString())
    }
  }, [order])

  const handleSaveAdjustment = async () => {
    if (!order?.id) return
    const actual = parseFloat(actualPaidAmount)
    if (isNaN(actual)) {
      showToast('Invalid amount', 'error')
      return
    }
    const adjustment = actual - order.total

    try {
      await orderService.updateOrder(order.id, {
        ...order,
        adjustmentAmount: adjustment
      })
      setIsEditingAdjustment(false)
      if (onOrderUpdated) await onOrderUpdated()
      showToast('Profit adjustment saved', 'success')
    } catch (error) {
      console.error(error)
      showToast('Failed to save adjustment', 'error')
    }
  }

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

  const handleDelete = async () => {
    if (!order?.id) return
    
    const confirmed = await sweetAlert.confirm({
      title: 'Delete Order?',
      message: 'Are you sure you want to delete this order? This action cannot be undone.',
      icon: 'warning',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    })

    if (confirmed) {
      onDelete(order.id)
      handleClose()
    }
  }

  if (!isOpen || !order) return null

  const orderDate = safeParseDate(order.date)
  const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
  const partialPayments = order.partialPayments || []
  const totalRawPayments = partialPayments.reduce((sum, p) => sum + p.amount, 0)

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
          top: 'calc(70px + env(safe-area-inset-top, 0px))', // Header height (~70px) + safe area
          bottom: '4rem', // NavBar height (4rem = 64px)
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
          className={`bg-white rounded-2xl border border-gray-100 max-w-lg w-full pointer-events-auto flex flex-col ${
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
            <h2 className="text-lg font-bold text-gray-900">Order Details</h2>
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
            {/* Party Name & Total */}
            <div className="bg-primary-50 rounded-lg p-3 border border-primary-200">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-primary-600" />
                  <span className="font-semibold text-gray-900">{order.partyName}</span>
                </div>
                <span className="text-lg font-bold text-primary-600">
                  {formatIndianCurrency(order.total)}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">{order.siteName}</div>
            </div>

            {/* Key Info Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Profit */}
              <div className="bg-green-50 rounded-lg p-2.5 border border-green-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} className="text-green-600" />
                  <span className="text-xs text-gray-600">Profit</span>
                </div>
                <div className={`font-bold ${order.profit >= 0 ? 'text-green-700' : 'text-red-600'}`} style={{ fontSize: '14px' }}>
                  {formatIndianCurrency(order.profit)}
                </div>
              </div>

              {/* Raw Payments */}
              <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign size={14} className="text-blue-600" />
                  <span className="text-xs text-gray-600">Raw Payments</span>
                </div>
                <div className="font-bold text-blue-700" style={{ fontSize: '14px' }}>
                  {formatIndianCurrency(totalRawPayments)}
                </div>
              </div>

              {/* Date */}
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar size={14} className="text-gray-600" />
                  <span className="text-xs text-gray-600">Date</span>
                </div>
                <div className="font-semibold text-gray-900" style={{ fontSize: '12px' }}>
                  {orderDate ? format(orderDate, 'dd MMM yyyy') : 'Invalid Date'}
                </div>
                {orderDate && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {format(orderDate, 'hh:mm a')}
                  </div>
                )}
              </div>

              {/* Truck Owner */}
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <Truck size={14} className="text-gray-600" />
                  <span className="text-xs text-gray-600">Truck Owner</span>
                </div>
                <div className="font-semibold text-gray-900" style={{ fontSize: '12px' }}>
                  {order.truckOwner}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{order.truckNo}</div>
              </div>
            </div>

            {/* Profit Adjustment */}
            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign size={16} className="text-yellow-700" />
                  <span className="font-semibold text-gray-900 text-xs">Actual Party Payment</span>
                </div>
                {!isEditingAdjustment ? (
                  <button
                    onClick={() => setIsEditingAdjustment(true)}
                    className="text-primary-600 text-xs font-medium"
                  >
                    Adjust
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={handleSaveAdjustment} className="text-green-600 text-xs font-bold">Save</button>
                    <button onClick={() => setIsEditingAdjustment(false)} className="text-gray-500 text-xs">Cancel</button>
                  </div>
                )}
              </div>

              {isEditingAdjustment ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-16">Paid Amount:</span>
                    <input
                      type="number"
                      value={actualPaidAmount}
                      onChange={(e) => setActualPaidAmount(e.target.value)}
                      className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Original Total: {formatIndianCurrency(order.total)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Realized Profit (Payments):</span>
                    {(() => {
                      const totalReceived = (order.customerPayments || []).reduce((sum, p) => sum + p.amount, 0)
                      const totalPaidOut = (order.partialPayments || []).reduce((sum, p) => sum + p.amount, 0)
                      const realizedProfit = totalReceived - totalPaidOut - order.additionalCost
                      return (
                        <span className={`font-bold text-sm ${realizedProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {formatIndianCurrency(realizedProfit)}
                        </span>
                      )
                    })()}
                  </div>
                  {order.adjustmentAmount ? (
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span>Manual Adjustment:</span>
                      <span>{formatIndianCurrency(order.adjustmentAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center text-[10px] text-gray-500 border-t border-yellow-200 pt-1 mt-1">
                     <span>Projected Profit:</span>
                     <span className="font-medium text-gray-700">{formatIndianCurrency(order.profit)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Material */}
            <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
              <div className="flex items-center gap-1.5 mb-2">
                <Package size={14} className="text-gray-600" />
                <span className="text-xs font-medium text-gray-700">Material</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {materials.map((mat, idx) => (
                  <span
                    key={idx}
                    className="bg-white px-2 py-1 rounded text-xs font-medium text-gray-700 border border-gray-300"
                  >
                    {mat}
                  </span>
                ))}
              </div>
            </div>

            {/* Raw Material Payments */}
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <DollarSign size={16} className="text-blue-600" />
                  <span className="font-semibold text-gray-900">Raw Material Payments</span>
                </div>
                <button
                  onClick={() => {
                    handleClose()
                    setTimeout(() => {
                      onAddPayment(order)
                    }, 300)
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium active:bg-blue-700 transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Plus size={14} />
                  Add Payment
                </button>
              </div>

              {partialPayments.length === 0 ? (
                <div className="text-center text-gray-500 py-4 text-xs">
                  No payments added yet
                </div>
              ) : (
                <div className="space-y-2">
                  {partialPayments.map((payment) => {
                    const paymentDate = safeParseDate(payment.date)
                    const isFromLedger = !!payment.ledgerEntryId
                    return (
                      <div
                        key={payment.id}
                        className="bg-white rounded-lg p-2.5 border border-blue-300 flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900" style={{ fontSize: '13px' }}>
                                {formatIndianCurrency(payment.amount)}
                              </span>
                              {isFromLedger && (
                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                  From Ledger
                                </span>
                              )}
                            </div>
                            {paymentDate && (
                              <span className="text-xs text-gray-500">
                                {format(paymentDate, 'dd MMM yyyy')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {paymentDate && (
                              <div className="text-xs text-gray-500">
                                {format(paymentDate, 'hh:mm a')}
                              </div>
                            )}
                            {payment.note && (
                              <span className="text-xs text-gray-500">• {payment.note}</span>
                            )}
                          </div>
                        </div>
                        {!isFromLedger && (
                          <div className="flex gap-1 ml-2">
                            <button
                              onClick={() => {
                                handleClose()
                                setTimeout(() => {
                                  onEditPayment(order, payment.id)
                                }, 300)
                              }}
                              className="p-1.5 bg-blue-100 text-blue-700 rounded active:bg-blue-200 transition-colors touch-manipulation"
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                              title="Edit Payment"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                const confirmed = await sweetAlert.confirm({
                                  title: 'Remove Payment?',
                                  message: 'Are you sure you want to remove this payment?',
                                  icon: 'warning',
                                })
                                if (confirmed) {
                                  onRemovePayment(order, payment.id)
                                  if (onOrderUpdated) {
                                    await onOrderUpdated()
                                  }
                                }
                              }}
                              className="p-1.5 bg-red-100 text-red-700 rounded active:bg-red-200 transition-colors touch-manipulation"
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                              title="Remove Payment"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Additional Details */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
              <div className="text-xs font-medium text-gray-700 mb-2">Additional Details</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600">Weight:</span>
                  <span className="font-semibold text-gray-900 ml-1">{order.weight.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Rate:</span>
                  <span className="font-semibold text-gray-900 ml-1">{formatIndianCurrency(order.rate)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Original Weight:</span>
                  <span className="font-semibold text-gray-900 ml-1">{order.originalWeight.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Original Rate:</span>
                  <span className="font-semibold text-gray-900 ml-1">{formatIndianCurrency(order.originalRate)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Original Total:</span>
                  <span className="font-semibold text-gray-900 ml-1">{formatIndianCurrency(order.originalTotal)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Additional Cost:</span>
                  <span className="font-semibold text-gray-900 ml-1">{formatIndianCurrency(order.additionalCost)}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-300 flex items-center gap-2">
                {order.invoiced ? (
                  <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                    <FileText size={12} />
                    Invoiced
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Not Invoiced</span>
                )}
                {(() => {
                  const existingPayments = order.partialPayments || []
                  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0)
                  
                  if (isOrderPaid(order)) {
                    return (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                        Paid
                      </span>
                    )
                  } else if (totalPaid > 0) {
                    return (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                        Partially Paid
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex-shrink-0 flex gap-2 p-4 border-t border-gray-200">
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-medium active:bg-red-700 transition-colors touch-manipulation flex items-center justify-center gap-2"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Trash2 size={18} />
              <span>Delete</span>
            </button>
            <button
              onClick={() => {
                handleClose()
                setTimeout(() => onEdit(order), 300)
              }}
              className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-medium active:bg-primary-700 transition-colors touch-manipulation flex items-center justify-center gap-2"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Edit size={18} />
              <span>Edit</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

