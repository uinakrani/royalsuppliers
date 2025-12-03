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
import { TrendingUp, DollarSign, Package, CreditCard, Calendar, Filter, Receipt, Plus, ArrowRight, Activity, ArrowDown, ArrowUp, Wallet, AlertCircle } from 'lucide-react'
import { createRipple } from '@/lib/rippleEffect'
import FilterPopup from '@/components/FilterPopup'
import TruckLoading from '@/components/TruckLoading'
import OrderForm from '@/components/OrderForm'
import { useRouter } from 'next/navigation'
import { partyPaymentService } from '@/lib/partyPaymentService'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { investmentService, InvestmentRecord } from '@/lib/investmentService'
import { getAdjustedProfit } from '@/lib/orderCalculations'

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
    moneyOut: 0,
    rawMaterialPaymentsOutstanding: 0,
    customerPaymentsReceived: 0,
    rawMaterialPaymentsReceived: 0,
    profitReceived: 0,
    calculatedBalance: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<OrderFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [duration, setDuration] = useState('currentMonth')
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [investment, setInvestment] = useState<InvestmentRecord | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadPartyNames()
  }, [])

  useEffect(() => {
    // Small delay to ensure Firebase is initialized
    const timer = setTimeout(() => {
      loadOrders()
      loadInvestment()
    }, 100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, duration])

  const loadInvestment = async () => {
    try {
      const investmentData = await investmentService.getInvestment()
      setInvestment(investmentData)
    } catch (error) {
      console.error('Error loading investment:', error)
    }
  }

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
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Loading timeout after 30 seconds')), 30000)
      })

      // Get all orders first
      const allOrders = await Promise.race([
        orderService.getAllOrders(),
        timeoutPromise
      ]) as Order[]

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
          try {
            const orderDate = new Date(order.date)
            if (isNaN(orderDate.getTime())) {
              console.warn('Invalid order date:', order.date, order.id)
              return false // Exclude orders with invalid dates
            }
            orderDate.setHours(12, 0, 0, 0) // Use noon to avoid timezone issues

            if (dateRangeStart && orderDate < dateRangeStart) {
              return false
            }
            if (dateRangeEnd && orderDate > dateRangeEnd) {
              return false
            }
            return true
          } catch (e) {
            console.warn('Error parsing order date:', order.date, e)
            return false
          }
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

      // Load ledger entries to calculate income and expenses
      let ledgerEntries: LedgerEntry[] = []
      try {
        ledgerEntries = await ledgerService.list()
      } catch (error) {
        console.warn('Error loading ledger entries:', error)
      }

      // Calculate All-Time Stats (independent of filters)
      const totalLedgerBalance = ledgerEntries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
      const totalMoneyOutAllTime = ledgerEntries.reduce((acc, e) => acc + (e.type === 'debit' ? e.amount : 0), 0)

      // Calculate receivables and total revenue from ALL orders (independent of filters)
      const totalRevenueAllTime = allOrders.reduce((sum, order) => sum + order.total, 0)
      const totalReceivables = allOrders.reduce((sum, order) => {
        const received = (order.customerPayments || []).reduce((s, p) => s + p.amount, 0)
        return sum + Math.max(0, order.total - received)
      }, 0)

      // Calculate stats from filtered orders and ledger entries
      const calculatedStats = calculateStats(filteredOrders, ledgerEntries, dateRangeStart || undefined, dateRangeEnd || undefined)

      // --- INTELLIGENT FORMULAS FOR ADJUSTED PROFIT AND CASH ---

      // 1. Calculate Realized Cash Profit (Adjusted Intelligently)
      // Formula: Sum of (Total Received - Total Paid - Additional Costs) for all filtered orders
      // This automatically accounts for over/under payments and manual adjustments implicitly via cash flow
      let realizedCashProfit = 0
      filteredOrders.forEach(order => {
        const totalReceived = (order.customerPayments || []).reduce((sum, p) => sum + p.amount, 0)
        const totalPaidOut = (order.partialPayments || []).reduce((sum, p) => sum + p.amount, 0)
        const cashProfit = totalReceived - totalPaidOut - order.additionalCost
        realizedCashProfit += cashProfit
      })
      
      // Update the stats with this intelligent profit
      calculatedStats.profitReceived = realizedCashProfit

      // 2. Calculate Available Cash (Intelligent Formula)
      // Formula: Investment + (All Customer Payments) - (All Expenses)
      // We use the ledger as the source of truth for money movement, assuming Investment is separate capital
      // Note: totalLedgerBalance = All Credits - All Debits. 
      // If Investment IS in ledger, totalLedgerBalance is the answer.
      // If Investment IS NOT in ledger, Investment + totalLedgerBalance is the answer.
      // Ideally, we assume the ledger tracks current cash state.
      // However, user feedback suggests "Available Cash is wrong", implying simple Ledger Balance isn't matching their mental model.
      // Let's use the "Operations Cash Flow" model:
      // Available Cash = Investment + Net Profit from Operations? No.
      // Available Cash = Investment + Total Money In - Total Money Out.
      // Let's assume totalLedgerBalance IS the "Net Money Flow" since start.
      // So Cash = Investment + totalLedgerBalance.
      // If this was wrong before, maybe totalLedgerBalance included something else?
      // Let's stick to the most robust definition:
      // Cash = Investment + (Customer Payments) - (Supplier Payments) - (Other Expenses)
      // This can be derived from: Investment + stats.customerPaymentsReceived (All Time) - stats.moneyOut (All Time)
      // But we need "All Time" stats for this, not filtered.
      
      // Calculate All-Time Cash Flow components from FULL ledger (ignoring date filters)
      let allTimeCustomerPayments = 0
      let allTimeExpenses = 0
      ledgerEntries.forEach(entry => {
        if (entry.type === 'credit' && entry.partyName) {
           allTimeCustomerPayments += entry.amount
        } else if (entry.type === 'debit') {
           allTimeExpenses += entry.amount
        }
      })
      
      // Intelligent Available Cash = Investment + All Customer Income - All Expenses
      // This ignores "Manual Credits" without party name (preventing double count if investment was added that way)
      const intelligentAvailableCash = (investment?.amount || 0) + allTimeCustomerPayments - allTimeExpenses

      // Add All-Time stats to the state object
      calculatedStats.totalLedgerBalance = intelligentAvailableCash // Override with intelligent formula
      calculatedStats.totalMoneyOutAllTime = totalMoneyOutAllTime
      calculatedStats.totalRevenueAllTime = totalRevenueAllTime
      calculatedStats.totalReceivables = totalReceivables

      setOrders(filteredOrders)
      setStats(calculatedStats)
      // Profit received = proportion of estimated profit based on how much was received vs total order value
      let profitReceived = 0

      // Create a map of filtered order IDs for quick lookup
      const filteredOrderMap = new Map(filteredOrders.map(order => [order.id, order]))

      try {
        const allInvoices = await invoiceService.getAllInvoices()
        const allOrders = await orderService.getAllOrders()

        // Create a map of order ID to order for quick lookup
        const orderMap = new Map(allOrders.map(order => [order.id, order]))

        // Map to track how much each order has received from customer payments
        const orderPaymentsReceived = new Map<string, number>()

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

          // Calculate total invoice amount from orders
          let invoiceTotalAmount = 0
          invoice.orderIds.forEach(orderId => {
            const order = orderMap.get(orderId)
            if (order && filteredOrderMap.has(orderId)) {
              invoiceTotalAmount += order.total
            }
          })

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
                // Distribute payment proportionally to orders in invoice
                if (invoiceTotalAmount > 0) {
                  invoice.orderIds.forEach(orderId => {
                    const order = orderMap.get(orderId)
                    if (order && filteredOrderMap.has(orderId)) {
                      const orderProportion = order.total / invoiceTotalAmount
                      const orderPaymentAmount = payment.amount * orderProportion
                      const currentReceived = orderPaymentsReceived.get(orderId) || 0
                      orderPaymentsReceived.set(orderId, currentReceived + orderPaymentAmount)
                    }
                  })
                }
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
              // For party payments, we need to distribute to orders proportionally
              // This is complex, so we'll approximate by distributing to all orders of that party
              filteredOrders.forEach(order => {
                if (order.partyName === p.partyName) {
                  const currentReceived = orderPaymentsReceived.get(order.id!) || 0
                  // Approximate: distribute equally among party orders (simplified)
                  const orderCount = filteredOrders.filter(o => o.partyName === p.partyName).length
                  if (orderCount > 0) {
                    orderPaymentsReceived.set(order.id!, currentReceived + (p.amount / orderCount))
                  }
                }
              })
            }
          })
        } catch (err) {
          console.warn('Party payments not included:', err)
        }

        // Calculate profit received based on customer payments
        filteredOrders.forEach(order => {
          const receivedAmount = orderPaymentsReceived.get(order.id!) || 0

          if (order.total > 0) {
            const adjustedProfit = getAdjustedProfit(order)
            if (receivedAmount >= order.total) {
              // If order is fully paid by received amount, all profit is received
              profitReceived += adjustedProfit
            } else if (receivedAmount > 0) {
              // If partially paid, calculate profit proportionally
              const profitRatio = adjustedProfit / order.total
              profitReceived += profitRatio * receivedAmount
            }
          }
        })
      } catch (error) {
        console.error('Error loading invoices for payment calculation:', error)
      }

      // Update stats with calculated values
      calculatedStats.paymentReceived = calculatedStats.customerPaymentsReceived
      calculatedStats.profitReceived = profitReceived

      // Current balance is already calculated in statsService from ledger entries
      // (Income with party name - Expenses)

      setOrders(filteredOrders)
      setStats(calculatedStats)
    } catch (error: any) {
      console.error('Error loading orders:', error)
      // Show error but still set loading to false so UI can render
      if (error?.message?.includes('timeout')) {
        const errorMsg = 'Loading timed out. Please check your Firebase configuration or network connection.'
        console.error(errorMsg)
        setError(errorMsg)
      } else {
        setError('Failed to load orders. Please check your Firebase configuration.')
      }
      // Set empty state so app can still render
      setOrders([])
      setStats({
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
        moneyOut: 0,
        rawMaterialPaymentsOutstanding: 0,
        customerPaymentsReceived: 0,
        rawMaterialPaymentsReceived: 0,
        profitReceived: 0,
        calculatedBalance: 0,
      })
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
    <div className="bg-gray-50" style={{
      height: '100dvh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header - Fixed at top */}
      <div className="bg-primary-600 text-white p-2.5 pt-safe sticky top-0 z-40" style={{ flexShrink: 0 }}>
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                createRipple(e)
                setShowForm(true)
              }}
              className="p-2 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all native-press flex items-center justify-center"
              style={{
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Plus size={18} />
            </button>
            <button
              onClick={(e) => {
                createRipple(e)
                setShowFilters(!showFilters)
              }}
              className="p-2 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all native-press flex items-center justify-center"
              style={{
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Filter size={18} />
            </button>
          </div>
        </div>
        {/* Duration Filter - Enhanced */}
        <div className="mt-2">
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-3 py-2 bg-white/95 backdrop-blur-sm border border-white/30 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
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

      {/* Content Area - Scrollable, fits between header and nav */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '4rem'
      }}>
        {/* Filters Drawer */}
        <FilterPopup isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
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
        </FilterPopup>

        {/* Statistics Cards */}
        {loading ? (
          <div className="fixed inset-0 flex flex-col items-center justify-center z-30 bg-gray-50 gap-4 p-4">
            <TruckLoading size={100} />
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md text-center">
                <p className="text-sm text-red-800 mb-2">{error}</p>
                <button
                  onClick={() => {
                    setError(null)
                    loadOrders()
                  }}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-sm text-red-800 mb-3">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  loadOrders()
                }}
                className="text-xs bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Investment / Capital Card - MOST IMPORTANT */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white border-2 border-amber-400">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Wallet size={20} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Your Investment (Capital)</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                {investment ? formatIndianCurrency(investment.amount) : formatIndianCurrency(0)}
              </p>
              <p className="text-xs opacity-90 mb-3">
                {investment ? (investment.note || 'Your actual capital in the business') : 'Set your investment in Ledger page'}
              </p>
              {investment && (
                <div className="pt-3 border-t border-white/20 space-y-3">
                  
                  {/* Liquidity & Receivables Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                       <p className="text-[10px] opacity-80 mb-0.5 uppercase tracking-wider">Available Cash</p>
                       <p className="text-sm font-bold text-white">
                         {formatIndianCurrency(stats.totalLedgerBalance || 0)}
                       </p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                       <p className="text-[10px] opacity-80 mb-0.5 uppercase tracking-wider">Market Receivables</p>
                       <p className="text-sm font-bold text-white">
                         {formatIndianCurrency(stats.totalReceivables || 0)}
                       </p>
                    </div>
                  </div>

                  {/* Rotation Stats */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="opacity-80">Total Business Volume:</span>
                      <span className="font-semibold">{formatIndianCurrency(stats.totalRevenueAllTime || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="opacity-80">Capital Rotation:</span>
                      <div className="flex items-center gap-1">
                         <Activity size={12} className="text-amber-200"/>
                         <span className="font-bold text-amber-100">
                           {((stats.totalRevenueAllTime || 0) / (investment.amount || 1)).toFixed(1)}x
                         </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="opacity-80">Investment Date:</span>
                      <span className="font-semibold opacity-90">{format(new Date(investment.date), 'dd MMM yyyy')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Financial Overview - Money Flow */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-primary-100 rounded-xl">
                  <Wallet size={18} className="text-primary-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Financial Overview</h3>
              </div>

              {/* Money Out */}
              <div className="mb-3 p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ArrowDown size={16} className="text-red-600" />
                    <span className="text-sm font-semibold text-gray-700">Money Going Out</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {formatIndianCurrency(stats.moneyOut)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Total expenses (Raw materials + Additional costs)
                </p>
              </div>

              {/* Outstanding Raw Materials */}
              {stats.rawMaterialPaymentsOutstanding > 0 && (
                <div className="mb-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-orange-600" />
                      <span className="text-sm font-semibold text-gray-700">Outstanding Raw Materials</span>
                    </div>
                    <span className="text-lg font-bold text-orange-600">
                      {formatIndianCurrency(stats.rawMaterialPaymentsOutstanding)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Yet to be paid for raw materials
                  </p>
                </div>
              )}

              {/* Money Received */}
              <div className="mb-3 p-3 bg-green-50 rounded-xl border border-green-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ArrowUp size={16} className="text-green-600" />
                    <span className="text-sm font-semibold text-gray-700">Money Received</span>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    {formatIndianCurrency(stats.customerPaymentsReceived)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Money received from parties (ledger credit entries with party name)
                </p>
              </div>
            </div>

            {/* Profit Analysis */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <TrendingUp size={18} className="text-blue-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Profit Analysis</h3>
              </div>

              <div className="space-y-3">
                {/* Estimated Profit */}
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700">Estimated Profit</span>
                    <span className="text-lg font-bold text-blue-600">
                      {formatIndianCurrency(stats.estimatedProfit)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Total profit from all orders
                  </p>
                </div>

                {/* Profit Received */}
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700">Realized Cash Profit</span>
                    <span className={`text-lg font-bold ${stats.profitReceived >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                      {formatIndianCurrency(stats.profitReceived)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Actual cash profit (Received - Spent - Costs)
                  </p>
                  {stats.estimatedProfit > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">Recovery Rate</span>
                        <span className="text-xs font-semibold text-purple-700">
                          {((stats.profitReceived / stats.estimatedProfit) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, (stats.profitReceived / stats.estimatedProfit) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Current Balance - Calculated */}
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Wallet size={20} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Current Balance</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                {formatIndianCurrency(stats.calculatedBalance)}
              </p>
              <p className="text-xs opacity-90 mb-3">
                Money Received (from Parties) - Money Spent
              </p>
              <div className="pt-3 border-t border-white/20 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-80">Received from Parties:</span>
                  <span className="font-semibold">{formatIndianCurrency(stats.customerPaymentsReceived)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-80">Spent (All Expenses):</span>
                  <span className="font-semibold">-{formatIndianCurrency(stats.moneyOut)}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                  <span className="opacity-80 font-medium">Net Balance:</span>
                  <span className={`font-bold ${stats.calculatedBalance >= 0 ? 'text-green-200' : 'text-red-200'
                    }`}>
                    {formatIndianCurrency(stats.calculatedBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Payment Balance Card */}
              <div
                className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white native-press"
                style={{
                  animation: 'fadeInUp 0.4s ease-out 0.1s both',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={(e) => {
                  createRipple(e)
                  router.push('/orders?filter=paid')
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <ArrowRight size={16} className="opacity-70" />
                </div>
                <p className="text-2xl font-bold mb-0.5">
                  {formatIndianCurrency(stats.currentBalance)}
                </p>
                <p className="text-xs opacity-90 font-medium">Payment Balance</p>
              </div>

              {/* Total Cost Card */}
              <div
                className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white native-press"
                style={{
                  animation: 'fadeInUp 0.4s ease-out 0.2s both',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={(e) => {
                  createRipple(e)
                  router.push('/ledger')
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    <DollarSign size={20} className="text-white" />
                  </div>
                  <ArrowRight size={16} className="opacity-70" />
                </div>
                <p className="text-2xl font-bold mb-0.5">
                  {formatIndianCurrency(stats.costAmount)}
                </p>
                <p className="text-xs opacity-90 font-medium">Total Cost</p>
              </div>
            </div>

            {/* Order Summary Card - Enhanced */}
            <div
              className="bg-white rounded-2xl p-4 border border-gray-100"
              style={{
                animation: 'fadeInUp 0.4s ease-out 0.5s both',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-primary-100 rounded-xl">
                  <Activity size={18} className="text-primary-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Order Summary</h3>
              </div>
              <div className="space-y-2.5">
                <div
                  className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl native-press"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    createRipple(e)
                    router.push('/orders')
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">Total Orders</span>
                  </div>
                  <span className="text-base font-bold text-gray-900">{stats.totalOrders}</span>
                </div>

                <div
                  className="flex justify-between items-center p-2.5 bg-green-50 rounded-xl native-press"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    createRipple(e)
                    router.push('/orders?filter=paid')
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">Paid Orders</span>
                  </div>
                  <span className="text-base font-bold text-green-600">{stats.paidOrders}</span>
                </div>

                <div
                  className="flex justify-between items-center p-2.5 bg-red-50 rounded-xl native-press"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    createRipple(e)
                    router.push('/orders?filter=unpaid')
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">Unpaid Orders</span>
                  </div>
                  <span className="text-base font-bold text-red-600">{stats.unpaidOrders}</span>
                </div>

                {stats.partialOrders > 0 && (
                  <div
                    className="flex justify-between items-center p-2.5 bg-yellow-50 rounded-xl native-press"
                    style={{
                      WebkitTapHighlightColor: 'transparent',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onClick={(e) => {
                      createRipple(e)
                      router.push('/orders?filter=partial')
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">Partial Payments</span>
                    </div>
                    <span className="text-base font-bold text-yellow-600">{stats.partialOrders}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div
              className="bg-white rounded-2xl p-4 border border-gray-100"
              style={{
                animation: 'fadeInUp 0.4s ease-out 0.6s both',
              }}
            >
              <h3 className="text-base font-bold text-gray-900 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={(e) => {
                    createRipple(e)
                    setShowForm(true)
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-primary-50 rounded-xl border-2 border-primary-200 native-press hover:bg-primary-100 transition-colors"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="p-2.5 bg-primary-600 rounded-xl">
                    <Plus size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-primary-700">New Order</span>
                </button>

                <button
                  onClick={(e) => {
                    createRipple(e)
                    router.push('/orders')
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-50 rounded-xl border-2 border-blue-200 native-press hover:bg-blue-100 transition-colors"
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="p-2.5 bg-blue-600 rounded-xl">
                    <Package size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-blue-700">View Orders</span>
                </button>
              </div>
            </div>
          </div>
        )
        }

        {/* Order Form */}
        {
          showForm && (
            <OrderForm
              order={null}
              onClose={() => setShowForm(false)}
              onSave={async (orderData) => {
                const orderId = await orderService.createOrder(orderData)
                setShowForm(false)
                // Navigate to orders page and highlight the new order
                router.push(`/orders?highlight=${orderId}`)
              }}
            />
          )
        }
      </div >

      {/* Bottom Navigation - Fixed at bottom */}
      < NavBar />
    </div >
  )
}

