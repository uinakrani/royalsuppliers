'use client'

import { useEffect, useState, useRef } from 'react'
import { orderService, isOrderPaid } from '@/lib/orderService'
import { invoiceService } from '@/lib/invoiceService'
import { partyPaymentService, PartyPayment } from '@/lib/partyPaymentService'
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
import SupplierDetailPopup from '@/components/SupplierDetailPopup'
import { useSearchParams, useRouter } from 'next/navigation'
import { Invoice, InvoicePayment } from '@/types/invoice'
import { createRipple } from '@/lib/rippleEffect'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { getDb } from '@/lib/firebase'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'

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
  totalAmount: number // Total amount to be paid: sum of (originalTotal - non-ledger partial payments) for each order
  totalPaid: number // Total paid via partial payments and ledger entries (for display)
  remainingAmount: number // totalAmount - ledger payments (amount still remaining after ledger payments)
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [partyPayments, setPartyPayments] = useState<PartyPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<OrderFilters>({})
  const [selectedPartyTags, setSelectedPartyTags] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'byParty' | 'allOrders' | 'suppliers'>('allOrders')
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null)
  const [showOrderDetailDrawer, setShowOrderDetailDrawer] = useState(false)
  const [selectedPartyGroup, setSelectedPartyGroup] = useState<PartyGroup | null>(null)
  const [showPartyDetailDrawer, setShowPartyDetailDrawer] = useState(false)
  const [selectedSupplierGroup, setSelectedSupplierGroup] = useState<SupplierGroup | null>(null)
  const [showSupplierDetailDrawer, setShowSupplierDetailDrawer] = useState(false)
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [selectedOrderForPayments, setSelectedOrderForPayments] = useState<Order | null>(null)
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)
  const [editingPayment, setEditingPayment] = useState<{ order: Order; paymentId: string } | null>(null)
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [showBottomTabs, setShowBottomTabs] = useState(true)
  const lastScrollTop = useRef(0)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [inlinePartyFilter, setInlinePartyFilter] = useState<Set<string>>(new Set())
  const [inlineMaterialFilter, setInlineMaterialFilter] = useState<Set<string>>(new Set())
  const [showPartyFilterDropdown, setShowPartyFilterDropdown] = useState(false)
  const [showMaterialFilterDropdown, setShowMaterialFilterDropdown] = useState(false)
  const [showExpandedView, setShowExpandedView] = useState(false)
  const selectAllRef = useRef<HTMLDivElement>(null)
  const tableHeaderRef = useRef<HTMLDivElement>(null)
  const [selectAllHeight, setSelectAllHeight] = useState(0)
  const [tableHeaderHeight, setTableHeaderHeight] = useState(40)

  // Filter form state
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true)
      try {
        // Load orders first (it manages its own loading state, but we'll override)
        await loadOrders()
        // Load other data in parallel
        await Promise.allSettled([
          loadInvoices(),
          loadPartyPayments(),
          loadPartyNames(),
          loadLedgerEntries()
        ])
      } catch (error) {
        console.error('Error initializing data:', error)
      } finally {
        setLoading(false) // Always set loading to false
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

  const loadOrders = async () => {
    try {
      const allOrders = await orderService.getAllOrders()
      setOrders(allOrders)
    } catch (error) {
      console.error('Error loading orders:', error)
      throw error // Re-throw to let caller handle
    }
  }

  const loadInvoices = async () => {
    try {
      const allInvoices = await invoiceService.getAllInvoices()
      setInvoices(allInvoices)
    } catch (error) {
      console.error('Error loading invoices:', error)
    }
  }

  const loadPartyPayments = async () => {
    try {
      const allPayments = await partyPaymentService.getAllPayments()
      setPartyPayments(allPayments)
    } catch (error) {
      console.error('Error loading party payments:', error)
    }
  }

  // Apply filters whenever orders, filters, selectedPartyTags, or inline filters change
  useEffect(() => {
    let filtered = [...orders]

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

    // Sort by createdAt (desc), fallback to updatedAt, then date
    const getTime = (o: Order) => safeGetTime(o.createdAt || o.updatedAt || o.date)
    filtered.sort((a, b) => getTime(b) - getTime(a))

    setFilteredOrders(filtered)
  }, [orders, filters, selectedPartyTags, inlinePartyFilter, inlineMaterialFilter])

  // Measure "Select All" and table header heights for sticky positioning
  useEffect(() => {
    const measureHeights = () => {
      if (selectAllRef.current) {
        const height = selectAllRef.current.getBoundingClientRect().height
        if (height > 0) {
          setSelectAllHeight(height)
        }
      }
      if (tableHeaderRef.current) {
        const height = tableHeaderRef.current.getBoundingClientRect().height
        if (height > 0) {
          setTableHeaderHeight(height)
        }
      }
    }

    // Measure after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(measureHeights, 50)

    // Use ResizeObserver for dynamic measurement
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureHeights()
      })
      if (selectAllRef.current) {
        resizeObserver.observe(selectAllRef.current)
      }
      if (tableHeaderRef.current) {
        resizeObserver.observe(tableHeaderRef.current)
      }
    }

    window.addEventListener('resize', measureHeights)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', measureHeights)
      if (resizeObserver) {
        if (selectAllRef.current) {
          resizeObserver.unobserve(selectAllRef.current)
        }
        if (tableHeaderRef.current) {
          resizeObserver.unobserve(tableHeaderRef.current)
        }
      }
    }
  }, [filteredOrders, viewMode])

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
      await loadPartyPayments()

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
        message: `This order is already marked as paid (within ₹250 tolerance). Adding more payments may cause overpayment. Continue?`,
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
          const paymentDate = new Date().toISOString()
          const newPayment: PaymentRecord = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            amount: amount,
            date: paymentDate,
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
              const paymentDate = payment?.date || new Date().toISOString()
              await redistributeLedgerEntry(ledgerEntryId, paymentDate)
              console.log(`✅ Redistributed ledger entry ${ledgerEntryId}`)
            } catch (error) {
              console.error(`Error redistributing ledger entry ${ledgerEntryId}:`, error)
            }
          }

          showToast('Payment added and ledger payments redistributed!', 'success')

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
        const wouldBecomePaid = newTotalAfterPayment >= (expenseAmount - 250)

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

      await orderService.addPaymentToOrder(order.id!, amount, note || undefined, markAsPaid)
      showToast('Payment added successfully!', 'success')

      // Wait a bit for Firestore to update
      await new Promise(resolve => setTimeout(resolve, 500))

      // Reload orders to get updated payment information
      await loadOrders()

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
    // Allow editing ledger payments - they will be redistributed
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

      console.log(`📦 Getting orders for supplier: ${ledgerEntry.supplier}`)

      // Get all orders for this supplier
      const allOrders = await orderService.getAllOrders({ supplier: ledgerEntry.supplier })

      console.log(`📦 Found ${allOrders.length} orders for supplier ${ledgerEntry.supplier}`)

      // Calculate total amount currently allocated to orders from this ledger entry
      let totalAllocated = 0
      allOrders.forEach(order => {
        const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === ledgerEntryId)
        const orderAllocated = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        totalAllocated += orderAllocated
        if (orderAllocated > 0) {
          console.log(`  Order ${order.id} (${order.siteName || 'N/A'}): allocated ${orderAllocated} from this ledger entry`)
        }
      })

      console.log(`💰 Total allocated to orders: ${totalAllocated}, Ledger entry amount: ${ledgerEntry.amount}`)

      // NOTE: We do NOT automatically update the ledger entry amount
      // The ledger entry amount should only be changed manually by the user
      // We use the original ledger entry amount for redistribution

      // Redistribute using the original ledger entry amount (not the calculated totalAllocated)
      // This ensures we redistribute the actual ledger entry amount, not what's currently allocated
      const supplier = ledgerEntry.supplier
      const ordersWithOutstanding = allOrders
        .map(order => {
          const existingPayments = order.partialPayments || []
          // Exclude payments from this ledger entry
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const originalTotal = Number(order.originalTotal || 0)
          const remaining = Math.max(0, originalTotal - totalPaid)

          const tempOrder: Order = {
            ...order,
            partialPayments: paymentsExcludingThis
          }

          const isPaid = isOrderPaid(tempOrder)

          return { order, remaining, currentPayments: existingPayments, tempOrder, isPaid, totalPaid, originalTotal }
        })
        .filter(({ remaining, isPaid, order, totalPaid, originalTotal }) => {
          const shouldInclude = remaining > 0 && !isPaid
          if (!shouldInclude) {
            if (remaining <= 0) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining} <= 0 (originalTotal=${originalTotal}, totalPaid=${totalPaid})`)
            } else if (isPaid) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): marked as PAID (remaining=${remaining}, originalTotal=${originalTotal}, totalPaid=${totalPaid})`)
            }
          } else {
            console.log(`  ✅ Including order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining}, originalTotal=${originalTotal}, totalPaid=${totalPaid}`)
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

      console.log(`✅ Found ${ordersWithOutstanding.length} orders with outstanding payments for redistribution`)

      if (ordersWithOutstanding.length === 0) {
        console.warn(`⚠️ No orders with outstanding payments for supplier ${supplier}`)
        return
      }

      // Preserve existing payments from this ledger entry (they may have been manually edited)
      // Calculate how much is already allocated to preserve those amounts
      const preservedPayments: Array<{ orderId: string; payment: PaymentRecord }> = []
      let preservedAmount = 0

      allOrders.forEach(order => {
        if (!order.id) return
        const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === ledgerEntryId)
        ledgerPayments.forEach(payment => {
          preservedPayments.push({ orderId: order.id!, payment })
          preservedAmount += Number(payment.amount || 0)
        })
      })

      console.log(`💾 Preserving ${preservedPayments.length} existing payment(s) totaling ${preservedAmount}`)

      // Calculate remaining amount to redistribute
      let remainingExpense = ledgerEntry.amount - preservedAmount
      const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = []

      console.log(`💰 Starting redistribution: ledger entry amount=${ledgerEntry.amount}, preserved=${preservedAmount}, remaining to redistribute=${remainingExpense}`)

      // First, preserve existing payments by adding them to paymentsToAdd
      const preservedByOrder = new Map<string, PaymentRecord[]>()
      preservedPayments.forEach(({ orderId, payment }) => {
        if (!preservedByOrder.has(orderId)) {
          preservedByOrder.set(orderId, [])
        }
        preservedByOrder.get(orderId)!.push(payment)
      })

      // Distribute remaining expense across orders (oldest first)
      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingExpense <= 0) break

        if (!order.id) continue

        // Check if this order has preserved payments
        const preservedForThisOrder = preservedByOrder.get(order.id) || []
        const preservedAmountForOrder = preservedForThisOrder.reduce((sum, p) => sum + Number(p.amount || 0), 0)

        // Calculate remaining capacity for this order (considering preserved payments)
        const remainingCapacity = Math.max(0, remaining - preservedAmountForOrder)

        if (remainingCapacity <= 0) {
          // Order already has preserved payment that fills the remaining amount
          const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const updatedPayments = [...paymentsWithoutThisEntry, ...preservedForThisOrder]
          paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
          console.log(`  💾 Preserved payment of ${preservedAmountForOrder} for order ${order.id}`)
          continue
        }

        const paymentAmount = Math.min(remainingExpense, remainingCapacity)

        let paymentDate = expenseDate
        if (paymentDate && !paymentDate.includes('T')) {
          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
        }

        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: paymentDate,
          note: `From ledger entry`,
          ledgerEntryId: ledgerEntryId,
        }

        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
        const updatedPayments = [...paymentsWithoutThisEntry, ...preservedForThisOrder, payment]

        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
        remainingExpense -= paymentAmount

        console.log(`  ✓ Adding payment of ${paymentAmount} to order ${order.id} (preserved: ${preservedAmountForOrder}, order remaining: ${remaining - preservedAmountForOrder - paymentAmount}, expense remaining: ${remainingExpense})`)
      }

      // Handle orders with preserved payments that weren't in ordersWithOutstanding
      preservedByOrder.forEach((preserved, orderId) => {
        if (!paymentsToAdd.find(p => p.orderId === orderId)) {
          const order = allOrders.find(o => o.id === orderId)
          if (order) {
            const existingPayments = order.partialPayments || []
            const paymentsWithoutThisEntry = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
            const updatedPayments = [...paymentsWithoutThisEntry, ...preserved]
            paymentsToAdd.push({ orderId, payment: updatedPayments })
            console.log(`  💾 Preserved payment(s) for order ${orderId} (not in outstanding list)`)
          }
        }
      })

      console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingExpense} remaining undistributed`)

      // Update orders with new payment distributions
      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
        await orderService.updateOrder(orderId, {
          partialPayments: updatedPayments,
        })
        console.log(`  ✅ Updated order ${orderId} with redistributed payment`)
      }

      if (remainingExpense > 0) {
        console.warn(`⚠️ Could not fully redistribute. Remaining undistributed: ${remainingExpense}`)
      } else {
        console.log(`✅ Successfully redistributed ledger entry ${ledgerEntryId}`)
      }
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
          showToast('Payment removed and ledger entry redistributed!', 'success')
        } catch (error) {
          console.error('Error redistributing ledger entry:', error)
          showToast('Payment removed, but redistribution failed', 'error')
        }
      } else {
        showToast('Payment removed successfully!', 'success')
      }

      // Reload orders
      await loadOrders()

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
        await loadPartyPayments()
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

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
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
    setShowPartyFilterDropdown(false)
  }

  const clearMaterialFilter = () => {
    setInlineMaterialFilter(new Set())
    setShowMaterialFilterDropdown(false)
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.filter-dropdown-container')) {
        setShowPartyFilterDropdown(false)
        setShowMaterialFilterDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

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
        await loadPartyPayments()
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

    // Filter out orders that already have invoices
    const orderIds = Array.from(selectedOrders)
    const ordersToInvoice = filteredOrders.filter(o => orderIds.includes(o.id!) && !o.invoiced)

    if (ordersToInvoice.length === 0) {
      showToast('All selected orders already have invoices', 'info')
      return
    }

    if (ordersToInvoice.length < orderIds.length) {
      const alreadyInvoiced = orderIds.length - ordersToInvoice.length
      try {
        const confirmed = await sweetAlert.confirm({
          title: 'Some Orders Already Invoiced',
          message: `${alreadyInvoiced} order(s) already have invoices. Create invoice for ${ordersToInvoice.length} order(s) only?`,
          icon: 'info',
          confirmText: 'Create Invoice',
          cancelText: 'Cancel'
        })
        if (!confirmed) return
      } catch (error: any) {
        if (error?.message && !error.message.includes('SweetAlert')) {
          return
        }
        return
      }
    }

    try {
      const invoiceOrderIds = ordersToInvoice.map(o => o.id!)
      showToast('Creating invoice...', 'info')
      await invoiceService.createInvoice(invoiceOrderIds)
      showToast(`Invoice created successfully for ${ordersToInvoice.length} order(s)!`, 'success')
      setSelectedOrders(new Set())
      await loadOrders()
      await loadInvoices()
      await loadPartyPayments()
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

  const getPartyGroups = (): PartyGroup[] => {
    // Group orders by party
    const partyMap = new Map<string, Order[]>()
    filteredOrders.forEach(order => {
      const party = order.partyName
      if (!partyMap.has(party)) {
        partyMap.set(party, [])
      }
      partyMap.get(party)!.push(order)
    })

    // Calculate totals and payment info for each party
    const groups: PartyGroup[] = []
    partyMap.forEach((partyOrders, partyName) => {
      const totalSelling = partyOrders.reduce((sum, order) => sum + order.total, 0)
      const totalProfit = partyOrders.reduce((sum, order) => sum + order.profit, 0)

      // Get all payments for this party
      const partyPaymentRecords = partyPayments.filter(p => p.partyName === partyName)

      // Convert party payments to the expected format
      const allPayments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment; ledgerEntryId?: string }> = []
      let totalPaid = 0
      let lastPaymentDate: string | null = null
      let lastPaymentAmount: number | null = null

      partyPaymentRecords.forEach(payment => {
        allPayments.push({
          invoiceId: '', // No invoice ID for party payments
          invoiceNumber: '', // No invoice number for party payments
          payment: {
            id: payment.id!,
            amount: payment.amount,
            date: payment.date,
            note: payment.note
          },
          ledgerEntryId: payment.ledgerEntryId // Include ledger entry ID if linked
        })
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
          const ta = safeGetTime(a.createdAt || a.updatedAt || a.date)
          const tb = safeGetTime(b.createdAt || b.updatedAt || b.date)
          return tb - ta
        }),
        payments: allPayments
      })
    })

    // Sort groups by party name
    return groups.sort((a, b) => a.partyName.localeCompare(b.partyName))
  }

  const getSupplierGroups = (): SupplierGroup[] => {
    // Group orders by supplier
    const supplierMap = new Map<string, Order[]>()
    filteredOrders.forEach(order => {
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
      // Calculate total amount to be paid: for each order, originalTotal - non-ledger partial payments
      // This represents the amount that still needs to be paid (excluding ledger payments)
      // Formula: totalAmount = sum of (originalTotal - non-ledger partial payments) for each order
      // 
      // Payment Structure:
      // - Direct Payments (non-ledger): Payments to driver/other parties added directly to order
      // - Supplier Payments (ledger): Payments to supplier via ledger expense entries
      let totalAmount = 0
      let totalPaid = 0
      let totalPaidDirectly = 0  // Sum of all direct (non-ledger) payments
      let totalPaidToSupplier = 0  // Sum of all supplier (ledger) payments

      supplierOrders.forEach(order => {
        const orderOriginalTotal = Number(order.originalTotal || 0)
        const partialPayments = order.partialPayments || []

        // Calculate non-ledger partial payments (manual payments only - to driver, etc.)
        // These are payments added directly to the order, not from ledger entries
        const nonLedgerPayments = partialPayments.filter(p => !p.ledgerEntryId)
        const nonLedgerPaid = nonLedgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

        // Calculate ledger payments (payments to supplier via ledger expense entries)
        const ledgerPayments = partialPayments.filter(p => p.ledgerEntryId)
        const ledgerPaid = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

        // Amount still to be paid for this order = originalTotal - non-ledger payments
        // This is the amount that needs to be paid for this specific order
        // (Direct payments to driver don't reduce the amount owed to supplier)
        const orderRemaining = orderOriginalTotal - nonLedgerPaid

        // Only add positive remaining amounts (if order is overpaid with non-ledger, it's 0)
        totalAmount += Math.max(0, orderRemaining)

        // Total paid includes all payments (ledger + manual) for display purposes
        totalPaid += partialPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

        // Track payment breakdown
        totalPaidDirectly += nonLedgerPaid
        totalPaidToSupplier += ledgerPaid
      })

      // Get ledger expense entries for this supplier (for display/reference only)
      const supplierLedgerEntries = ledgerEntries.filter(
        e => e.type === 'debit' && e.supplier === supplierName
      )

      // Calculate remaining amount: totalAmount (which already excludes non-ledger payments) - ledger payments
      // totalAmount = sum of (originalTotal - non-ledger payments) for each order
      // remainingAmount = totalAmount - ledger payments (payments made via ledger expense entries)
      const totalLedgerPayments = supplierLedgerEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)
      const remainingAmount = Math.max(0, totalAmount - totalLedgerPayments)

      // Verify calculation: Check if ledger entry amounts match partial payments with ledgerEntryId
      // This is for debugging/validation
      const ledgerEntryIds = new Set(supplierLedgerEntries.map(e => e.id).filter(Boolean))
      let totalPaidFromLedgerPayments = 0
      supplierOrders.forEach(order => {
        const partialPayments = order.partialPayments || []
        partialPayments.forEach(payment => {
          if (payment.ledgerEntryId && ledgerEntryIds.has(payment.ledgerEntryId)) {
            totalPaidFromLedgerPayments += payment.amount
          }
        })
      })

      const totalLedgerEntryAmount = supplierLedgerEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

      // Log warning if there's a mismatch (ledger entries should match partial payments with ledgerEntryId)
      if (Math.abs(totalLedgerEntryAmount - totalPaidFromLedgerPayments) > 0.01) {
        console.warn(`⚠️ Supplier ${supplierName}: Ledger entry total (${totalLedgerEntryAmount}) doesn't match partial payments with ledgerEntryId (${totalPaidFromLedgerPayments})`)
      }

      // Verification: Ensure calculations are correct
      // totalPaid should equal totalPaidDirectly + totalPaidToSupplier
      const calculatedTotalPaid = totalPaidDirectly + totalPaidToSupplier
      if (Math.abs(totalPaid - calculatedTotalPaid) > 0.01) {
        console.warn(`⚠️ Supplier ${supplierName}: Payment totals mismatch! totalPaid (${totalPaid}) != direct (${totalPaidDirectly}) + supplier (${totalPaidToSupplier}) = ${calculatedTotalPaid}`)
      }

      // Verification: remainingAmount should equal totalAmount - totalPaidToSupplier
      // (because totalAmount already excludes direct payments)
      const calculatedRemaining = totalAmount - totalPaidToSupplier
      if (Math.abs(remainingAmount - calculatedRemaining) > 0.01) {
        console.warn(`⚠️ Supplier ${supplierName}: Remaining amount mismatch! remainingAmount (${remainingAmount}) != totalAmount (${totalAmount}) - supplier payments (${totalPaidToSupplier}) = ${calculatedRemaining}`)
      }

      // Track last payment date and amount
      let lastPaymentDate: string | null = null
      let lastPaymentAmount: number | null = null

      // Check partial payments for last payment
      supplierOrders.forEach(order => {
        const partialPayments = order.partialPayments || []
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

      // Check ledger entries for last payment
      supplierLedgerEntries.forEach(entry => {
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
        totalAmount,
        totalPaid,
        remainingAmount,
        lastPaymentDate,
        lastPaymentAmount,
        orders: supplierOrders.sort((a, b) => {
          const ta = safeGetTime(a.createdAt || a.updatedAt || a.date)
          const tb = safeGetTime(b.createdAt || b.updatedAt || b.date)
          return tb - ta
        }),
        ledgerPayments: sortedLedgerPayments
      })
    })

    return groups.sort((a, b) => {
      const aLastDate = safeGetTime(a.lastPaymentDate)
      const bLastDate = safeGetTime(b.lastPaymentDate)
      return bLastDate - aLastDate
    })
  }

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
              onClick={() => {
                applyFilterForm()
                setShowFilters(false)
              }}
              className="flex-1 bg-primary-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => {
                resetFilters()
                setShowFilters(false)
              }}
              className="flex-1 bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </FilterPopup>

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
          paddingBottom: selectedOrders.size > 0 ? '12.25rem' : '7.25rem'
        }}
      >
        {/* Orders List */}
        {loading ? (
          <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-50">
            <TruckLoading size={100} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-2.5 text-center text-sm text-gray-500">No orders found</div>
        ) : viewMode === 'byParty' ? (
          // By Party View - Ultra Compact Design
          <div className="p-2 space-y-2">
            {getPartyGroups().map((group, index) => {
              const balance = group.totalSelling - group.totalPaid
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
                            await loadPartyPayments()
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

                    {/* Stats - Inline */}
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600">Total:</span>
                        <span className="text-xs font-bold text-primary-700">
                          {formatIndianCurrency(group.totalSelling)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600">Profit:</span>
                        <span className={`text-xs font-bold ${group.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {formatIndianCurrency(group.totalProfit)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600">Receive:</span>
                        <span className="text-xs font-bold text-green-600">
                          {formatIndianCurrency(group.totalPaid)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600">Due:</span>
                        <span className={`text-xs font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                          {formatIndianCurrency(Math.abs(balance))}
                        </span>
                      </div>
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
        ) : viewMode === 'suppliers' ? (
          // Suppliers View - Two Column Grid
          <div className="p-3">
            <div className="grid grid-cols-2 gap-3">
              {getSupplierGroups().map((group, index) => {
                const lastPaymentDateObj = safeParseDate(group.lastPaymentDate)
                const paymentPercentage = group.totalAmount > 0 ? (group.totalPaid / group.totalAmount) * 100 : 0

                return (
                  <div
                    key={group.supplierName}
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
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-2 border border-gray-200/50">
                          <div className="text-[10px] text-gray-600 mb-0.5 font-medium">Total Amount</div>
                          <div className="text-sm font-bold text-gray-900 truncate">{formatIndianCurrency(group.totalAmount)}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2 border border-green-200/50">
                            <div className="text-[10px] text-green-700 mb-0.5 font-medium">Paid</div>
                            <div className="text-xs font-bold text-green-700 truncate">{formatIndianCurrency(group.totalPaid)}</div>
                          </div>

                          <div className={`rounded-lg p-2 border ${group.remainingAmount > 0
                              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200/50'
                              : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200/50'
                            }`}>
                            <div className={`text-[10px] mb-0.5 font-medium ${group.remainingAmount > 0 ? 'text-red-700' : 'text-green-700'
                              }`}>Remaining</div>
                            <div className={`text-xs font-bold truncate ${group.remainingAmount > 0 ? 'text-red-700' : 'text-green-700'
                              }`}>{formatIndianCurrency(Math.abs(group.remainingAmount))}</div>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {group.totalAmount > 0 && (
                        <div className="mb-3">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                            <div
                              className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-700 ease-out shadow-sm"
                              style={{ width: `${Math.min(100, paymentPercentage)}%` }}
                            />
                          </div>
                          <div className="text-[9px] text-gray-500 mt-1 text-center font-medium">
                            {paymentPercentage.toFixed(1)}% Paid
                          </div>
                        </div>
                      )}

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
          <div className="w-full" style={{ paddingTop: '0.5rem' }}>
            {/* Select All Checkbox */}
            {filteredOrders.length > 0 && (
              <div ref={selectAllRef} className="bg-white border-b border-gray-100 px-2 py-2 sticky top-0 z-20 flex items-center justify-between min-w-max">
                <label className="flex items-center gap-2 cursor-pointer touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrders.has(o.id!))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allIds = new Set(filteredOrders.map((o) => o.id!))
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
                    Select All ({filteredOrders.length})
                  </span>
                </label>
                <button
                  onClick={() => setShowExpandedView(!showExpandedView)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  {showExpandedView ? 'Compact view' : 'Expanded view'}
                </button>
              </div>
            )}

            {/* Table Header - Sticky - Single Row - Compact */}
            {filteredOrders.length > 0 && (
              <div ref={tableHeaderRef} className="sticky z-30 bg-gray-50 min-w-max" style={{ top: `${selectAllHeight || 0}px` }}>
                <div className="flex items-center">
                  <div className="w-12 px-1 py-1.5 flex-shrink-0"></div>
                  <div className="w-24 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                    <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Date</span>
                  </div>
                  <div className="w-28 px-1 py-1.5 flex-shrink-0 border-l border-gray-200 relative filter-dropdown-container">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Party/Site</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowPartyFilterDropdown(!showPartyFilterDropdown)
                          setShowMaterialFilterDropdown(false)
                        }}
                        className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${inlinePartyFilter.size > 0 ? 'text-primary-600' : 'text-gray-400'
                          }`}
                        title="Filter parties"
                      >
                        {showPartyFilterDropdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      {inlinePartyFilter.size > 0 && (
                        <span className="text-[9px] text-primary-600 font-bold">({inlinePartyFilter.size})</span>
                      )}
                    </div>
                    {showPartyFilterDropdown && (
                      <div
                        className="absolute top-full left-0 mt-0.5 bg-white border border-gray-300 rounded shadow-lg z-50 w-56 max-h-64 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-1.5">
                          {partyNames.length === 0 ? (
                            <div className="text-[10px] text-gray-500 p-2 text-center">No parties found</div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 mb-1">
                                <span className="text-[10px] font-semibold text-gray-700">Select Parties</span>
                                {inlinePartyFilter.size > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      clearPartyFilter()
                                    }}
                                    className="text-[9px] text-primary-600 hover:text-primary-700"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {partyNames.map((partyName) => (
                                  <label
                                    key={partyName}
                                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-50 cursor-pointer text-[10px]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={inlinePartyFilter.has(partyName)}
                                      onChange={() => togglePartyFilter(partyName)}
                                      className="custom-checkbox"
                                      style={{ width: '14px', height: '14px' }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-gray-700 truncate">{partyName}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-28 px-1 py-1.5 flex-shrink-0 border-l border-gray-200 relative filter-dropdown-container">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Material</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowMaterialFilterDropdown(!showMaterialFilterDropdown)
                          setShowPartyFilterDropdown(false)
                        }}
                        className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${inlineMaterialFilter.size > 0 ? 'text-primary-600' : 'text-gray-400'
                          }`}
                        title="Filter materials"
                      >
                        {showMaterialFilterDropdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      {inlineMaterialFilter.size > 0 && (
                        <span className="text-[9px] text-primary-600 font-bold">({inlineMaterialFilter.size})</span>
                      )}
                    </div>
                    {showMaterialFilterDropdown && (
                      <div
                        className="absolute top-full left-0 mt-0.5 bg-white border border-gray-300 rounded shadow-lg z-50 w-56 max-h-64 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-1.5">
                          {getUniqueMaterials().length === 0 ? (
                            <div className="text-[10px] text-gray-500 p-2 text-center">No materials found</div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 mb-1">
                                <span className="text-[10px] font-semibold text-gray-700">Select Materials</span>
                                {inlineMaterialFilter.size > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      clearMaterialFilter()
                                    }}
                                    className="text-[9px] text-primary-600 hover:text-primary-700"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {getUniqueMaterials().map((material) => (
                                  <label
                                    key={material}
                                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-50 cursor-pointer text-[10px]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={inlineMaterialFilter.has(material)}
                                      onChange={() => toggleMaterialFilter(material)}
                                      className="custom-checkbox"
                                      style={{ width: '14px', height: '14px' }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-gray-700 truncate">{material}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
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
                  <div className="w-32 px-1 py-1.5 flex-shrink-0 border-l border-gray-200">
                    <span className="text-[10px] font-semibold text-gray-600 uppercase leading-tight">Actions</span>
                  </div>
                </div>
              </div>
            )}

            {/* Compact Sticky Totals Row */}
            {filteredOrders.length > 0 && (
              <div
                className="sticky z-30 bg-primary-600 text-white border-t border-primary-700 border-b border-primary-500 min-w-max"
                style={{
                  top: `${selectAllHeight + tableHeaderHeight}px`,
                }}
              >
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
                      {formatIndianCurrency(filteredOrders.reduce((sum, o) => sum + o.total, 0))}
                    </div>
                  </div>
                  <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                  <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                    <div className="text-[9px] font-bold">
                      {filteredOrders.reduce((sum, o) => sum + o.originalWeight, 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                    <div className="font-bold text-[10px]">
                      {formatIndianCurrency(filteredOrders.reduce((sum, o) => sum + o.originalTotal, 0))}
                    </div>
                  </div>
                  <div className="w-24 px-1 py-0.5 flex-shrink-0 border-l border-primary-500">
                    <div className="text-[9px] font-bold">
                      {formatIndianCurrency(filteredOrders.reduce((sum, o) => sum + o.additionalCost, 0))}
                    </div>
                    <div className="font-bold text-[10px]">
                      {formatIndianCurrency(filteredOrders.reduce((sum, o) => sum + o.profit, 0))}
                    </div>
                  </div>
                  <div className="w-32 px-1 py-0.5 flex-shrink-0 border-l border-primary-500"></div>
                </div>
              </div>
            )}

            {/* Table Rows */}
            <div className="divide-y divide-gray-100 min-w-max">
              {filteredOrders.map((order, index) => {
                const orderDate = safeParseDate(order.date)
                const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
                const partialPayments = order.partialPayments || []
                const totalRawPayments = partialPayments.reduce((sum, p) => sum + p.amount, 0)
                const expenseAmount = Number(order.originalTotal || 0)
                const isPaid = isOrderPaid(order)

                const isExpanded = expandedRows.has(order.id!)

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
                      {/* Checkbox Column */}
                      <div className="w-12 px-1 py-1 flex-shrink-0 flex items-center justify-center border-r border-gray-100">
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

                      {/* Date Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-gray-600 text-[10px] leading-tight font-medium">
                          {orderDate ? format(orderDate, 'dd MMM') : 'N/A'}
                        </div>
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
                        {isPaid && (
                          <span className="bg-green-500 text-white px-1 py-0.5 rounded text-[8px] font-bold">
                            PAID
                          </span>
                        )}
                      </div>

                      {/* Additional Cost / Profit Column */}
                      <div className="w-24 px-1 py-1 flex-shrink-0 border-r border-gray-100">
                        <div className="text-blue-600 text-[10px] leading-tight">
                          {formatIndianCurrency(order.additionalCost)}
                        </div>
                        <div className={`font-semibold text-[11px] leading-tight ${order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {formatIndianCurrency(order.profit)}
                        </div>
                      </div>

                      {/* Actions Column - Compact with expand button */}
                      <div className="w-32 px-1 py-1 flex-shrink-0 flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleRowExpansion(order.id!)
                          }}
                          className="p-1 text-gray-600 hover:text-primary-600 transition-colors"
                          title={expandedRows.has(order.id!) ? 'Collapse' : 'Expand'}
                        >
                          {expandedRows.has(order.id!) ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddPaymentToOrder(order)
                          }}
                          className="flex-1 px-2 py-1 bg-primary-600 text-white text-[9px] font-medium rounded active:bg-primary-700 transition-colors touch-manipulation native-press"
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          Payment
                        </button>
                      </div>
                    </div>

                    {/* Expandable Section for Payment Details */}
                    {isExpanded && (
                      <div className="w-full bg-gray-50 px-2 py-2">
                        <div className="grid grid-cols-2 gap-3 mb-2">
                          <div>
                            <div className="text-[9px] text-gray-500 mb-0.5">Total Paid</div>
                            <div className="text-[11px] font-bold text-green-600">
                              {formatIndianCurrency(totalRawPayments)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-gray-500 mb-0.5">Remaining</div>
                            <div className={`text-[11px] font-bold ${order.originalTotal - totalRawPayments > 0 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                              {formatIndianCurrency(Math.max(0, order.originalTotal - totalRawPayments))}
                            </div>
                          </div>
                        </div>

                        {partialPayments.length > 0 && (
                          <div>
                            <div className="text-[9px] font-semibold text-gray-600 mb-1">Payment Details:</div>
                            <div className="space-y-1">
                              {partialPayments.map((payment, idx) => {
                                const paymentDate = safeParseDate(payment.date)
                                const isFromLedger = !!payment.ledgerEntryId
                                return (
                                  <div key={payment.id || idx} className="flex items-center justify-between text-[10px] bg-white rounded px-2 py-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-700">
                                        {paymentDate ? format(paymentDate, 'dd MMM') : 'N/A'}
                                      </span>
                                      {isFromLedger && (
                                        <span className="bg-purple-100 text-purple-700 px-1 rounded text-[8px]">
                                          Ledger
                                        </span>
                                      )}
                                      {payment.note && (
                                        <span className="text-gray-500 truncate" title={payment.note}>
                                          • {payment.note}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-semibold text-gray-900">
                                      {formatIndianCurrency(payment.amount)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
          onAddPayment={handleAddPaymentToOrder}
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
            await loadPartyPayments()
          }}
          onPaymentRemoved={async () => {
            await loadPartyPayments()
          }}
        />

        <SupplierDetailPopup
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
          onRefresh={async () => {
            await loadOrders()
            await loadLedgerEntries()
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
                                    <button
                                      onClick={() => handleEditPayment(selectedOrderForPayments, payment.id)}
                                      className="p-1.5 bg-blue-50 text-blue-600 rounded active:bg-blue-100 transition-colors touch-manipulation"
                                      style={{ WebkitTapHighlightColor: 'transparent' }}
                                      title={isFromLedger ? "Edit payment (from ledger)" : "Edit payment"}
                                    >
                                      <Edit size={16} />
                                    </button>
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

      {/* Bottom Navigation - Fixed at bottom */}
      <NavBar />
    </div>
  )
}


