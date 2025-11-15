'use client'

import { useEffect, useState } from 'react'
import { orderService } from '@/lib/orderService'
import { calculateStats, getDateRangeForDuration } from '@/lib/statsService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Order, DashboardStats, OrderFilters } from '@/types/order'
import NavBar from '@/components/NavBar'
import { format } from 'date-fns'
import { TrendingUp, DollarSign, Package, CreditCard, Calendar, Filter } from 'lucide-react'
import FilterDrawer from '@/components/FilterDrawer'
import LoadingSpinner from '@/components/LoadingSpinner'

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
      
      // Apply client-side filters for multiple party names and materials
      let filteredOrders = allOrders
      
      // Apply duration filter
      if (duration) {
        const { start, end } = getDateRangeForDuration(duration)
        filteredOrders = filteredOrders.filter((order) => {
          const orderDate = new Date(order.date)
          return orderDate >= start && orderDate <= end
        })
      }
      
      if (filters.partyName) {
        const filterPartyNames = filters.partyName.split(',').map(p => p.trim().toLowerCase())
        filteredOrders = filteredOrders.filter((o) =>
          filterPartyNames.some(fp => o.partyName.toLowerCase() === fp)
        )
      }
      
      if (filters.material) {
        const filterMaterials = filters.material.split(',').map(m => m.trim().toLowerCase())
        filteredOrders = filteredOrders.filter((o) => {
          const orderMaterials = Array.isArray(o.material) 
            ? o.material.map(m => m.toLowerCase())
            : [o.material.toLowerCase()]
          return filterMaterials.some(fm => orderMaterials.some(om => om.includes(fm)))
        })
      }
      
      // Apply date range filter
      if (filters.startDate || filters.endDate) {
        filteredOrders = filteredOrders.filter((order) => {
          const orderDate = new Date(order.date)
          if (filters.startDate && orderDate < new Date(filters.startDate)) {
            return false
          }
          if (filters.endDate && orderDate > new Date(filters.endDate)) {
            return false
          }
          return true
        })
      }
      
      setOrders(filteredOrders)
      setStats(calculateStats(filteredOrders))
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
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors flex items-center justify-center"
          >
            <Filter size={18} />
          </button>
        </div>
      </div>

      {/* Filters Drawer */}
      <FilterDrawer isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <div className="space-y-3">
          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
            >
              <option value="currentMonth">Current Month</option>
              <option value="7days">Last 7 Days</option>
              <option value="lastMonth">Last Month</option>
              <option value="last3Months">Last 3 Months</option>
              <option value="last6Months">Last 6 Months</option>
              <option value="lastYear">Last Year</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
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
              className="flex-1 bg-primary-600 text-white py-2 rounded-lg text-[10px] font-medium hover:bg-primary-700 transition-colors shadow-sm"
            >
              Apply
            </button>
            <button
              onClick={() => {
                resetFilters()
                setShowFilters(false)
              }}
              className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg text-[10px] font-medium hover:bg-gray-300 transition-colors"
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
                {formatIndianCurrency(stats.totalCost)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Total cost</p>
            </div>

            <div className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <TrendingUp className="text-blue-600" size={16} />
                <span className="text-[10px] text-gray-500">Profit</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {formatIndianCurrency(stats.totalProfit)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Total profit</p>
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

      <NavBar />
    </div>
  )
}

