'use client'

import { useEffect, useMemo, useState } from 'react'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { PlusCircle, MinusCircle, Wallet, Plus, History, Calendar, X, Edit2, List, Activity } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import NavBar from '@/components/NavBar'
import LedgerEntryWizard from '@/components/LedgerEntryWizard'
import BottomSheet from '@/components/BottomSheet'
import { createRipple } from '@/lib/rippleEffect'
import TruckLoading from '@/components/TruckLoading'
import { orderService, isOrderPaid, isCustomerPaid } from '@/lib/orderService'
import { PaymentRecord, Order } from '@/types/order'
import { getDb } from '@/lib/firebase'
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore'
import { nativePopup } from '@/components/NativePopup'
import { showToast } from '@/components/Toast'
import { ledgerActivityService, LedgerActivity } from '@/lib/ledgerActivityService'
import { investmentService, InvestmentRecord, InvestmentActivity } from '@/lib/investmentService'
import LedgerTimelineView from '@/components/LedgerTimelineView'

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Tab state
  const [activeTab, setActiveTab] = useState<'entries' | 'timeline' | 'activity' | 'investment'>('entries')

  // Activity log state
  const [activities, setActivities] = useState<LedgerActivity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerType, setDrawerType] = useState<'credit' | 'debit'>('credit')
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add')
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null)

  // Bottom sheet state
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)

  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)

  // Investment state
  const [investment, setInvestment] = useState<InvestmentRecord | null>(null)
  const [investmentHistory, setInvestmentHistory] = useState<InvestmentActivity[]>([])
  const [showInvestmentDrawer, setShowInvestmentDrawer] = useState(false)
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [investmentDate, setInvestmentDate] = useState('')
  const [investmentNote, setInvestmentNote] = useState('')
  const [investmentMode, setInvestmentMode] = useState<'add' | 'reduce' | 'set'>('add')

  const balance = useMemo(() => {
    const ledgerBalance = entries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
    return (investment?.amount || 0) + ledgerBalance
  }, [entries, investment])

  // Separate income (credit) and expenses (debit)
  // Sort by creation time (most recent first) - use createdAt, then date as fallback
  const incomeEntries = useMemo(() => {
    return entries.filter(e => e.type === 'credit').sort((a, b) => {
      const aTime = a.createdAt
        ? new Date(a.createdAt).getTime()
        : (a.date ? new Date(a.date).getTime() : 0)
      const bTime = b.createdAt
        ? new Date(b.createdAt).getTime()
        : (b.date ? new Date(b.date).getTime() : 0)
      return bTime - aTime // Descending order (newest first)
    })
  }, [entries])

  const expenseEntries = useMemo(() => {
    return entries.filter(e => e.type === 'debit').sort((a, b) => {
      const aTime = a.createdAt
        ? new Date(a.createdAt).getTime()
        : (a.date ? new Date(a.date).getTime() : 0)
      const bTime = b.createdAt
        ? new Date(b.createdAt).getTime()
        : (b.date ? new Date(b.date).getTime() : 0)
      return bTime - aTime // Descending order (newest first)
    })
  }, [entries])

  // Calculate totals
  const totalIncome = useMemo(() => {
    return incomeEntries.reduce((acc, e) => acc + e.amount, 0)
  }, [incomeEntries])

  const totalExpenses = useMemo(() => {
    return expenseEntries.reduce((acc, e) => acc + e.amount, 0)
  }, [expenseEntries])

  const load = async () => {
    setLoading(true)
    try {
      const items = await ledgerService.list()
      setEntries(items)
    } catch (error) {
      console.error('Failed to load ledger entries:', error)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }


  const loadInvestment = async () => {
    try {
      const data = await investmentService.getInvestment()
      setInvestment(data)
      if (data) {
        setInvestmentAmount(data.amount.toString())
        setInvestmentDate(data.date)
        setInvestmentNote(data.note || '')
      } else {
        setInvestmentDate(new Date().toISOString().split('T')[0])
      }

      const history = await investmentService.getActivityLog()
      setInvestmentHistory(history)
    } catch (error) {
      console.error('Error loading investment:', error)
    }
  }

  useEffect(() => {
    // initial fetch then subscribe
    load()
    loadInvestment()
    const unsub = ledgerService.subscribe((items) => {
      setEntries(items)
    })
    return () => unsub()
  }, [])

  // Load activities
  useEffect(() => {
    if (activeTab === 'activity') {
      setActivitiesLoading(true)
      const loadActivities = async () => {
        try {
          const items = await ledgerActivityService.getActivities(
            startDate || undefined,
            endDate || undefined
          )
          setActivities(items)
        } catch (error) {
          console.error('Failed to load activities:', error)
          setActivities([])
        } finally {
          setActivitiesLoading(false)
        }
      }
      loadActivities()

      // Subscribe to real-time updates
      const unsub = ledgerActivityService.subscribe(
        (items) => {
          setActivities(items)
          setActivitiesLoading(false)
        },
        startDate || undefined,
        endDate || undefined
      )
      return () => unsub()
    }
  }, [activeTab, startDate, endDate])

  const handleSaveInvestment = async () => {
    if (!investmentAmount || !investmentDate) {
      showToast('Please fill in amount and date', 'error')
      return
    }

    try {
      const entered = parseFloat(investmentAmount)
      const current = investment?.amount || 0
      const nextAmount = investmentMode === 'add'
        ? current + entered
        : investmentMode === 'reduce'
          ? Math.max(0, current - entered)
          : entered

      await investmentService.setInvestment(nextAmount, investmentDate, investmentNote)

      showToast('Investment updated successfully', 'success')
      setShowInvestmentDrawer(false)
      loadInvestment()
    } catch (error) {
      console.error('Error saving investment:', error)
      showToast('Failed to save investment', 'error')
    }
  }

  const handleEntryClick = (entry: LedgerEntry) => {
    // Directly open the wizard in edit mode (showing review page)
    handleEditEntry(entry)
  }

  const handleAddEntry = (type: 'credit' | 'debit') => {
    setDrawerType(type)
    setDrawerMode('add')
    setEditingEntry(null)
    setDrawerOpen(true)
  }

  const handleEditEntry = (entry: LedgerEntry) => {
    setEditingEntry(entry)
    setDrawerType(entry.type)
    setDrawerMode('edit')
    setDrawerOpen(true)
  }

  const handleSaveEntry = async (data: { amount: number; date: string; note?: string; supplier?: string; partyName?: string }) => {
    if (drawerMode === 'edit' && editingEntry?.id) {
      const oldPartyName = editingEntry.partyName
      const oldSupplier = editingEntry.supplier
      const newPartyName = data.partyName?.trim() || undefined
      const newSupplier = data.supplier?.trim() || undefined

      await ledgerService.update(editingEntry.id, {
        amount: data.amount,
        date: data.date,
        note: data.note,
        supplier: newSupplier,
        partyName: newPartyName,
      })

      // Handle party name changes for income entries
      if (editingEntry.type === 'credit') {
        if (oldPartyName && !newPartyName) {
          // Party was removed - revert the customer payments that were added
          await revertIncomeDistribution(editingEntry.id, oldPartyName)
          // Also remove linked party payment
          await deleteLinkedPartyPayment(editingEntry.id)
        } else if (oldPartyName && newPartyName && oldPartyName !== newPartyName) {
          // Party was changed - revert old payments and distribute new ones
          await revertIncomeDistribution(editingEntry.id, oldPartyName)
          await distributeIncomeToOrders(editingEntry.id, data.amount, newPartyName, data.date)
          // Update linked party payment with new party name
          await updateLinkedPartyPaymentPartyName(editingEntry.id, newPartyName)
          // Also update amount/date/note in linked party payment
          await updateLinkedPartyPayment(editingEntry.id, data.amount, data.date, data.note)
        } else if (!oldPartyName && newPartyName) {
          // Party was added - distribute income to orders
          await distributeIncomeToOrders(editingEntry.id, data.amount, newPartyName, data.date)
          // Create linked party payment for this income entry
          await createPartyPaymentFromIncome(editingEntry.id, newPartyName, data.amount, data.date, data.note)
        } else if (oldPartyName && newPartyName && oldPartyName === newPartyName) {
          // Party unchanged - if amount or date changed, recalculate distribution
          const oldAmount = editingEntry.amount
          const oldDate = editingEntry.date
          if (oldAmount !== data.amount || oldDate !== data.date) {
            // Revert old distribution and apply new one with updated amount/date
            await revertIncomeDistribution(editingEntry.id, oldPartyName)
            await distributeIncomeToOrders(editingEntry.id, data.amount, newPartyName, data.date)
            // Update linked party payment fields
            await updateLinkedPartyPayment(editingEntry.id, data.amount, data.date, data.note)
          }
        }
      }

      // Handle supplier changes for expense entries
      if (editingEntry.type === 'debit') {
        if (oldSupplier && !newSupplier) {
          // Supplier was removed - revert the partial payments that were added
          await revertExpenseDistribution(editingEntry.id, oldSupplier)
        } else if (oldSupplier && newSupplier && oldSupplier !== newSupplier) {
          // Supplier was changed - revert old payments and distribute new ones
          await revertExpenseDistribution(editingEntry.id, oldSupplier)
          await distributeExpenseToOrders(editingEntry.id, data.amount, newSupplier, data.date)
        } else if (!oldSupplier && newSupplier) {
          // Supplier was added - distribute expense to orders
          await distributeExpenseToOrders(editingEntry.id, data.amount, newSupplier, data.date)
        } else if (oldSupplier && newSupplier && oldSupplier === newSupplier) {
          // Supplier unchanged - if amount or date changed, recalculate distribution
          const oldAmount = editingEntry.amount
          const oldDate = editingEntry.date
          if (oldAmount !== data.amount || oldDate !== data.date) {
            // Revert old distribution and apply new one with updated amount/date
            await revertExpenseDistribution(editingEntry.id, oldSupplier)
            await distributeExpenseToOrders(editingEntry.id, data.amount, newSupplier, data.date)
          }
        }
      }
    } else {
      const entryId = await ledgerService.addEntry(
        drawerType,
        data.amount,
        data.note,
        'manual',
        data.date,
        data.supplier,
        data.partyName
      )

      // If this is an expense entry with a supplier, distribute it to orders
      if (drawerType === 'debit' && data.supplier && data.supplier.trim()) {
        await distributeExpenseToOrders(entryId, data.amount, data.supplier.trim(), data.date)
      }
      // If this is an income entry with a party name, distribute it to orders
      if (drawerType === 'credit' && data.partyName && data.partyName.trim()) {
        await distributeIncomeToOrders(entryId, data.amount, data.partyName.trim(), data.date)
        // Create linked party payment for this income entry
        await createPartyPaymentFromIncome(entryId, data.partyName.trim(), data.amount, data.date, data.note)
      }
    }
    // Drawer will close automatically on success
  }

  const distributeExpenseToOrders = async (entryId: string, expenseAmount: number, supplier: string, expenseDate: string) => {
    try {
      console.log(`🔄 Distributing expense ${expenseAmount} for supplier ${supplier} (ledger entry ${entryId})`)

      // Get all orders for this supplier
      const allOrders = await orderService.getAllOrders({ supplier })

      if (allOrders.length === 0) {
        console.warn(`No orders found for supplier ${supplier}`)
        return
      }

      console.log(`📦 Found ${allOrders.length} orders for supplier ${supplier}`)

      // Calculate outstanding amounts for each order (excluding payments from this ledger entry)
      // Only include unpaid orders
      const ordersWithOutstanding = allOrders
        .map(order => {
          const existingPayments = order.partialPayments || []
          // Exclude payments from this ledger entry (in case we're updating)
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== entryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const originalTotal = Number(order.originalTotal || 0)
          const remaining = Math.max(0, originalTotal - totalPaid)

          // Create a temporary order object with payments excluding this ledger entry
          // to check if it's already paid
          const tempOrder: Order = {
            ...order,
            partialPayments: paymentsExcludingThis
          }

          const isPaid = isOrderPaid(tempOrder)
          const difference = originalTotal - totalPaid
          const tolerance = originalTotal - 250
          
          console.log(`  Order ${order.id} (${order.siteName || 'N/A'}): originalTotal=${originalTotal}, totalPaid=${totalPaid}, remaining=${remaining}, difference=${difference}, isPaid=${isPaid}, tolerance=${tolerance} (paid if >= ${tolerance})`)

          return { order, remaining, currentPayments: existingPayments, tempOrder, isPaid, difference, totalPaid, originalTotal }
        })
        .filter(({ remaining, isPaid, order, totalPaid, originalTotal }) => {
          // Filter out orders that are already paid (within 250 tolerance)
          // Only include unpaid or partially paid orders
          const shouldInclude = remaining > 0 && !isPaid
          if (!shouldInclude) {
            if (remaining <= 0) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining} <= 0 (originalTotal=${originalTotal}, totalPaid=${totalPaid})`)
            } else if (isPaid) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): marked as PAID (remaining=${remaining}, originalTotal=${originalTotal}, totalPaid=${totalPaid}, difference=${originalTotal - totalPaid})`)
            }
          } else {
            console.log(`  ✅ Including order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining}, originalTotal=${originalTotal}, totalPaid=${totalPaid}`)
          }
          return shouldInclude
        })
        .sort((a, b) => {
          // Sort by date (oldest first), then by creation time
          const aDate = new Date(a.order.date).getTime()
          const bDate = new Date(b.order.date).getTime()
          if (aDate !== bDate) return aDate - bDate
          const aTime = safeGetTime(a.order.createdAt || a.order.updatedAt || a.order.date)
          const bTime = safeGetTime(b.order.createdAt || b.order.updatedAt || b.order.date)
          return aTime - bTime
        })

      console.log(`✅ Found ${ordersWithOutstanding.length} orders with outstanding payments`)

      if (ordersWithOutstanding.length === 0) {
        console.warn(`No orders with outstanding payments for supplier ${supplier}`)
        nativePopup.warning(
          'No Unpaid Orders',
          `No unpaid orders found for supplier "${supplier}". All orders are already paid or have no outstanding amount.`
        )
        return
      }

      // Calculate total outstanding across all unpaid orders
      const totalOutstanding = ordersWithOutstanding.reduce((sum, { remaining }) => sum + remaining, 0)
      console.log(`💰 Total outstanding across ${ordersWithOutstanding.length} unpaid orders: ${totalOutstanding}`)

      if (expenseAmount > totalOutstanding) {
        console.warn(`⚠️ Expense amount (${expenseAmount}) exceeds total outstanding (${totalOutstanding})`)
      }

      let remainingExpense = expenseAmount
      const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = []

      // Distribute expense across orders (oldest first, fill completely before next)
      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingExpense <= 0) break

        if (!order.id) {
          console.warn(`  ⚠️ Order missing ID, skipping`)
          continue
        }

        const paymentAmount = Math.min(remainingExpense, remaining)

        // Convert date to ISO string if needed
        let paymentDate = expenseDate
        if (paymentDate && !paymentDate.includes('T')) {
          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
        }

        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: paymentDate,
          note: `From ledger entry`,
          ledgerEntryId: entryId, // Track which ledger entry created this payment
        }

        // Remove any existing payments from this ledger entry first
        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== entryId)
        const updatedPayments = [...paymentsWithoutThisEntry, payment]

        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
        remainingExpense -= paymentAmount

        console.log(`  ✓ Adding payment of ${paymentAmount} to order ${order.id} (order remaining: ${remaining - paymentAmount}, expense remaining: ${remainingExpense})`)
      }

      console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingExpense} remaining undistributed`)

      // Update orders with new payment distributions
      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
        await orderService.updateOrder(orderId, {
          partialPayments: updatedPayments,
        })
        console.log(`  ✅ Updated order ${orderId} with new payment distribution`)
      }

      // If there's remaining expense that couldn't be distributed, log it and show warning
      if (remainingExpense > 0) {
        console.warn(`⚠️ Could not fully distribute expense of ${expenseAmount}. Remaining undistributed: ${remainingExpense}`)
        // Show user-friendly warning
        nativePopup.warning(
          'Partial Distribution',
          `₹${expenseAmount.toLocaleString('en-IN')} was entered for supplier "${supplier}", but only ₹${(expenseAmount - remainingExpense).toLocaleString('en-IN')} could be distributed to unpaid orders. ₹${remainingExpense.toLocaleString('en-IN')} remains undistributed because all orders are already paid or there aren't enough unpaid orders.`
        )
      } else {
        console.log(`✅ Successfully distributed expense ${expenseAmount} across orders`)
      }
    } catch (error) {
      console.error('❌ Error distributing expense to orders:', error)
      // Don't throw - ledger entry is already created, just log the error
    }
  }

  const distributeIncomeToOrders = async (entryId: string, incomeAmount: number, partyName: string, incomeDate: string) => {
    try {
      console.log(`🔄 Distributing income ${incomeAmount} for party ${partyName} (ledger entry ${entryId})`)

      // Get all orders for this party
      const allOrders = await orderService.getAllOrders({ partyName })

      if (allOrders.length === 0) {
        console.warn(`No orders found for party ${partyName}`)
        return
      }

      console.log(`📦 Found ${allOrders.length} orders for party ${partyName}`)

      // Calculate outstanding amounts for each order (excluding payments from this ledger entry)
      // Only include orders where customer hasn't paid
      const ordersWithOutstanding = allOrders
        .map(order => {
          const existingPayments = order.customerPayments || []
          // Exclude payments from this ledger entry (in case we're updating)
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== entryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const sellingTotal = Number(order.total || 0)
          const remaining = Math.max(0, sellingTotal - totalPaid)

          // Create a temporary order object with payments excluding this ledger entry
          // to check if customer has already paid
          const tempOrder: Order = {
            ...order,
            customerPayments: paymentsExcludingThis
          }

          const isPaid = isCustomerPaid(tempOrder)
          const difference = sellingTotal - totalPaid
          const tolerance = sellingTotal - 250
          
          console.log(`  Order ${order.id} (${order.siteName || 'N/A'}): sellingTotal=${sellingTotal}, totalPaid=${totalPaid}, remaining=${remaining}, difference=${difference}, isPaid=${isPaid}, tolerance=${tolerance} (paid if >= ${tolerance})`)

          return { order, remaining, currentPayments: existingPayments, tempOrder, isPaid, difference, totalPaid, sellingTotal }
        })
        .filter(({ remaining, isPaid, order, totalPaid, sellingTotal }) => {
          // Filter out orders that are already paid (within 250 tolerance)
          // Only include unpaid or partially paid orders
          const shouldInclude = remaining > 0 && !isPaid
          if (!shouldInclude) {
            if (remaining <= 0) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining} <= 0 (sellingTotal=${sellingTotal}, totalPaid=${totalPaid})`)
            } else if (isPaid) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): marked as PAID (remaining=${remaining}, sellingTotal=${sellingTotal}, totalPaid=${totalPaid}, difference=${sellingTotal - totalPaid})`)
            }
          } else {
            console.log(`  ✅ Including order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining}, sellingTotal=${sellingTotal}, totalPaid=${totalPaid}`)
          }
          return shouldInclude
        })
        .sort((a, b) => {
          // Sort by date (oldest first), then by creation time
          const aDate = new Date(a.order.date).getTime()
          const bDate = new Date(b.order.date).getTime()
          if (aDate !== bDate) return aDate - bDate
          const aTime = safeGetTime(a.order.createdAt || a.order.updatedAt || a.order.date)
          const bTime = safeGetTime(b.order.createdAt || b.order.updatedAt || b.order.date)
          return aTime - bTime
        })

      console.log(`✅ Found ${ordersWithOutstanding.length} orders with outstanding customer payments`)

      if (ordersWithOutstanding.length === 0) {
        console.warn(`No orders with outstanding customer payments for party ${partyName}`)
        nativePopup.warning(
          'No Unpaid Orders',
          `No unpaid orders found for party "${partyName}". All orders are already paid or have no outstanding amount.`
        )
        return
      }

      // Calculate total outstanding across all unpaid orders
      const totalOutstanding = ordersWithOutstanding.reduce((sum, { remaining }) => sum + remaining, 0)
      console.log(`💰 Total outstanding across ${ordersWithOutstanding.length} unpaid orders: ${totalOutstanding}`)

      if (incomeAmount > totalOutstanding) {
        console.warn(`⚠️ Income amount (${incomeAmount}) exceeds total outstanding (${totalOutstanding})`)
      }

      let remainingIncome = incomeAmount
      const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = []

      // Distribute income across orders (oldest first, fill completely before next)
      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingIncome <= 0) break

        if (!order.id) {
          console.warn(`  ⚠️ Order missing ID, skipping`)
          continue
        }

        const paymentAmount = Math.min(remainingIncome, remaining)

        // Convert date to ISO string if needed
        let paymentDate = incomeDate
        if (paymentDate && !paymentDate.includes('T')) {
          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
        }

        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: paymentDate,
          note: `From ledger entry`,
          ledgerEntryId: entryId, // Track which ledger entry created this payment
        }

        // Remove any existing payments from this ledger entry first
        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== entryId)
        const updatedPayments = [...paymentsWithoutThisEntry, payment]

        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
        remainingIncome -= paymentAmount

        console.log(`  ✓ Adding customer payment of ${paymentAmount} to order ${order.id} (order remaining: ${remaining - paymentAmount}, income remaining: ${remainingIncome})`)
      }

      console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingIncome} remaining undistributed`)

      // Update orders with new payment distributions
      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
        await orderService.updateOrder(orderId, {
          customerPayments: updatedPayments,
        })
        console.log(`  ✅ Updated order ${orderId} with new customer payment distribution`)
      }

      // If there's remaining income that couldn't be distributed, log it and show warning
      if (remainingIncome > 0) {
        console.warn(`⚠️ Could not fully distribute income of ${incomeAmount}. Remaining undistributed: ${remainingIncome}`)
        // Show user-friendly warning
        nativePopup.warning(
          'Partial Distribution',
          `₹${incomeAmount.toLocaleString('en-IN')} was entered for party "${partyName}", but only ₹${(incomeAmount - remainingIncome).toLocaleString('en-IN')} could be distributed to unpaid orders. ₹${remainingIncome.toLocaleString('en-IN')} remains undistributed because all orders are already paid or there aren't enough unpaid orders.`
        )
      } else {
        console.log(`✅ Successfully distributed income ${incomeAmount} across orders`)
      }
    } catch (error) {
      console.error('❌ Error distributing income to orders:', error)
      // Don't throw - ledger entry is already created, just log the error
    }
  }

  const safeGetTime = (dateString: string | null | undefined): number => {
    if (!dateString) return 0
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const createPartyPaymentFromIncome = async (entryId: string, partyName: string, amount: number, paymentDate: string, note?: string) => {
    try {
      const db = getDb()
      if (!db) {
        throw new Error('Firebase is not configured.')
      }

      // Convert date to ISO string if needed
      let dateValue = paymentDate
      if (dateValue && !dateValue.includes('T')) {
        dateValue = new Date(dateValue + 'T00:00:00').toISOString()
      }

      const now = new Date().toISOString()
      const paymentData: any = {
        partyName,
        amount,
        date: dateValue,
        ledgerEntryId: entryId, // Link to ledger entry
        createdAt: now,
        updatedAt: now,
      }

      // Add note if provided
      if (note && note.trim()) {
        paymentData.note = note.trim()
      }

      // Create party payment directly without creating ledger entry (since we already created it)
      await addDoc(collection(db, 'partyPayments'), paymentData)
      console.log(`✅ Party payment created for ${partyName}: ${amount} (linked to ledger entry ${entryId})`)
    } catch (error) {
      console.error('Error creating party payment from income entry:', error)
      // Don't throw - ledger entry is already created, just log the error
    }
  }

  const updateLinkedPartyPayment = async (ledgerEntryId: string, amount: number, paymentDate: string, note?: string) => {
    try {
      const db = getDb()
      if (!db) {
        throw new Error('Firebase is not configured.')
      }

      // Find the party payment linked to this ledger entry
      const q = query(
        collection(db, 'partyPayments'),
        where('ledgerEntryId', '==', ledgerEntryId)
      )
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        console.warn(`No party payment found linked to ledger entry ${ledgerEntryId}`)
        return
      }

      // Convert date to ISO string if needed
      let dateValue = paymentDate
      if (dateValue && !dateValue.includes('T')) {
        dateValue = new Date(dateValue + 'T00:00:00').toISOString()
      }

      // Update all linked party payments (should only be one, but handle multiple just in case)
      const updatePromises = querySnapshot.docs.map(async (paymentDoc) => {
        const updateData: any = {
          amount,
          date: dateValue,
          updatedAt: new Date().toISOString(),
        }

        if (note !== undefined) {
          if (note && note.trim()) {
            updateData.note = note.trim()
          } else {
            updateData.note = null // Remove note if empty
          }
        }

        await updateDoc(doc(db, 'partyPayments', paymentDoc.id), updateData)
      })

      await Promise.all(updatePromises)
      console.log(`✅ Updated party payment linked to ledger entry ${ledgerEntryId}`)
    } catch (error) {
      console.error('Error updating linked party payment:', error)
      // Don't throw - ledger entry is already updated, just log the error
    }
  }

  const handleDeleteClick = (entryId: string) => {
    setEntryToDelete(entryId)
    setDeleteSheetOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return
    try {
      // Get the entry before deleting to check its type and supplier/party
      const entryToDeleteObj = entries.find(e => e.id === entryToDelete)

      // Before deleting ledger entry, clean up related data
      if (entryToDeleteObj) {
        // Delete linked party payment if it's an income entry
        if (entryToDeleteObj.type === 'credit' && entryToDeleteObj.partyName) {
          await deleteLinkedPartyPayment(entryToDelete)
        }

        // Revert expense distribution if it's an expense entry with supplier
        if (entryToDeleteObj.type === 'debit' && entryToDeleteObj.supplier) {
          await revertExpenseDistribution(entryToDelete, entryToDeleteObj.supplier)
        }
      }

      await ledgerService.remove(entryToDelete)
      // Entry will be removed from list automatically via realtime subscription
      setDeleteSheetOpen(false)
      setEntryToDelete(null)
    } catch (error: any) {
      // Error handling - could show error in bottom sheet or just log
      console.error('Failed to delete entry:', error)
      setDeleteSheetOpen(false)
      setEntryToDelete(null)
    }
  }

  const deleteLinkedPartyPayment = async (ledgerEntryId: string) => {
    try {
      const db = getDb()
      if (!db) {
        throw new Error('Firebase is not configured.')
      }

      // Find the party payment linked to this ledger entry
      const q = query(
        collection(db, 'partyPayments'),
        where('ledgerEntryId', '==', ledgerEntryId)
      )
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        // No linked party payment, nothing to delete
        return
      }

      // Delete all linked party payments (should only be one, but handle multiple just in case)
      const deletePromises = querySnapshot.docs.map(async (paymentDoc) => {
        await deleteDoc(doc(db, 'partyPayments', paymentDoc.id))
      })

      await Promise.all(deletePromises)
      console.log(`✅ Deleted party payment linked to ledger entry ${ledgerEntryId}`)
    } catch (error) {
      console.error('Error deleting linked party payment:', error)
      // Don't throw - we still want to delete the ledger entry even if party payment deletion fails
    }
  }

  const updateLinkedPartyPaymentPartyName = async (ledgerEntryId: string, newPartyName: string) => {
    try {
      const db = getDb()
      if (!db) {
        throw new Error('Firebase is not configured.')
      }

      // Find the party payment linked to this ledger entry
      const q = query(
        collection(db, 'partyPayments'),
        where('ledgerEntryId', '==', ledgerEntryId)
      )
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        console.warn(`No party payment found linked to ledger entry ${ledgerEntryId}`)
        return
      }

      // Update all linked party payments with new party name
      const updatePromises = querySnapshot.docs.map(async (paymentDoc) => {
        await updateDoc(doc(db, 'partyPayments', paymentDoc.id), {
          partyName: newPartyName,
          updatedAt: new Date().toISOString(),
        })
      })

      await Promise.all(updatePromises)
      console.log(`✅ Updated party name in payment linked to ledger entry ${ledgerEntryId}`)
    } catch (error) {
      console.error('Error updating party name in linked party payment:', error)
      // Don't throw - ledger entry is already updated, just log the error
    }
  }

  const revertExpenseDistribution = async (ledgerEntryId: string, supplier: string) => {
    try {
      // Get all orders for this supplier
      const allOrders = await orderService.getAllOrders({ supplier })

      // Find and remove partial payments that were created by this ledger entry
      for (const order of allOrders) {
        if (!order.id || !order.partialPayments) continue

        // Filter out payments that have this ledger entry ID
        const updatedPayments = order.partialPayments.filter(
          payment => payment.ledgerEntryId !== ledgerEntryId
        )

        // Only update if payments were actually removed
        if (updatedPayments.length < order.partialPayments.length) {
          await orderService.updateOrder(order.id, {
            partialPayments: updatedPayments,
          })
          console.log(`✅ Removed payments from order ${order.id} for ledger entry ${ledgerEntryId}`)
        }
      }

      console.log(`✅ Reverted expense distribution for ledger entry ${ledgerEntryId}`)
    } catch (error) {
      console.error('Error reverting expense distribution:', error)
      // Don't throw - ledger entry is already updated, just log the error
    }
  }

  const revertIncomeDistribution = async (ledgerEntryId: string, partyName: string) => {
    try {
      // Get all orders for this party
      const allOrders = await orderService.getAllOrders({ partyName })

      // Find and remove customer payments that were created by this ledger entry
      for (const order of allOrders) {
        if (!order.id || !order.customerPayments) continue

        // Filter out payments that have this ledger entry ID
        const updatedPayments = order.customerPayments.filter(
          payment => payment.ledgerEntryId !== ledgerEntryId
        )

        // Only update if payments were actually removed
        if (updatedPayments.length < order.customerPayments.length) {
          await orderService.updateOrder(order.id, {
            customerPayments: updatedPayments,
          })
          console.log(`✅ Removed customer payments from order ${order.id} for ledger entry ${ledgerEntryId}`)
        }
      }

      console.log(`✅ Reverted income distribution for ledger entry ${ledgerEntryId}`)
    } catch (error) {
      console.error('Error reverting income distribution:', error)
      // Don't throw - ledger entry is already updated, just log the error
    }
  }

  const renderEntry = (e: LedgerEntry) => {
    if (!e.id) return null
    return (
      <button
        key={e.id}
        onClick={(event) => {
          createRipple(event)
          handleEntryClick(e)
        }}
        className={`w-full rounded-lg mb-1 p-2 active:bg-gray-50 transition-all duration-150 touch-manipulation native-press border ${e.type === 'debit' && e.supplier ? 'bg-red-50/40 border-red-200' : 'bg-white border-gray-100'}`}
        style={{
          WebkitTapHighlightColor: 'transparent',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div className="flex flex-col w-full">
          <div className="flex items-center justify-between w-full mb-1">
            <span className={`font-bold ${e.type === 'credit' ? 'text-green-700' : 'text-red-700'}`} style={{ fontSize: '13px' }}>
              {formatIndianCurrency(e.amount)}
            </span>
            <span className="text-gray-500 flex-shrink-0" style={{ fontSize: '10px' }}>
              {format(new Date(e.date), 'dd MMM')}
            </span>
          </div>
          {e.note && (
            <div className="text-gray-600 text-left w-full mt-0.5" style={{ fontSize: '11px', lineHeight: '1.3' }}>
              {e.note}
            </div>
          )}
          {e.type === 'credit' && e.partyName && (
            <div className="mt-1">
              <span className="inline-block px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold">Party: {e.partyName}</span>
            </div>
          )}
          {e.type === 'debit' && e.supplier && (
            <div className="mt-1">
              <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold">Supplier: {e.supplier}</span>
            </div>
          )}
        </div>
      </button>
    )
  }

  const renderActivity = (activity: LedgerActivity) => {
    const getActivityColor = () => {
      switch (activity.activityType) {
        case 'created':
          return 'bg-green-50/50 border-l-3 border-green-500'
        case 'updated':
          return 'bg-blue-50/50 border-l-3 border-blue-500'
        case 'deleted':
          return 'bg-red-50/50 border-l-3 border-red-500'
        default:
          return 'bg-gray-50/50 border-l-3 border-gray-400'
      }
    }

    const getActivityIcon = () => {
      switch (activity.activityType) {
        case 'created':
          return <PlusCircle size={14} className="text-green-600" />
        case 'updated':
          return <Edit2 size={14} className="text-blue-600" />
        case 'deleted':
          return <X size={14} className="text-red-600" />
        default:
          return null
      }
    }

    const getActivityLabel = () => {
      switch (activity.activityType) {
        case 'created':
          return 'Created'
        case 'updated':
          return 'Updated'
        case 'deleted':
          return 'Deleted'
        default:
          return 'Activity'
      }
    }

    const formatTimestamp = (timestamp: string) => {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return format(date, 'dd MMM, hh:mm a')
    }

    // Collect all changes for compact display
    const changes: Array<{ label: string; old: any; new: any; formatter?: (val: any) => string }> = []

    if (activity.activityType === 'created') {
      if (activity.amount !== undefined && activity.amount !== null) {
        changes.push({ label: 'Amount', old: null, new: activity.amount, formatter: (val) => formatIndianCurrency(val || 0) })
      }
      if (activity.date) {
        changes.push({ label: 'Date', old: null, new: activity.date, formatter: (val) => val ? format(new Date(val), 'dd MMM yyyy') : 'N/A' })
      }
      if (activity.note) changes.push({ label: 'Note', old: null, new: activity.note })
      if (activity.supplier) changes.push({ label: 'Supplier', old: null, new: activity.supplier })
      if (activity.partyName) changes.push({ label: 'Party', old: null, new: activity.partyName })
    } else if (activity.activityType === 'deleted') {
      if (activity.previousAmount !== undefined && activity.previousAmount !== null) {
        changes.push({ label: 'Amount', old: activity.previousAmount, new: null, formatter: (val) => formatIndianCurrency(val || 0) })
      }
      if (activity.previousDate) {
        changes.push({ label: 'Date', old: activity.previousDate, new: null, formatter: (val) => val ? format(new Date(val), 'dd MMM yyyy') : 'N/A' })
      }
      if (activity.previousNote) changes.push({ label: 'Note', old: activity.previousNote, new: null })
      if (activity.previousSupplier) changes.push({ label: 'Supplier', old: activity.previousSupplier, new: null })
      if (activity.previousPartyName) changes.push({ label: 'Party', old: activity.previousPartyName, new: null })
    } else {
      // Updated - only show changed fields
      if (activity.previousAmount !== activity.amount && (activity.previousAmount !== undefined || activity.amount !== undefined)) {
        changes.push({ label: 'Amount', old: activity.previousAmount, new: activity.amount, formatter: (val) => formatIndianCurrency(val || 0) })
      }
      if (activity.previousDate !== activity.date && (activity.previousDate || activity.date)) {
        changes.push({ label: 'Date', old: activity.previousDate, new: activity.date, formatter: (val) => val ? format(new Date(val), 'dd MMM yyyy') : 'N/A' })
      }
      if (activity.previousNote !== activity.note && (activity.previousNote !== undefined || activity.note !== undefined)) {
        changes.push({ label: 'Note', old: activity.previousNote, new: activity.note })
      }
      if (activity.previousSupplier !== activity.supplier && (activity.previousSupplier !== undefined || activity.supplier !== undefined)) {
        changes.push({ label: 'Supplier', old: activity.previousSupplier, new: activity.supplier })
      }
      if (activity.previousPartyName !== activity.partyName && (activity.previousPartyName !== undefined || activity.partyName !== undefined)) {
        changes.push({ label: 'Party', old: activity.previousPartyName, new: activity.partyName })
      }
    }

    return (
      <div
        key={activity.id}
        className={`rounded-lg border-l-3 ${getActivityColor()} transition-all duration-150 hover:shadow-sm`}
        style={{
          borderLeftWidth: '3px',
        }}
      >
        <div className="p-2.5">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="flex-shrink-0">
                {getActivityIcon()}
              </div>
              <span className="font-semibold text-gray-900 text-xs">
                {getActivityLabel()}
              </span>
              {activity.type && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${activity.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                  {activity.type === 'credit' ? 'Income' : 'Expense'}
                </span>
              )}
            </div>
            <span className="text-gray-500 text-[10px] flex-shrink-0 ml-2">
              {formatTimestamp(activity.timestamp)}
            </span>
          </div>

          {/* Changes - Compact inline display */}
          {changes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {changes.map((change, idx) => (
                <div key={idx} className="flex items-center gap-1 text-[10px]">
                  <span className="text-gray-500 font-medium">{change.label}:</span>
                  {activity.activityType === 'created' ? (
                    <span className="text-gray-800 font-semibold">
                      {change.formatter ? change.formatter(change.new) : String(change.new)}
                    </span>
                  ) : activity.activityType === 'deleted' ? (
                    <span className="text-gray-600 line-through">
                      {change.formatter ? change.formatter(change.old) : String(change.old)}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      {change.old !== undefined && change.old !== null && change.old !== '' && (
                        <>
                          <span className="text-red-600 line-through">
                            {change.formatter ? change.formatter(change.old) : String(change.old)}
                          </span>
                          <span className="text-gray-400">→</span>
                        </>
                      )}
                      {change.new !== undefined && change.new !== null && change.new !== '' ? (
                        <span className="text-green-600 font-semibold">
                          {change.formatter ? change.formatter(change.new) : String(change.new)}
                        </span>
                      ) : change.old !== undefined && (
                        <span className="text-gray-400 italic">removed</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // If wizard is open, show only the wizard (no drawer/overlay)
  if (drawerOpen) {
    return (
      <LedgerEntryWizard
        entry={editingEntry || null}
        type={drawerType}
        onClose={() => {
          setDrawerOpen(false)
          setEditingEntry(null)
        }}
        onSave={handleSaveEntry}
        onDelete={handleDeleteClick}
        onDeleteConfirm={async (entryId: string) => {
          try {
            // Get the entry before deleting to check its type and supplier/party
            const entryToDeleteObj = entries.find(e => e.id === entryId)

            // Before deleting ledger entry, clean up related data
            if (entryToDeleteObj) {
              // Revert income distribution if it's an income entry with party name
              if (entryToDeleteObj.type === 'credit' && entryToDeleteObj.partyName) {
                await revertIncomeDistribution(entryId, entryToDeleteObj.partyName)
              }

              // Revert expense distribution if it's an expense entry with supplier
              if (entryToDeleteObj.type === 'debit' && entryToDeleteObj.supplier) {
                await revertExpenseDistribution(entryId, entryToDeleteObj.supplier)
              }
            }

            await ledgerService.remove(entryId)
            // Close wizard after successful deletion
            setDrawerOpen(false)
            setEditingEntry(null)
          } catch (error: any) {
            console.error('Failed to delete entry:', error)
            throw error
          }
        }}
      />
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
      <div className="bg-primary-600 text-white p-2 pt-safe sticky top-0 z-40" style={{ flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Wallet size={18} />
            <h1 className="text-lg font-bold truncate">Ledger</h1>
          </div>
          {activeTab === 'activity' && (
            <button
              onClick={(e) => {
                createRipple(e)
                setShowDateFilter(!showDateFilter)
              }}
              className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg active:bg-white/30 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Calendar size={16} />
            </button>
          )}
        </div>
        {activeTab === 'entries' && (
          <div className="bg-white rounded-lg p-2 text-gray-800 flex items-center justify-between">
            <span className="font-medium" style={{ fontSize: '12px' }}>Balance</span>
            <span className={`font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`} style={{ fontSize: '12px' }}>
              {formatIndianCurrency(Math.abs(balance))} {balance >= 0 ? '' : '(Dr)'}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={(e) => {
              createRipple(e)
              setActiveTab('entries')
            }}
            className={`flex-1 py-2 px-3 whitespace-nowrap rounded-lg font-medium transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5 ${activeTab === 'entries'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'bg-white/20 text-white/80 active:bg-white/30'
              }`}
            style={{ fontSize: '13px', WebkitTapHighlightColor: 'transparent' }}
          >
            <List size={14} />
            Entries
          </button>
          <button
            onClick={(e) => {
              createRipple(e)
              setActiveTab('timeline')
            }}
            className={`flex-1 py-2 px-3 whitespace-nowrap rounded-lg font-medium transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5 ${activeTab === 'timeline'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'bg-white/20 text-white/80 active:bg-white/30'
              }`}
            style={{ fontSize: '13px', WebkitTapHighlightColor: 'transparent' }}
          >
            <Activity size={14} />
            Timeline
          </button>
          <button
            onClick={(e) => {
              createRipple(e)
              setActiveTab('activity')
            }}
            className={`flex-1 py-2 px-3 whitespace-nowrap rounded-lg font-medium transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5 ${activeTab === 'activity'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'bg-white/20 text-white/80 active:bg-white/30'
              }`}
            style={{ fontSize: '13px', WebkitTapHighlightColor: 'transparent' }}
          >
            <History size={14} />
            Log
          </button>
          <button
            onClick={(e) => {
              createRipple(e)
              setActiveTab('investment')
            }}
            className={`flex-1 py-2 px-3 whitespace-nowrap rounded-lg font-medium transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5 ${activeTab === 'investment'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'bg-white/20 text-white/80 active:bg-white/30'
              }`}
            style={{ fontSize: '13px', WebkitTapHighlightColor: 'transparent' }}
          >
            <Wallet size={14} />
            Inv.
          </button>
        </div>

        {/* Date Filter */}
        {showDateFilter && activeTab === 'activity' && (
          <div className="mt-2 bg-white/95 backdrop-blur-xl rounded-lg p-2 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-800 font-medium" style={{ fontSize: '12px' }}>Date Range</span>
              <button
                onClick={(e) => {
                  createRipple(e)
                  setStartDate('')
                  setEndDate('')
                }}
                className="text-primary-600 text-xs font-medium active:opacity-70 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setInvestmentMode('add')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'add' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Add Investment
              </button>
              <button
                type="button"
                onClick={() => setInvestmentMode('reduce')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'reduce' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Reduce Amount
              </button>
              <button
                type="button"
                onClick={() => setInvestmentMode('set')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'set' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Set Exact Value
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Area - Fixed height, fits between header and buttons */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '9.25rem' // NavBar (~4.75rem) + Buttons bar (~4rem) + spacing
      }}>
        {activeTab === 'entries' ? (
          loading ? (
            <div className="flex-1 flex items-center justify-center">
              <TruckLoading size={100} />
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-1.5 p-1.5" style={{ minHeight: 0 }}>
              {/* Income Column */}
              <div className="bg-green-50 rounded-lg p-1.5 border border-green-200 flex flex-col" style={{ minHeight: 0 }}>
                <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                  <h2 className="font-semibold text-green-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                    <PlusCircle size={14} />
                    Income
                  </h2>
                </div>
                <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-green-300 flex-shrink-0">
                  <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                  <div className="font-bold text-green-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalIncome)}</div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                  {incomeEntries.length === 0 ? (
                    <div className="text-center text-gray-400 py-4" style={{ fontSize: '11px' }}>No entries</div>
                  ) : (
                    incomeEntries.map(renderEntry)
                  )}
                </div>
              </div>

              {/* Expenses Column */}
              <div className="bg-red-50 rounded-lg p-1.5 border border-red-200 flex flex-col" style={{ minHeight: 0 }}>
                <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                  <h2 className="font-semibold text-red-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                    <MinusCircle size={14} />
                    Expenses
                  </h2>
                </div>
                <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-red-300 flex-shrink-0">
                  <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                  <div className="font-bold text-red-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalExpenses)}</div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                  {expenseEntries.length === 0 ? (
                    <div className="text-center text-gray-400 py-4" style={{ fontSize: '11px' }}>No entries</div>
                  ) : (
                    expenseEntries.map(renderEntry)
                  )}
                </div>
              </div>
            </div>
          )
        ) : activeTab === 'timeline' ? (
          <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {loading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <TruckLoading size={100} />
              </div>
            ) : (
              <LedgerTimelineView entries={entries} investment={investment} />
            )}
          </div>
        ) : activeTab === 'investment' ? (
          /* Investment Tab */
          <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Current Investment Card */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Wallet size={100} />
              </div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                      <Wallet size={20} className="text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Current Investment</h3>
                  </div>
                  <button
                    onClick={() => setShowInvestmentDrawer(true)}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors backdrop-blur-sm"
                  >
                    <Edit2 size={18} className="text-white" />
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-amber-100 mb-1">Total Capital Invested</p>
                  <p className="text-3xl font-bold">
                    {investment ? formatIndianCurrency(investment.amount) : formatIndianCurrency(0)}
                  </p>
                </div>

                {investment && (
                  <div className="space-y-2 text-sm text-amber-50">
                    <div className="flex justify-between border-b border-white/10 pb-2">
                      <span>Date</span>
                      <span className="font-medium">{format(new Date(investment.date), 'dd MMM yyyy')}</span>
                    </div>
                    {investment.note && (
                      <div className="flex justify-between border-b border-white/10 pb-2">
                        <span>Note</span>
                        <span className="font-medium">{investment.note}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      <span>Last Updated</span>
                      <span className="font-medium">
                        {investment.updatedAt
                          ? format(new Date(investment.updatedAt), 'dd MMM yyyy HH:mm')
                          : format(new Date(investment.createdAt || investment.date), 'dd MMM yyyy HH:mm')
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Investment History */}
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <History size={18} className="text-gray-500" />
                History
              </h3>

              <div className="space-y-3">
                {investmentHistory.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-xl border border-gray-100">
                    No history available
                  </div>
                ) : (
                  investmentHistory.map((activity) => (
                    <div key={activity.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${activity.activityType === 'created' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                            {activity.activityType === 'created' ? <Plus size={14} /> : <Edit2 size={14} />}
                          </div>
                          <span className="font-medium text-gray-900 text-sm capitalize">
                            Investment {activity.activityType}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {format(new Date(activity.timestamp), 'dd MMM HH:mm')}
                        </span>
                      </div>

                      <div className="pl-9 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Amount</span>
                          <div className="flex items-center gap-2">
                            {activity.previousAmount !== undefined && activity.previousAmount !== activity.amount && (
                              <span className="text-gray-400 line-through text-xs">
                                {formatIndianCurrency(activity.previousAmount)}
                              </span>
                            )}
                            <span className="font-bold text-gray-900">
                              {formatIndianCurrency(activity.amount)}
                            </span>
                          </div>
                        </div>

                        {(activity.previousDate !== undefined && activity.previousDate !== activity.date) && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Date Changed</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 line-through">
                                {format(new Date(activity.previousDate), 'dd MMM yyyy')}
                              </span>
                              <span>→</span>
                              <span className="text-gray-700">
                                {format(new Date(activity.date), 'dd MMM yyyy')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Activity Log */
          <div className="flex-1 overflow-y-auto p-1.5" style={{ WebkitOverflowScrolling: 'touch' }}>
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-12">
                <TruckLoading size={80} />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center text-gray-400 py-12" style={{ fontSize: '13px' }}>
                No activity logs found
                {(startDate || endDate) && (
                  <div className="mt-2 text-xs text-gray-500">
                    Try adjusting the date range
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {activities.map((activity) => renderActivity(activity))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Buttons Bar - Floating at bottom, above NavBar - Only show on entries tab */}
      {activeTab === 'entries' && (
        <div
          className="fixed left-0 right-0 z-30 flex items-end justify-center"
          style={{
            bottom: '5.25rem',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
            pointerEvents: 'none',
          }}
        >
          <div
            className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl w-full"
            style={{
              padding: '0.75rem',
              boxShadow: '0 2px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)',
              pointerEvents: 'auto',
            }}
          >
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  createRipple(e)
                  handleAddEntry('credit')
                }}
                className="flex-1 bg-green-600 text-white rounded-xl active:bg-green-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation font-medium native-press"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  fontSize: '14px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                title="Add Income"
                aria-label="Add Income"
              >
                <Plus size={18} />
                <span>Add Income</span>
              </button>
              <button
                onClick={(e) => {
                  createRipple(e)
                  handleAddEntry('debit')
                }}
                className="flex-1 bg-red-600 text-white rounded-xl active:bg-red-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation font-medium native-press"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  fontSize: '14px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                title="Add Expense"
                aria-label="Add Expense"
              >
                <Plus size={18} />
                <span>Add Expense</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Bottom Sheet */}
      <BottomSheet
        isOpen={deleteSheetOpen}
        onClose={() => {
          setDeleteSheetOpen(false)
          setEntryToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Entry?"
        message="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />

      {/* Investment Drawer */}
      <BottomSheet
        isOpen={showInvestmentDrawer}
        onClose={() => setShowInvestmentDrawer(false)}
        title="Update Investment"
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={handleSaveInvestment}
        confirmColor="amber"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Investment Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
              <input
                type="number"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                placeholder="0"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setInvestmentMode('add')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'add' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Add Investment
              </button>
              <button
                type="button"
                onClick={() => setInvestmentMode('reduce')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'reduce' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Reduce Amount
              </button>
              <button
                type="button"
                onClick={() => setInvestmentMode('set')}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${investmentMode === 'set' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-800'} active:opacity-80`}
              >
                Set Exact Value
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={investmentDate}
              onChange={(e) => setInvestmentDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (Optional)
            </label>
            <textarea
              value={investmentNote}
              onChange={(e) => setInvestmentNote(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
              rows={3}
              placeholder="Add a note about this investment..."
            />
          </div>
        </div>
      </BottomSheet>

      <NavBar />
    </div>
  )
}
