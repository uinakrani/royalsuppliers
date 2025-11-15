'use client'

import { useEffect, useState } from 'react'
import { orderService } from '@/lib/orderService'
import { calculateStats, getDateRangeForDuration } from '@/lib/statsService'
import { Order, DashboardStats, OrderFilters } from '@/types/order'
import NavBar from '@/components/NavBar'
import { format } from 'date-fns'
import { TrendingUp, DollarSign, Package, CreditCard, Calendar, Filter } from 'lucide-react'

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
  const [partyName, setPartyName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadOrders()
  }, [filters, duration])

  const loadOrders = async () => {
    setLoading(true)
    try {
      let orderFilters: OrderFilters = { ...filters }

      // Apply duration filter
      if (duration) {
        const { start, end } = getDateRangeForDuration(duration)
        orderFilters.startDate = start.toISOString().split('T')[0]
        orderFilters.endDate = end.toISOString().split('T')[0]
      }

      const allOrders = await orderService.getAllOrders(orderFilters)
      setOrders(allOrders)
      setStats(calculateStats(allOrders))
    } catch (error) {
      console.error('Error loading orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    const newFilters: OrderFilters = {}
    if (partyName) newFilters.partyName = partyName
    if (startDate) newFilters.startDate = startDate
    if (endDate) newFilters.endDate = endDate
    setFilters(newFilters)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setPartyName('')
    setStartDate('')
    setEndDate('')
    setDuration('currentMonth')
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
      <div className="bg-primary-600 text-white p-4 sticky top-0 z-40">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-primary-100 text-sm mt-1">
          {format(new Date(), 'dd MMMM yyyy')}
        </p>
      </div>

      {/* Filter Button */}
      <div className="p-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full bg-white rounded-lg p-3 flex items-center justify-between shadow-sm border border-gray-200"
        >
          <div className="flex items-center">
            <Filter size={20} className="mr-2 text-gray-600" />
            <span className="text-gray-700">Filters</span>
          </div>
          <span className="text-primary-600 text-sm">
            {showFilters ? 'Hide' : 'Show'}
          </span>
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg bg-white"
            >
              <option value="currentMonth">Current Month</option>
              <option value="7days">Last 7 Days</option>
              <option value="lastMonth">Last Month</option>
              <option value="last3Months">Last 3 Months</option>
              <option value="last6Months">Last 6 Months</option>
              <option value="lastYear">Last Year</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party Name
            </label>
            <input
              type="text"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="Enter party name"
              className="w-full p-2 border border-gray-300 rounded-lg bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 bg-primary-600 text-white py-2 rounded-lg font-medium"
            >
              Apply
            </button>
            <button
              onClick={resetFilters}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {loading ? (
        <div className="p-4 text-center text-gray-500">Loading...</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <Package className="text-primary-600" size={20} />
                <span className="text-xs text-gray-500">Weight</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {stats.totalWeight.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total sold</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="text-green-600" size={20} />
                <span className="text-xs text-gray-500">Cost</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(stats.totalCost)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total cost</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="text-blue-600" size={20} />
                <span className="text-xs text-gray-500">Profit</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(stats.totalProfit)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total profit</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <CreditCard className="text-purple-600" size={20} />
                <span className="text-xs text-gray-500">Balance</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(stats.currentBalance)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Paid orders</p>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Order Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Orders</span>
                <span className="font-semibold">{stats.totalOrders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Paid Orders</span>
                <span className="font-semibold text-green-600">{stats.paidOrders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Unpaid Orders</span>
                <span className="font-semibold text-red-600">{stats.unpaidOrders}</span>
              </div>
              {stats.partialOrders > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Partial Payments</span>
                  <span className="font-semibold text-yellow-600">{stats.partialOrders}</span>
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

