'use client'

import { useEffect, useState, useRef } from 'react'
import { orderService } from '@/lib/orderService'
import { invoiceService } from '@/lib/invoiceService'
import { partyPaymentService, PartyPayment } from '@/lib/partyPaymentService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Order, OrderFilters, PaymentRecord } from '@/types/order'
import NavBar from '@/components/NavBar'
import OrderForm from '@/components/OrderForm'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, Filter, FileText, X } from 'lucide-react'
import PaymentEditDrawer from '@/components/PaymentEditDrawer'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import FilterDrawer from '@/components/FilterDrawer'
import LoadingSpinner from '@/components/LoadingSpinner'
import OrderDetailDrawer from '@/components/OrderDetailDrawer'
import PartyDetailPopup from '@/components/PartyDetailPopup'
import OrderDetailPopup from '@/components/OrderDetailPopup'
import { useSearchParams, useRouter } from 'next/navigation'
import { Invoice, InvoicePayment } from '@/types/invoice'
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
  const [viewMode, setViewMode] = useState<'byParty' | 'allOrders'>('byParty')
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null)
  const [showOrderDetailDrawer, setShowOrderDetailDrawer] = useState(false)
  const [selectedPartyGroup, setSelectedPartyGroup] = useState<PartyGroup | null>(null)
  const [showPartyDetailDrawer, setShowPartyDetailDrawer] = useState(false)
  const [selectedOrderForPayments, setSelectedOrderForPayments] = useState<Order | null>(null)
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)
  const [editingPayment, setEditingPayment] = useState<{ order: Order; paymentId: string } | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

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
    loadOrders()
    loadInvoices()
    loadPartyPayments()
    loadPartyNames()
  }, [])

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight)
      }
    }
    updateHeaderHeight()
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [])

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

  useEffect(() => {
    applyFilters()
  }, [orders, filters, selectedPartyTags])

  const loadOrders = async () => {
    setLoading(true)
    try {
      const allOrders = await orderService.getAllOrders()
      setOrders(allOrders)
    } catch (error) {
      console.error('Error loading orders:', error)
    } finally {
      setLoading(false)
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

  const applyFilters = () => {
    let filtered = [...orders]

    // Apply party tag filters (takes priority over filter drawer party name)
    if (selectedPartyTags.size > 0) {
      filtered = filtered.filter((o) =>
        selectedPartyTags.has(o.partyName)
      )
    } else if (filters.partyName) {
      // Only apply filter drawer party name if no tags are selected
      const filterPartyNames = filters.partyName.split(',').map(p => p.trim().toLowerCase())
      filtered = filtered.filter((o) =>
        filterPartyNames.some(fp => o.partyName.toLowerCase() === fp)
      )
    }
    if (filters.material) {
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
  }

  const handleSaveOrder = async (orderData: Omit<Order, 'id'>) => {
    console.log('📝 handleSaveOrder called', { 
      isEdit: !!editingOrder?.id, 
      orderId: editingOrder?.id,
      orderData 
    })
    
    try {
      if (editingOrder?.id) {
        console.log('🔄 Updating order:', editingOrder.id)
        await orderService.updateOrder(editingOrder.id, orderData)
        console.log('✅ Order updated')
        showToast('Order updated successfully!', 'success')
      } else {
        console.log('➕ Creating new order')
        const orderId = await orderService.createOrder(orderData)
        
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
    let totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    // If order is marked as paid but has no partial payments, consider it fully paid
    // Also check paidAmount as a fallback
    if (totalPaid === 0) {
      if (order.paid && expenseAmount > 0) {
        totalPaid = expenseAmount
      } else if (order.paidAmount && order.paidAmount > 0) {
        totalPaid = order.paidAmount
      }
    }
    const remainingAmount = expenseAmount - totalPaid
    return { expenseAmount, totalPaid, remainingAmount }
  }

  const handleAddPaymentToOrder = async (order: Order) => {
    if (order.paid) {
      showToast('Order is already fully paid', 'error')
      return
    }
    
    // Calculate expense amount and remaining payment
    const { remainingAmount } = getOrderPaymentInfo(order)
    
    if (remainingAmount <= 0) {
      showToast('Order is already fully paid', 'error')
      return
    }

    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Add Payment',
        message: `Remaining amount: ${formatIndianCurrency(remainingAmount)}`,
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
      
      // Get the expense amount (originalTotal)
      const { expenseAmount } = getOrderPaymentInfo(order)
      
      // Check if payment exceeds the original total (expense amount)
      if (amount > expenseAmount) {
        showToast(`Payment amount cannot exceed original total (${formatIndianCurrency(expenseAmount)})`, 'error')
        return
      }
      
      // Check if payment exceeds remaining amount
      if (amount > remainingAmount) {
        showToast(`Payment amount cannot exceed remaining amount (${formatIndianCurrency(remainingAmount)})`, 'error')
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
          paidAmount: updatedOrderCheck.paidAmount,
          paid: updatedOrderCheck.paid,
          paymentDue: updatedOrderCheck.paymentDue
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
    setEditingPayment({ order, paymentId })
  }

  const handleSavePaymentEdit = async (data: { amount: number; date: string }) => {
    if (!editingPayment || !editingPayment.order.id) return
    
    try {
      await orderService.updatePartialPayment(editingPayment.order.id, editingPayment.paymentId, data)
      
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
      setEditingPayment(null)
    }
  }

  const handleRemovePayment = async (order: Order, paymentId: string) => {
    if (!order.id) return
    
    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Remove Payment?',
        message: 'Are you sure you want to remove this payment? This action cannot be undone.',
        icon: 'warning',
        confirmText: 'Remove',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      await orderService.removePartialPayment(order.id, paymentId)
      showToast('Payment removed successfully!', 'success')
      
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
        try {
          await orderService.deleteOrder(id)
          showToast('Order deleted successfully!', 'success')
          await loadOrders()
          await loadInvoices()
          await loadPartyPayments()
        } catch (error: any) {
          console.error('Error deleting order:', error)
          showToast(`Failed to delete order: ${error?.message || 'Unknown error'}`, 'error')
        }
      }
    } catch (error: any) {
      console.error('Error showing SweetAlert:', error)
      // Fallback to SweetAlert confirm
      const confirmed = await sweetAlert.confirm({
        title: 'Delete Order?',
        message: 'Are you sure you want to delete this order? This action cannot be undone.',
        icon: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      })
      if (confirmed) {
        try {
          await orderService.deleteOrder(id)
          showToast('Order deleted successfully!', 'success')
          await loadOrders()
          await loadInvoices()
          await loadPartyPayments()
        } catch (err: any) {
          console.error('Error deleting order:', err)
          showToast(`Failed to delete order: ${err?.message || 'Unknown error'}`, 'error')
        }
      }
    }
  }

  const togglePartyTag = (partyName: string) => {
    const newSelected = new Set(selectedPartyTags)
    if (newSelected.has(partyName)) {
      newSelected.delete(partyName)
    } else {
      newSelected.add(partyName)
    }
    setSelectedPartyTags(newSelected)
    // Clear filter drawer party name when using tags
    if (newSelected.size > 0) {
      setFilterPartyName('')
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
      
      // Get all payments for this party
      const partyPaymentRecords = partyPayments.filter(p => p.partyName === partyName)
      
      // Convert party payments to the expected format
      const allPayments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment }> = []
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
          }
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


  return (
    <div className="bg-gray-50" style={{ 
      height: '100dvh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header - Fixed at top */}
      <div ref={headerRef} className="bg-primary-600 text-white sticky top-0 z-40 shadow-sm pt-safe" style={{ flexShrink: 0 }}>
        <div className="p-2.5">
          <div className="flex justify-between items-center gap-2">
            <h1 className="text-xl font-bold">Orders</h1>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setEditingOrder(null)
                  setShowForm(true)
                }}
                className="p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
                title="Add Order"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
              >
                <Filter size={18} />
              </button>
            </div>
          </div>
          {/* View Toggle */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setViewMode('byParty')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'byParty'
                  ? 'bg-white text-primary-600'
                  : 'bg-primary-500 text-white hover:bg-primary-400'
              }`}
            >
              By Party
            </button>
            <button
              onClick={() => setViewMode('allOrders')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'allOrders'
                  ? 'bg-white text-primary-600'
                  : 'bg-primary-500 text-white hover:bg-primary-400'
              }`}
            >
              All Orders
            </button>
          </div>
        </div>
      </div>

      {/* Party Name Tags - Horizontal Scrollable */}
      {partyNames.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-2.5 py-2 sticky z-30 shadow-sm" style={{ top: headerHeight ? `${headerHeight}px` : 'auto' }}>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {partyNames.map((partyName) => {
              const isSelected = selectedPartyTags.has(partyName)
              return (
                <button
                  key={partyName}
                  onClick={() => togglePartyTag(partyName)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    isSelected
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {partyName}
                </button>
              )
            })}
            {selectedPartyTags.size > 0 && (
              <button
                onClick={() => setSelectedPartyTags(new Set())}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters Drawer */}
      <FilterDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
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
      </FilterDrawer>

      {/* Action Buttons - Fixed at Bottom (only when orders are selected) */}
      {selectedOrders.size > 0 && (
        <div 
          className="fixed left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-lg"
          style={{ 
            bottom: '4rem',
            padding: '0.75rem',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))'
          }}
        >
          <div className="flex gap-2">
            <button
              onClick={handleBulkCreateInvoice}
              className="flex-1 bg-green-600 text-white px-3 py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 active:bg-green-700 transition-colors touch-manipulation shadow-md"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <FileText size={18} />
              <span>Create Invoice ({selectedOrders.size})</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex-1 bg-red-600 text-white px-3 py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 active:bg-red-700 transition-colors touch-manipulation shadow-md"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Trash2 size={18} />
              <span>Delete ({selectedOrders.size})</span>
            </button>
            <button
              onClick={() => setSelectedOrders(new Set())}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium active:bg-gray-300 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Content Area - Scrollable, fits between header and buttons/nav */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: selectedOrders.size > 0 ? '9rem' : '4rem'
      }}>
      {/* Orders List */}
      {loading ? (
        <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-50">
          <LoadingSpinner size={32} />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-2.5 text-center text-sm text-gray-500">No orders found</div>
      ) : viewMode === 'byParty' ? (
        // By Party View
        <div className="p-2 space-y-2">
          {getPartyGroups().map((group, index) => {
            const balance = group.totalSelling - group.totalPaid
            return (
              <div 
                key={group.partyName} 
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-md"
                style={{
                  animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                }}
              >
                {/* Party Group Header */}
                <div className="p-3">
                  <button
                    onClick={(e) => {
                      createRipple(e)
                      handlePartyGroupClick(group)
                    }}
                    className="w-full flex flex-col hover:bg-gray-50 active:bg-gray-100 transition-all duration-150 cursor-pointer rounded-lg text-left native-press"
                    style={{ 
                      width: '100%', 
                      padding: 0, 
                      margin: 0, 
                      border: 'none', 
                      background: 'transparent',
                      WebkitTapHighlightColor: 'transparent',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div className="w-full flex items-center justify-between mb-1" style={{ width: '100%', boxSizing: 'border-box' }}>
                      <h3 className="font-semibold text-xs text-gray-900">{group.partyName}</h3>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
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
                        className="px-2 py-1 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 active:bg-primary-800 transition-all duration-150 touch-manipulation native-press flex items-center gap-1.5 flex-shrink-0"
                        style={{
                          WebkitTapHighlightColor: 'transparent',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        onMouseDown={(e) => {
                          createRipple(e as any)
                        }}
                      >
                        <Plus size={12} />
                        Add Payment
                      </button>
                    </div>
                    {group.orders.length > 0 && group.orders[0].siteName && (
                      <p className="text-[10px] text-gray-500 mb-2 w-full">{group.orders[0].siteName}</p>
                    )}
                    <div className="w-full space-y-2 text-xs" style={{ width: '100%', boxSizing: 'border-box' }}>
                      <div className="flex justify-between items-center" style={{ width: '100%', boxSizing: 'border-box' }}>
                        <span className="text-gray-600">Received</span>
                        <span className="font-medium text-gray-900">{formatIndianCurrency(group.totalPaid)}</span>
                      </div>
                      <div className="flex justify-between items-center" style={{ width: '100%', boxSizing: 'border-box' }}>
                        <span className="text-gray-600">Remaining</span>
                        <span className={`font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatIndianCurrency(Math.abs(balance))}
                        </span>
                      </div>
                      {group.lastPaymentDate && group.lastPaymentAmount !== null && (() => {
                        const lastPaymentDateObj = safeParseDate(group.lastPaymentDate)
                        return lastPaymentDateObj ? (
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200" style={{ width: '100%', boxSizing: 'border-box' }}>
                            <span className="text-gray-600">Last paid at</span>
                            <span className="font-medium text-gray-900 text-right">
                              {format(lastPaymentDateObj, 'dd MMM yyyy')} ({formatIndianCurrency(group.lastPaymentAmount)})
                            </span>
                          </div>
                        ) : null
                      })()}
                    </div>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // All Orders View - Native List View
        <div className="p-1.5 space-y-1.5" style={{ paddingTop: '0.5rem' }}>
          {/* Select All Checkbox */}
          {filteredOrders.length > 0 && (
            <div className="bg-white rounded-lg p-1.5 border border-gray-200 mb-1.5 sticky top-0 z-10 shadow-sm">
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
                  style={{ width: '18px', height: '18px' }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-xs font-medium text-gray-700">
                  Select All ({filteredOrders.length})
                </span>
              </label>
            </div>
          )}

          {/* Order List Items */}
          {filteredOrders.map((order, index) => {
            const orderDate = safeParseDate(order.date)
            const materials = Array.isArray(order.material) ? order.material : (order.material ? [order.material] : [])
            const { totalPaid } = getOrderPaymentInfo(order)
            const partialPayments = order.partialPayments || []
            const totalRawPayments = partialPayments.reduce((sum, p) => sum + p.amount, 0)

            return (
              <div
                key={order.id}
                data-order-id={order.id}
                className={`bg-white rounded-lg border transition-all duration-150 touch-manipulation native-press ${
                  selectedOrders.has(order.id!)
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 shadow-sm'
                } ${
                  highlightedOrderId === order.id ? 'ring-2 ring-primary-400 border-primary-500' : ''
                }`}
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={(e) => {
                  // Don't open if clicking checkbox
                  if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                    return
                  }
                  
                  // Create ripple effect from click position
                  createRipple(e)
                  
                  // Open detail popup with slight delay for better UX
                  setTimeout(() => {
                    setSelectedOrderDetail(order)
                    setShowOrderDetailDrawer(true)
                  }, 200)
                }}
              >
                <div className="p-2">
                  {/* Header Row: Checkbox, Party Name, Total */}
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id!)}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleOrderSelection(order.id!)
                      }}
                      className="custom-checkbox flex-shrink-0"
                      style={{ width: '18px', height: '18px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className="font-semibold text-gray-900 truncate" style={{ fontSize: '14px' }}>
                          {order.partyName}
                        </h3>
                        <span className="text-base font-bold text-primary-600 flex-shrink-0 ml-2">
                          {formatIndianCurrency(order.total)}
                        </span>
                      </div>
                      
                      {/* Inline Info: Profit, Raw Payments, Date, Truck Owner */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-600">
                        <span className={`font-medium ${order.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Profit: {formatIndianCurrency(order.profit)}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="text-blue-600 font-medium">
                          Raw: {formatIndianCurrency(totalRawPayments)}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>
                          {orderDate ? format(orderDate, 'dd MMM yyyy, hh:mm a') : 'Invalid Date'}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="truncate max-w-[100px]">
                          {order.truckOwner} ({order.truckNo})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Material Tags & Status Badges */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100">
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {materials.slice(0, 3).map((mat, idx) => (
                        <span
                          key={idx}
                          className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        >
                          {mat}
                        </span>
                      ))}
                      {materials.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{materials.length - 3}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {order.invoiced && (
                        <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                          Invoiced
                        </span>
                      )}
                      {order.paid ? (
                        <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                          Paid
                        </span>
                      ) : order.paymentDue ? (
                        <span className="bg-yellow-100 text-yellow-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                          Due
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
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
          <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
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
                            
                            return (
                              <div
                                key={payment.id}
                                className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold text-gray-900">
                                      {formatIndianCurrency(payment.amount)}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {(() => {
                                        const paymentDate = safeParseDate(payment.date)
                                        return paymentDate ? format(paymentDate, 'dd MMM yyyy, hh:mm a') : 'Invalid Date'
                                      })()}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-3">
                                  <button
                                    onClick={() => handleEditPayment(selectedOrderForPayments, payment.id)}
                                    className="p-1.5 bg-blue-50 text-blue-600 rounded active:bg-blue-100 transition-colors touch-manipulation"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                    title="Edit payment"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleRemovePayment(selectedOrderForPayments, payment.id)}
                                    className="p-1.5 bg-red-50 text-red-600 rounded active:bg-red-100 transition-colors touch-manipulation"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                    title="Remove payment"
                                  >
                                    <Trash2 size={16} />
                                  </button>
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
          <PaymentEditDrawer
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

