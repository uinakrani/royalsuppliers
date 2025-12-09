'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order, PaymentRecord } from '@/types/order'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import { X, Package, DollarSign, FileText, Calendar, TrendingDown, Edit, Trash2 } from 'lucide-react'
import { LedgerEntry, ledgerService } from '@/lib/ledgerService'
import { createRipple } from '@/lib/rippleEffect'
import { sweetAlert } from '@/lib/sweetalert'
import { showToast } from '@/components/Toast'
import PaymentEditPopup from '@/components/PaymentEditPopup'
import { orderService } from '@/lib/orderService'

interface SupplierGroup {
  supplierName: string
  rawMaterialTotal: number
  totalAmount: number
  totalPaid: number
  remainingAmount: number
  paidDirect: number
  paidToSupplier: number
  totalCartingPaid: number
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
  onAddPayment?: (order: Order) => Promise<void>
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
  onAddPayment,
  onRefresh,
}: SupplierDetailPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isAddingSupplierPayment, setIsAddingSupplierPayment] = useState(false)
  const [orderPaymentLoadingId, setOrderPaymentLoadingId] = useState<string | null>(null)
  const [editingPayment, setEditingPayment] = useState<{ order: Order; payment: PaymentRecord } | null>(null)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [editingLedgerPaymentId, setEditingLedgerPaymentId] = useState<string | null>(null)
  const [deletingLedgerPaymentId, setDeletingLedgerPaymentId] = useState<string | null>(null)
  const [editingSupplierPaymentId, setEditingSupplierPaymentId] = useState<string | null>(null)
  const [deletingSupplierPaymentId, setDeletingSupplierPaymentId] = useState<string | null>(null)
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
  const rawMaterialTotal = group.rawMaterialTotal ?? group.totalAmount
  // Direct payments to orders are now considered carting payments
  // Paid directly to supplier would be ledger entries without supplier name (rare)
  const paidDirectTotal = group.paidDirect ?? 0
  const paidToSupplierTotal =
    group.paidToSupplier ??
    group.ledgerPayments.reduce((sum, p) => sum + Number(p.entry.amount || 0), 0)

  // Calculate total carting paid across all orders
  const totalCartingPaid = group.orders.reduce((sum, order) => {
    const existingPayments = order.partialPayments || []
    const directPayments = existingPayments.filter(p => !p.ledgerEntryId)
    const ledgerEntryIds = new Set(group.ledgerPayments.map(p => p.entry.id).filter(Boolean))
    const ledgerCartingPayments = existingPayments.filter(p => p.ledgerEntryId && !ledgerEntryIds.has(p.ledgerEntryId))
    const cartingTotal =
      directPayments.reduce((s, p) => s + Number(p.amount || 0), 0) +
      ledgerCartingPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    return sum + cartingTotal
  }, 0)

  // Amount supplier is owed after only deducting carting payments
  const supplierPayableAfterCarting = Math.max(0, rawMaterialTotal - totalCartingPaid)

  const totalPaid = paidDirectTotal + paidToSupplierTotal + totalCartingPaid
  const owedAmount = Math.max(0, rawMaterialTotal - totalPaid)

  const handleAddOrderPayment = async (order: Order) => {
    if (!onAddPayment || orderPaymentLoadingId) return
    setOrderPaymentLoadingId(order.id || null)
    try {
      await onAddPayment(order)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      console.error('Failed to add payment on order:', error)
      showToast(error?.message || 'Failed to add payment', 'error')
    } finally {
      setOrderPaymentLoadingId(null)
    }
  }

  const handleAddSupplierPayment = async () => {
    if (!group || isAddingSupplierPayment) return
    const owedLabel = formatIndianCurrency(owedAmount)
    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Add Supplier Payment',
        message: `Owed to supplier: ${owedLabel}`,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputType: 'text',
        formatCurrencyInr: true,
        confirmText: 'Add',
        cancelText: 'Cancel',
      })

      if (!amountStr) return

      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error')
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. UPI / Bank transfer',
        inputType: 'text',
        required: false,
        confirmText: 'Save',
        cancelText: 'Skip',
      })

      setIsAddingSupplierPayment(true)
      await ledgerService.addEntry(
        'debit',
        amount,
        note ? `Supplier Payment - ${group.supplierName}: ${note}` : `Supplier Payment - ${group.supplierName}`,
        'orderExpense',
        new Date().toISOString(),
        group.supplierName
      )
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      console.error('Failed to add supplier payment:', error)
      showToast(error?.message || 'Failed to add supplier payment', 'error')
    } finally {
      setIsAddingSupplierPayment(false)
    }
  }

  const handleSavePaymentEdit = async (data: { amount: number; date: string }) => {
    if (!editingPayment) return
    const { order, payment } = editingPayment
    if (!order.id) return
    try {
      await orderService.updatePartialPayment(order.id, payment.id, data, payment.ledgerEntryId)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      console.error('Failed to update payment:', error)
      showToast(error?.message || 'Failed to update payment', 'error')
    } finally {
      setEditingPayment(null)
    }
  }

  const handleRemovePayment = async (order: Order, payment: PaymentRecord) => {
    if (!order.id || deletingPaymentId) return
    const confirm = await sweetAlert.confirm({
      title: 'Remove Payment',
      message: 'Are you sure you want to remove this payment?',
      icon: 'warning',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    })
    if (!confirm) return
    setDeletingPaymentId(payment.id)
    try {
      await orderService.removePartialPayment(order.id, payment.id)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      console.error('Failed to remove payment:', error)
      showToast(error?.message || 'Failed to remove payment', 'error')
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const handleEditSupplierPayment = async (payment: PaymentRecord & { ledgerEntry?: LedgerEntry }) => {
    if (editingSupplierPaymentId || !payment.ledgerEntryId) return

    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Edit Supplier Payment',
        message: 'Update the payment amount',
        inputLabel: 'Payment Amount',
        inputType: 'text',
        formatCurrencyInr: true,
        inputValue: String(payment.amount),
        confirmText: 'Save',
        cancelText: 'Cancel',
      })

      if (!amountStr) return

      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error')
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. UPI / Bank transfer',
        inputType: 'text',
        required: false,
        inputValue: payment.note || payment.ledgerEntry?.note || '',
        confirmText: 'Save',
        cancelText: 'Skip',
      })

      setEditingSupplierPaymentId(payment.ledgerEntryId)
      await ledgerService.update(
        payment.ledgerEntryId,
        { amount, note: note || undefined },
        { fromOrder: true }
      )
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(error?.message || 'Failed to update payment', 'error')
      }
    } finally {
      setEditingSupplierPaymentId(null)
    }
  }

  const handleRemoveSupplierPayment = async (payment: PaymentRecord) => {
    if (deletingSupplierPaymentId || !payment.ledgerEntryId) return

    const confirmed = await sweetAlert.confirm({
      title: 'Remove Supplier Payment?',
      message: 'Are you sure you want to remove this payment? This action cannot be undone.',
      icon: 'warning',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    })
    if (!confirmed) return

    setDeletingSupplierPaymentId(payment.ledgerEntryId)
    try {
      await ledgerService.remove(payment.ledgerEntryId)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(error?.message || 'Failed to remove payment', 'error')
      }
    } finally {
      setDeletingSupplierPaymentId(null)
    }
  }

  const handleEditLedgerPayment = async (entry: LedgerEntry) => {
    if (!entry.id || editingLedgerPaymentId || deletingLedgerPaymentId) return

    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Edit Supplier Payment',
        message: 'Update the payment amount',
        inputLabel: 'Payment Amount',
        inputType: 'text',
        formatCurrencyInr: true,
        inputValue: String(entry.amount),
        confirmText: 'Update',
        cancelText: 'Cancel',
      })

      if (!amountStr) return

      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error')
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. UPI / Bank transfer',
        inputType: 'text',
        required: false,
        inputValue: entry.note || '',
        confirmText: 'Update',
        cancelText: 'Skip',
      })

      setEditingLedgerPaymentId(entry.id)
      await ledgerService.update(entry.id, {
        amount,
        note: note || undefined,
      })
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        console.error('Failed to update supplier payment:', error)
        showToast(error?.message || 'Failed to update supplier payment', 'error')
      }
    } finally {
      setEditingLedgerPaymentId(null)
    }
  }

  const handleRemoveLedgerPayment = async (entry: LedgerEntry) => {
    if (!entry.id || deletingLedgerPaymentId || editingLedgerPaymentId) return

    const confirmed = await sweetAlert.confirm({
      title: 'Delete Supplier Payment',
      message: 'Are you sure you want to delete this payment? This action cannot be undone.',
      icon: 'warning',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    })

    if (!confirmed) return

    setDeletingLedgerPaymentId(entry.id)
    try {
      await ledgerService.remove(entry.id)
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        console.error('Failed to delete supplier payment:', error)
        showToast(error?.message || 'Failed to delete supplier payment', 'error')
      }
    } finally {
      setDeletingLedgerPaymentId(null)
    }
  }

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
          <div className="flex-1 overflow-y-auto p-4 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Summary Section - Clean & Flat */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-orange-500 rounded-lg">
                  <TrendingDown size={16} className="text-white" />
                </div>
              <h3 className="text-base font-bold text-gray-900">Summary</h3>
              <div className="flex-1" />
              <button
                onClick={handleAddSupplierPayment}
                disabled={isAddingSupplierPayment}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white shadow-sm active:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {isAddingSupplierPayment ? 'Saving...' : 'Add Supplier Payment'}
              </button>
              </div>
              <div className="space-y-3">
                <div className="py-2.5 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 font-medium">Raw Material Cost</span>
                  <span className="text-base font-bold text-gray-900">{formatIndianCurrency(rawMaterialTotal)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                  (Sum of original cost across all orders)
                  </div>
                </div>
                
                <div className="py-2.5 border-b border-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 font-medium">Paid to Supplier</span>
                      <span className="text-base font-bold text-green-600">
                        {formatIndianCurrency(paidToSupplierTotal)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      (Ledger entries tagged with supplier name)
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 font-medium">Carting Paid</span>
                      <span className="text-base font-bold text-orange-600">
                        {formatIndianCurrency(totalCartingPaid)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      (Total carting payments across all orders)
                    </div>
                  </div>
                </div>
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-200">
                    <span className="text-sm text-gray-700 font-medium">Payable (after carting)</span>
                    <span className="text-base font-bold text-gray-900">
                      {formatIndianCurrency(supplierPayableAfterCarting)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (Raw material cost minus carting payments)
                  </div>
                </div>
                
                <div className="py-2.5 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 font-medium">Total Paid</span>
                  <span className="text-base font-bold text-blue-600">{formatIndianCurrency(totalPaid)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                  (Supplier payments + carting payments)
                  </div>
                </div>
                
                <div className="py-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Remaining</span>
                  <span className={`text-lg font-bold ${owedAmount > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                    {formatIndianCurrency(Math.abs(owedAmount))}
                    </span>
                  </div>
                </div>
                
                {lastPaymentDateObj && group.lastPaymentAmount !== null && (
                  <div className="pt-2.5 mt-2.5 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500">Last Payment</div>
                        <div className="text-sm font-medium text-gray-700">
                          {format(lastPaymentDateObj, 'dd MMM yyyy')} • {formatIndianCurrency(group.lastPaymentAmount)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Orders Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-500 rounded-lg">
                  <FileText size={16} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Orders ({group.orders.length})</h3>
                <div className="text-xs text-gray-500">(compact view)</div>
              </div>
              <div className="space-y-3">
                {group.orders.map((order, index) => {
                  const orderDate = safeParseDate(order.date)
                  const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
                  const expenseAmount = Number(order.originalTotal || 0)
                  const existingPayments = order.partialPayments || []
                  
                  // Match ledger payments with actual ledger entries to ensure accuracy
                  // Only show payments that match actual ledger entries (by ledgerEntryId)
                  const ledgerEntryIds = new Set(group.ledgerPayments.map(p => p.entry.id).filter(Boolean))
                  const supplierPayments = existingPayments.filter(p => {
                    if (!p.ledgerEntryId) return false
                    // Only include if this ledger entry exists in the supplier's ledger entries
                    return ledgerEntryIds.has(p.ledgerEntryId)
                  })
                  // Carting payments (direct payments + order-level ledger entries not tied to supplier)
                  const directPayments = existingPayments.filter(p => !p.ledgerEntryId)
                  const ledgerCartingPayments = existingPayments.filter(p => p.ledgerEntryId && !ledgerEntryIds.has(p.ledgerEntryId))
                  const cartingPayments = [...directPayments, ...ledgerCartingPayments]
                  
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
                  
                  const cartingTotal = directPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) +
                                       ledgerCartingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                  const totalPaid = cartingTotal
                  const yetToPay = Math.max(0, expenseAmount - totalPaid)
                  
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
                      className="border-b border-gray-200 pb-3"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        position: 'relative',
                        overflow: 'hidden',
                        animation: `fadeInUp 0.2s ease-out ${index * 0.03}s both`,
                      }}
                    >
                      <div className="pt-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              {orderDate && (
                                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[11px] font-semibold">
                                  {format(orderDate, 'dd MMM')}
                                </span>
                              )}
                          {order.challanNo ? (
                            <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 text-[11px] font-semibold">
                              Challan #{order.challanNo}
                            </span>
                          ) : null}
                              <span className="text-xs text-gray-600 truncate">{order.siteName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {materials.slice(0, 2).map((mat, idx) => (
                                <span key={idx} className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-[11px] font-medium">
                                  {mat}
                                </span>
                              ))}
                              {materials.length > 2 && (
                                <span className="text-[11px] text-gray-500">+{materials.length - 2}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="text-base font-bold text-orange-600">{formatIndianCurrency(expenseAmount)}</p>
                            <p className="text-[11px] text-gray-500">Raw cost</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Truck:</span>
                              <span className="font-medium text-gray-800 truncate">{order.truckNo || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Weight:</span>
                              <span className="font-medium text-gray-800">{order.originalWeight ?? '—'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Rate:</span>
                              <span className="font-medium text-gray-800">{order.originalRate ?? '—'}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-700">
                            <span>Carting Paid</span>
                            <span className="font-semibold text-orange-700">{formatIndianCurrency(cartingTotal)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-700">
                            <span>Yet to Pay</span>
                            <span className="font-bold text-red-600">{formatIndianCurrency(yetToPay)}</span>
                          </div>
                        </div>

                        {supplierPaymentsWithLedger.length > 0 && (
                          <div className="pt-2 border-t border-gray-100 space-y-1">
                            <div className="text-[11px] text-gray-500 font-semibold">Supplier Payments</div>
                            <div className="space-y-1">
                              {supplierPaymentsWithLedger.map((payment, pIdx) => {
                                const paymentDate = safeParseDate(payment.date) || safeParseDate(payment.ledgerEntry?.date)
                                const note = payment.note || payment.ledgerEntry?.note
                                return (
                                  <div key={`supplier-${payment.id || payment.ledgerEntryId || pIdx}`} className="flex items-center justify-between text-xs text-gray-600">
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      {paymentDate && <span className="text-gray-500">{format(paymentDate, 'dd MMM')}</span>}
                                      {note && <span className="truncate">• {note}</span>}
                                      <span className="text-green-700">Supplier</span>
                                    </div>
                                    <span className="font-medium text-gray-900 ml-2">{formatIndianCurrency(payment.amount)}</span>
                                    <div className="flex items-center gap-2 ml-2">
                                      <button
                                        className="text-[11px] text-gray-500 underline"
                                        disabled={editingSupplierPaymentId === payment.ledgerEntryId}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleEditSupplierPayment(payment)
                                        }}
                                      >
                                        {editingSupplierPaymentId === payment.ledgerEntryId ? 'Saving...' : 'Edit'}
                                      </button>
                                      <button
                                        className="text-[11px] text-red-500 underline disabled:opacity-50"
                                        disabled={deletingSupplierPaymentId === payment.ledgerEntryId}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleRemoveSupplierPayment(payment)
                                        }}
                                      >
                                        {deletingSupplierPaymentId === payment.ledgerEntryId ? 'Removing...' : 'Remove'}
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {cartingPayments.length > 0 && (
                          <div className="pt-2 border-t border-gray-100 space-y-1">
                            <div className="text-[11px] text-gray-500 font-semibold">Carting Payments</div>
                            <div className="space-y-1">
                              {cartingPayments.map((payment, pIdx) => {
                                const paymentDate = safeParseDate(payment.date)
                                return (
                                  <div key={`carting-${pIdx}`} className="flex items-center justify-between text-xs text-gray-600">
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      {paymentDate && <span className="text-gray-500">{format(paymentDate, 'dd MMM')}</span>}
                                      {payment.note && <span className="truncate">• {payment.note}</span>}
                                      <span className="text-orange-600">Carting</span>
                                    </div>
                                    <span className="font-medium text-gray-900 ml-2">{formatIndianCurrency(payment.amount)}</span>
                                    <div className="flex items-center gap-2 ml-2">
                                      <button
                                        className="text-[11px] text-gray-500 underline"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditingPayment({ order, payment })
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className="text-[11px] text-red-500 underline disabled:opacity-50"
                                        disabled={deletingPaymentId === payment.id}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleRemovePayment(order, payment)
                                        }}
                                      >
                                        {deletingPaymentId === payment.id ? 'Removing...' : 'Remove'}
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-2">
                            {onOrderClick && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  createRipple(e)
                                  handleClose()
                                  setTimeout(() => onOrderClick(order), 200)
                                }}
                                className="text-xs font-semibold text-gray-700 px-2 py-1 rounded-md border border-gray-200 active:bg-gray-100"
                              >
                                View
                              </button>
                            )}
                            {onAddPayment && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleAddOrderPayment(order)
                                }}
                                disabled={orderPaymentLoadingId === order.id}
                                className="text-xs font-semibold text-white px-2.5 py-1 rounded-md bg-blue-600 active:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                              >
                                {orderPaymentLoadingId === order.id ? 'Adding...' : 'Add Payment'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment History from Ledger */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-green-500 rounded-lg">
                  <DollarSign size={16} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Ledger Payments ({group.ledgerPayments.length})</h3>
              </div>
              {group.ledgerPayments.length > 0 ? (
                <div className="space-y-2">
                  {group.ledgerPayments.map((paymentItem, idx) => {
                    const paymentDate = safeParseDate(paymentItem.entry.date)
                    return (
                      <div
                        key={paymentItem.entry.id || idx}
                        className="bg-white rounded-lg border border-gray-200 p-3 transition-all duration-200"
                        style={{
                          animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both`,
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-base font-bold text-gray-900">
                              {formatIndianCurrency(paymentItem.entry.amount)}
                            </p>
                            {paymentDate && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Calendar size={14} className="text-gray-400" />
                                <p className="text-xs text-gray-500">
                                  {format(paymentDate, 'dd MMM yyyy')}
                                </p>
                              </div>
                            )}
                            {paymentItem.entry.note && (
                              <p className="text-xs text-gray-600 mt-1.5">
                                {paymentItem.entry.note}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditLedgerPayment(paymentItem.entry)
                              }}
                              disabled={editingLedgerPaymentId === paymentItem.entry.id || deletingLedgerPaymentId === paymentItem.entry.id}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                              title="Edit Payment"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveLedgerPayment(paymentItem.entry)
                              }}
                              disabled={deletingLedgerPaymentId === paymentItem.entry.id || editingLedgerPaymentId === paymentItem.entry.id}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Delete Payment"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
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
  return (
    <>
      {createPortal(popupContent, document.body)}
      <PaymentEditPopup
        isOpen={!!editingPayment}
        onClose={() => setEditingPayment(null)}
        onSave={handleSavePaymentEdit}
        initialData={{
          amount: editingPayment?.payment.amount || 0,
          date: editingPayment?.payment.date || new Date().toISOString(),
        }}
      />
    </>
  )
}

