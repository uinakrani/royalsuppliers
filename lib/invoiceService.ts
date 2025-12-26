import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  deleteField
} from 'firebase/firestore'
import { getDb } from './firebase'
import { Invoice, InvoiceFilters, InvoicePayment } from '@/types/invoice'
import { orderService } from './orderService'
import { offlineStorage, STORES } from './offlineStorage'
import { localStorageCache, CACHE_KEYS } from './localStorageCache'
import { Order } from '@/types/order'
import { format } from 'date-fns'
import { matchesActiveWorkspace, getActiveWorkspaceId, WORKSPACE_DEFAULTS } from './workspaceSession'

const INVOICES_COLLECTION = 'invoices'
const generateLocalInvoiceId = () => `local-invoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Generate invoice number: ROYAL + short timestamp
const generateInvoiceNumber = (): string => {
  const now = new Date()
  const timestamp = format(now, 'yyMMddHHmm')
  return `ROYAL${timestamp}`
}

export const invoiceService = {
  // Create invoice from orders
  async createInvoice(orderIds: string[], options?: { skipQueue?: boolean }): Promise<string> {
    const db = getDb()
    const localId = generateLocalInvoiceId()
    const createdAt = new Date().toISOString()
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week from now
    const workspaceId = getActiveWorkspaceId()

    console.log('Creating invoice for orderIds:', orderIds, 'in workspace:', workspaceId)

    try {
      // Fetch all orders
      const orders: Order[] = []
      for (const orderId of orderIds) {
        const order = await orderService.getOrderById(orderId)
        if (order) {
          orders.push(order)
        }
      }

      if (orders.length === 0) {
        throw new Error('No valid orders found')
      }

      // Note: Allow creating multiple invoices for the same orders
      // Business logic allows splitting orders across different invoices

      // Sort orders by date (oldest first) and get sorted orderIds
      const sortedOrders = orders.sort((a, b) => {
        const aDate = new Date(a.date).getTime()
        const bDate = new Date(b.date).getTime()
        return aDate - bDate
      })
      const sortedOrderIds = sortedOrders.map(order => order.id!)

      // Calculate total amount
      const totalAmount = orders.reduce((sum, order) => sum + order.total, 0)

      // Get party name and site name from first order
      const partyName = orders[0].partyName
      const siteName = orders[0].siteName

      // Create invoice payload with sorted orderIds
      const invoiceData: Invoice = {
        id: localId,
        invoiceNumber: generateInvoiceNumber(),
        orderIds: sortedOrderIds,
        totalAmount,
        paidAmount: 0,
        partialPayments: [],
        createdAt,
        dueDate,
        paid: false,
        overdue: false,
        partyName,
        siteName,
        archived: false,
        workspaceId,
      }

      console.log('Invoice data:', invoiceData)

      const canWriteRemote = offlineStorage.isOnline() && db

      if (canWriteRemote) {
        try {
          // Omit id field for Firestore - it will be set automatically
          const { id: _, ...invoiceDataForFirestore } = invoiceData
          const docRef = await addDoc(collection(db, INVOICES_COLLECTION), invoiceDataForFirestore)

          const remoteInvoice: Invoice = { ...invoiceData, id: docRef.id }
          await offlineStorage.put(STORES.INVOICES, remoteInvoice)
          // Also update localStorage cache
          const cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES) || []
          const updatedCache = cachedInvoices.filter(i => i.id !== remoteInvoice.id).concat(remoteInvoice)
          localStorageCache.set(CACHE_KEYS.INVOICES, updatedCache)

          // Update orders with authoritative invoice id
          for (const orderId of orderIds) {
            const order = await orderService.getOrderById(orderId)
            if (order) {
              await orderService.updateOrder(orderId, {
                invoiced: true,
                invoiceId: docRef.id
              } as any, { skipQueue: true })
            }
          }

          console.log('✅ Invoice created online with ID:', docRef.id)
          return docRef.id
        } catch (error) {
          console.error('Failed to create invoice online, falling back to offline queue:', error)
        }
      }

      // Offline or remote failure - cache locally and queue for sync
      console.log('Storing invoice offline with localId:', localId)
      await offlineStorage.put(STORES.INVOICES, invoiceData)
      // Also update localStorage cache
      const cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES) || []
      const updatedCache = cachedInvoices.filter(i => i.id !== invoiceData.id).concat(invoiceData)
      localStorageCache.set(CACHE_KEYS.INVOICES, updatedCache)

      for (const orderId of orderIds) {
        const order = await orderService.getOrderById(orderId)
        if (order) {
          await orderService.updateOrder(orderId, {
            invoiced: true,
            invoiceId: localId
          } as any)
        }
      }

      if (!options?.skipQueue) {
        await offlineStorage.queueForSync({
          id: localId,
          collection: STORES.INVOICES,
          operation: 'create',
          data: invoiceData,
          localId,
          lastModifiedAt: createdAt
        })
      }

      console.log('✅ Invoice created offline with ID:', localId)
      return localId
    } catch (error: any) {
      console.error('❌ Firestore error creating invoice:', error)
      throw new Error(`Failed to create invoice: ${error.message || 'Unknown error'}`)
    }
  },

  // Get all invoices (online-first with offline fallback)
  async getAllInvoices(
    filters?: InvoiceFilters,
    options?: { onRemoteUpdate?: (invoices: Invoice[], source: 'remote' | 'local') => void, preferRemote?: boolean, skipCache?: boolean }
  ): Promise<Invoice[]> {
    try {
      const activeWorkspaceId = getActiveWorkspaceId()
      const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id
      const isOnline = offlineStorage.isOnline()
      let invoicesToProcess: Invoice[] = []
      let fetchedFrom: 'remote' | 'local' | 'none' = 'none'

      if (isOnline && (options?.preferRemote !== false)) { // Prioritize remote if online and not explicitly told to prefer local
        try {
          const remoteInvoices = await this.fetchAllInvoicesFromFirestore()
          invoicesToProcess = remoteInvoices.map(this.processInvoiceData).filter(matchesActiveWorkspace)
          fetchedFrom = 'remote'
          localStorageCache.set(CACHE_KEYS.INVOICES, remoteInvoices)
          options?.onRemoteUpdate?.(this.applyInvoiceFilters(invoicesToProcess, filters), 'remote')
        } catch (error) {
          console.warn('Failed to fetch invoices from Firestore, falling back to cache:', error)
          // Fallback to cache if remote fetch fails
          const cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES)
          if (cachedInvoices && cachedInvoices.length > 0) {
            invoicesToProcess = cachedInvoices.map(this.processInvoiceData).filter(matchesActiveWorkspace)
            fetchedFrom = 'local'
            options?.onRemoteUpdate?.(this.applyInvoiceFilters(invoicesToProcess, filters), 'local')
          } else {
            // No cache either, get from offline storage
            const localInvoices = await offlineStorage.getAll(STORES.INVOICES)
            const scopedLocal = localInvoices.map((inv) =>
              inv.workspaceId ? inv : { ...(inv as Invoice), workspaceId: fallbackWorkspaceId }
            )
            invoicesToProcess = scopedLocal.map(this.processInvoiceData).filter(matchesActiveWorkspace)
            fetchedFrom = 'local'
            options?.onRemoteUpdate?.(this.applyInvoiceFilters(invoicesToProcess, filters), 'local')
          }
        }
      } else {
        // Offline or explicitly prefer local/skip remote - try cache first
        let cachedInvoices: Invoice[] | null = null
        if (!options?.skipCache) {
          cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES)
        }

        if (cachedInvoices && cachedInvoices.length > 0) {
          invoicesToProcess = cachedInvoices.map(this.processInvoiceData).filter(matchesActiveWorkspace)
          fetchedFrom = 'local'
          options?.onRemoteUpdate?.(this.applyInvoiceFilters(invoicesToProcess, filters), 'local')
        } else {
          // No cache available, get from offline storage as fallback
          const localInvoices = await offlineStorage.getAll(STORES.INVOICES)
          const scopedLocal = localInvoices.map((inv) =>
            inv.workspaceId ? inv : { ...(inv as Invoice), workspaceId: fallbackWorkspaceId }
          )
          invoicesToProcess = scopedLocal.map(this.processInvoiceData).filter(matchesActiveWorkspace)
          fetchedFrom = 'local'
          options?.onRemoteUpdate?.(this.applyInvoiceFilters(invoicesToProcess, filters), 'local')
        }

        // If offline and data came from local/cache, still attempt a background fetch if online status changes later
        if (!isOnline && fetchedFrom === 'local') {
          offlineStorage.onOnlineStatusChange((online) => {
            if (online) {
              this.fetchAllInvoicesFromFirestore()
                .then(async (allInvoices) => {
                  localStorageCache.set(CACHE_KEYS.INVOICES, allInvoices)
                  const filteredRemote = this.applyInvoiceFilters(allInvoices.filter(matchesActiveWorkspace), filters)
                  options?.onRemoteUpdate?.(filteredRemote, 'remote')
                })
                .catch((error) => {
                  console.warn('Background fetch failed for invoices after online status change:', error)
                })
            }
          })
        }
      }

      // Filter and return the immediately available data
      return this.applyInvoiceFilters(invoicesToProcess, filters)

    } catch (error) {
      console.error('Error in invoiceService.getAllInvoices():', error)
      return []
    }
  },

  // Fetch all invoices from Firestore (used for background refresh)
  async fetchAllInvoicesFromFirestore(): Promise<Invoice[]> {
    const db = getDb()
    if (!db) return []

    const activeWorkspaceId = getActiveWorkspaceId()
    const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id
    const q = query(collection(db, INVOICES_COLLECTION), orderBy('createdAt', 'desc'))
    const querySnapshot = await getDocs(q)
    const invoices: Invoice[] = []

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      const invoiceData = this.processInvoiceData({
        id: docSnap.id,
        ...data,
      } as Invoice)

      if (!invoiceData.workspaceId) {
        invoiceData.workspaceId = fallbackWorkspaceId
        try {
          const ref = doc(db, INVOICES_COLLECTION, docSnap.id)
          updateDoc(ref, { workspaceId: fallbackWorkspaceId }).catch(() => {})
        } catch {
          // ignore best-effort tag
        }
      }

      if (!matchesActiveWorkspace(invoiceData)) {
        return
      }

      invoices.push(invoiceData)

      // Cache in local storage
      offlineStorage.put(STORES.INVOICES, invoiceData)
      // Also cache in localStorage for faster access
      const cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES) || []
      const updatedCache = cachedInvoices.filter(i => i.id !== invoiceData.id).concat(invoiceData)
      localStorageCache.set(CACHE_KEYS.INVOICES, updatedCache)
    })

    return invoices
  },

  // Apply filters to invoice data (including overdue)
  applyInvoiceFilters(invoices: Invoice[], filters?: InvoiceFilters): Invoice[] {
    if (!filters) return invoices

    let filtered = invoices

    // Apply filters
    if (filters.partyName) {
      filtered = filtered.filter(invoice => invoice.partyName === filters.partyName)
    }
    if (filters.paid !== undefined) {
      filtered = filtered.filter(invoice => invoice.paid === filters.paid)
    }
    if (filters.overdue !== undefined) {
      filtered = filtered.filter(invoice => invoice.overdue === filters.overdue)
    }

    // Apply date range filter
    if (filters.startDate || filters.endDate) {
      filtered = filtered.filter((invoice) => {
        const invoiceDate = new Date(invoice.createdAt)
        if (filters.startDate && invoiceDate < new Date(filters.startDate)) {
          return false
        }
        if (filters.endDate && invoiceDate > new Date(filters.endDate)) {
          return false
        }
        return true
      })
    }

    // Sort by createdAt descending
    return filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  // Process invoice data to calculate overdue status
  processInvoiceData(invoice: any): Invoice {
    const processed = { ...invoice } as Invoice

    // Calculate overdue status
    if (!processed.paid) {
      const dueDate = new Date(processed.dueDate)
      const now = new Date()
      processed.overdue = now > dueDate
    } else {
      processed.overdue = false
    }

    return processed
  },

  // Background sync method that doesn't block UI
  async syncInvoicesWithFirestore(): Promise<void> {
    if (!offlineStorage.isOnline()) return

    const db = getDb()
    if (!db) return

    try {
      const q = query(collection(db, INVOICES_COLLECTION), orderBy('createdAt', 'desc'))
      const querySnapshot = await getDocs(q)

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const invoiceData = this.processInvoiceData({
          id: doc.id,
          ...data,
        } as Invoice)

        // Update local storage with fresh data (async, doesn't block)
        offlineStorage.put(STORES.INVOICES, invoiceData)
      })

      console.log('Background sync completed for invoices')
    } catch (error) {
      console.error('Background sync failed for invoices:', error)
    }
  },

  // Get invoice by ID
  async getInvoiceById(id: string): Promise<Invoice | null> {
    const invoices = await this.getAllInvoices()
    return invoices.find((inv) => inv.id === id) || null
  },

  // Update invoice fields (online-first with offline queue)
  async updateInvoice(id: string, data: Partial<Invoice>, options?: { skipQueue?: boolean }): Promise<void> {
    const db = getDb()
    const existing = await this.getInvoiceById(id)

    if (!existing) {
      throw new Error('Invoice not found')
    }

    // Avoid accidentally writing the id field
    const { id: _omitId, ...updateData } = data as any
    const updatedAt = new Date().toISOString()

    const merged: Invoice = {
      ...existing,
      ...updateData,
      id,
      updatedAt,
    }

    const canUpdateRemote = offlineStorage.isOnline() && db

    if (canUpdateRemote) {
      try {
        const invoiceRef = doc(db, INVOICES_COLLECTION, id)
        await updateDoc(invoiceRef, {
          ...updateData,
          updatedAt,
        })
        console.log('✅ Invoice updated online')
        await offlineStorage.put(STORES.INVOICES, merged)
        // Also update localStorage cache
        const cachedInvoices = localStorageCache.get<Invoice[]>(CACHE_KEYS.INVOICES) || []
        const updatedCache = cachedInvoices.filter(i => i.id !== merged.id).concat(merged)
        localStorageCache.set(CACHE_KEYS.INVOICES, updatedCache)
        return
      } catch (error: any) {
        console.error('Error updating invoice online, falling back to offline queue:', error)
      }
    }

    // Offline or remote failure - cache locally and queue for sync
    await offlineStorage.put(STORES.INVOICES, merged)

    if (!options?.skipQueue) {
      await offlineStorage.queueForSync({
        id,
        collection: STORES.INVOICES,
        operation: 'update',
        data: merged,
        lastModifiedAt: updatedAt
      })
    }
  },

  // Add partial payment to invoice
  async addPayment(invoiceId: string, amount: number, note?: string): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    
    const currentPaid = invoice.paidAmount || 0
    const newPaid = currentPaid + amount
    const isFullyPaid = newPaid >= invoice.totalAmount
    
    const paymentDate = new Date().toISOString()
    const newPayment: InvoicePayment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount,
      date: paymentDate,
      createdAt: paymentDate,
      // note will be conditionally appended
    }
    if (note && note.trim()) {
      ;(newPayment as any).note = note.trim()
    }
    
    const updatedPayments = [...(invoice.partialPayments || []), newPayment]
    
    await this.updateInvoice(invoiceId, {
      paidAmount: newPaid,
      partialPayments: updatedPayments,
      paid: isFullyPaid,
      overdue: false, // Reset overdue when payment is made
    })
    
    // If fully paid, archive the orders
    if (isFullyPaid && !invoice.archived) {
      await this.archiveOrders(invoiceId)
    }
    
    // NOTE: Ledger entries should only be created manually by the user
    // No automatic ledger entry creation
    
    console.log('✅ Payment added successfully')
  },

  // Remove a partial payment
  async removePayment(invoiceId: string, paymentId: string): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    
    const existingPayments = invoice.partialPayments || []
    const paymentToRemove = existingPayments.find(p => p.id === paymentId)
    
    if (!paymentToRemove) {
      throw new Error('Payment record not found')
    }
    
    const updatedPayments = existingPayments.filter(p => p.id !== paymentId)
    const newPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    const isFullyPaid = newPaid >= invoice.totalAmount
    
    await this.updateInvoice(invoiceId, {
      paidAmount: newPaid,
      partialPayments: updatedPayments,
      paid: isFullyPaid,
    })
    
    // If no longer fully paid, unarchive orders
    if (!isFullyPaid && invoice.archived) {
      await this.unarchiveOrders(invoiceId)
    }
    
    console.log('✅ Payment removed successfully')
  },

  // Archive orders when invoice is fully paid
  async archiveOrders(invoiceId: string): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    
    try {
      // Mark all orders as archived
      for (const orderId of invoice.orderIds) {
        await orderService.updateOrder(orderId, { archived: true } as any)
      }
      
      // Mark invoice as archived
      const db = getDb()
      if (db) {
        const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId)
        await updateDoc(invoiceRef, {
          archived: true,
          updatedAt: new Date().toISOString(),
        })
      }
      
      console.log('✅ Orders archived successfully')
    } catch (error: any) {
      console.error('Error archiving orders:', error)
      throw new Error(`Failed to archive orders: ${error.message || 'Unknown error'}`)
    }
  },

  // Unarchive orders when invoice payment is removed
  async unarchiveOrders(invoiceId: string): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    
    try {
      // Unmark all orders as archived
      for (const orderId of invoice.orderIds) {
        await orderService.updateOrder(orderId, { archived: false } as any)
      }
      
      // Mark invoice as not archived
      const db = getDb()
      if (db) {
        const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId)
        await updateDoc(invoiceRef, {
          archived: false,
          updatedAt: new Date().toISOString(),
        })
      }
      
      console.log('✅ Orders unarchived successfully')
    } catch (error: any) {
      console.error('Error unarchiving orders:', error)
      throw new Error(`Failed to unarchive orders: ${error.message || 'Unknown error'}`)
    }
  },

  // Delete invoice (online-first with offline queue)
  async deleteInvoice(id: string, options?: { skipQueue?: boolean }): Promise<void> {
    const db = getDb()
    const now = new Date().toISOString()
    const invoice = await this.getInvoiceById(id)

    if (!invoice) {
      throw new Error('Invoice not found')
    }

    const canDeleteRemote = offlineStorage.isOnline() && db

    if (canDeleteRemote) {
      try {
        // Unmark orders as invoiced online
        for (const orderId of invoice.orderIds) {
          const orderRef = doc(db, 'orders', orderId)
          await updateDoc(orderRef, {
            invoiced: false,
            invoiceId: deleteField(),
            updatedAt: now,
          })
        }
      
        await deleteDoc(doc(db, INVOICES_COLLECTION, id))
        console.log('✅ Invoice deleted successfully')
        await offlineStorage.delete(STORES.INVOICES, id)
        return
      } catch (error: any) {
        console.error('Error deleting invoice online, queueing:', error)
      }
    }

    // Offline or remote failure - update cache and queue deletion
    await offlineStorage.delete(STORES.INVOICES, id)

    for (const orderId of invoice.orderIds) {
      await orderService.updateOrder(orderId, { invoiced: false, invoiceId: undefined } as any)
    }
    
    if (!options?.skipQueue) {
      await offlineStorage.queueForSync({
        id,
        collection: STORES.INVOICES,
        operation: 'delete',
        data: { id },
        lastModifiedAt: now
      })
    }
  },

  // Get unique party names from invoices
  async getUniquePartyNames(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      return []
    }
    
    try {
      const workspaceId = getActiveWorkspaceId()
      const includeLegacy = workspaceId === WORKSPACE_DEFAULTS.id
      const q = includeLegacy
        ? query(collection(db, INVOICES_COLLECTION))
        : query(collection(db, INVOICES_COLLECTION), where('workspaceId', '==', workspaceId))
      const querySnapshot = await getDocs(q)
      const partyNames = new Set<string>()
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const belongsToWorkspace = includeLegacy
          ? matchesActiveWorkspace({ workspaceId: (data as any).workspaceId })
          : true
        if (!belongsToWorkspace) return
        if (data.partyName && typeof data.partyName === 'string') {
          partyNames.add(data.partyName.trim())
        }
      })
      
      return Array.from(partyNames).sort()
    } catch (error: any) {
      console.error('Error fetching party names:', error)
      return []
    }
  },
}

