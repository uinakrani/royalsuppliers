'use client'

import { useEffect, useState } from 'react'
import { orderService } from '@/lib/orderService'
import { invoiceService } from '@/lib/invoiceService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Order, OrderFilters, PaymentRecord } from '@/types/order'
import NavBar from '@/components/NavBar'
import OrderForm from '@/components/OrderForm'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, CheckCircle, Filter, X } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import FilterDrawer from '@/components/FilterDrawer'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'latest' | 'paymentDue'>('latest')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<OrderFilters>({})

  // Filter form state
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [partyNames, setPartyNames] = useState<string[]>([])

  useEffect(() => {
    loadOrders()
    loadPartyNames()
  }, [])

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
  }, [orders, activeTab, filters])

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

  const applyFilters = () => {
    let filtered = [...orders]

    // Apply tab filter
    if (activeTab === 'paymentDue') {
      filtered = filtered.filter((o) => o.paymentDue && !o.paid)
    }

    // Apply other filters
    if (filters.partyName) {
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
        await orderService.createOrder(orderData)
        console.log('✅ Order created')
        showToast('Order created successfully!', 'success')
      }
      
      console.log('🔄 Reloading orders...')
      await loadOrders()
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
        } catch (err: any) {
          console.error('Error deleting order:', err)
          showToast(`Failed to delete order: ${err?.message || 'Unknown error'}`, 'error')
        }
      }
    }
  }

  const handleMarkAsPaid = async (id: string) => {
    try {
      const order = filteredOrders.find((o) => o.id === id)
      if (!order) {
        showToast('Order not found', 'error')
        return
      }

      // Always route payment to invoice
      // If order doesn't have an invoice, create one first
      let invoiceId = order.invoiceId
      
      if (!invoiceId) {
        // Create a new invoice for this order
        try {
          showToast('Creating invoice for this order...', 'info')
          invoiceId = await invoiceService.createInvoice([id])
          showToast('Invoice created successfully!', 'success')
        } catch (error: any) {
          showToast(`Failed to create invoice: ${error?.message || 'Unknown error'}`, 'error')
          return
        }
      }

      // Get the invoice and add payment
      try {
        const invoice = await invoiceService.getInvoiceById(invoiceId)
        if (!invoice) {
          showToast('Invoice not found', 'error')
          return
        }

        const remaining = invoice.totalAmount - (invoice.paidAmount || 0)
        
        try {
          const amountStr = await sweetAlert.prompt({
            title: 'Add Payment',
            text: `Remaining balance: ${formatIndianCurrency(remaining)}`,
            inputLabel: 'Payment Amount',
            inputPlaceholder: 'Enter amount',
            inputValue: remaining.toString(),
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

          if (amount > remaining) {
            showToast(`Amount cannot exceed remaining balance of ${formatIndianCurrency(remaining)}`, 'error')
            return
          }

          await invoiceService.addPayment(invoiceId, amount)
          showToast('Payment added to invoice successfully!', 'success')
          await loadOrders()
          return
        } catch (error: any) {
          if (error?.message && !error.message.includes('SweetAlert')) {
            showToast(`Failed to add payment: ${error?.message || 'Unknown error'}`, 'error')
          }
          return
        }
      } catch (error: any) {
        showToast(`Failed to add payment to invoice: ${error?.message || 'Unknown error'}`, 'error')
        return
      }
    } catch (error: any) {
      console.error('Error in handleMarkAsPaid:', error)
      showToast(`Failed to process payment: ${error?.message || 'Unknown error'}`, 'error')
    }
  }

  const handleRemovePartialPayment = async (orderId: string, paymentId: string) => {
    try {
      console.log('Removing payment:', { orderId, paymentId })
      const order = filteredOrders.find((o) => o.id === orderId)
      if (!order) {
        console.error('Order not found:', orderId)
        showToast('Order not found', 'error')
        return
      }

      console.log('Order found:', { 
        orderId: order.id, 
        partialPayments: order.partialPayments,
        paymentIds: order.partialPayments?.map(p => p.id)
      })

      const payment = order.partialPayments?.find(p => p.id === paymentId)
      if (!payment) {
        console.error('Payment not found:', { 
          paymentId, 
          availableIds: order.partialPayments?.map(p => p.id),
          partialPayments: order.partialPayments
        })
        showToast('Payment record not found', 'error')
        return
      }

      const confirmed = await sweetAlert.confirm({
        title: 'Remove Payment?',
        text: `Are you sure you want to remove payment of ${formatIndianCurrency(payment.amount)}?`,
        icon: 'warning',
        confirmText: 'Remove',
        cancelText: 'Cancel'
      })

      if (confirmed) {
        try {
          console.log('Calling removePartialPayment:', { orderId, paymentId })
          await orderService.removePartialPayment(orderId, paymentId)
          console.log('Payment removed successfully')
          showToast('Payment removed!', 'success')
          await loadOrders()
        } catch (error: any) {
          console.error('Error removing partial payment:', error)
          console.error('Error details:', {
            message: error?.message,
            code: error?.code,
            stack: error?.stack
          })
          showToast(`Failed to remove payment: ${error?.message || 'Unknown error'}`, 'error')
        }
      }
    } catch (error: any) {
      console.error('Error in handleRemovePartialPayment:', error)
      showToast('Failed to remove partial payment', 'error')
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

  const applyFilterForm = () => {
    const newFilters: OrderFilters = {}
    if (filterPartyName) newFilters.partyName = filterPartyName
    if (filterMaterial) newFilters.material = filterMaterial
    if (filterStartDate) newFilters.startDate = filterStartDate
    if (filterEndDate) newFilters.endDate = filterEndDate
    setFilters(newFilters)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilterPartyName('')
    setFilterMaterial('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilters({})
    setShowFilters(false)
  }


  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold">Orders</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors"
          >
            <Filter size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('latest')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'latest'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'bg-primary-500 text-white hover:bg-primary-500/90'
            }`}
          >
            Latest
          </button>
          <button
            onClick={() => setActiveTab('paymentDue')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'paymentDue'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'bg-primary-500 text-white hover:bg-primary-500/90'
            }`}
          >
            Payment Due
          </button>
        </div>
      </div>

      {/* Filters Drawer */}
      <FilterDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Party Name
            </label>
            <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-60 overflow-y-auto">
              {partyNames.map((partyNameOption) => (
              <label key={partyNameOption} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors">
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
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{partyNameOption}</span>
              </label>
            ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Material
            </label>
            <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-60 overflow-y-auto">
              {['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth'].map((materialOption) => (
              <label key={materialOption} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors">
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
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{materialOption}</span>
              </label>
            ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                applyFilterForm()
                setShowFilters(false)
              }}
              className="flex-1 bg-primary-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
            <button
              onClick={() => {
                resetFilters()
                setShowFilters(false)
              }}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </FilterDrawer>

      {/* Action Buttons */}
      <div className="p-2.5 flex gap-2">
        <button
          onClick={() => {
            setEditingOrder(null)
            setShowForm(true)
          }}
          className="flex-1 bg-primary-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Add Order
        </button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="p-2.5 text-center text-sm text-gray-500">Loading...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-2.5 text-center text-sm text-gray-500">No orders found</div>
      ) : (
        <div className="px-2.5 pb-2.5 overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full bg-white rounded-lg shadow-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">
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
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Invoice</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Party Name</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Site Name</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Material</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Weight</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Rate</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Total</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Truck Owner</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Truck No</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Original Weight</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Original Rate</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Original Total</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Additional Cost</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Profit</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Status</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-700 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    selectedOrders.has(order.id!) ? 'bg-primary-50' : ''
                  }`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id!)}
                      onChange={() => toggleOrderSelection(order.id!)}
                      className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-900">
                    {format(new Date(order.date), 'dd MMM yyyy')}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-center">
                    {order.invoiced ? (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                        Invoiced
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-900">
                    {order.partyName}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                    {order.siteName}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                    {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {order.weight.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {formatIndianCurrency(order.rate)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs font-semibold text-gray-900 text-right">
                    {formatIndianCurrency(order.total)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                    {order.truckOwner}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                    {order.truckNo}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {order.originalWeight.toFixed(2)}
                  </td>
                  <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right ${
                    order.originalRate > order.rate && order.rate > 0
                      ? 'text-red-600 font-semibold'
                      : 'text-gray-900'
                  }`}>
                    {formatIndianCurrency(order.originalRate)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs font-semibold text-gray-900 text-right">
                    {formatIndianCurrency(order.originalTotal)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-900 text-right">
                    {formatIndianCurrency(order.additionalCost)}
                  </td>
                  <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right font-medium ${
                    order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatIndianCurrency(order.profit)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    {order.paid ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
                        Paid
                      </span>
                    ) : order.partialPayments && order.partialPayments.length > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium">
                          Partial
                        </span>
                        <span className="text-xs text-gray-600">
                          {formatIndianCurrency(order.paidAmount || 0)} / {formatIndianCurrency(order.total)}
                        </span>
                        <div className="flex flex-col gap-1 mt-1">
                          {order.partialPayments.map((payment) => (
                            <div key={payment.id} className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded text-xs">
                              <span className="text-gray-700">
                                {formatIndianCurrency(payment.amount)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemovePartialPayment(order.id!, payment.id)
                                }}
                                className="p-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                title="Remove this payment"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : order.paidAmount && order.paidAmount > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium">
                          Partial
                        </span>
                        <span className="text-xs text-gray-600">
                          {formatIndianCurrency(order.paidAmount)} / {formatIndianCurrency(order.total)}
                        </span>
                      </div>
                    ) : order.paymentDue ? (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium">
                        Due
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full font-medium">
                        -
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-1">
                      {!order.paid && (
                        <button
                          onClick={() => handleMarkAsPaid(order.id!)}
                          className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                          title={(order.paidAmount && order.paidAmount > 0) || (order.partialPayments && order.partialPayments.length > 0) ? "Add Payment" : "Mark as Paid"}
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingOrder(order)
                          setShowForm(true)
                        }}
                        className="p-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order.id!)}
                        className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
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

      <NavBar />
    </div>
  )
}

