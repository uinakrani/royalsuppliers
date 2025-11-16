'use client'

import { useEffect, useState } from 'react'
import { orderService } from '@/lib/orderService'
import { invoiceService } from '@/lib/invoiceService'
import { calculateStats, getDateRangeForDuration } from '@/lib/statsService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Order, DashboardStats, OrderFilters } from '@/types/order'
import { Invoice } from '@/types/invoice'
import NavBar from '@/components/NavBar'
import { format } from 'date-fns'
import { TrendingUp, DollarSign, Package, CreditCard, Calendar, Filter, Receipt, Plus } from 'lucide-react'
import FilterDrawer from '@/components/FilterDrawer'
import LoadingSpinner from '@/components/LoadingSpinner'
import OrderForm from '@/components/OrderForm'
import { showToast } from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { partyPaymentService } from '@/lib/partyPaymentService'

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    totalWeight: 0,
    totalCost: 0,
    totalProfit: 0,
    currentBalance: 0,
    totalOrders: 0,
    paidOrders: 0,
    unpaidOrders: 0,
    partialOrders: 0,
    estimatedProfit: 0,
    paymentReceived: 0,
    costAmount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<OrderFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [duration, setDuration] = useState('currentMonth')
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadPartyNames()
  }, [])

  useEffect(() => {
    loadOrders()
  }, [filters, duration])

  const loadPartyNames = async () => {
    try {
      const uniquePartyNames = await orderService.getUniquePartyNames()
      setPartyNames(uniquePartyNames)
    } catch (error) {
      console.error('Error loading party names:', error)
    }
  }

  const loadOrders = async () => {
    setLoading(true)
    try {
      // Get all orders first
      const allOrders = await orderService.getAllOrders()
      
      // Determine date range: custom date filters take precedence over duration
      let dateRangeStart: Date | null = null
      let dateRangeEnd: Date | null = null
      
      if (filters.startDate || filters.endDate) {
        // Use custom date filters if provided
        if (filters.startDate) {
          dateRangeStart = new Date(filters.startDate)
          dateRangeStart.setHours(0, 0, 0, 0) // Start of day
        }
        if (filters.endDate) {
          dateRangeEnd = new Date(filters.endDate)
          dateRangeEnd.setHours(23, 59, 59, 999) // End of day
        }
      } else if (duration) {
        // Use duration filter if no custom dates provided
        const { start, end } = getDateRangeForDuration(duration)
        dateRangeStart = start
        dateRangeStart.setHours(0, 0, 0, 0) // Start of day
        dateRangeEnd = end
        dateRangeEnd.setHours(23, 59, 59, 999) // End of day
      }
      
      // Apply all filters to orders
      let filteredOrders = allOrders
      
      // Apply date range filter (order date)
      if (dateRangeStart || dateRangeEnd) {
        filteredOrders = filteredOrders.filter((order) => {
          const orderDate = new Date(order.date)
          orderDate.setHours(12, 0, 0, 0) // Use noon to avoid timezone issues
          
          if (dateRangeStart && orderDate < dateRangeStart) {
            return false
          }
          if (dateRangeEnd && orderDate > dateRangeEnd) {
            return false
          }
          return true
        })
      }
      
      // Apply party name filter
      if (filters.partyName) {
        const filterPartyNames = filters.partyName.split(',').map(p => p.trim().toLowerCase())
        filteredOrders = filteredOrders.filter((o) =>
          filterPartyNames.some(fp => o.partyName.toLowerCase() === fp)
        )
      }
      
      // Apply material filter
      if (filters.material) {
        const filterMaterials = filters.material.split(',').map(m => m.trim().toLowerCase())
        filteredOrders = filteredOrders.filter((o) => {
          const orderMaterials = Array.isArray(o.material) 
            ? o.material.map(m => m.toLowerCase())
            : [o.material.toLowerCase()]
          return filterMaterials.some(fm => orderMaterials.some(om => om.includes(fm)))
        })
      }
      
      // Calculate stats from filtered orders
      const calculatedStats = calculateStats(filteredOrders)
      
      // Calculate payment received
      // Payment received should:
      // 1. Filter invoices by party name and material (if filters are applied)
      // 2. Count ALL payments made within the date range (payment date, not order date)
      let paymentReceived = 0
      try {
        const allInvoices = await invoiceService.getAllInvoices()
        const allOrders = await orderService.getAllOrders()
        
        // Create a map of order ID to order for quick lookup
        const orderMap = new Map(allOrders.map(order => [order.id, order]))
        
        // Filter invoices by party name and material (if filters are applied)
        allInvoices.forEach((invoice) => {
          // Check if invoice matches party name filter
          if (filters.partyName) {
            const filterPartyNames = filters.partyName.split(',').map(p => p.trim().toLowerCase())
            if (!filterPartyNames.some(fp => invoice.partyName.toLowerCase() === fp)) {
              return // Skip this invoice if party name doesn't match
            }
          }
          
          // Check if invoice matches material filter by checking its orders
          if (filters.material) {
            const filterMaterials = filters.material.split(',').map(m => m.trim().toLowerCase())
            const invoiceHasMatchingMaterial = invoice.orderIds.some(orderId => {
              const order = orderMap.get(orderId)
              if (!order) return false
              const orderMaterials = Array.isArray(order.material) 
                ? order.material.map(m => m.toLowerCase())
                : [order.material.toLowerCase()]
              return filterMaterials.some(fm => orderMaterials.some(om => om.includes(fm)))
            })
            
            if (!invoiceHasMatchingMaterial) {
              return // Skip this invoice if material doesn't match
            }
          }
          
          // Count all payments made within the date range
          // Payment date is what matters, not order date
          if (invoice.partialPayments && invoice.partialPayments.length > 0) {
            invoice.partialPayments.forEach((payment) => {
              const paymentDate = new Date(payment.date)
              
              // Check if payment date is within the filter range
              let isInRange = true
              if (dateRangeStart) {
                if (paymentDate < dateRangeStart) {
                  isInRange = false
                }
              }
              if (dateRangeEnd) {
                if (paymentDate > dateRangeEnd) {
                  isInRange = false
                }
              }
              
              if (isInRange) {
                paymentReceived += payment.amount
              }
            })
          }
        })

        // Include party-level payments as well (since payments moved to party level)
        try {
          const partyPayments = await partyPaymentService.getAllPayments()
          partyPayments.forEach((p) => {
            // Party filter (if applied)
            if (filters.partyName) {
              const filterPartyNames = filters.partyName.split(',').map((name) => name.trim().toLowerCase())
              if (!filterPartyNames.some((fp) => p.partyName.toLowerCase() === fp)) {
                return
              }
            }
            // Date range filter on payment date
            const payDate = new Date(p.date)
            let inRange = true
            if (dateRangeStart && payDate < dateRangeStart) inRange = false
            if (dateRangeEnd && payDate > dateRangeEnd) inRange = false
            if (inRange) {
              paymentReceived += p.amount
            }
          })
        } catch (err) {
          console.warn('Party payments not included:', err)
        }
      } catch (error) {
        console.error('Error loading invoices for payment calculation:', error)
      }
      
      calculatedStats.paymentReceived = paymentReceived
      
      setOrders(filteredOrders)
      setStats(calculatedStats)
    } catch (error) {
      console.error('Error loading orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    const newFilters: OrderFilters = {}
    if (filterPartyName) newFilters.partyName = filterPartyName
    if (filterMaterial) newFilters.material = filterMaterial
    if (startDate) newFilters.startDate = startDate
    if (endDate) newFilters.endDate = endDate
    setFilters(newFilters)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilterPartyName('')
    setFilterMaterial('')
    setStartDate('')
    setEndDate('')
    setDuration('currentMonth')
    setFilters({})
    setShowFilters(false)
  }


  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
      <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
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
        {/* Duration Filter - Visible on Screen */}
        <div>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900"
          >
            <option value="currentMonth">Current Month</option>
            <option value="7days">Last 7 Days</option>
            <option value="lastMonth">Last Month</option>
            <option value="last3Months">Last 3 Months</option>
            <option value="last6Months">Last 6 Months</option>
            <option value="lastYear">Last Year</option>
          </select>
        </div>
      </div>

      {/* Filters Drawer */}
      <FilterDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <div className="space-y-3">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Party Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Party Name</label>
            <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
              {partyNames.map((partyNameOption) => (
                <label key={partyNameOption} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={filterPartyName.split(',').filter(p => p.trim()).includes(partyNameOption)}
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
                  <span className="text-xs text-gray-700 truncate">{partyNameOption}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Material */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
            <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
              {['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth'].map((materialOption) => (
                <label key={materialOption} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={filterMaterial.split(',').filter(m => m.trim()).includes(materialOption)}
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
                  <span className="text-xs text-gray-700 truncate">{materialOption}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-200 sticky bottom-0 bg-white pb-2">
            <button
              onClick={() => {
                applyFilters()
                setShowFilters(false)
              }}
              className="flex-1 bg-primary-600 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => {
                resetFilters()
                setShowFilters(false)
              }}
              className="px-2 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </FilterDrawer>

      {/* Statistics Cards */}
      {loading ? (
        <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-50">
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <div className="p-2.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <Package className="text-primary-600" size={16} />
                <span className="text-[10px] text-gray-500">Weight</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {stats.totalWeight.toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Total sold</p>
            </div>

            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <DollarSign className="text-green-600" size={16} />
                <span className="text-[10px] text-gray-500">Cost</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {formatIndianCurrency(stats.costAmount)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Total cost</p>
            </div>

            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <TrendingUp className="text-blue-600" size={16} />
                <span className="text-[10px] text-gray-500">Profit</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {formatIndianCurrency(stats.estimatedProfit)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Estimated profit</p>
            </div>

            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <Receipt className="text-orange-600" size={16} />
                <span className="text-[10px] text-gray-500">Received</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {formatIndianCurrency(stats.paymentReceived)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Payment received</p>
            </div>

            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <CreditCard className="text-purple-600" size={16} />
                <span className="text-[10px] text-gray-500">Balance</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {formatIndianCurrency(stats.currentBalance)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Paid orders</p>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Order Summary</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Total Orders</span>
                <span className="text-xs font-semibold">{stats.totalOrders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Paid Orders</span>
                <span className="text-xs font-semibold text-green-600">{stats.paidOrders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Unpaid Orders</span>
                <span className="text-xs font-semibold text-red-600">{stats.unpaidOrders}</span>
              </div>
              {stats.partialOrders > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Partial Payments</span>
                  <span className="text-xs font-semibold text-yellow-600">{stats.partialOrders}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Form */}
      {showForm && (
        <OrderForm
          order={null}
          onClose={() => setShowForm(false)}
          onSave={async (orderData) => {
            try {
              const orderId = await orderService.createOrder(orderData)
              showToast('Order created successfully!', 'success')
              setShowForm(false)
              // Navigate to orders page and highlight the new order
              router.push(`/orders?highlight=${orderId}`)
            } catch (error: any) {
              showToast(error?.message || 'Failed to create order', 'error')
              throw error
            }
          }}
        />
      )}

      <NavBar />
    </div>
  )
}

