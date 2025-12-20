'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { orderService, isOrderPaid, isCustomerPaid, PAYMENT_TOLERANCE } from '@/lib/orderService'
import { invoiceService } from '@/lib/invoiceService'
import { partyPaymentService } from '@/lib/partyPaymentService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Order, OrderFilters, PaymentRecord } from '@/types/order'
import NavBar from '@/components/NavBar'
import OrderForm from '@/components/OrderForm'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, Filter, FileText, X, User, Calendar, ChevronRight, Package, ChevronDown, ChevronUp } from 'lucide-react'
import PaymentEditPopup from '@/components/PaymentEditPopup'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import FilterPopup from '@/components/FilterPopup'
import TruckLoading from '@/components/TruckLoading'
import OrderDetailDrawer from '@/components/OrderDetailDrawer'
import PartyDetailPopup from '@/components/PartyDetailPopup'
import OrderDetailPopup from '@/components/OrderDetailPopup'
import SelectionSheet from '@/components/SelectionSheet'
import SupplierDetailPopup from '@/components/SupplierDetailPopup'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Invoice, InvoicePayment } from '@/types/invoice'
import { createRipple } from '@/lib/rippleEffect'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { getDb } from '@/lib/firebase'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { getAdjustedProfit, hasProfitAdjustments, getEstimatedProfit } from '@/lib/orderCalculations'
import AuthGate from '@/components/AuthGate'

interface PartyGroup {
  partyName: string
  totalSelling: number
  totalPaid: number
  totalProfit: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  orders: Order[]
  payments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment; ledgerEntryId?: string }>
}

interface SupplierGroup {
  supplierName: string
  rawMaterialTotal: number // Sum of originalTotal for all orders
  totalAmount: number // Alias for rawMaterialTotal (kept for compatibility)
  totalPaid: number // Total paid including carting payments and supplier ledger payments
  remainingAmount: number // Amount still owed after all payments
  paidDirect: number // Payments added directly to orders (non-ledger)
  paidToSupplier: number // Payments recorded against supplier via ledger entries
  totalCartingPaid: number // Carting payments across orders
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  orders: Order[]
  ledgerPayments: Array<{ entry: LedgerEntry }> // Expense entries from ledger
}

// Helper function to safely parse dates
const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return null
  }
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

// Helper function to safely get time for sorting
const safeGetTime = (dateString: string | null | undefined): number => {
  const date = safeParseDate(dateString)
  return date ? date.getTime() : 0
}

// Generate available months for filtering
const generateMonthOptions = (): string[] => {
  // Business started in Nov 2025, so always include up to that month
  const options = ['all']
  const startDate = new Date(2025, 10, 1) // Nov 2025 (0-indexed month)
  const now = new Date()

  // Build list from current month back to start date so the earliest month appears last
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1)
  while (cursor >= startDate) {
    options.push(format(cursor, 'MMM yyyy'))
    cursor.setMonth(cursor.getMonth() - 1)
  }

  return options
}

// Default to the current month label (e.g., "Dec 2025")
const getCurrentMonthLabel = () => format(new Date(), 'MMM yyyy')

// Check if order date falls within selected month
const isOrderInSelectedMonth = (order: Order, selectedMonth: string): boolean => {
  if (selectedMonth === 'all') return true

  const orderDate = safeParseDate(order.date)
  if (!orderDate) return false

  const monthName = format(orderDate, 'MMM yyyy')
  return monthName === selectedMonth
}

// Check if payment date falls within selected month
const isPaymentInSelectedMonth = (paymentDate: string | null | undefined, selectedMonth: string): boolean => {
  if (selectedMonth === 'all') return true
  if (!paymentDate) return false

  const date = safeParseDate(paymentDate)
  if (!date) return false

  const monthName = format(date, 'MMM yyyy')
  return monthName === selectedMonth
}

