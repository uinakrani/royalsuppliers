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
import { FileText, Plus, Trash2, Filter, X, AlertCircle, CheckCircle, Download } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({})
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [invoiceOrders, setInvoiceOrders] = useState<Record<string, Order[]>>({})

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
        text: 'Are you sure you want to remove this payment?',
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
        text: 'Are you sure you want to delete this invoice? This will unmark the orders as invoiced.',
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
        <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle size={10} />
          Paid
        </span>
      )
    }
    if (invoice.overdue) {
      return (
        <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 flex items-center gap-1">
          <AlertCircle size={10} />
          Overdue
        </span>
      )
    }
    return (
      <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
        Pending
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-500">Loading invoices...</div>
        </div>
        <NavBar />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40 shadow-sm">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Invoices</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 bg-primary-500 rounded-lg hover:bg-primary-500/80 transition-colors"
          >
            <Filter size={18} />
          </button>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-4">

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Party Name</label>
                <select
                  value={filterPartyName}
                  onChange={(e) => setFilterPartyName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                <select
                  value={filterPaid}
                  onChange={(e) => setFilterPaid(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">All</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Overdue Status</label>
                <select
                  value={filterOverdue}
                  onChange={(e) => setFilterOverdue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">All</option>
                  <option value="overdue">Overdue</option>
                  <option value="not-overdue">Not Overdue</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={applyFilterForm}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Apply Filters
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
              >
                Reset
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 flex items-center gap-1"
              >
                <X size={16} />
                Close
              </button>
            </div>
          </div>
        )}

        {/* Invoices List */}
        <div className="space-y-3">
          {filteredInvoices.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center border border-gray-200">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No invoices found</p>
            </div>
          ) : (
            filteredInvoices.map((invoice) => {
              const orders = invoiceOrders[invoice.id!] || []
              const remaining = invoice.totalAmount - (invoice.paidAmount || 0)
              const isExpanded = expandedInvoice === invoice.id

              return (
                <div key={invoice.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  {/* Invoice Header - Mobile Friendly */}
                  <div className="p-3 border-b border-gray-200">
                    {/* Top Row: Invoice Number and Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900 truncate">{invoice.invoiceNumber}</h3>
                          {getStatusBadge(invoice)}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleDownloadInvoice(invoice)}
                          className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center"
                          title="Download Invoice"
                        >
                          <Download size={16} />
                        </button>
                        {!invoice.paid && (
                          <button
                            onClick={() => handleAddPayment(invoice.id!)}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center"
                            title="Add Payment"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => toggleExpand(invoice.id!)}
                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300"
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {/* Info Row: Party, Site, Dates */}
                    <div className="space-y-1.5 mb-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 font-medium">Party:</span>
                        <span className="text-gray-900">{invoice.partyName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 font-medium">Site:</span>
                        <span className="text-gray-900">{invoice.siteName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                        <span>Created: {format(new Date(invoice.createdAt), 'dd MMM yyyy')}</span>
                        <span className={`${invoice.overdue ? 'text-red-600 font-semibold' : ''}`}>
                          Due: {format(new Date(invoice.dueDate), 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Amount Row */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">Total Amount</p>
                        <p className="text-lg font-bold text-gray-900">{formatIndianCurrency(invoice.totalAmount)}</p>
                      </div>
                      <div className="text-right">
                        {!invoice.paid ? (
                          <>
                            <p className="text-xs text-gray-500">Remaining</p>
                            <p className="text-lg font-bold text-red-600">{formatIndianCurrency(remaining)}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-gray-500">Paid</p>
                            <p className="text-lg font-bold text-green-600">{formatIndianCurrency(invoice.paidAmount || 0)}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Summary Row */}
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-500">
                      <span>{orders.length} Order{orders.length !== 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{invoice.partialPayments?.length || 0} Payment{invoice.partialPayments?.length !== 1 ? 's' : ''}</span>
                      <button
                        onClick={() => handleDeleteInvoice(invoice.id!)}
                        className="ml-auto px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 flex items-center gap-1"
                        title="Delete Invoice"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Invoice Details - Expanded */}
                  {isExpanded && (
                    <div className="p-3 bg-gray-50 border-t border-gray-200">
                      <div className="space-y-4">
                        {/* Orders - Compact View */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Orders Included ({orders.length}):</h4>
                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            {/* Desktop Table Header */}
                            <div className="hidden sm:grid grid-cols-12 gap-2 p-2 bg-gray-100 border-b border-gray-200 text-xs font-semibold text-gray-700">
                              <div className="col-span-2">Date</div>
                              <div className="col-span-5">Material</div>
                              <div className="col-span-1 text-right">Weight</div>
                              <div className="col-span-2 text-right">Rate</div>
                              <div className="col-span-2 text-right">Total</div>
                            </div>
                            {/* Table Rows */}
                            <div className="divide-y divide-gray-200">
                              {orders.map((order) => (
                                <div key={order.id} className="p-2 hover:bg-gray-50">
                                  {/* Desktop View */}
                                  <div className="hidden sm:grid grid-cols-12 gap-2 text-xs">
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
                                  <div className="sm:hidden space-y-1.5 text-xs">
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

                        {/* Payments */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Payment History:</h4>
                          {invoice.partialPayments && invoice.partialPayments.length > 0 ? (
                            <div className="space-y-2">
                              {invoice.partialPayments.map((payment) => (
                                <div key={payment.id} className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                                  <div>
                                    <p className="font-semibold text-gray-900 text-sm">{formatIndianCurrency(payment.amount)}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{format(new Date(payment.date), 'dd MMM yyyy HH:mm')}</p>
                                  </div>
                                  <button
                                    onClick={() => handleRemovePayment(invoice.id!, payment.id)}
                                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs hover:bg-red-200 flex items-center gap-1.5 font-medium"
                                  >
                                    <Trash2 size={14} />
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 bg-white p-3 rounded-lg border border-gray-200">No payments recorded</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      <NavBar />
    </div>
  )
}

