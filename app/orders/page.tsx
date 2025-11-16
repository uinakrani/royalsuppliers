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
import { Plus, Edit, Trash2, Filter, FileText } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import FilterDrawer from '@/components/FilterDrawer'
import LoadingSpinner from '@/components/LoadingSpinner'
import OrderDetailDrawer from '@/components/OrderDetailDrawer'
import PartyDetailDrawer from '@/components/PartyDetailDrawer'
import { useSearchParams, useRouter } from 'next/navigation'
import { Invoice, InvoicePayment } from '@/types/invoice'

interface PartyGroup {
  partyName: string
  totalSelling: number
  totalPaid: number
  lastPaymentDate: string | null
  orders: Order[]
  payments: Array<{ invoiceId: string; invoiceNumber: string; payment: InvoicePayment }>
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
      filtered = filtered.filter((o) => new Date(o.date) >= new Date(filters.startDate!))
    }
    if (filters.endDate) {
      filtered = filtered.filter((o) => new Date(o.date) <= new Date(filters.endDate!))
    }

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
        console.log('✅ Order created')
        showToast('Order created successfully!', 'success')
        
        console.log('🔄 Reloading orders...')
        await loadOrders()
        console.log('✅ Orders reloaded')
        
        setEditingOrder(null)
        setShowForm(false)
        console.log('✅ Form closed')
        
        // Highlight the newly created order
        setHighlightedOrderId(orderId)
        router.replace(`/orders?highlight=${orderId}`, { scroll: false })
        setTimeout(() => {
          setHighlightedOrderId(null)
          router.replace('/orders', { scroll: false })
        }, 1000)
        return // Exit early to avoid duplicate reload
      }
      
      console.log('🔄 Reloading orders...')
      await loadOrders()
      await loadInvoices()
      await loadPartyPayments()
      console.log('✅ Orders reloaded')
      
      setEditingOrder(null)
      setShowForm(false)
      console.log('✅ Form closed')
    } catch (error: any) {
      console.error('❌ Error in handleSaveOrder:', error)
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      })
      const errorMessage = error?.message || 'Failed to save order'
      showToast(errorMessage, 'error')
      throw error // Re-throw so OrderForm can handle it
    }
  }

  const handleDeleteOrder = async (id: string) => {
    try {
      console.log('Delete button clicked for order:', id)
      const confirmed = await sweetAlert.confirm({
        title: 'Delete Order?',
        text: 'Are you sure you want to delete this order? This action cannot be undone.',
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
        text: 'Are you sure you want to delete this order? This action cannot be undone.',
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
        text: `Are you sure you want to delete ${selectedOrders.size} order(s)? This action cannot be undone.`,
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
          text: `${alreadyInvoiced} order(s) already have invoices. Create invoice for ${ordersToInvoice.length} order(s) only?`,
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

      partyPaymentRecords.forEach(payment => {
        allPayments.push({
          invoiceId: '', // No invoice ID for party payments
          invoiceNumber: '', // No invoice number for party payments
          payment: {
            id: payment.id!,
            amount: payment.amount,
            date: payment.date
          }
        })
        totalPaid += payment.amount
        
        // Track last payment date
        const paymentDate = new Date(payment.date)
        if (!lastPaymentDate || paymentDate > new Date(lastPaymentDate)) {
          lastPaymentDate = payment.date
        }
      })

      // Sort payments by date (newest first)
      allPayments.sort((a, b) => new Date(b.payment.date).getTime() - new Date(a.payment.date).getTime())

      groups.push({
        partyName,
        totalSelling,
        totalPaid,
        lastPaymentDate,
        orders: partyOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        payments: allPayments
      })
    })

    // Sort groups by party name
    return groups.sort((a, b) => a.partyName.localeCompare(b.partyName))
  }


  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
      <div ref={headerRef} className="bg-primary-600 text-white sticky top-0 z-40 shadow-sm">
        <div className="p-2.5">
          <div className="flex justify-between items-center gap-2">
            <h1 className="text-xl font-bold">Orders</h1>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setEditingOrder(null)
                  setShowForm(true)
                }}
                className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
                title="Add Order"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
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
              className="flex-1 bg-primary-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors shadow-sm"
            >
              Apply
            </button>
            <button
              onClick={() => {
                resetFilters()
                setShowFilters(false)
              }}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </FilterDrawer>

      {/* Action Buttons - Sticky at Bottom (only when orders are selected) */}
      {selectedOrders.size > 0 && (
        <div className="fixed left-0 right-0 bg-white border-t border-gray-200 p-2.5 flex gap-2 z-40 shadow-lg" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
          <button
            onClick={handleBulkCreateInvoice}
            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-green-700 transition-colors shadow-sm"
          >
            <FileText size={18} />
            Create Invoice ({selectedOrders.size})
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-700 transition-colors shadow-sm"
          >
            <Trash2 size={18} />
            Delete ({selectedOrders.size})
          </button>
          <button
            onClick={() => setSelectedOrders(new Set())}
            className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

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
          {getPartyGroups().map((group) => {
            const balance = group.totalSelling - group.totalPaid
            return (
              <div key={group.partyName} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Party Group Header */}
                <div className="p-3">
                  <button
                    onClick={() => handlePartyGroupClick(group)}
                    className="w-full flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer -m-3 p-3 rounded-lg"
                  >
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-sm text-gray-900">{group.partyName}</h3>
                      <div className="flex gap-4 mt-1 text-xs text-gray-600">
                        <div className="flex flex-col items-center">
                          <span>Total</span>
                          <span className="font-medium">{formatIndianCurrency(group.totalSelling)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span>Paid</span>
                          <span className="font-medium">{formatIndianCurrency(group.totalPaid)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span>Balance</span>
                          <span className={`font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatIndianCurrency(Math.abs(balance))}
                          </span>
                        </div>
                      </div>
                      {group.lastPaymentDate && (
                        <p className="text-xs text-gray-500 mt-0.5 text-center">
                          Last Payment: {format(new Date(group.lastPaymentDate), 'dd MMM yyyy')}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={async () => {
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

                          await partyPaymentService.addPayment(group.partyName, amount)
                          showToast('Payment added successfully!', 'success')
                          await loadPartyPayments()
                        } catch (error: any) {
                          if (error?.message && !error.message.includes('SweetAlert')) {
                            showToast(`Failed to add payment: ${error?.message || 'Unknown error'}`, 'error')
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} />
                      Add Payment
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // All Orders View (existing table view)
        <div className="px-2 pb-1 overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full bg-white rounded-lg shadow-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
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
                  />
                </th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Date</th>
                <th className="px-1.5 py-1 text-center text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Invoice</th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Party Name</th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Site Name</th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Material</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Weight</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Rate</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Total</th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Truck Owner</th>
                <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Truck No</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Original Weight</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Original Rate</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Original Total</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Additional Cost</th>
                <th className="px-1.5 py-1 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Profit</th>
                <th className="px-1.5 py-1 text-center text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  data-order-id={order.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    selectedOrders.has(order.id!) ? 'bg-primary-50' : ''
                  } ${
                    highlightedOrderId === order.id ? 'highlight-row' : ''
                  }`}
                >
                  <td className="px-1.5 py-0.5 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id!)}
                      onChange={() => toggleOrderSelection(order.id!)}
                      className="custom-checkbox"
                    />
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-900">
                    {format(new Date(order.date), 'dd MMM yyyy')}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-center">
                    {order.invoiced ? (
                      <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                        Invoiced
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs font-medium text-gray-900">
                    {order.partyName}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-600">
                    {order.siteName}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-600">
                    {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {order.weight.toFixed(2)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {formatIndianCurrency(order.rate)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs font-semibold text-gray-900 text-right">
                    {formatIndianCurrency(order.total)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-600">
                    {order.truckOwner}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-600">
                    {order.truckNo}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {order.originalWeight.toFixed(2)}
                  </td>
                  <td className={`px-1.5 py-0.5 whitespace-nowrap text-xs text-right ${
                    order.originalRate > order.rate && order.rate > 0
                      ? 'text-red-600 font-semibold'
                      : 'text-gray-900'
                  }`}>
                    {formatIndianCurrency(order.originalRate)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs font-semibold text-gray-900 text-right">
                    {formatIndianCurrency(order.originalTotal)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {formatIndianCurrency(order.additionalCost)}
                  </td>
                  <td className={`px-1.5 py-0.5 whitespace-nowrap text-xs text-right font-medium ${
                    order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatIndianCurrency(order.profit)}
                  </td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => {
                          setEditingOrder(order)
                          setShowForm(true)
                        }}
                        className="p-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order.id!)}
                        className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <OrderDetailDrawer
        order={selectedOrderDetail}
        isOpen={showOrderDetailDrawer}
        onClose={() => {
          setShowOrderDetailDrawer(false)
          setSelectedOrderDetail(null)
        }}
        onEdit={(order) => {
          setEditingOrder(order)
          setShowForm(true)
        }}
        onDelete={handleDeleteOrder}
      />

      <PartyDetailDrawer
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

      <NavBar />
    </div>
  )
}

