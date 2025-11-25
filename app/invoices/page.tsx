'use client'

import { useEffect, useState } from 'react'
import { invoiceService } from '@/lib/invoiceService'
import { orderService } from '@/lib/orderService'
import { generateInvoicePDF, generateMultipleInvoicesPDF } from '@/lib/pdfService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { Invoice, InvoiceFilters, InvoicePayment } from '@/types/invoice'
import { Order } from '@/types/order'
import NavBar from '@/components/NavBar'
import { format } from 'date-fns'
import { FileText, Plus, Trash2, Filter, X, AlertCircle, CheckCircle, Download, Package } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import FilterPopup from '@/components/FilterPopup'
import TruckLoading from '@/components/TruckLoading'
import OrderForm from '@/components/OrderForm'
import { useRouter } from 'next/navigation'
import { createRipple } from '@/lib/rippleEffect'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({})
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [invoiceOrders, setInvoiceOrders] = useState<Record<string, Order[]>>({})
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  // Filter form state
  const [filterPartyName, setFilterPartyName] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterPaid, setFilterPaid] = useState<string>('')
  const [filterOverdue, setFilterOverdue] = useState<string>('')

  useEffect(() => {
    loadInvoices()
    loadPartyNames()
  }, [])

  useEffect(() => {
    applyFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, filters])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const allInvoices = await invoiceService.getAllInvoices()
      setInvoices(allInvoices)
      
      // Load orders for each invoice
      const ordersMap: Record<string, Order[]> = {}
      for (const invoice of allInvoices) {
        const orders: Order[] = []
        for (const orderId of invoice.orderIds) {
          const order = await orderService.getOrderById(orderId)
          if (order) {
            orders.push(order)
          }
        }
        ordersMap[invoice.id!] = orders
      }
      setInvoiceOrders(ordersMap)
    } catch (error) {
      console.error('Error loading invoices:', error)
      showToast('Failed to load invoices', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadPartyNames = async () => {
    try {
      const uniquePartyNames = await invoiceService.getUniquePartyNames()
      setPartyNames(uniquePartyNames)
    } catch (error) {
      console.error('Error loading party names:', error)
    }
  }

  const applyFilters = () => {
    let filtered = [...invoices]

    if (filters.partyName) {
      filtered = filtered.filter((inv) => inv.partyName === filters.partyName)
    }
    if (filters.paid !== undefined) {
      filtered = filtered.filter((inv) => inv.paid === filters.paid)
    }
    if (filters.overdue !== undefined) {
      filtered = filtered.filter((inv) => inv.overdue === filters.overdue)
    }
    if (filters.startDate) {
      filtered = filtered.filter((inv) => new Date(inv.createdAt) >= new Date(filters.startDate!))
    }
    if (filters.endDate) {
      filtered = filtered.filter((inv) => new Date(inv.createdAt) <= new Date(filters.endDate!))
    }

    setFilteredInvoices(filtered)
  }

  const applyFilterForm = () => {
    const newFilters: InvoiceFilters = {}
    if (filterPartyName) newFilters.partyName = filterPartyName
    if (filterStartDate) newFilters.startDate = filterStartDate
    if (filterEndDate) newFilters.endDate = filterEndDate
    if (filterPaid === 'paid') newFilters.paid = true
    if (filterPaid === 'unpaid') newFilters.paid = false
    if (filterOverdue === 'overdue') newFilters.overdue = true
    if (filterOverdue === 'not-overdue') newFilters.overdue = false
    setFilters(newFilters)
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilterPartyName('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterPaid('')
    setFilterOverdue('')
    setFilters({})
    setShowFilters(false)
  }


  const handleAddPayment = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId)
    if (!invoice) return

    const remaining = invoice.totalAmount - (invoice.paidAmount || 0)
    
    try {
      const amountStr = await sweetAlert.prompt({
        title: 'Add Payment',
        message: `Remaining balance: ${formatIndianCurrency(remaining)}`,
        inputLabel: 'Payment Amount',
        inputPlaceholder: 'Enter amount',
        inputType: 'text',
        formatCurrencyInr: true,
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

      const note = await sweetAlert.prompt({
        title: 'Payment Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'Add a note (optional)',
        inputType: 'text',
        required: false,
        confirmText: 'Save',
        cancelText: 'Skip',
      })

      await invoiceService.addPayment(invoiceId, amount, note || undefined)
      showToast('Payment added successfully!', 'success')
      await loadInvoices()
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to add payment: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const handleRemovePayment = async (invoiceId: string, paymentId: string) => {
    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Remove Payment?',
        message: 'Are you sure you want to remove this payment?',
        icon: 'warning',
        confirmText: 'Remove',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      await invoiceService.removePayment(invoiceId, paymentId)
      showToast('Payment removed successfully!', 'success')
      await loadInvoices()
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to remove payment: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Delete Invoice?',
        message: 'Are you sure you want to delete this invoice? This will unmark the orders as invoiced.',
        icon: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      })

      if (!confirmed) return

      await invoiceService.deleteInvoice(invoiceId)
      showToast('Invoice deleted successfully!', 'success')
      await loadInvoices()
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast(`Failed to delete invoice: ${error?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const orders = invoiceOrders[invoice.id!] || []
      if (orders.length === 0) {
        showToast('No orders found for this invoice', 'error')
        return
      }

      if (orders.length === 1) {
        await generateInvoicePDF(orders[0])
      } else {
        await generateMultipleInvoicesPDF(orders)
      }
      showToast('Invoice PDF downloaded!', 'success')
    } catch (error: any) {
      showToast(`Failed to download invoice: ${error?.message || 'Unknown error'}`, 'error')
    }
  }

  const toggleExpand = (invoiceId: string) => {
    setExpandedInvoice(expandedInvoice === invoiceId ? null : invoiceId)
  }

  const getStatusBadge = (invoice: Invoice) => {
    if (invoice.paid) {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-green-500 to-green-600 text-white flex items-center gap-1.5 shadow-sm shadow-green-500/30">
          <CheckCircle size={12} className="flex-shrink-0" />
          Paid
        </span>
      )
    }
    if (invoice.overdue) {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white flex items-center gap-1.5 shadow-sm shadow-red-500/30 animate-pulse">
          <AlertCircle size={12} className="flex-shrink-0" />
          Overdue
        </span>
      )
    }
    return (
      <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white flex items-center gap-1.5 shadow-sm shadow-amber-500/30">
        Pending
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
        <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">Invoices</h1>
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
        </div>
        <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-50">
          <TruckLoading size={100} />
        </div>
        <NavBar />
      </div>
    )
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
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-4 pt-safe sticky top-0 z-40 shadow-lg" style={{ flexShrink: 0 }}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-0.5">Invoices</h1>
            <p className="text-xs text-primary-100 opacity-90">
              {filteredInvoices.length} {filteredInvoices.length === 1 ? 'invoice' : 'invoices'}
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-sm"
            style={{
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Filter size={20} />
          </button>
        </div>
      </div>
      
      {/* Content Area - Scrollable, fits between header and nav */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '4rem'
      }}>
        <div className="max-w-7xl mx-auto">

        {/* Filters Drawer */}
        <FilterPopup isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Party Name</label>
              <select
                value={filterPartyName}
                onChange={(e) => setFilterPartyName(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              >
                <option value="">All</option>
                {partyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                value={filterPaid}
                onChange={(e) => setFilterPaid(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              >
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Overdue Status</label>
              <select
                value={filterOverdue}
                onChange={(e) => setFilterOverdue(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg"
              >
                <option value="">All</option>
                <option value="overdue">Overdue</option>
                <option value="not-overdue">Not Overdue</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-200 sticky bottom-0 bg-white pb-2">
              <button
                onClick={() => {
                  applyFilterForm()
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
                className="flex-1 bg-gray-200 text-gray-700 px-2 py-1 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </FilterPopup>

        {/* Invoices List */}
        <div className="space-y-3 p-3">
          {filteredInvoices.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-12 text-center border border-gray-200 shadow-sm" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={40} className="text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium text-base">No invoices found</p>
              <p className="text-gray-500 text-sm mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            filteredInvoices.map((invoice, index) => {
              const orders = invoiceOrders[invoice.id!] || []
              const remaining = invoice.totalAmount - (invoice.paidAmount || 0)
              const isExpanded = expandedInvoice === invoice.id
              const paymentPercentage = invoice.totalAmount > 0 ? ((invoice.paidAmount || 0) / invoice.totalAmount) * 100 : 0

              return (
                <div 
                  key={invoice.id} 
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ease-out"
                  style={{ 
                    animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  {/* Invoice Header - Modern Design */}
                  <div className="p-4">
                    {/* Top Row: Invoice Number and Status */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-sm">
                            <FileText size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-gray-900 truncate">{invoice.invoiceNumber}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{invoice.partyName}</p>
                          </div>
                        </div>
                        {getStatusBadge(invoice)}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            createRipple(e)
                            handleDownloadInvoice(invoice)
                          }}
                          className="p-2.5 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 flex items-center justify-center shadow-sm shadow-primary-500/30 active:scale-95 transition-all duration-150"
                          title="Download Invoice"
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <Download size={16} />
                        </button>
                        {!invoice.paid && (
                          <button
                            onClick={(e) => {
                              createRipple(e)
                              handleAddPayment(invoice.id!)
                            }}
                            className="p-2.5 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 flex items-center justify-center shadow-sm shadow-green-500/30 active:scale-95 transition-all duration-150"
                            title="Add Payment"
                            style={{
                              WebkitTapHighlightColor: 'transparent',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Payment Progress Bar */}
                    {!invoice.paid && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-600">Payment Progress</span>
                          <span className="text-xs font-bold text-primary-600">{paymentPercentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500 ease-out shadow-sm"
                            style={{ width: `${Math.min(100, paymentPercentage)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Info Cards */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Site</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{invoice.siteName}</p>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Due Date</p>
                        <p className={`text-sm font-semibold ${invoice.overdue ? 'text-red-600' : 'text-gray-900'}`}>
                          {format(new Date(invoice.dueDate), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>

                    {/* Amount Cards */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-3 border border-primary-200">
                        <p className="text-xs text-primary-600 font-medium mb-1">Total Amount</p>
                        <p className="text-lg font-bold text-primary-700">{formatIndianCurrency(invoice.totalAmount)}</p>
                      </div>
                      <div className={`rounded-xl p-3 border ${
                        invoice.paid 
                          ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' 
                          : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                      }`}>
                        <p className={`text-xs font-medium mb-1 ${invoice.paid ? 'text-green-600' : 'text-red-600'}`}>
                          {invoice.paid ? 'Paid' : 'Remaining'}
                        </p>
                        <p className={`text-lg font-bold ${invoice.paid ? 'text-green-700' : 'text-red-700'}`}>
                          {formatIndianCurrency(invoice.paid ? (invoice.paidAmount || 0) : remaining)}
                        </p>
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <Package size={12} />
                          {orders.length} Order{orders.length !== 1 ? 's' : ''}
                        </span>
                        <span>•</span>
                        <span>{invoice.partialPayments?.length || 0} Payment{invoice.partialPayments?.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            createRipple(e)
                            toggleExpand(invoice.id!)
                          }}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-200 active:scale-95 transition-all duration-150"
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          {isExpanded ? 'Hide Details' : 'View Details'}
                        </button>
                        <button
                          onClick={(e) => {
                            createRipple(e)
                            handleDeleteInvoice(invoice.id!)
                          }}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-200 active:scale-95 transition-all duration-150 flex items-center gap-1.5"
                          title="Delete Invoice"
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Details - Expanded with Animation */}
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="p-4 bg-gradient-to-br from-gray-50 to-white border-t border-gray-200">
                      <div className="space-y-4">
                        {/* Orders - Modern View */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-primary-100 rounded-lg">
                              <Package size={14} className="text-primary-600" />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Orders ({orders.length})</h4>
                          </div>
                          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            {/* Desktop Table Header */}
                            <div className="hidden sm:grid grid-cols-12 gap-1.5 p-1.5 bg-gray-100 border-b border-gray-200 text-xs font-semibold text-gray-700">
                              <div className="col-span-2">Date</div>
                              <div className="col-span-5">Material</div>
                              <div className="col-span-1 text-right">Weight</div>
                              <div className="col-span-2 text-right">Rate</div>
                              <div className="col-span-2 text-right">Total</div>
                            </div>
                            {/* Table Rows */}
                            <div className="divide-y divide-gray-200">
                              {orders.map((order) => (
                                <div key={order.id} className="p-1.5 hover:bg-gray-50">
                                  {/* Desktop View */}
                                  <div className="hidden sm:grid grid-cols-12 gap-1.5 text-xs">
                                    <div className="col-span-2 text-gray-900">
                                      {format(new Date(order.date), 'dd MMM yyyy')}
                                    </div>
                                    <div className="col-span-5 text-gray-900 truncate" title={Array.isArray(order.material) ? order.material.join(', ') : order.material}>
                                      {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                                    </div>
                                    <div className="col-span-1 text-right text-gray-900">
                                      {order.weight.toFixed(2)}
                                    </div>
                                    <div className="col-span-2 text-right text-gray-900">
                                      {formatIndianCurrency(order.rate)}
                                    </div>
                                    <div className="col-span-2 text-right font-semibold text-gray-900">
                                      {formatIndianCurrency(order.total)}
                                    </div>
                                  </div>
                                  {/* Mobile View */}
                                  <div className="sm:hidden space-y-1 text-xs">
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1">
                                        <p className="font-semibold text-gray-900">
                                          {format(new Date(order.date), 'dd MMM yyyy')}
                                        </p>
                                        <p className="text-gray-600 mt-0.5">
                                          {Array.isArray(order.material) ? order.material.join(', ') : order.material}
                                        </p>
                                      </div>
                                      <p className="font-semibold text-gray-900 ml-2">
                                        {formatIndianCurrency(order.total)}
                                      </p>
                                    </div>
                                    <div className="flex gap-3 text-gray-600">
                                      <span>Weight: {order.weight.toFixed(2)}</span>
                                      <span>Rate: {formatIndianCurrency(order.rate)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Payments - Modern View */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-green-100 rounded-lg">
                              <CheckCircle size={14} className="text-green-600" />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Payments ({invoice.partialPayments?.length || 0})</h4>
                          </div>
                          {invoice.partialPayments && invoice.partialPayments.length > 0 ? (
                            <div className="space-y-2">
                              {invoice.partialPayments.map((payment, idx) => (
                                <div 
                                  key={payment.id} 
                                  className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow duration-200"
                                  style={{ animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both` }}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-bold text-gray-900 text-sm">{formatIndianCurrency(payment.amount)}</p>
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                        Paid
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500">{format(new Date(payment.date), 'dd MMM yyyy • HH:mm')}</p>
                                    {payment.note && (
                                      <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 px-2 py-1 rounded-lg">{payment.note}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      createRipple(e)
                                      handleRemovePayment(invoice.id!, payment.id)
                                    }}
                                    className="ml-3 px-3 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-200 active:scale-95 transition-all duration-150 flex items-center gap-1.5"
                                    style={{
                                      WebkitTapHighlightColor: 'transparent',
                                      position: 'relative',
                                      overflow: 'hidden'
                                    }}
                                  >
                                    <Trash2 size={12} />
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <AlertCircle size={20} className="text-gray-400" />
                              </div>
                              <p className="text-sm text-gray-600 font-medium">No payments recorded</p>
                              <p className="text-xs text-gray-500 mt-1">Add a payment to track invoice status</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

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
      </div>

      {/* Bottom Navigation - Fixed at bottom */}
      <NavBar />
    </div>
  )
}

