'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order } from '@/types/order'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import { X, Package, DollarSign, FileText, Calendar, TrendingDown } from 'lucide-react'
import { LedgerEntry } from '@/lib/ledgerService'
import { createRipple } from '@/lib/rippleEffect'

interface SupplierGroup {
  supplierName: string
  totalAmount: number
  totalPaid: number
  remainingAmount: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  orders: Order[]
  ledgerPayments: Array<{ entry: LedgerEntry }>
}

interface SupplierDetailPopupProps {
  group: SupplierGroup | null
  isOpen: boolean
  onClose: () => void
  onEditOrder: (order: Order) => void
  onDeleteOrder: (id: string) => void
  onOrderClick?: (order: Order) => void
  onRefresh?: () => Promise<void>
}

const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return null
  }
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

export default function SupplierDetailPopup({
  group,
  isOpen,
  onClose,
  onEditOrder,
  onDeleteOrder,
  onOrderClick,
  onRefresh,
}: SupplierDetailPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.documentElement.classList.contains('standalone')
      setIsStandalone(isStandaloneMode)
    }
    checkStandalone()
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

  if (!isOpen || !group) return null

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
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Package size={20} className="text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{group.supplierName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Raw Material Supplier</p>
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
            <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={16} className="text-orange-600" />
                <h3 className="font-semibold text-gray-900">Summary</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Amount to Supplier</span>
                  <span className="text-sm font-bold text-gray-900">{formatIndianCurrency(group.totalAmount)}</span>
                </div>
                <div className="text-xs text-gray-500 pl-1">
                  (Sum of: Original Total - Direct Payments for each order)
                </div>
                
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm text-gray-600">Paid to Supplier (Ledger)</span>
                  <span className="text-sm font-bold text-green-600">
                    {formatIndianCurrency(group.ledgerPayments.reduce((sum, p) => sum + Number(p.entry.amount || 0), 0))}
                  </span>
                </div>
                <div className="text-xs text-gray-500 pl-1">
                  (Total from all ledger expense entries for this supplier)
                </div>
                {(() => {
                  // Calculate total ledger entry amount vs total distributed to orders
                  const totalLedgerEntryAmount = group.ledgerPayments.reduce((sum, p) => sum + Number(p.entry.amount || 0), 0)
                  const totalDistributedToOrders = group.orders.reduce((sum, order) => {
                    const ledgerPayments = (order.partialPayments || []).filter(p => {
                      const ledgerEntryIds = new Set(group.ledgerPayments.map(p => p.entry.id).filter(Boolean))
                      return p.ledgerEntryId && ledgerEntryIds.has(p.ledgerEntryId)
                    })
                    return sum + ledgerPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
                  }, 0)
                  const undistributedAmount = totalLedgerEntryAmount - totalDistributedToOrders
                  
                  if (Math.abs(undistributedAmount) > 0.01) {
                    return (
                      <div className="mt-2 pt-2 border-t border-orange-200">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">Distributed to Orders:</span>
                          <span className="font-semibold text-blue-600">{formatIndianCurrency(totalDistributedToOrders)}</span>
                        </div>
                        {undistributedAmount > 0 && (
                          <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-gray-600">Undistributed Amount:</span>
                            <span className="font-semibold text-orange-600">{formatIndianCurrency(undistributedAmount)}</span>
                          </div>
                        )}
                        <div className="text-xs text-gray-600 mt-2 px-2 py-1 bg-orange-100 rounded border border-orange-200">
                          {undistributedAmount > 0 
                            ? `Not enough unpaid orders to distribute full amount`
                            : `Over-distributed - check for errors`}
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Paid (All Payments)</span>
                  <span className="text-sm font-bold text-blue-600">{formatIndianCurrency(group.totalPaid)}</span>
                </div>
                <div className="text-xs text-gray-500 pl-1">
                  (Includes: Direct payments + Supplier payments)
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                  <span className="text-sm font-medium text-gray-700">Remaining to Supplier</span>
                  <span className={`text-sm font-bold ${
                    group.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {formatIndianCurrency(Math.abs(group.remainingAmount))}
                    {group.remainingAmount > 0 ? ' (Due)' : ' (Paid)'}
                  </span>
                </div>
                {lastPaymentDateObj && group.lastPaymentAmount !== null && (
                  <div className="flex justify-between items-center pt-2 border-t border-orange-200">
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
              <div className="space-y-1.5">
                {group.orders.map((order, index) => {
                  const orderDate = safeParseDate(order.date)
                  const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
                  const expenseAmount = Number(order.originalTotal || 0)
                  const existingPayments = order.partialPayments || []
                  
                  // Separate payments: direct (non-ledger) vs supplier (ledger)
                  const directPayments = existingPayments.filter(p => !p.ledgerEntryId)
                  
                  // Match ledger payments with actual ledger entries to ensure accuracy
                  // Only show payments that match actual ledger entries (by ledgerEntryId)
                  const ledgerEntryIds = new Set(group.ledgerPayments.map(p => p.entry.id).filter(Boolean))
                  const supplierPayments = existingPayments.filter(p => {
                    if (!p.ledgerEntryId) return false
                    // Only include if this ledger entry exists in the supplier's ledger entries
                    return ledgerEntryIds.has(p.ledgerEntryId)
                  })
                  
                  // Get the actual ledger entry for each supplier payment to show correct amount
                  // Note: The payment.amount is the portion of the ledger entry allocated to THIS order
                  // (A ledger entry can be split across multiple orders)
                  const supplierPaymentsWithLedger = supplierPayments.map(payment => {
                    const ledgerEntry = group.ledgerPayments.find(p => p.entry.id === payment.ledgerEntryId)
                    return {
                      ...payment,
                      // Use the payment amount (which is the portion allocated to this order)
                      // NOT the full ledger entry amount (which might be split across orders)
                      amount: payment.amount, // This is the correct amount for this order
                      ledgerEntry: ledgerEntry?.entry // Keep reference for display
                    }
                  })
                  
                  const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                  const paidDirectly = directPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                  const paidToSupplier = supplierPaymentsWithLedger.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                  const remainingAmount = expenseAmount - totalPaid
                  
                  // Verification: Log if there's a mismatch (for debugging)
                  // This helps identify when order.partialPayments doesn't match ledger entries
                  if (process.env.NODE_ENV === 'development' && order.id) {
                    const allLedgerPaymentsInOrder = existingPayments.filter(p => p.ledgerEntryId)
                    const unmatchedLedgerPayments = allLedgerPaymentsInOrder.filter(p => !ledgerEntryIds.has(p.ledgerEntryId!))
                    if (unmatchedLedgerPayments.length > 0) {
                      console.warn(`⚠️ Order ${order.id}: Found ${unmatchedLedgerPayments.length} ledger payment(s) that don't match any ledger entry:`, unmatchedLedgerPayments.map(p => ({ id: p.id, ledgerEntryId: p.ledgerEntryId, amount: p.amount })))
                    }
                  }

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-lg p-3 border border-blue-300 transition-all duration-150 active:bg-blue-50 native-press shadow-sm"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        position: 'relative',
                        overflow: 'hidden',
                        animation: `fadeInUp 0.2s ease-out ${index * 0.03}s both`,
                      }}
                      onClick={(e) => {
                        if (onOrderClick) {
                          createRipple(e)
                          handleClose()
                          setTimeout(() => onOrderClick(order), 300)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {orderDate && (
                              <span className="text-xs text-gray-500 font-medium">{format(orderDate, 'dd MMM')}</span>
                            )}
                            <span className="text-sm font-semibold text-gray-900 truncate">{order.siteName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {materials.slice(0, 2).map((mat, idx) => (
                              <span key={idx} className="bg-primary-50 text-primary-700 px-2 py-1 rounded-md text-xs font-medium border border-primary-100">
                                {mat}
                              </span>
                            ))}
                            {materials.length > 2 && (
                              <span className="text-xs text-gray-500 font-medium">+{materials.length - 2} more</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <p className="text-sm font-bold text-orange-600">{formatIndianCurrency(expenseAmount)}</p>
                        </div>
                      </div>
                      
                      {expenseAmount > 0 && (
                        <div className="space-y-2 pt-2 border-t border-gray-200">
                          {/* Payment Summary */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                              <div className="text-xs text-gray-600 mb-1 font-medium">Total Paid</div>
                              <div className={`text-sm font-bold ${totalPaid > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                {formatIndianCurrency(totalPaid)}
                              </div>
                            </div>
                            {remainingAmount > 0 && (
                              <div className="bg-red-50 rounded-lg p-2 border border-red-100">
                                <div className="text-xs text-gray-600 mb-1 font-medium">Remaining</div>
                                <div className="text-sm font-bold text-red-600">{formatIndianCurrency(remainingAmount)}</div>
                              </div>
                            )}
                          </div>
                          
                          {/* Payment Breakdown: Direct vs Supplier */}
                          {totalPaid > 0 && (
                            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 border border-gray-200">
                              <div className="text-xs font-semibold text-gray-800 mb-2">Payment Breakdown</div>
                              
                              {/* Direct Payments (to driver, etc.) */}
                              {paidDirectly > 0 && (
                                <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-blue-700">Paid Directly</span>
                                    <span className="text-xs font-bold text-blue-700">{formatIndianCurrency(paidDirectly)}</span>
                                  </div>
                                  <div className="space-y-1">
                                    {directPayments.map((payment, pIdx) => {
                                      const paymentDate = safeParseDate(payment.date)
                                      return (
                                        <div key={pIdx} className="flex items-center justify-between text-xs text-gray-700 bg-white rounded px-2 py-1">
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            {paymentDate && (
                                              <span className="text-gray-500 whitespace-nowrap">{format(paymentDate, 'dd MMM')}</span>
                                            )}
                                            {payment.note && (
                                              <span className="truncate">• {payment.note}</span>
                                            )}
                                          </div>
                                          <span className="font-semibold text-gray-900 ml-2 flex-shrink-0">{formatIndianCurrency(payment.amount)}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Supplier Payments (from ledger) */}
                              {paidToSupplier > 0 && (
                                <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-green-700">Paid to Supplier</span>
                                    <span className="text-xs font-bold text-green-700">{formatIndianCurrency(paidToSupplier)}</span>
                                  </div>
                                  <div className="text-xs text-gray-600 mb-1.5 px-1">
                                    (Portion of ledger entry allocated to this order)
                                  </div>
                                  <div className="space-y-1">
                                    {supplierPaymentsWithLedger.map((payment, pIdx) => {
                                      // Use ledger entry date if available, otherwise use payment date
                                      const paymentDate = payment.ledgerEntry?.date 
                                        ? safeParseDate(payment.ledgerEntry.date)
                                        : safeParseDate(payment.date)
                                      const displayNote = payment.ledgerEntry?.note || payment.note
                                      // Show the ledger entry total if it's different from the order portion
                                      const ledgerEntryTotal = payment.ledgerEntry?.amount || 0
                                      const isPartial = ledgerEntryTotal > 0 && Math.abs(ledgerEntryTotal - payment.amount) > 0.01
                                      return (
                                        <div key={pIdx} className="flex items-center justify-between text-xs text-gray-700 bg-white rounded px-2 py-1">
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            {paymentDate && (
                                              <span className="text-gray-500 whitespace-nowrap">{format(paymentDate, 'dd MMM')}</span>
                                            )}
                                            <span className="text-green-600 font-medium">• From Ledger</span>
                                            {isPartial && (
                                              <span className="text-gray-500 text-[10px]" title={`Ledger entry total: ${formatIndianCurrency(ledgerEntryTotal)}`}>
                                                (of {formatIndianCurrency(ledgerEntryTotal)})
                                              </span>
                                            )}
                                            {displayNote && (
                                              <span className="truncate">• {displayNote}</span>
                                            )}
                                          </div>
                                          <span className="font-semibold text-gray-900 ml-2 flex-shrink-0">{formatIndianCurrency(payment.amount)}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment History from Ledger */}
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-green-600" />
                  <h3 className="font-semibold text-gray-900">Ledger Payments ({group.ledgerPayments.length})</h3>
                </div>
              </div>
              {group.ledgerPayments.length > 0 ? (
                <div className="space-y-2">
                  {group.ledgerPayments.map((paymentItem, idx) => {
                    const paymentDate = safeParseDate(paymentItem.entry.date)
                    return (
                      <div
                        key={paymentItem.entry.id || idx}
                        className="bg-white rounded-lg p-2.5 border border-green-300 transition-all duration-200"
                        style={{
                          animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both`,
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">
                              {formatIndianCurrency(paymentItem.entry.amount)}
                            </p>
                            {paymentDate && (
                              <div className="flex items-center gap-1 mt-1">
                                <Calendar size={12} className="text-gray-400" />
                                <p className="text-xs text-gray-500">
                                  {format(paymentDate, 'dd MMM yyyy')}
                                </p>
                              </div>
                            )}
                            {paymentItem.entry.note && (
                              <p className="text-xs text-gray-600 mt-1">
                                {paymentItem.entry.note}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded-md border border-gray-200" title="From ledger entry - edit in ledger">
                            From Ledger
                          </span>
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

  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

