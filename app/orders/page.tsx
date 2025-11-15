'use client'

import { useEffect, useState } from 'react'
import { orderService } from '@/lib/orderService'
import { generateInvoicePDF, generateMultipleInvoicesPDF } from '@/lib/pdfService'
import { Order, OrderFilters } from '@/types/order'
import NavBar from '@/components/NavBar'
import OrderForm from '@/components/OrderForm'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, CheckCircle, FileText, Filter, X } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'

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
  const [filterTruckOwner, setFilterTruckOwner] = useState('')
  const [filterTruckNo, setFilterTruckNo] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

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
      filtered = filtered.filter((o) =>
        o.partyName.toLowerCase().includes(filters.partyName!.toLowerCase())
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
    if (filters.truckOwner) {
      filtered = filtered.filter((o) =>
        o.truckOwner.toLowerCase().includes(filters.truckOwner!.toLowerCase())
      )
    }
    if (filters.truckNo) {
      filtered = filtered.filter((o) =>
        o.truckNo.toLowerCase().includes(filters.truckNo!.toLowerCase())
      )
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
      // Fallback to native confirm
      if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
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

      const totalAmount = order.total
      const alreadyPaid = order.paidAmount || 0
      const remainingAmount = totalAmount - alreadyPaid
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2,
        }).format(amount)
      }

      // Create custom HTML for the payment dialog
      const Swal = await (async () => {
        if (typeof window === 'undefined') return null
        if (window.Swal) return window.Swal
        return new Promise((resolve) => {
          let attempts = 0
          const checkSwal = () => {
            if (window.Swal) {
              resolve(window.Swal)
            } else if (attempts < 50) {
              attempts++
              setTimeout(checkSwal, 100)
            } else {
              resolve(null)
            }
          }
          checkSwal()
        })
      })()

      if (!Swal) {
        // Fallback to simple prompt
        const promptText = alreadyPaid > 0 
          ? `Enter total paid amount (Already paid: ${formatCurrency(alreadyPaid)}, Remaining: ${formatCurrency(remainingAmount)}):`
          : `Enter paid amount (Total: ${formatCurrency(totalAmount)}):`
        const amountStr = prompt(promptText, totalAmount.toString())
        if (amountStr) {
          const amount = parseFloat(amountStr)
          if (!isNaN(amount) && amount > 0) {
            try {
              await orderService.markAsPaid(id, amount)
              showToast(amount >= totalAmount ? 'Order marked as fully paid!' : `Payment of ${formatCurrency(amount)} recorded!`, 'success')
              await loadOrders()
            } catch (error: any) {
              showToast(`Failed to update order: ${error?.message || 'Unknown error'}`, 'error')
            }
          }
        }
        return
      }

      // Use SweetAlert2 with custom HTML
      const result = await Swal.fire({
        title: alreadyPaid > 0 ? 'Add Payment' : 'Record Payment',
        html: `
          <div style="text-align: left; padding: 10px 0;">
            <p style="margin-bottom: 10px; font-size: 14px; color: #666;">
              Total Amount: <strong style="color: #000;">${formatCurrency(totalAmount)}</strong>
            </p>
            ${alreadyPaid > 0 ? `
              <p style="margin-bottom: 10px; font-size: 14px; color: #666;">
                Already Paid: <strong style="color: #059669;">${formatCurrency(alreadyPaid)}</strong>
              </p>
              <p style="margin-bottom: 15px; font-size: 14px; color: #666;">
                Remaining: <strong style="color: #dc2626;">${formatCurrency(remainingAmount)}</strong>
              </p>
            ` : ''}
            <label style="display: block; margin-bottom: 5px; font-size: 14px; font-weight: 500;">
              ${alreadyPaid > 0 ? 'Amount to Add:' : 'Paid Amount:'}
            </label>
            <input 
              id="swal-paid-amount" 
              type="number" 
              step="0.01" 
              min="${alreadyPaid > 0 ? 0 : 0}" 
              max="${alreadyPaid > 0 ? remainingAmount : totalAmount}" 
              value="${alreadyPaid > 0 ? remainingAmount : totalAmount}" 
              placeholder="Enter amount"
              style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 10px;"
            />
            <button 
              type="button" 
              id="swal-fully-paid-btn"
              style="width: 100%; padding: 10px; background-color: #10b981; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;"
            >
              ${alreadyPaid > 0 ? `Pay Remaining (${formatCurrency(remainingAmount)})` : `Fully Paid (${formatCurrency(totalAmount)})`}
            </button>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Record Payment',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#0ea5e9',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
        didOpen: () => {
          const input = document.getElementById('swal-paid-amount') as HTMLInputElement
          const fullyPaidBtn = document.getElementById('swal-fully-paid-btn')
          
          if (input) {
            input.focus()
            input.select()
          }
          
          if (fullyPaidBtn) {
            fullyPaidBtn.addEventListener('click', () => {
              if (input) {
                // Set to remaining amount if partial payment exists, otherwise full amount
                const valueToSet = alreadyPaid > 0 ? remainingAmount : totalAmount
                input.value = valueToSet.toString()
                input.dispatchEvent(new Event('input', { bubbles: true }))
              }
            })
          }
        },
        preConfirm: () => {
          const input = document.getElementById('swal-paid-amount') as HTMLInputElement
          const value = input?.value
          if (!value || value === '') {
            Swal.showValidationMessage('Please enter an amount')
            return false
          }
          const inputAmount = parseFloat(value)
          if (isNaN(inputAmount) || inputAmount <= 0) {
            Swal.showValidationMessage('Please enter a valid amount greater than 0')
            return false
          }
          
          // If there's already a partial payment, calculate the new total
          if (alreadyPaid > 0) {
            const newTotalPaid = alreadyPaid + inputAmount
            if (newTotalPaid > totalAmount) {
              Swal.showValidationMessage(`Total cannot exceed ${formatCurrency(totalAmount)}. Maximum you can add is ${formatCurrency(remainingAmount)}`)
              return false
            }
            return newTotalPaid
          } else {
            // For new payments, just validate against total
            if (inputAmount > totalAmount) {
              Swal.showValidationMessage(`Amount cannot exceed total (${formatCurrency(totalAmount)})`)
              return false
            }
            return inputAmount
          }
        },
      })

      if (result.isConfirmed && result.value !== false) {
        const paidAmount = result.value as number
        try {
          await orderService.markAsPaid(id, paidAmount)
          const isFullyPaid = paidAmount >= totalAmount
          showToast(
            isFullyPaid 
              ? 'Order marked as fully paid!' 
              : `Payment of ${formatCurrency(paidAmount)} recorded!`,
            'success'
          )
          await loadOrders()
        } catch (error: any) {
          console.error('Error marking order as paid:', error)
          showToast(`Failed to update order: ${error?.message || 'Unknown error'}`, 'error')
        }
      }
    } catch (error: any) {
      console.error('Error showing payment dialog:', error)
      showToast('Failed to open payment dialog', 'error')
    }
  }

  const handleGeneratePDF = (order: Order) => {
    generateInvoicePDF(order)
  }

  const handleGenerateMultiplePDFs = () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one order')
      return
    }
    const ordersToExport = filteredOrders.filter((o) => selectedOrders.has(o.id!))
    generateMultipleInvoicesPDF(ordersToExport)
    setSelectedOrders(new Set())
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
    if (filterTruckOwner) newFilters.truckOwner = filterTruckOwner
    if (filterTruckNo) newFilters.truckNo = filterTruckNo
    if (filterStartDate) newFilters.startDate = filterStartDate
    if (filterEndDate) newFilters.endDate = filterEndDate
    setFilters(newFilters)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilterPartyName('')
    setFilterMaterial('')
    setFilterTruckOwner('')
    setFilterTruckNo('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilters({})
    setShowFilters(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-600 text-white p-4 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-2xl font-bold">Orders</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors"
          >
            <Filter size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('latest')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'latest'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'bg-primary-500 text-white hover:bg-primary-500/90'
            }`}
          >
            Latest
          </button>
          <button
            onClick={() => setActiveTab('paymentDue')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'paymentDue'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'bg-primary-500 text-white hover:bg-primary-500/90'
            }`}
          >
            Payment Due
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b border-gray-200 p-4 space-y-3 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            <button 
              onClick={() => setShowFilters(false)}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <input
            type="text"
            placeholder="Party Name"
            value={filterPartyName}
            onChange={(e) => setFilterPartyName(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Material
            </label>
            <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
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

          <input
            type="text"
            placeholder="Truck Owner"
            value={filterTruckOwner}
            onChange={(e) => setFilterTruckOwner(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />

          <input
            type="text"
            placeholder="Truck No"
            value={filterTruckNo}
            onChange={(e) => setFilterTruckNo(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              placeholder="Start Date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <input
              type="date"
              placeholder="End Date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyFilterForm}
              className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors shadow-sm"
            >
              Apply
            </button>
            <button
              onClick={resetFilters}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4 flex gap-2">
        <button
          onClick={() => {
            setEditingOrder(null)
            setShowForm(true)
          }}
          className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus size={20} />
          Add Order
        </button>
        {selectedOrders.size > 0 && (
          <button
            onClick={handleGenerateMultiplePDFs}
            className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium flex items-center gap-2 hover:bg-green-700 transition-colors shadow-sm"
          >
            <FileText size={20} />
            PDF ({selectedOrders.size})
          </button>
        )}
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="p-4 text-center text-gray-500">Loading...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-4 text-center text-gray-500">No orders found</div>
      ) : (
        <div className="px-4 pb-4 overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full bg-white rounded-lg shadow-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
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
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Party Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Site Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Material</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Weight</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Rate</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Total</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Truck Owner</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Truck No</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Original Weight</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Original Rate</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Original Total</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Additional Cost</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Profit</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
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
                  <td className="px-3 py-3 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id!)}
                      onChange={() => toggleOrderSelection(order.id!)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(order.date), 'dd MMM yyyy')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {order.partyName}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                    {order.siteName}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                    {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {order.weight.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(order.rate)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                    {order.truckOwner}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                    {order.truckNo}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {order.originalWeight.toFixed(2)}
                  </td>
                  <td className={`px-3 py-3 whitespace-nowrap text-sm text-right ${
                    order.originalRate > order.rate && order.rate > 0
                      ? 'text-red-600 font-semibold'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(order.originalRate)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(order.originalTotal)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(order.additionalCost)}
                  </td>
                  <td className={`px-3 py-3 whitespace-nowrap text-sm text-right font-medium ${
                    order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(order.profit)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-center">
                    {order.paid ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
                        Paid
                      </span>
                    ) : order.paidAmount && order.paidAmount > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium">
                          Partial
                        </span>
                        <span className="text-xs text-gray-600">
                          {formatCurrency(order.paidAmount)} / {formatCurrency(order.total)}
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
                      <button
                        onClick={() => handleGeneratePDF(order)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                        title="Generate PDF"
                      >
                        <FileText size={16} />
                      </button>
                      {!order.paid && (
                        <button
                          onClick={() => handleMarkAsPaid(order.id!)}
                          className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                          title={order.paidAmount && order.paidAmount > 0 ? "Add Payment" : "Mark as Paid"}
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