function OrdersPageContent() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<OrderFilters>({})
  const [selectedPartyTags, setSelectedPartyTags] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'byParty' | 'allOrders' | 'suppliers'>('allOrders')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthLabel())
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null)
  const [showOrderDetailDrawer, setShowOrderDetailDrawer] = useState(false)
  const [selectedPartyGroup, setSelectedPartyGroup] = useState<PartyGroup | null>(null)
  const [showPartyDetailDrawer, setShowPartyDetailDrawer] = useState(false)
  const [selectedSupplierGroup, setSelectedSupplierGroup] = useState<SupplierGroup | null>(null)
  const [showSupplierDetailDrawer, setShowSupplierDetailDrawer] = useState(false)
  const [supplierGroupsRefreshKey, setSupplierGroupsRefreshKey] = useState(0)
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [selectedOrderForPayments, setSelectedOrderForPayments] = useState<Order | null>(null)
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)
  const [editingPayment, setEditingPayment] = useState<{ order: Order; paymentId: string } | null>(null)
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [showBottomTabs, setShowBottomTabs] = useState(true)
  const lastScrollTop = useRef(0)
  const [inlinePartyFilter, setInlinePartyFilter] = useState<Set<string>>(new Set())
  const [inlineMaterialFilter, setInlineMaterialFilter] = useState<Set<string>>(new Set())
  const [activeColumnFilter, setActiveColumnFilter] = useState<'party' | 'material' | null>(null)
  const selectAllRef = useRef<HTMLDivElement>(null)
  const tableHeaderRef = useRef<HTMLDivElement>(null)

  // Filter form state
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  const ordersForView = useMemo(() => {
    if (viewMode === 'allOrders') {
      if (selectedMonth === 'all') return filteredOrders
      return filteredOrders.filter(order => isOrderInSelectedMonth(order, selectedMonth))
    }
    return filteredOrders
  }, [filteredOrders, selectedMonth, viewMode])

  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoading(true)
        // Load orders first (it manages its own loading state, but we'll override)
        await loadOrders()
        // Load other data in parallel - these will be instant from local storage
        await Promise.allSettled([
          loadInvoices(),
          loadPartyNames(),
          loadLedgerEntries()
        ])
        setLoading(false)
      } catch (error) {
        console.error('Error initializing data:', error)
        setLoading(false)
      }
    }
    initializeData()

    // Subscribe to ledger entries changes for real-time updates
    const unsubscribe = ledgerService.subscribe((entries) => {
      setLedgerEntries(entries)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const loadLedgerEntries = async () => {
    try {
      const entries = await ledgerService.list()
      setLedgerEntries(entries)
    } catch (error) {
      console.error('Error loading ledger entries:', error)
    }
  }


  // Scroll detection for hiding/showing bottom tabs (works for both view modes)
  useEffect(() => {
    if (!contentRef.current) {
      setShowBottomTabs(true)
      return
    }

    const contentElement = contentRef.current
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = contentElement.scrollTop
          const scrollThreshold = 50 // Show/hide threshold

          if (scrollTop > scrollThreshold) {
            // Scrolling down - hide tabs
            if (scrollTop > lastScrollTop.current) {
              setShowBottomTabs(false)
            } else {
              // Scrolling up - show tabs
              setShowBottomTabs(true)
            }
          } else {
            // Near top - always show
            setShowBottomTabs(true)
          }

          lastScrollTop.current = scrollTop
          ticking = false
        })
        ticking = true
      }
    }

    contentElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => contentElement.removeEventListener('scroll', handleScroll)
  }, [viewMode])

  // Check for highlight query parameter
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (highlightId) {
      setHighlightedOrderId(highlightId)
      // Scroll to the highlighted row after a short delay to ensure it's rendered
      setTimeout(() => {
        const element = document.querySelector(`[data-order-id="${highlightId}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      // Remove highlight after 1 second
      const timer = setTimeout(() => {
        setHighlightedOrderId(null)
        // Clean up URL
        router.replace('/orders', { scroll: false })
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [searchParams, router, filteredOrders])

  const loadPartyNames = async () => {
    try {
      const uniquePartyNames = await orderService.getUniquePartyNames()
      setPartyNames(uniquePartyNames)
    } catch (error) {
      console.error('Error loading party names:', error)
    }
  }

  const loadOrders = async (): Promise<Order[]> => {
    try {
      setLoading(true)
      const allOrders = await orderService.getAllOrders(undefined, {
        onRemoteUpdate: (fresh) => {
          setOrders(fresh)
          setLoading(false)
        }
      })
      setOrders(allOrders)
      setLoading(false)
      return allOrders
    } catch (error) {
      console.error('Error loading orders:', error)
      setLoading(false)
      throw error // Re-throw to let caller handle
    }
  }

  const loadInvoices = async () => {
    try {
      const allInvoices = await invoiceService.getAllInvoices(undefined, {
        onRemoteUpdate: (fresh) => setInvoices(fresh)
      })
      setInvoices(allInvoices)
    } catch (error) {
      console.error('Error loading invoices:', error)
    }
  }


  // Helper function to apply filters to orders
  const applyFiltersToOrders = useCallback((ordersToFilter: Order[]) => {
    let filtered = [...ordersToFilter]

    // Apply inline party filter (takes highest priority)
    if (inlinePartyFilter.size > 0) {
      filtered = filtered.filter((o) =>
        inlinePartyFilter.has(o.partyName?.trim() || '')
      )
    } else if (selectedPartyTags.size > 0) {
      // Apply party tag filters (takes priority over filter drawer party name)
      filtered = filtered.filter((o) => {
        // Ensure exact match by trimming whitespace
        const orderPartyName = o.partyName?.trim() || ''
        return selectedPartyTags.has(orderPartyName)
      })
    } else if (filters.partyName) {
      // Only apply filter drawer party name if no tags are selected
      const filterPartyNames = filters.partyName.split(',').map(p => p.trim().toLowerCase())
      filtered = filtered.filter((o) =>
        filterPartyNames.some(fp => o.partyName.toLowerCase() === fp)
      )
    }

    // Apply inline material filter (takes highest priority)
    if (inlineMaterialFilter.size > 0) {
      filtered = filtered.filter((o) => {
        const orderMaterials = Array.isArray(o.material)
          ? o.material.map(m => String(m).trim())
          : [String(o.material || '').trim()].filter(Boolean)
        return orderMaterials.some(om => inlineMaterialFilter.has(om))
      })
    } else if (filters.material) {
      const filterMaterials = filters.material.split(',').map(m => m.trim().toLowerCase())
      filtered = filtered.filter((o) => {
        const orderMaterials = Array.isArray(o.material)
          ? o.material.map(m => m.toLowerCase())
          : [o.material.toLowerCase()]
        return filterMaterials.some(fm => orderMaterials.some(om => om.includes(fm)))
      })
    }
    if (filters.startDate) {
      const startDate = safeParseDate(filters.startDate)
      if (startDate) {
        filtered = filtered.filter((o) => {
          const orderDate = safeParseDate(o.date)
          return orderDate && orderDate >= startDate
        })
      }
    }
    if (filters.endDate) {
      const endDate = safeParseDate(filters.endDate)
      if (endDate) {
        filtered = filtered.filter((o) => {
          const orderDate = safeParseDate(o.date)
          return orderDate && orderDate <= endDate
        })
      }
    }

    // Sort by date (desc), fallback to createdAt, then updatedAt
    const getTime = (o: Order) => safeGetTime(o.date || o.createdAt || o.updatedAt)
    filtered.sort((a, b) => getTime(b) - getTime(a))

    return filtered
  }, [filters, selectedPartyTags, inlinePartyFilter, inlineMaterialFilter])

  // Apply filters whenever orders, filters, selectedPartyTags, or inline filters change
  useEffect(() => {
    const filtered = applyFiltersToOrders(orders)
    setFilteredOrders(filtered)
  }, [orders, applyFiltersToOrders])

  // Refresh supplier groups when ledger entries change (for supplier payment updates)
  useEffect(() => {
    setSupplierGroupsRefreshKey(prev => prev + 1)
  }, [ledgerEntries])

  // Measure heights logic removed - no longer needed for sticky header
  // Cleaned up unused state/refs in previous steps but let's ensure we don't have dead code
  // Removing the useEffect for resizeObserver

  const handleSaveOrder = async (orderData: Omit<Order, 'id'>) => {
    console.log('📝 handleSaveOrder called', {
      isEdit: !!editingOrder?.id,
      orderId: editingOrder?.id,
      orderData
    })

    try {
      if (editingOrder?.id) {
        console.log('🔄 Updating order:', editingOrder.id)

        // Check if any ledger payments were modified
        const oldPayments = editingOrder.partialPayments || []
        const newPayments = orderData.partialPayments || []

        console.log('🔍 Checking for ledger payment changes:', {
          oldPayments: oldPayments.map(p => ({ id: p.id, amount: p.amount, ledgerEntryId: p.ledgerEntryId })),
          newPayments: newPayments.map(p => ({ id: p.id, amount: p.amount, ledgerEntryId: p.ledgerEntryId }))
        })

        // Find ledger payments that changed
        const ledgerEntryIdsToRedistribute = new Set<string>()

        // Check for modified or removed ledger payments
        oldPayments.forEach(oldPayment => {
          if (oldPayment.ledgerEntryId) {
            const newPayment = newPayments.find(p => p.id === oldPayment.id)
            if (!newPayment) {
              // Payment was removed - need to redistribute
              console.log(`  ❌ Ledger payment ${oldPayment.id} was removed (ledgerEntryId: ${oldPayment.ledgerEntryId})`)
              ledgerEntryIdsToRedistribute.add(oldPayment.ledgerEntryId)
            } else {
              // Payment was modified - only amount changes should trigger redistribution
              const amountChanged = Math.abs(Number(newPayment.amount) - Number(oldPayment.amount)) > 0.01

              if (amountChanged) {
                console.log(`  ✏️  Ledger payment ${oldPayment.id} amount changed: ${oldPayment.amount} → ${newPayment.amount} (ledgerEntryId: ${oldPayment.ledgerEntryId})`)

                // Only amount changes trigger redistribution
                // Date and note changes don't affect the distribution
                ledgerEntryIdsToRedistribute.add(oldPayment.ledgerEntryId)
              } else {
                console.log(`  ℹ️  Ledger payment ${oldPayment.id} modified (date/note only, no redistribution needed)`)
              }
            }
          }
        })

        // Check for new ledger payments
        newPayments.forEach(newPayment => {
          if (newPayment.ledgerEntryId) {
            const oldPayment = oldPayments.find(p => p.id === newPayment.id)
            if (!oldPayment) {
              // New ledger payment added - need to redistribute
              console.log(`  ➕ New ledger payment ${newPayment.id} added (ledgerEntryId: ${newPayment.ledgerEntryId})`)
              ledgerEntryIdsToRedistribute.add(newPayment.ledgerEntryId)
            }
            // Modified payments are already handled above
          }
        })

        console.log(`📊 Found ${ledgerEntryIdsToRedistribute.size} ledger entry/entries to redistribute:`, Array.from(ledgerEntryIdsToRedistribute))

        // Update the order
        await orderService.updateOrder(editingOrder.id, orderData)
        console.log('✅ Order updated')

        // Redistribute ledger entries if any ledger payments were modified
        if (ledgerEntryIdsToRedistribute.size > 0) {
          console.log(`🔄 Redistributing ${ledgerEntryIdsToRedistribute.size} ledger entry/entries`)

          // Wait a bit for the order update to propagate
          await new Promise(resolve => setTimeout(resolve, 500))

          // Redistribute each affected ledger entry
          const ledgerEntryIdsArray = Array.from(ledgerEntryIdsToRedistribute)
          for (const ledgerEntryId of ledgerEntryIdsArray) {
            try {
              // Get the payment date from the new payments, or use the order date, or current date
              const payment = newPayments.find(p => p.ledgerEntryId === ledgerEntryId)
              const paymentDate = payment?.date || orderData.date || new Date().toISOString()
              await redistributeLedgerEntry(ledgerEntryId, paymentDate)
              console.log(`✅ Redistributed ledger entry ${ledgerEntryId}`)
            } catch (error) {
              console.error(`Error redistributing ledger entry ${ledgerEntryId}:`, error)
              // Don't fail the order save if redistribution fails
            }
          }
        }

        showToast('Order updated successfully!', 'success')
      } else {
        console.log('➕ Creating new order')
        const orderId = await orderService.createOrder(orderData)

        showToast('Order created successfully!', 'success')

        await loadOrders()

        setEditingOrder(null)
        setShowForm(false)

        // Highlight the newly created order
        setHighlightedOrderId(orderId)
        router.replace(`/orders?highlight=${orderId}`, { scroll: false })
        setTimeout(() => {
          setHighlightedOrderId(null)
          router.replace('/orders', { scroll: false })
        }, 1000)
        return // Exit early to avoid duplicate reload
      }

      await loadOrders()
      await loadInvoices()

      setEditingOrder(null)
      setShowForm(false)
    } catch (error: any) {
      console.error('Error in handleSaveOrder:', error)
      throw error // Re-throw so OrderForm can handle it
    }
  }

  // Helper function to calculate payment info for an order
  const getOrderPaymentInfo = (order: Order) => {
    // Expense amount is just originalTotal (raw material cost)
    const expenseAmount = Number(order.originalTotal || 0)
    const existingPayments = order.partialPayments || []
    const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    const remainingAmount = expenseAmount - totalPaid
    return { expenseAmount, totalPaid, remainingAmount }
  }

  const handleAddPaymentToOrder = async (order: Order) => {
    // Calculate expense amount and remaining payment
    const { expenseAmount, totalPaid, remainingAmount } = getOrderPaymentInfo(order)

    // Check if order is already paid (warn but allow)
    const isPaid = isOrderPaid(order)
    if (isPaid) {
      const confirmed = await sweetAlert.confirm({
        title: 'Order Already Paid',
        message: `This order is already marked as paid (within ₹${PAYMENT_TOLERANCE} tolerance). Adding more payments may cause overpayment. Continue?`,
        icon: 'warning',
        confirmText: 'Continue',
        cancelText: 'Cancel'
      })
      if (!confirmed) {
        return
      }
    }

    // Check for ledger payments on this order
    const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId)
    const hasLedgerPayments = ledgerPayments.length > 0
    const ledgerPaymentsTotal = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    try {
      const message = hasLedgerPayments
        ? `Remaining: ${formatIndianCurrency(remainingAmount)}\nLedger payments: ${formatIndianCurrency(ledgerPaymentsTotal)}`
        : `Remaining amount: ${formatIndianCurrency(remainingAmount)}`

      const amountStr = await sweetAlert.prompt({
        title: 'Add Payment',
        message: message,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputType: 'text',
        formatCurrencyInr: true,
        confirmText: 'Next',
        cancelText: 'Cancel',
      })

      if (!amountStr) {
        return
      }

      const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))

      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Invalid amount', 'error')
        return
      }

      // Get note from user before processing payment
      const note = await sweetAlert.prompt({
        title: 'Add Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. Cash payment / Bank transfer',
        inputType: 'text',
        required: false,
        confirmText: 'Next',
        cancelText: 'Skip',
      })

      // Get date from user
      const dateInput = await sweetAlert.prompt({
        title: 'Payment Date',
        inputLabel: 'Date',
        inputType: 'date',
        inputValue: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        confirmText: 'Add Payment',
        cancelText: 'Cancel',
      })

      if (!dateInput) {
        return
      }

      const parsedDate = dateInput.includes('T')
        ? new Date(dateInput)
        : new Date(`${dateInput}T00:00:00`)
      if (isNaN(parsedDate.getTime())) {
        showToast('Please select a valid payment date', 'error')
        return
      }
      const paymentDateIso = parsedDate.toISOString()

      // Check for overpayment
      const newTotalPaid = totalPaid + amount
      const wouldOverpay = newTotalPaid > expenseAmount
      const overpaymentAmount = wouldOverpay ? newTotalPaid - expenseAmount : 0

      // If overpayment detected and there are ledger payments, offer to reduce ledger payments
      if (wouldOverpay && hasLedgerPayments) {
        const confirmed = await sweetAlert.confirm({
          title: 'Overpayment Detected',
          message: `Adding this payment would result in overpayment of ${formatIndianCurrency(overpaymentAmount)}.\n\nTotal payments: ${formatIndianCurrency(newTotalPaid)}\nOriginal total: ${formatIndianCurrency(expenseAmount)}\nLedger payments on this order: ${formatIndianCurrency(ledgerPaymentsTotal)}\n\nWould you like to reduce the ledger payment(s) on this order and redistribute to other unpaid orders of this supplier?`,
          icon: 'question',
          confirmText: 'Reduce & Redistribute',
          cancelText: 'Cancel'
        })

        if (!confirmed) {
          return
        }

        // Reduce ledger payments on this order and redistribute
        try {
          // Calculate how much to reduce from ledger payments
          let remainingToReduce = overpaymentAmount
          const ledgerEntryIdsToRedistribute = new Set<string>()
          const updatedPayments = [...(order.partialPayments || [])]

          // Reduce ledger payments starting from the most recent
          const ledgerPaymentIndices: Array<{ index: number; payment: PaymentRecord }> = []
          updatedPayments.forEach((p, idx) => {
            if (p.ledgerEntryId) {
              ledgerPaymentIndices.push({ index: idx, payment: p })
            }
          })

          // Sort by date (most recent first) to reduce from newest first
          ledgerPaymentIndices.sort((a, b) => {
            const aDate = new Date(a.payment.date).getTime()
            const bDate = new Date(b.payment.date).getTime()
            return bDate - aDate
          })

          // Reduce ledger payments
          for (const { index, payment } of ledgerPaymentIndices) {
            if (remainingToReduce <= 0) break

            const currentAmount = Number(payment.amount || 0)
            const reductionAmount = Math.min(remainingToReduce, currentAmount)
            const newAmount = currentAmount - reductionAmount

            if (newAmount > 0) {
              // Update the payment amount
              updatedPayments[index] = {
                ...payment,
                amount: newAmount
              }
            } else {
              // Remove the payment if amount becomes 0 or negative
              updatedPayments.splice(index, 1)
            }

            ledgerEntryIdsToRedistribute.add(payment.ledgerEntryId!)
            remainingToReduce -= reductionAmount

            console.log(`  🔄 Reducing ledger payment ${payment.id} by ${reductionAmount} (from ${currentAmount} to ${newAmount})`)
          }

          // Add the new direct payment
          const newPayment: PaymentRecord = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            amount: amount,
            date: paymentDateIso,
            note: note || undefined,
          }
          updatedPayments.push(newPayment)

          // Update the order with reduced ledger payments and new direct payment
          await orderService.updateOrder(order.id!, {
            partialPayments: updatedPayments,
          })

          console.log(`✅ Updated order ${order.id} with reduced ledger payments and new direct payment`)

          // Wait for the update to propagate
          await new Promise(resolve => setTimeout(resolve, 500))

          // Redistribute each affected ledger entry
          const ledgerEntryIdsArray = Array.from(ledgerEntryIdsToRedistribute)
          for (const ledgerEntryId of ledgerEntryIdsArray) {
            try {
              const payment = updatedPayments.find(p => p.ledgerEntryId === ledgerEntryId)
              const paymentDate = payment?.date || paymentDateIso
              await redistributeLedgerEntry(ledgerEntryId, paymentDate)
              console.log(`✅ Redistributed ledger entry ${ledgerEntryId}`)
            } catch (error) {
              console.error(`Error redistributing ledger entry ${ledgerEntryId}:`, error)
            }
          }


          // Reload orders
          await loadOrders()

          // Update selected order if it's the same
          if (selectedOrderDetail?.id === order.id && order.id) {
            const updated = await orderService.getOrderById(order.id)
            if (updated) {
              setSelectedOrderDetail(updated)
            }
          }

          // Update payment history if it's open
          if (selectedOrderForPayments?.id === order.id && order.id) {
            const updated = await orderService.getOrderById(order.id)
            if (updated) {
              setSelectedOrderForPayments(updated)
            }
          }

          return // Exit early since we've already handled the payment
        } catch (error: any) {
          console.error('Error reducing ledger payments:', error)
          showToast(error.message || 'Failed to reduce ledger payments', 'error')
          return
        }
      } else if (wouldOverpay && !hasLedgerPayments) {
        // Overpayment but no ledger payments - just warn
        const confirmed = await sweetAlert.confirm({
          title: 'Overpayment Warning',
          message: `Adding this payment would result in overpayment of ${formatIndianCurrency(overpaymentAmount)}.\n\nTotal payments: ${formatIndianCurrency(newTotalPaid)}\nOriginal total: ${formatIndianCurrency(expenseAmount)}\n\nContinue anyway?`,
          icon: 'warning',
          confirmText: 'Continue',
          cancelText: 'Cancel'
        })
        if (!confirmed) {
          return
        }
      }
      // If order is already paid or would overpay (without ledger payments to reduce), skip the "mark as paid" dialog
      // and automatically allow the payment
      let markAsPaid = false
      if (!isPaid && !wouldOverpay) {
        // Only ask "mark as paid" if order is not paid and won't overpay
        // Check if this payment would make the order paid (within tolerance)
        const newTotalAfterPayment = totalPaid + amount
        const wouldBecomePaid = newTotalAfterPayment >= (expenseAmount - PAYMENT_TOLERANCE)

        if (wouldBecomePaid) {
          const actionChoice = await sweetAlert.confirm({
            title: 'Add Payment',
            message: `Payment amount: ${formatIndianCurrency(amount)}\nRemaining: ${formatIndianCurrency(remainingAmount)}\n\nThis payment will mark the order as paid. Continue?`,
            icon: 'question',
            confirmText: 'Add Payment',
            cancelText: 'Cancel',
          })
          if (!actionChoice) {
            return
          }
          markAsPaid = true
        }
      } else if (isPaid || (wouldOverpay && !hasLedgerPayments)) {
        // Order is already paid or would overpay without ledger payments - automatically allow with markAsPaid
        markAsPaid = true
      }

      // Add direct payment to order (creates ledger entry without supplier name)
      await orderService.addPaymentToOrder(order.id!, amount, note || undefined, markAsPaid, paymentDateIso)

      // Immediately reload orders and ledger entries for real-time updates
      await Promise.all([loadOrders(), loadLedgerEntries()])
      setSupplierGroupsRefreshKey(prev => prev + 1)

      // Force refresh supplier details if open and order has a supplier
      if (showSupplierDetailDrawer && order.supplier && selectedSupplierGroup?.supplierName === order.supplier) {
        const updated = getSupplierGroups().find(
          g => g.supplierName === order.supplier
        )
        if (updated) {
          setSelectedSupplierGroup(updated)
        }
      }

      // Double-check: fetch the specific order to verify payment was saved
      const updatedOrderCheck = await orderService.getOrderById(order.id!)
      if (updatedOrderCheck) {
        console.log('Order after payment:', {
          id: updatedOrderCheck.id,
          partialPayments: updatedOrderCheck.partialPayments,
        })
      }
      // Also reload if order detail drawer is open
      if (selectedOrderDetail?.id === order.id) {
        const updatedOrder = await orderService.getOrderById(order.id!)
        if (updatedOrder) {
          setSelectedOrderDetail(updatedOrder)
        }
      }
      // Also update payment history if it's open
      if (selectedOrderForPayments?.id === order.id && order.id) {
        const updated = await orderService.getOrderById(order.id)
        if (updated) {
          setSelectedOrderForPayments(updated)
        }
      }
    } catch (error: any) {
      console.error('Error adding payment:', error)
      showToast(error.message || 'Failed to add payment', 'error')
    }
  }

  const handleEditPayment = (order: Order, paymentId: string) => {
    const payment = order.partialPayments?.find(p => p.id === paymentId)
    if (payment?.ledgerEntryId) {
      return
    }
    setEditingPayment({ order, paymentId })
  }

  const handleSavePaymentEdit = async (data: { amount: number; date: string }) => {
    if (!editingPayment || !editingPayment.order.id) return

    try {
      const payment = editingPayment.order.partialPayments?.find(p => p.id === editingPayment.paymentId)
      const isLedgerPayment = !!payment?.ledgerEntryId

      // Check if amount changed (only for ledger payments)
      const amountChanged = isLedgerPayment && payment
        ? Math.abs(Number(data.amount) - Number(payment.amount)) > 0.01
        : false

      // Update the payment on the order (preserving ledgerEntryId if it exists)
      await orderService.updatePartialPayment(
        editingPayment.order.id,
        editingPayment.paymentId,
        data,
        payment?.ledgerEntryId // Preserve ledgerEntryId
      )

      // If this is a ledger payment AND the amount changed, redistribute the ledger entry
      if (isLedgerPayment && payment.ledgerEntryId && amountChanged) {
        await redistributeLedgerEntry(payment.ledgerEntryId, data.date)
      }

      // Reload orders
      await loadOrders()
      setSupplierGroupsRefreshKey(prev => prev + 1)

      // Force refresh supplier details if open and order has a supplier
      if (showSupplierDetailDrawer && editingPayment.order.supplier && selectedSupplierGroup?.supplierName === editingPayment.order.supplier) {
        const updated = getSupplierGroups().find(
          g => g.supplierName === editingPayment.order.supplier
        )
        if (updated) {
          setSelectedSupplierGroup(updated)
        }
      }

      // Update selected order if it's the same
      if (selectedOrderForPayments?.id === editingPayment.order.id && editingPayment.order.id) {
        const updated = await orderService.getOrderById(editingPayment.order.id)
        if (updated) {
          setSelectedOrderForPayments(updated)
        }
      }

      // Update order detail drawer if it's open
      if (selectedOrderDetail?.id === editingPayment.order.id && editingPayment.order.id) {
        const updated = await orderService.getOrderById(editingPayment.order.id)
        if (updated) {
          setSelectedOrderDetail(updated)
        }
      }

      setEditingPayment(null)
    } catch (error: any) {
      console.error('Failed to update payment:', error)
      showToast(error.message || 'Failed to update payment', 'error')
      setEditingPayment(null)
    }
  }

  // Redistribute ledger entry when a payment amount changes
  const redistributeLedgerEntry = async (ledgerEntryId: string, expenseDate: string) => {
    try {
      console.log(`🔄 Redistributing ledger entry ${ledgerEntryId} (date: ${expenseDate})`)

      // Get the ledger entry
      const ledgerEntry = await ledgerService.getEntryById(ledgerEntryId)
      if (!ledgerEntry) {
        console.warn(`❌ Ledger entry ${ledgerEntryId} not found`)
        return
      }
      if (ledgerEntry.type !== 'debit' || !ledgerEntry.supplier) {
        console.warn(`❌ Ledger entry is not an expense with supplier (type: ${ledgerEntry.type}, supplier: ${ledgerEntry.supplier})`)
        return
      }

    console.log('Redistribution is handled server-side by orderService.redistributeSupplierPayment; skipping duplicate client distribution.')
    } catch (error) {
      console.error('❌ Error redistributing ledger entry:', error)
      throw error
    }
  }

  const handleRemovePayment = async (order: Order, paymentId: string) => {
    if (!order.id) return

    const payment = order.partialPayments?.find(p => p.id === paymentId)
    const isLedgerPayment = !!payment?.ledgerEntryId

    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Remove Payment?',
        message: isLedgerPayment
          ? 'This payment is from a ledger entry. Removing it will trigger redistribution of the ledger entry. Continue?'
          : 'Are you sure you want to remove this payment? This action cannot be undone.',
        icon: 'warning',
        confirmText: 'Remove',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      await orderService.removePartialPayment(order.id, paymentId)

      // If this was a ledger payment, redistribute the ledger entry
      if (isLedgerPayment && payment.ledgerEntryId) {
        try {
          // Get the order date or use current date for redistribution
          const paymentDate = order.date || new Date().toISOString()
          await redistributeLedgerEntry(payment.ledgerEntryId, paymentDate)
        } catch (error) {
          console.error('Error redistributing ledger entry:', error)
          showToast('Payment removed, but redistribution failed', 'error')
        }
      }

      // Reload orders
      await loadOrders()
      setSupplierGroupsRefreshKey(prev => prev + 1)

      // Force refresh supplier details if open and order has a supplier
      if (showSupplierDetailDrawer && order.supplier && selectedSupplierGroup?.supplierName === order.supplier) {
        const updated = getSupplierGroups().find(
          g => g.supplierName === order.supplier
        )
        if (updated) {
          setSelectedSupplierGroup(updated)
        }
      }

      // Update selected order if payment history is open
      if (selectedOrderForPayments?.id === order.id && order.id) {
        const updated = await orderService.getOrderById(order.id)
        if (updated) {
          setSelectedOrderForPayments(updated)
        }
      }

      // Update order detail drawer if it's open
      if (selectedOrderDetail?.id === order.id && order.id) {
        const updated = await orderService.getOrderById(order.id)
        if (updated) {
          setSelectedOrderDetail(updated)
        }
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to remove payment: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const handleDeleteOrder = async (id: string) => {
    try {
      console.log('Delete button clicked for order:', id)
      const confirmed = await sweetAlert.confirm({
        title: 'Delete Order?',
        message: 'Are you sure you want to delete this order? This action cannot be undone.',
        icon: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      })
      console.log('SweetAlert confirmed:', confirmed)

      if (confirmed) {
        await orderService.deleteOrder(id)
        showToast('Order deleted successfully!', 'success')
        await loadOrders()
        await loadInvoices()
      }
    } catch (error: any) {
      console.error('Error deleting order:', error)
      // Only show error if it's not a cancellation (SweetAlert cancellation throws an error)
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to delete order: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const togglePartyTag = (partyName: string) => {
    const newSelected = new Set(selectedPartyTags)
    // Ensure we're working with trimmed party names
    const trimmedPartyName = partyName.trim()
    if (newSelected.has(trimmedPartyName)) {
      newSelected.delete(trimmedPartyName)
    } else {
      newSelected.add(trimmedPartyName)
    }
    setSelectedPartyTags(newSelected)
    // Clear filter drawer party name when using tags
    if (newSelected.size > 0) {
      setFilterPartyName('')
      // Also clear the filters.partyName to avoid conflicts
      setFilters(prev => ({ ...prev, partyName: undefined }))
    }
  }

  const toggleOrderSelection = (id: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedOrders(newSelected)
  }

  // Get unique materials from orders
  const getUniqueMaterials = (): string[] => {
    const materialSet = new Set<string>()
    orders.forEach(order => {
      if (Array.isArray(order.material)) {
        order.material.forEach(m => {
          const material = String(m || '').trim()
          if (material) materialSet.add(material)
        })
      } else if (order.material) {
        const material = String(order.material).trim()
        if (material) materialSet.add(material)
      }
    })
    return Array.from(materialSet).sort()
  }

  const togglePartyFilter = (partyName: string) => {
    const newFilter = new Set(inlinePartyFilter)
    if (newFilter.has(partyName)) {
      newFilter.delete(partyName)
    } else {
      newFilter.add(partyName)
    }
    setInlinePartyFilter(newFilter)
  }

  const toggleMaterialFilter = (material: string) => {
    const newFilter = new Set(inlineMaterialFilter)
    if (newFilter.has(material)) {
      newFilter.delete(material)
    } else {
      newFilter.add(material)
    }
    setInlineMaterialFilter(newFilter)
  }

  const clearPartyFilter = () => {
    setInlinePartyFilter(new Set())
    setActiveColumnFilter(null)
  }

  const clearMaterialFilter = () => {
    setInlineMaterialFilter(new Set())
    setActiveColumnFilter(null)
  }

  // Close dropdowns when clicking outside - Removed as we use SelectionSheet now
  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     const target = event.target as HTMLElement
  //     if (!target.closest('.filter-dropdown-container')) {
  //       setActiveColumnFilter(null)
  //     }
  //   }
  //   document.addEventListener('click', handleClickOutside)
  //   return () => document.removeEventListener('click', handleClickOutside)
  // }, [])

  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) return

    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Delete Selected Orders?',
        message: `Are you sure you want to delete ${selectedOrders.size} order(s)? This action cannot be undone.`,
        icon: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      const orderIds = Array.from(selectedOrders)
      let successCount = 0
      let failCount = 0

      for (const orderId of orderIds) {
        try {
          await orderService.deleteOrder(orderId)
          successCount++
        } catch (error: any) {
          console.error(`Failed to delete order ${orderId}:`, error)
          failCount++
        }
      }

      if (successCount > 0) {
        showToast(`Successfully deleted ${successCount} order(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`, 'success')
        setSelectedOrders(new Set())
        await loadOrders()
        await loadInvoices()
      } else {
        showToast(`Failed to delete orders.`, 'error')
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to delete orders: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const handleBulkCreateInvoice = async () => {
    if (selectedOrders.size === 0) return

    const orderIds = Array.from(selectedOrders)

    try {
      showToast('Creating invoice...', 'info')
      await invoiceService.createInvoice(orderIds)
      showToast(`Invoice created successfully for ${orderIds.length} order(s)!`, 'success')
      setSelectedOrders(new Set())
      await loadOrders()
      await loadInvoices()
    } catch (error: any) {
      showToast(`Failed to create invoice: ${error?.message || 'Unknown error'}`, 'error')
    }
  }

  const applyFilterForm = () => {
    const newFilters: OrderFilters = {}
    if (filterPartyName) newFilters.partyName = filterPartyName
    if (filterMaterial) newFilters.material = filterMaterial
    if (filterStartDate) newFilters.startDate = filterStartDate
    if (filterEndDate) newFilters.endDate = filterEndDate
    setFilters(newFilters)
    // Clear tags when applying filter drawer filters
    if (filterPartyName) {
      setSelectedPartyTags(new Set())
    }
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilterPartyName('')
    setFilterMaterial('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilters({})
    setSelectedPartyTags(new Set())
    setShowFilters(false)
  }

  const handlePartyGroupClick = (group: PartyGroup) => {
    setSelectedPartyGroup(group)
    setShowPartyDetailDrawer(true)
  }

  const getPartyGroups = useCallback((): PartyGroup[] => {
    // Use only ledger income entries (credits with partyName) as the single source of truth
    const partyPayments = ledgerEntries
      .filter((entry) => entry.type === 'credit' && entry.partyName)
      .map((entry) => ({
        id: entry.id,
        partyName: entry.partyName!,
        amount: entry.amount,
        date: entry.date,
        ledgerEntryId: entry.id,
        note: entry.note ?? null,
        createdAt: entry.createdAt ?? entry.date,
        updatedAt: entry.createdAt ?? entry.date,
        source: 'ledgerCredit',
      }))
    // Filter orders by selected month first
    const monthFilteredOrders = filteredOrders.filter(order =>
      isOrderInSelectedMonth(order, selectedMonth)
    )

    // Group orders by party
    const partyMap = new Map<string, Order[]>()
    monthFilteredOrders.forEach(order => {
      const party = order.partyName
      if (!partyMap.has(party)) {
        partyMap.set(party, [])
      }
      partyMap.get(party)!.push(order)
    })

    // Calculate totals and payment info for each party
    const groups: PartyGroup[] = []
    partyMap.forEach((partyOrders, partyName) => {
      let totalSelling = 0
      let totalProfit = 0
      let totalPaid = 0
      let lastPaymentDate: string | null = null
      let lastPaymentAmount: number | null = null

      if (selectedMonth === 'all') {
        // For "All" - calculate totals across all time
        // Get all orders for this party (not just filtered ones)
        const allPartyOrders = orders.filter(order => order.partyName === partyName) // Use all orders, not just filtered
        totalSelling = allPartyOrders.reduce((sum, order) => sum + Math.max(0, order.total || 0), 0)


        // For "All" time view, show total estimated profit across all orders
        // This gives a true picture of profitability regardless of payment status
        totalProfit = allPartyOrders.reduce((sum, order) => {
          const profit = getEstimatedProfit(order)
          return sum + profit
        }, 0)

        // Get all payments for this party (across all time)
        const partyPaymentRecords = partyPayments.filter(p => p.partyName === partyName)

        partyPaymentRecords.forEach(payment => {
          totalPaid += payment.amount

          // Track last payment date and amount
          const paymentDate = safeParseDate(payment.date)
          if (paymentDate) {
            const currentLastDate = safeParseDate(lastPaymentDate)
            if (!currentLastDate || paymentDate > currentLastDate) {
              lastPaymentDate = payment.date
              lastPaymentAmount = payment.amount
            }
          }
        })
      } else {
        // For specific month - calculate only for that month's data
        totalSelling = partyOrders.reduce((sum, order) => sum + order.total, 0)
        // Show estimated profit for monthly views to see actual profitability
        totalProfit = partyOrders.reduce((sum, order) => sum + getEstimatedProfit(order), 0)

        // Get payments only for the selected month
        const partyPaymentRecords = partyPayments.filter(p =>
          p.partyName === partyName && isPaymentInSelectedMonth(p.date, selectedMonth)
        )

        partyPaymentRecords.forEach(payment => {
          totalPaid += payment.amount

          // Track last payment date and amount (within the month)
          const paymentDate = safeParseDate(payment.date)
          if (paymentDate) {
            const currentLastDate = safeParseDate(lastPaymentDate)
            if (!currentLastDate || paymentDate > currentLastDate) {
              lastPaymentDate = payment.date
              lastPaymentAmount = payment.amount
            }
          }
        })
      }

      // Convert party payments to the expected format (only for the relevant time period)
      const allPayments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment; ledgerEntryId?: string }> = []
      const relevantPayments = selectedMonth === 'all'
        ? partyPayments.filter(p => p.partyName === partyName)
        : partyPayments.filter(p => p.partyName === partyName && isPaymentInSelectedMonth(p.date, selectedMonth))

      relevantPayments.forEach(payment => {
        allPayments.push({
          invoiceId: '', // No invoice ID for party payments
          invoiceNumber: '', // No invoice number for party payments
          payment: {
            id: payment.id!,
            amount: payment.amount,
            date: payment.date,
            ...(payment.note ? { note: payment.note } : {})
          },
          ledgerEntryId: payment.ledgerEntryId // Include ledger entry ID if linked
        })
      })

      // Sort payments by date (newest first)
      allPayments.sort((a, b) => safeGetTime(b.payment.date) - safeGetTime(a.payment.date))

      groups.push({
        partyName,
        totalSelling,
        totalPaid,
        totalProfit,
        lastPaymentDate,
        lastPaymentAmount,
        orders: partyOrders.sort((a, b) => {
          const ta = safeGetTime(a.date || a.createdAt || a.updatedAt)
          const tb = safeGetTime(b.date || b.createdAt || b.updatedAt)
          return tb - ta
        }),
        payments: allPayments
      })
    })

    // Sort groups by party name
    return groups.sort((a, b) => a.partyName.localeCompare(b.partyName))
  }, [ledgerEntries, invoices, orders, selectedMonth, filteredOrders])

  const partyGroups = useMemo(
    () => getPartyGroups(),
    [getPartyGroups]
  )

  const partySummaries = useMemo(
    () =>
      partyGroups.map((group) => {
        const outstandingAmount = Math.max(0, group.totalSelling - group.totalPaid)
        const remainingProfit = group.totalProfit - outstandingAmount
        const useAdjustedProfit = outstandingAmount <= 250
        const effectiveProfit = useAdjustedProfit ? remainingProfit : group.totalProfit
        return {
          ...group,
          outstandingAmount,
          remainingProfit,
          useAdjustedProfit,
          effectiveProfit,
        }
      }),
    [partyGroups]
  )

  const totalPartyProfit = useMemo(
    () => partySummaries.reduce((sum, group) => sum + group.effectiveProfit, 0),
    [partySummaries]
  )

  // Keep the party detail popup in sync after income edits while it stays open
  useEffect(() => {
    if (!showPartyDetailDrawer || !selectedPartyGroup?.partyName) return

    const updatedGroup = partySummaries.find(
      (group) => group.partyName === selectedPartyGroup.partyName
    )

    if (!updatedGroup) return

    const paymentsChanged =
      updatedGroup.payments.length !== selectedPartyGroup.payments.length ||
      updatedGroup.payments.some((payment, idx) => {
        const current = selectedPartyGroup.payments[idx]
        if (!current) return true
        return (
          current.payment.amount !== payment.payment.amount ||
          current.payment.date !== payment.payment.date ||
          (current.payment.note || '') !== (payment.payment.note || '')
        )
      })

    const hasChanged =
      updatedGroup.totalPaid !== selectedPartyGroup.totalPaid ||
      updatedGroup.totalSelling !== selectedPartyGroup.totalSelling ||
      updatedGroup.totalProfit !== selectedPartyGroup.totalProfit ||
      updatedGroup.lastPaymentDate !== selectedPartyGroup.lastPaymentDate ||
      paymentsChanged

    if (hasChanged) {
      setSelectedPartyGroup(updatedGroup)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyGroups, selectedPartyGroup, showPartyDetailDrawer])

  const getSupplierGroups = useCallback((): SupplierGroup[] => {
    const monthFilteredOrders = selectedMonth === 'all'
      ? filteredOrders
      : filteredOrders.filter(order => isOrderInSelectedMonth(order, selectedMonth))

    // Group orders by supplier
    const supplierMap = new Map<string, Order[]>()
    monthFilteredOrders.forEach(order => {
      const supplier = order.supplier
      if (!supplier || supplier.trim() === '') return
      if (!supplierMap.has(supplier)) {
        supplierMap.set(supplier, [])
      }
      supplierMap.get(supplier)!.push(order)
    })

    // Calculate totals and payment info for each supplier
    const groups: SupplierGroup[] = []
    supplierMap.forEach((supplierOrders, supplierName) => {
      let rawMaterialTotal = 0
      let totalPaidDirectly = 0  // Direct payments to supplier (currently always 0 since direct payments to orders are carting)
      let totalPaidToSupplier = 0  // Supplier payments via ledger expense entries

      supplierOrders.forEach(order => {
        const orderOriginalTotal = Number(order.originalTotal || 0)
        rawMaterialTotal += orderOriginalTotal

        // Note: Direct payments to orders are now considered carting payments,
        // not direct payments to supplier. Only ledger entries without supplier name
        // are counted as direct payments to supplier.
      })

      // Get supplier payments from ledger expense entries
      const supplierLedgerEntries = ledgerEntries.filter(
        e =>
          e.type === 'debit' &&
          e.supplier === supplierName &&
          !e.voided &&
          isPaymentInSelectedMonth(e.date, selectedMonth)
      )
      totalPaidToSupplier = supplierLedgerEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

      // Calculate total carting paid across all orders
      const totalCartingPaid = supplierOrders.reduce((sum, order) => {
        const existingPayments = (order.partialPayments || []).filter(payment =>
          isPaymentInSelectedMonth(payment.date, selectedMonth)
        )
        const directPayments = existingPayments.filter(p => !p.ledgerEntryId)
        const ledgerEntryIds = new Set(supplierLedgerEntries.map(p => p.id).filter(Boolean))
        const ledgerCartingPayments = existingPayments.filter(p => p.ledgerEntryId && !ledgerEntryIds.has(p.ledgerEntryId))
        const cartingTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0) +
                            ledgerCartingPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
        return sum + cartingTotal
      }, 0)

      const totalPaid = totalPaidDirectly + totalPaidToSupplier + totalCartingPaid
      const remainingAmount = Math.max(0, rawMaterialTotal - totalPaid)

      // Track last payment date and amount
      let lastPaymentDate: string | null = null
      let lastPaymentAmount: number | null = null

      // Check order payments for last payment
      supplierOrders.forEach(order => {
        const partialPayments = (order.partialPayments || []).filter(payment =>
          isPaymentInSelectedMonth(payment.date, selectedMonth)
        )
        partialPayments.forEach(payment => {
          const paymentDate = safeParseDate(payment.date)
          if (paymentDate) {
            const currentLastDate = safeParseDate(lastPaymentDate)
            if (!currentLastDate || paymentDate > currentLastDate) {
              lastPaymentDate = payment.date
              lastPaymentAmount = payment.amount
            }
          }
        })
      })

      // Check supplier ledger entries for last payment
      supplierLedgerEntries.forEach(entry => {
        if (!isPaymentInSelectedMonth(entry.date, selectedMonth)) return
        const entryDate = safeParseDate(entry.date)
        if (entryDate) {
          const currentLastDate = safeParseDate(lastPaymentDate)
          if (!currentLastDate || entryDate > currentLastDate) {
            lastPaymentDate = entry.date
            lastPaymentAmount = entry.amount
          }
        }
      })

      // Sort ledger payments by date (newest first)
      const sortedLedgerPayments = supplierLedgerEntries
        .map(entry => ({ entry }))
        .sort((a, b) => safeGetTime(b.entry.date) - safeGetTime(a.entry.date))

      groups.push({
        supplierName,
        rawMaterialTotal,
        totalAmount: rawMaterialTotal, // backwards-compatible alias
        totalPaid,
        remainingAmount,
        lastPaymentDate,
        lastPaymentAmount,
        orders: supplierOrders.sort((a, b) => {
          const ta = safeGetTime(a.date || a.createdAt || a.updatedAt)
          const tb = safeGetTime(b.date || b.createdAt || b.updatedAt)
          return tb - ta
        }),
        ledgerPayments: sortedLedgerPayments,
        paidDirect: totalPaidDirectly,
        paidToSupplier: totalPaidToSupplier,
        totalCartingPaid
      })
    })

    return groups.sort((a, b) => {
      const aLastDate = safeGetTime(a.lastPaymentDate)
      const bLastDate = safeGetTime(b.lastPaymentDate)
      return bLastDate - aLastDate
    })
  }, [filteredOrders, ledgerEntries, selectedMonth])

  // Refresh selected supplier group when orders change (for direct payment updates)
  useEffect(() => {
    if (selectedSupplierGroup?.supplierName && showSupplierDetailDrawer) {
      const updated = getSupplierGroups().find(
        g => g.supplierName === selectedSupplierGroup.supplierName
      )
      if (updated) {
        setSelectedSupplierGroup(updated)
      } else {
        setShowSupplierDetailDrawer(false)
        setSelectedSupplierGroup(null)
      }
    }
  }, [selectedSupplierGroup?.supplierName, showSupplierDetailDrawer, getSupplierGroups])

  const handleSupplierGroupClick = (group: SupplierGroup) => {
    setSelectedSupplierGroup(group)
    setShowSupplierDetailDrawer(true)
  }

  return (
    <div className="bg-gray-50" style={{
      height: '100dvh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>

      {/* Filters Drawer */}
      <FilterPopup isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Party Name
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-2 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
              {partyNames.map((partyNameOption) => (
                <label key={partyNameOption} className="flex items-center space-x-1.5 cursor-pointer hover:bg-gray-100 p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={filterPartyName.split(',').includes(partyNameOption)}
                    onChange={(e) => {
                      const currentFilters = filterPartyName.split(',').filter(p => p.trim())
                      let newFilters: string[]
                      if (e.target.checked) {
                        newFilters = [...currentFilters, partyNameOption]
                      } else {
                        newFilters = currentFilters.filter(p => p !== partyNameOption)
                      }
                      setFilterPartyName(newFilters.join(','))
                    }}
                    className="custom-checkbox"
                  />
                  <span className="text-xs text-gray-700">{partyNameOption}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Material
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-2 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
              {['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth'].map((materialOption) => (
                <label key={materialOption} className="flex items-center space-x-1.5 cursor-pointer hover:bg-gray-100 p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={filterMaterial.split(',').includes(materialOption)}
                    onChange={(e) => {
                      const currentFilters = filterMaterial.split(',').filter(m => m.trim())
                      let newFilters: string[]
                      if (e.target.checked) {
                        newFilters = [...currentFilters, materialOption]
                      } else {
                        newFilters = currentFilters.filter(m => m !== materialOption)
                      }
                      setFilterMaterial(newFilters.join(','))
                    }}
                    className="custom-checkbox"
                  />
                  <span className="text-xs text-gray-700">{materialOption}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full p-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full p-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-200 sticky bottom-0 bg-white pb-2">
            <button
              onClick={async () => {
                try {
                  const orphanedOrders = await orderService.findOrphanedInvoicedOrders()
                  if (orphanedOrders.length === 0) {
                    await sweetAlert.info('No Issues Found', 'All orders with invoice references have corresponding invoices.')
                  } else {
                    const orderIds = orphanedOrders.map(o => o.orderId)
                    const orderList = orphanedOrders.map(o =>
                      `• ${o.partyName} - ${o.date}`
                    ).join('\n')

                    const confirmed = await sweetAlert.confirm({
                      title: 'Orphaned Orders Found',
                      message: `Found ${orphanedOrders.length} orders marked as invoiced but without corresponding invoices:\n\n${orderList}\n\nReset their invoiced status?`,
                      icon: 'warning',
                      confirmText: 'Fix Orders',
                      cancelText: 'Cancel'
                    })

                    if (confirmed) {
                      await orderService.fixOrphanedInvoicedOrders(orderIds)
                      showToast(`Fixed ${orderIds.length} orphaned orders`, 'success')
                      await loadOrders() // Refresh the orders list
                    }
                  }
                } catch (error: any) {
                  showToast(`Error checking orders: ${error?.message || 'Unknown error'}`, 'error')
                }
              }}
              className="flex-1 bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              Check Invoiced Orders
            </button>
            <div className="flex gap-1 flex-1">
              <button
                onClick={() => {
                  applyFilterForm()
                  setShowFilters(false)
                }}
                className="flex-1 bg-primary-600 text-white px-2 py-2 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  resetFilters()
                  setShowFilters(false)
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-2 py-2 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </FilterPopup>

      {/* Month Selection Bar - Shared across views */}
      {(viewMode === 'byParty' || viewMode === 'allOrders' || viewMode === 'suppliers') && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              {generateMonthOptions().map((month) => (
                <button
                  key={month}
                  onClick={() => setSelectedMonth(month)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    selectedMonth === month
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {month === 'all' ? 'All' : month}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Mode Tabs - Floating at Bottom */}
      <div
        className="fixed left-0 right-0 z-[45] flex items-end justify-center"
        style={{
          bottom: selectedOrders.size > 0 ? '9.75rem' : '5.25rem',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          pointerEvents: 'none',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: !showBottomTabs ? 'translateY(calc(100% + 1rem))' : 'translateY(0)',
          opacity: !showBottomTabs ? 0 : 1,
        }}
      >
        <div
          className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl flex gap-2 w-full"
          style={{
            padding: '0.5rem',
            boxShadow: '0 2px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)',
            pointerEvents: !showBottomTabs ? 'none' : 'auto',
          }}
        >
          <button
            onClick={(e) => {
              createRipple(e)
              setViewMode('allOrders')
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all native-press ${viewMode === 'allOrders'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            style={{
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            All Orders
          </button>
          <button
            onClick={(e) => {
              createRipple(e)
              setViewMode('byParty')
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all native-press ${viewMode === 'byParty'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            style={{
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            By Party
          </button>
          <button
            onClick={(e) => {
              createRipple(e)
              setViewMode('suppliers')
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all native-press ${viewMode === 'suppliers'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            style={{
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            Suppliers
          </button>
        </div>
      </div>

      {/* Action Buttons - Floating at Bottom (only when orders are selected) */}
      {selectedOrders.size > 0 && (
        <div
          className="fixed left-0 right-0 z-[44] flex items-end justify-center"
          style={{
            bottom: '5.25rem',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
            pointerEvents: 'none',
          }}
        >
          <div
            className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl w-full"
            style={{
              padding: '0.75rem',
              boxShadow: '0 2px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)',
              pointerEvents: 'auto',
            }}
          >
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  createRipple(e)
                  handleBulkCreateInvoice()
                }}
                className="flex-1 bg-green-600 text-white px-3 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:bg-green-700 transition-colors touch-manipulation native-press"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <FileText size={18} />
                <span>Create Invoice ({selectedOrders.size})</span>
              </button>
              <button
                onClick={(e) => {
                  createRipple(e)
                  handleBulkDelete()
                }}
                className="flex-1 bg-red-600 text-white px-3 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:bg-red-700 transition-colors touch-manipulation native-press"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Trash2 size={18} />
                <span>Delete ({selectedOrders.size})</span>
              </button>
              <button
                onClick={(e) => {
                  createRipple(e)
                  setSelectedOrders(new Set())
                }}
                className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-300 transition-colors touch-manipulation native-press"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Scrollable, fits between header and buttons/nav */}
      <div
        ref={contentRef}
        onClick={(e) => {
          // Clear highlight when clicking on the container (not on a row or button)
          if ((e.target as HTMLElement).closest('[data-order-id]') === null &&
            (e.target as HTMLElement).closest('button') === null) {
            setHighlightedRowId(null)
          }
        }}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: viewMode === 'allOrders' ? 'auto' : 'visible',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: selectedOrders.size > 0 ? '16rem' : '9rem' // Increased padding to clear bottom bar
        }}
      >
        {/* Orders List */}
        {loading ? (
          <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-50">
            <TruckLoading size={100} />
          </div>
        ) : ordersForView.length === 0 ? (
          <div className="p-2.5 text-center text-sm text-gray-500">No orders found</div>
        ) : viewMode === 'byParty' ? (
          <>
            {/* By Party View - Ultra Compact Design */}
            <div className="px-3 pb-1">
              <div className="bg-white rounded-xl border border-green-200 shadow-sm px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-green-700">Total Profit (all parties)</span>
                <span className="text-lg font-bold text-green-800">
                  {formatIndianCurrency(totalPartyProfit)}
                </span>
              </div>
            </div>
            <div className="p-2 space-y-2">
            {partySummaries.map((group, index) => {
              const balance = group.totalSelling - group.totalPaid
              const { outstandingAmount, remainingProfit, useAdjustedProfit: showProfitCalc, effectiveProfit } = group
              const lastPaymentDateObj = safeParseDate(group.lastPaymentDate)
              const paymentPercentage = group.totalSelling > 0 ? (group.totalPaid / group.totalSelling) * 100 : 0

              return (
                <div
                  key={group.partyName}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-all duration-200 hover:border-primary-300 active:scale-[0.99] native-press"
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 0.04}s both`,
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    createRipple(e)
                    handlePartyGroupClick(group)
                  }}
                >
                  <div className="p-2.5">
                    {/* Header Row - Minimal */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <User size={13} className="text-primary-600 flex-shrink-0" />
                          <h3 className="font-bold text-sm text-gray-900 truncate">{group.partyName}</h3>
                        </div>
                        {group.orders.length > 0 && group.orders[0].siteName && (
                          <p className="text-[10px] text-gray-500 truncate ml-4.5">{group.orders[0].siteName}</p>
                        )}
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          createRipple(e)
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

                            await partyPaymentService.addPayment(group.partyName, amount, note || undefined)
                            showToast('Payment added successfully!', 'success')
                            await loadOrders()
                          } catch (error: any) {
                            if (error?.message && !error.message.includes('SweetAlert')) {
                              showToast(`Failed to add payment: ${error?.message || 'Unknown error'}`, 'error')
                            }
                          }
                        }}
                        className="p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-all native-press flex items-center justify-center flex-shrink-0"
                        style={{
                          WebkitTapHighlightColor: 'transparent',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {/* Stats - consistent layout for all month selections */}
                    <div className="mb-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`p-2 rounded-lg ${balance >= 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                          <div className={`text-[10px] font-medium mb-0.5 ${balance >= 0 ? 'text-orange-600' : 'text-green-600'}`}>Outstanding</div>
                          <div className={`text-sm font-bold ${balance >= 0 ? 'text-orange-700' : 'text-green-700'}`}>
                            {formatIndianCurrency(Math.abs(balance))}
                          </div>
                        </div>
                        <div className={`p-2 rounded-lg ${effectiveProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                          <div className={`text-[10px] font-medium mb-0.5 ${effectiveProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Total Profit</div>
                          <div className={`text-sm font-bold ${effectiveProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatIndianCurrency(effectiveProfit)}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded-lg">
                          <div className="text-[10px] text-blue-600 font-medium mb-0.5">Total Paid by Party</div>
                          <div className="text-sm font-bold text-blue-700">
                            {formatIndianCurrency(group.totalPaid)}
                          </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-lg">
                          <div className="text-[10px] text-gray-600 font-medium mb-0.5">Total Orders</div>
                          <div className="text-sm font-bold text-gray-700">
                            {formatIndianCurrency(group.totalSelling)}
                          </div>
                        </div>
                      </div>
                      {showProfitCalc && (
                        <div className="mt-2 p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100">
                          <div className="text-[10px] font-semibold text-green-700 mb-0.5">Profit after clearing dues</div>
                          <div className="text-xs font-bold text-gray-900">
                            {`${formatIndianCurrency(group.totalProfit)} - ${formatIndianCurrency(outstandingAmount)} = ${formatIndianCurrency(remainingProfit)}`}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer - Minimal */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                      {lastPaymentDateObj && group.lastPaymentAmount !== null ? (
                        <span className="text-[10px] text-gray-500">
                          {format(lastPaymentDateObj, 'dd MMM')} • {formatIndianCurrency(group.lastPaymentAmount)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">No payments</span>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500">
                          {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                        </span>
                        <ChevronRight size={11} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        ) : viewMode === 'suppliers' ? (
          // Suppliers View - Two Column Grid
          <div className="p-3">
            <div className="grid grid-cols-2 gap-3">
              {getSupplierGroups().map((group, index) => {
                // Use refresh key to force re-render when data updates
                const key = `${group.supplierName}-${supplierGroupsRefreshKey}-${group.paidDirect}-${group.paidToSupplier}`
                const lastPaymentDateObj = safeParseDate(group.lastPaymentDate)
                const paymentPercentage = group.totalAmount > 0 ? (group.totalPaid / group.totalAmount) * 100 : 0

                return (
                  <div
                    key={key}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:border-orange-400 hover:shadow-md active:scale-[0.98] native-press group"
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                      WebkitTapHighlightColor: 'transparent',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return
                      createRipple(e)
                      handleSupplierGroupClick(group)
                    }}
                  >
                    {/* Gradient Header Background */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 px-3 py-2.5 border-b border-orange-200/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="p-1.5 bg-orange-500 rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-200">
                            <Package size={14} className="text-white" />
                          </div>
                          <h3 className="font-bold text-sm text-gray-900 truncate leading-tight">{group.supplierName}</h3>
                        </div>
                        <ChevronRight size={16} className="text-orange-500 flex-shrink-0 ml-1 group-hover:translate-x-0.5 transition-transform duration-200" />
                      </div>
                    </div>

                    <div className="p-3">
                      {/* Amount Cards */}
                      <div className="space-y-2 mb-3">
                        <div className={`rounded-lg p-2 border ${group.remainingAmount > 0
                          ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200/50'
                          : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200/50'
                        }`}>
                          <div className={`text-[10px] mb-0.5 font-medium ${group.remainingAmount > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            Owed to Supplier
                          </div>
                          <div className={`text-sm font-bold truncate ${group.remainingAmount > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {formatIndianCurrency(Math.abs(group.remainingAmount))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2 border border-green-200/50">
                            <div className="text-[10px] text-green-700 mb-0.5 font-medium">Paid to Supplier</div>
                            <div className="text-xs font-bold text-green-700 truncate">{formatIndianCurrency(group.paidToSupplier)}</div>
                          </div>

                          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2 border border-orange-200/50">
                            <div className="text-[10px] text-orange-700 mb-0.5 font-medium">Carting Paid</div>
                            <div className="text-xs font-bold text-orange-700 truncate">{formatIndianCurrency(group.totalCartingPaid)}</div>
                          </div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-2 border border-gray-200/50">
                          <div className="text-[10px] text-gray-600 mb-0.5 font-medium">Raw Material Cost</div>
                          <div className="text-sm font-bold text-gray-900 truncate">{formatIndianCurrency(group.rawMaterialTotal)}</div>
                        </div>
                      </div>

                      {/* Quick Stats */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span className="text-[10px] text-gray-600 font-medium">{group.orders.length} {group.orders.length === 1 ? 'Order' : 'Orders'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span className="text-[10px] text-gray-600 font-medium">{group.ledgerPayments.length} {group.ledgerPayments.length === 1 ? 'Payment' : 'Payments'}</span>
                        </div>
                      </div>

                      {/* Last Payment */}
                      {lastPaymentDateObj && group.lastPaymentAmount !== null && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <Calendar size={10} className="text-gray-400" />
                            <span className="text-gray-600 font-medium">Last:</span>
                            <span className="text-gray-700 font-semibold">{format(lastPaymentDateObj, 'dd MMM')}</span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-700 font-semibold">{formatIndianCurrency(group.lastPaymentAmount)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {getSupplierGroups().length === 0 && (
              <div className="col-span-2 p-8 text-center">
                <Package size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No suppliers found</p>
                <p className="text-xs text-gray-400 mt-1">Suppliers will appear here when you create orders</p>
              </div>
            )}
          </div>
        ) : (
          // All Orders View - Compact Table View
          <div className="inline-block min-w-full" style={{ paddingTop: '0.5rem' }}>
            {/* Sticky Header Group */}
            {ordersForView.length > 0 && (
              <div className="sticky top-0 z-30 shadow-sm bg-white min-w-max">
                {/* Select All Checkbox - Sticky Left */}
                <div ref={selectAllRef} className="bg-white border-b border-gray-100 px-2 py-2 flex items-center justify-between sticky left-0 z-40 w-screen max-w-[100%]">
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={ordersForView.length > 0 && ordersForView.every((o) => selectedOrders.has(o.id!))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allIds = new Set(ordersForView.map((o) => o.id!))
                          setSelectedOrders(allIds)
                        } else {
                          setSelectedOrders(new Set())
                        }
                      }}
                      className="custom-checkbox"
                      style={{ width: '22px', height: '22px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Select All ({ordersForView.length})
                    </span>
                  </label>
                </div>

                {/* Table Header - Single Row - Compact */}
                <div ref={tableHeaderRef} className="bg-gray-50 min-w-max">
                  <div className="flex items-center">
                    <div className="w-12 px-1 py-1.5 flex-shrink-0 text-center">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">#</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Date</span>
                    </div>
                    <div className="w-28 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <div
                        className="flex items-center gap-1 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveColumnFilter('party')
                        }}
                      >
                        <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Party/Site</span>
                        <div className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${inlinePartyFilter.size > 0 ? 'text-primary-600' : 'text-gray-400'}`}>
                          <Filter size={10} />
                        </div>
                        {inlinePartyFilter.size > 0 && (
                          <span className="text-[9px] text-primary-600 font-bold">({inlinePartyFilter.size})</span>
                        )}
                      </div>
                    </div>
                    <div className="w-28 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <div
                        className="flex items-center gap-1 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveColumnFilter('material')
                        }}
                      >
                        <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Material</span>
                        <div className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${inlineMaterialFilter.size > 0 ? 'text-primary-600' : 'text-gray-400'}`}>
                          <Filter size={10} />
                        </div>
                        {inlineMaterialFilter.size > 0 && (
                          <span className="text-[9px] text-primary-600 font-bold">({inlineMaterialFilter.size})</span>
                        )}
                      </div>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Wt/Rate</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Total</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Truck</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Orig Wt/Rate</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Orig Total</span>
                    </div>
                    <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Add/Profit</span>
                    </div>
                    <div className="w-36 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Actions</span>
                    </div>
                  </div>
                </div>

                {/* Compact Sticky Totals Row */}
                <div className="bg-primary-600 text-white border-t border-primary-700 border-b border-primary-500 min-w-max">
                  <div className="flex items-center">
                    <div className="w-12 px-1 py-0.5 flex-shrink-0"></div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                      <span className="text-[9px] font-bold uppercase">Total</span>
                    </div>
                    <div className="w-28 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                    <div className="w-28 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                      <div className="font-bold text-[10px]">
                        {formatIndianCurrency(ordersForView.reduce((sum, o) => sum + o.total, 0))}
                      </div>
                    </div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                      <div className="text-[9px] font-bold">
                        {ordersForView.reduce((sum, o) => sum + o.originalWeight, 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                      <div className="font-bold text-[10px]">
                        {formatIndianCurrency(ordersForView.reduce((sum, o) => sum + o.originalTotal, 0))}
                      </div>
                    </div>
                    <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                      <div className="text-[9px] font-bold">
                        {formatIndianCurrency(ordersForView.reduce((sum, o) => sum + o.additionalCost, 0))}
                      </div>
                      <div className="font-bold text-[10px]">
                        {formatIndianCurrency(ordersForView.reduce((sum, o) => sum + o.profit, 0))}
                      </div>
                    </div>
                    <div className="w-36 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Table Rows */}
            <div className="divide-y divide-gray-100 min-w-max">
              {ordersForView.map((order, index) => {
                const orderDate = safeParseDate(order.date)
                const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
                const partialPayments = order.partialPayments || []
                const totalRawPayments = partialPayments.reduce((sum, p) => sum + p.amount, 0)
                const customerPayments = order.customerPayments || []
                const totalCustomerPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0)
                const displayIndex = ordersForView.length - index
                const expenseAmount = Number(order.originalTotal || 0)
                const isPaid = isOrderPaid(order)
                const isPartyPaid = isCustomerPaid(order)

                return (
                  <div key={order.id} data-order-id={order.id} className="border-b border-gray-100">
                    <div
                      onClick={(e) => {
                        // Don't highlight if clicking on buttons, checkboxes, or expand button
                        if ((e.target as HTMLElement).closest('button') ||
                          (e.target as HTMLElement).closest('input[type="checkbox"]')) {
                          return
                        }
                        setHighlightedRowId(order.id || null)
                      }}
                      className={`flex items-center touch-manipulation transition-colors ${highlightedRowId === order.id
                          ? 'bg-yellow-100'
                          : selectedOrders.has(order.id!)
                            ? 'bg-primary-50'
                            : isPaid
                              ? 'bg-green-50/30'
                              : 'bg-white'
                        }`}
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        animation: `fadeInUp 0.2s ease-out ${index * 0.02}s both`,
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: '2rem',
                        lineHeight: '1rem',
                      }}
                    >
                      {/* Index + Checkbox Column */}
                      <div className="w-12 px-1 py-1 flex-shrink-0 flex items-center justify-center border-r border-gray-100">
                        <div className="flex flex-col items-center gap-0.5 leading-tight">
                          <span className="text-[10px] font-semibold text-gray-500">{displayIndex}</span>
                          <input
                            type="checkbox"
                            checked={selectedOrders.has(order.id!)}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleOrderSelection(order.id!)
                            }}
                            className="custom-checkbox"
                            style={{ width: '18px', height: '18px' }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Date Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-gray-600 text-[10px] leading-tight font-medium">
                          {orderDate ? format(orderDate, 'dd MMM') : 'N/A'}
                        </div>
                        {order.challanNo ? (
                          <div className="text-[9px] text-gray-500 font-semibold">
                            Challan #{order.challanNo}
                          </div>
                        ) : null}
                        {order.invoiced && (
                          <FileText size={10} className="text-blue-600 mt-0.5" />
                        )}
                      </div>

                      {/* Party / Site Column */}
                      <div className="w-28 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="font-semibold text-gray-900 truncate text-[11px] leading-tight">
                          {order.partyName}
                        </div>
                        {order.siteName && (
                          <div className="text-[9px] text-gray-500 truncate">
                            {order.siteName}
                          </div>
                        )}
                      </div>

                      {/* Material Column */}
                      <div className="w-28 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="flex flex-wrap gap-0.5">
                          {materials.slice(0, 2).map((mat, idx) => (
                            <span
                              key={idx}
                              className="bg-primary-50 text-primary-700 px-1 py-0.5 rounded text-[9px] font-medium whitespace-nowrap"
                              title={mat}
                            >
                              {mat}
                            </span>
                          ))}
                          {materials.length > 2 && (
                            <span className="text-[9px] text-gray-500">+{materials.length - 2}</span>
                          )}
                        </div>
                      </div>

                      {/* Weight / Rate Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-gray-700 text-[10px] leading-tight">
                          {order.weight.toLocaleString('en-IN')}
                        </div>
                        <div className="text-gray-700 text-[10px] leading-tight">
                          {formatIndianCurrency(order.rate)}
                        </div>
                      </div>

                      {/* Total Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="font-bold text-primary-600 text-[11px] leading-tight">
                          {formatIndianCurrency(order.total)}
                        </div>
                      </div>

                      {/* Truck Owner / No. / Supplier Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-gray-700 text-[10px] leading-tight truncate font-semibold">
                          {order.truckOwner}
                        </div>
                        {order.truckNo && (
                          <div className="text-gray-700 text-[9px] leading-tight truncate">
                            {order.truckNo}
                          </div>
                        )}
                        {order.supplier && (
                          <div className="text-orange-600 text-[9px] leading-tight truncate">
                            {order.supplier}
                          </div>
                        )}
                      </div>

                      {/* Original Weight / Rate Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-gray-700 text-[10px] leading-tight">
                          {order.originalWeight.toLocaleString('en-IN')}
                        </div>
                        <div className="text-gray-700 text-[10px] leading-tight">
                          {formatIndianCurrency(order.originalRate)}
                        </div>
                      </div>

                      {/* Original Total Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="font-semibold text-gray-800 text-[11px] leading-tight">
                          {formatIndianCurrency(order.originalTotal)}
                        </div>
                      </div>

                      {/* Additional Cost / Profit Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-blue-600 text-[10px] leading-tight">
                          {formatIndianCurrency(order.additionalCost)}
                        </div>
                        
                        {/* Profit Display Logic */}
                        <div className={`font-semibold text-[11px] leading-tight ${order.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatIndianCurrency(order.profit)}
                        </div>
                      </div>

                      {/* Actions Column - Compact with view/edit */}
                      <div className="w-36 px-1 py-1 flex-shrink-0 flex items-center gap-2 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrderDetail(order)
                            setShowOrderDetailDrawer(true)
                          }}
                          className="p-2 text-gray-600 hover:text-primary-600 transition-colors rounded-full hover:bg-primary-50 bg-white border border-gray-200 shadow-sm active:scale-95"
                          title="View"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingOrder(order)
                            setShowForm(true)
                          }}
                          className="p-2 text-gray-600 hover:text-primary-600 transition-colors rounded-full hover:bg-primary-50 bg-white border border-gray-200 shadow-sm active:scale-95"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                      </div>
                    </div>

                  </div>
                )
              })}
            </div>
          </div>
        )}


        {showForm && (
          <OrderForm
            order={editingOrder}
            onClose={() => {
              setShowForm(false)
              setEditingOrder(null)
            }}
            onSave={handleSaveOrder}
          />
        )}

        <OrderDetailPopup
          order={selectedOrderDetail}
          isOpen={showOrderDetailDrawer}
          onClose={() => {
            setShowOrderDetailDrawer(false)
            setSelectedOrderDetail(null)
          }}
          onEdit={(order) => {
            setEditingOrder(order)
            setShowOrderDetailDrawer(false)
            setShowForm(true)
          }}
          onDelete={handleDeleteOrder}
          onEditPayment={handleEditPayment}
          onRemovePayment={handleRemovePayment}
          onOrderUpdated={async () => {
            await loadOrders()
            // Refresh the selected order detail
            if (selectedOrderDetail?.id) {
              const updated = await orderService.getOrderById(selectedOrderDetail.id)
              if (updated) {
                setSelectedOrderDetail(updated)
              }
            }
          }}
        />

        <PartyDetailPopup
          group={selectedPartyGroup}
          isOpen={showPartyDetailDrawer}
          onClose={() => {
            setShowPartyDetailDrawer(false)
            setSelectedPartyGroup(null)
          }}
          onEditOrder={(order) => {
            setEditingOrder(order)
            setShowForm(true)
          }}
          onDeleteOrder={handleDeleteOrder}
          onOrderClick={(order) => {
            setSelectedOrderDetail(order)
            setShowOrderDetailDrawer(true)
          }}
          onPaymentAdded={async () => {
            // Ledger subscription handles data updates, just refresh selected group
            if (selectedPartyGroup?.partyName) {
              const updatedGroup = partySummaries.find(g => g.partyName === selectedPartyGroup.partyName)
              if (updatedGroup) {
                setSelectedPartyGroup(updatedGroup)
              }
            }
          }}
          onPaymentRemoved={async () => {
            // Ledger subscription handles data updates, just refresh selected group
            if (selectedPartyGroup?.partyName) {
              const updatedGroup = partySummaries.find(g => g.partyName === selectedPartyGroup.partyName)
              if (updatedGroup) {
                setSelectedPartyGroup(updatedGroup)
              }
            }
          }}
        />

        <SupplierDetailPopup
          key={selectedSupplierGroup?.supplierName || 'none'}
          group={selectedSupplierGroup}
          isOpen={showSupplierDetailDrawer}
          onClose={() => {
            setShowSupplierDetailDrawer(false)
            setSelectedSupplierGroup(null)
          }}
          onEditOrder={(order) => {
            setEditingOrder(order)
            setShowForm(true)
          }}
          onDeleteOrder={handleDeleteOrder}
          onOrderClick={(order) => {
            setSelectedOrderDetail(order)
            setShowOrderDetailDrawer(true)
          }}
          onAddPayment={handleAddPaymentToOrder}
          onRefresh={async () => {
            // Directly reload data and update state synchronously
            const [freshOrders, freshLedgerEntries] = await Promise.all([
              orderService.getAllOrders(),
              ledgerService.list()
            ])
            setOrders(freshOrders)
            setLedgerEntries(freshLedgerEntries)
            setFilteredOrders(applyFiltersToOrders(freshOrders))
            setSupplierGroupsRefreshKey(prev => prev + 1)

            if (selectedSupplierGroup?.supplierName) {
              const updated = getSupplierGroups().find(
                g => g.supplierName === selectedSupplierGroup.supplierName
              )
              if (updated) {
                setSelectedSupplierGroup(updated)
              }
            }
          }}
        />

        {/* Payment History Modal */}
        {showPaymentHistory && selectedOrderForPayments && (
          <>
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-50"
              onClick={() => {
                setShowPaymentHistory(false)
                setSelectedOrderForPayments(null)
              }}
            />
            <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl border-t border-gray-100 z-50 max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
                <button
                  onClick={() => {
                    setShowPaymentHistory(false)
                    setSelectedOrderForPayments(null)
                  }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {(() => {
                  const { expenseAmount, totalPaid, remainingAmount } = getOrderPaymentInfo(selectedOrderForPayments)
                  const payments = selectedOrderForPayments.partialPayments || []

                  return (
                    <>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">Total Expense</span>
                          <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(expenseAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">Total Paid</span>
                          <span className="text-sm font-semibold text-green-600">{formatIndianCurrency(totalPaid)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <span className="text-sm font-medium text-gray-600">Remaining</span>
                          <span className={`text-sm font-semibold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatIndianCurrency(remainingAmount)}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Records</h3>
                        {payments.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No payment records found</p>
                        ) : (
                          <div className="space-y-2">
                            {payments.map((payment) => {
                              // Calculate max amount for this payment (original total - other payments)
                              const otherPaymentsTotal = payments
                                .filter(p => p.id !== payment.id)
                                .reduce((sum, p) => sum + p.amount, 0)
                              const maxAmount = expenseAmount - otherPaymentsTotal
                              const isFromLedger = !!payment.ledgerEntryId

                              return (
                                <div
                                  key={payment.id}
                                  className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-semibold text-gray-900">
                                          {formatIndianCurrency(payment.amount)}
                                        </span>
                                        {isFromLedger && (
                                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                            From Ledger
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs text-gray-500">
                                        {(() => {
                                          const paymentDate = safeParseDate(payment.date)
                                          return paymentDate ? format(paymentDate, 'dd MMM yyyy, hh:mm a') : 'Invalid Date'
                                        })()}
                                      </span>
                                    </div>
                                    {payment.note && (
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {payment.note}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 ml-3">
                                    {!isFromLedger && (
                                      <button
                                        onClick={() => handleEditPayment(selectedOrderForPayments, payment.id)}
                                        className="p-1.5 bg-blue-50 text-blue-600 rounded active:bg-blue-100 transition-colors touch-manipulation"
                                        style={{ WebkitTapHighlightColor: 'transparent' }}
                                        title="Edit payment"
                                      >
                                        <Edit size={16} />
                                      </button>
                                    )}
                                    {!isFromLedger && (
                                      <button
                                        onClick={() => handleRemovePayment(selectedOrderForPayments, payment.id)}
                                        className="p-1.5 bg-red-50 text-red-600 rounded active:bg-red-100 transition-colors touch-manipulation"
                                        style={{ WebkitTapHighlightColor: 'transparent' }}
                                        title="Remove payment"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {remainingAmount > 0 && (
                        <button
                          onClick={() => {
                            setShowPaymentHistory(false)
                            handleAddPaymentToOrder(selectedOrderForPayments)
                          }}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Plus size={18} />
                          Add Payment
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </>
        )}

        {/* Payment Edit Drawer */}
        {editingPayment && editingPayment.order.partialPayments && (() => {
          const payment = editingPayment.order.partialPayments!.find(p => p.id === editingPayment.paymentId)
          if (!payment) return null

          // Calculate max amount (original total - other payments)
          const otherPaymentsTotal = editingPayment.order.partialPayments!
            .filter(p => p.id !== editingPayment.paymentId)
            .reduce((sum, p) => sum + p.amount, 0)
          const expenseAmount = Number(editingPayment.order.originalTotal || 0)
          const maxAmount = expenseAmount - otherPaymentsTotal

          return (
            <PaymentEditPopup
              isOpen={!!editingPayment}
              onClose={() => setEditingPayment(null)}
              onSave={handleSavePaymentEdit}
              initialData={{ amount: payment.amount, date: payment.date }}
              maxAmount={maxAmount}
            />
          )
        })()}
      </div>

      {/* Selection Sheets for Column Filters */}
      <SelectionSheet
        isOpen={activeColumnFilter === 'party'}
        onClose={() => setActiveColumnFilter(null)}
        title="Filter by Party"
      >
        <div className="space-y-1">
          {/* Clear Filter Option */}
          {inlinePartyFilter.size > 0 && (
            <button
              onClick={() => {
                clearPartyFilter()
                setActiveColumnFilter(null)
              }}
              className="w-full text-left px-4 py-3 text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} />
              Clear Filter
            </button>
          )}
          
          {partyNames.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No parties found</div>
          ) : (
            partyNames.map((partyName) => {
              const isSelected = inlinePartyFilter.has(partyName)
              return (
                <button
                  key={partyName}
                  onClick={() => {
                    // Toggle behavior: 
                    // If already selected, remove it (and keep sheet open? user said "close on selection")
                    // User said "selecting one option should close". 
                    // So we set the filter to THIS option (single select behavior) and close.
                    // If they want to clear, they use Clear Filter.
                    
                    // Implementing single-select style for quick filter:
                    const newSet = new Set<string>()
                    newSet.add(partyName)
                    setInlinePartyFilter(newSet)
                    setActiveColumnFilter(null)
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-primary-50 text-primary-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="truncate">{partyName}</span>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-primary-600" />}
                </button>
              )
            })
          )}
        </div>
      </SelectionSheet>

      <SelectionSheet
        isOpen={activeColumnFilter === 'material'}
        onClose={() => setActiveColumnFilter(null)}
        title="Filter by Material"
      >
        <div className="space-y-1">
          {/* Clear Filter Option */}
          {inlineMaterialFilter.size > 0 && (
            <button
              onClick={() => {
                clearMaterialFilter()
                setActiveColumnFilter(null)
              }}
              className="w-full text-left px-4 py-3 text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} />
              Clear Filter
            </button>
          )}
          
          {getUniqueMaterials().length === 0 ? (
            <div className="text-center text-gray-500 py-8">No materials found</div>
          ) : (
            getUniqueMaterials().map((material) => {
              const isSelected = inlineMaterialFilter.has(material)
              return (
                <button
                  key={material}
                  onClick={() => {
                    const newSet = new Set<string>()
                    newSet.add(material)
                    setInlineMaterialFilter(newSet)
                    setActiveColumnFilter(null)
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-primary-50 text-primary-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="truncate">{material}</span>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-primary-600" />}
                </button>
              )
            })
          )}
        </div>
      </SelectionSheet>

      {/* Bottom Navigation - Fixed at bottom */}
      <NavBar />
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Orders...</p>
        </div>
      </div>
    }>
      <AuthGate>
        <OrdersPageContent />
      </AuthGate>
    </Suspense>
  )
}

