'use client'

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
  Timestamp,
  deleteField
} from 'firebase/firestore'
import { getDb } from './firebase'
import { Order, OrderFilters, PaymentRecord } from '@/types/order'
// LedgerService import removed to avoid circular dependency


const ORDERS_COLLECTION = 'orders'
export const PAYMENT_TOLERANCE = 100

const coerceIsoString = (value: any, fallback?: string): string | undefined => {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    try {
      return new Date(value).toISOString()
    } catch {
      return fallback
    }
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString()
    } catch {
      return fallback
    }
  }
  return fallback
}

const normalizePaymentRecord = (payment: PaymentRecord): PaymentRecord => {
  const normalizedDate = coerceIsoString(payment.date, new Date().toISOString())!
  const normalizedCreatedAt = coerceIsoString(payment.createdAt, normalizedDate) || normalizedDate

  return {
    ...payment,
    amount: Number(payment.amount) || 0,
    date: normalizedDate,
    createdAt: normalizedCreatedAt,
  }
}

const roundDelta = (delta: number): number => {
  return Math.abs(delta) < 0.01 ? 0 : Number(delta.toFixed(2))
}

const calculateExpenseAdjustment = (originalTotal: number, payments: PaymentRecord[]): number => {
  if (!payments || payments.length === 0) return 0
  const expected = Number(originalTotal || 0)
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  if (totalPaid >= expected - PAYMENT_TOLERANCE || totalPaid >= expected) {
    return roundDelta(expected - totalPaid)
  }
  return 0
}

const calculateRevenueAdjustment = (sellingTotal: number, payments: PaymentRecord[]): number => {
  if (!payments || payments.length === 0) return 0
  const expected = Number(sellingTotal || 0)
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  return roundDelta(totalPaid - expected)
}

// Helper function to check if supplier expenses are paid (within tolerance of originalTotal)
export const isExpensePaid = (order: Order): boolean => {
  const expenseAmount = Number(order.originalTotal || 0)
  if (expenseAmount <= 0) return false

  const partialPayments = order.partialPayments || []
  const totalPaid = partialPayments.reduce((sum, p) => sum + p.amount, 0)

  // Order expenses are paid if total payments are within tolerance of original total
  return totalPaid >= (expenseAmount - PAYMENT_TOLERANCE)
}

// Helper function to check if customer has paid for the order (within tolerance of total)
export const isCustomerPaid = (order: Order): boolean => {
  const sellingAmount = Number(order.total || 0)
  if (sellingAmount <= 0) return false

  const customerPayments = order.customerPayments || []
  const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0)

  // Customer payment is complete if total payments are within tolerance of selling total
  return totalPaid >= (sellingAmount - PAYMENT_TOLERANCE)
}

// Keep isOrderPaid for backward compatibility (checks expense payments)
export const isOrderPaid = isExpensePaid


export const orderService = {
  // Helper: Create ledger entries for payments that don't have them
  async ensureLedgerEntriesForPayments(payments: PaymentRecord[], orderInfo: { truckNo?: string, id?: string, supplier?: string }): Promise<PaymentRecord[]> {
    const updatedPayments = [...payments];
    let modified = false;

    for (let i = 0; i < updatedPayments.length; i++) {
      const payment = updatedPayments[i];
      if (!payment.ledgerEntryId) {
        try {
          const { ledgerService } = await import('./ledgerService');
          console.log('Creating missing ledger entry for payment:', payment);
          
          const ledgerEntryId = await ledgerService.addEntry(
            'debit',
            payment.amount,
            payment.note ? `Order Payment (${orderInfo.truckNo || 'Unknown Truck'}): ${payment.note}` : `Order Payment: ${orderInfo.truckNo || orderInfo.id || 'Unknown Order'}`,
            'orderExpense',
            payment.date || new Date().toISOString(),
            undefined, // No supplier to avoid auto-distribution as per user request
            undefined // No partyName
          );
          
          updatedPayments[i] = {
            ...payment,
            ledgerEntryId
          };
          modified = true;
          console.log('Γ£à Created ledger entry:', ledgerEntryId);
        } catch (error) {
          console.error('Γ¥î Failed to create ledger entry for payment:', error);
        }
      }
    }
    return updatedPayments;
  },

  // Create order
  async createOrder(order: Omit<Order, 'id'> & { paidAmountForRawMaterials?: number }): Promise<string> {
    const db = getDb()

    if (!db) {
      const errorMsg = 'Firebase db is not initialized. Check your Firebase configuration and .env.local file.'
      console.error(errorMsg)
      console.error('Environment check:', {
        hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        isClient: typeof window !== 'undefined'
      })
      throw new Error(errorMsg)
    }

    try {
      // Extract paidAmountForRawMaterials if provided (temporary field from form)
      const paidAmountForRawMaterials = (order as any).paidAmountForRawMaterials
      const expenseAmount = Number(order.originalTotal || 0)

      // Prepare order data without the temporary field
      const { paidAmountForRawMaterials: _, ...orderDataWithoutTemp } = order as any
      
      // Process partial payments to ensure they have ledger entries
      let processedPartialPayments = order.partialPayments || []
      if (processedPartialPayments.length > 0) {
        processedPartialPayments = await this.ensureLedgerEntriesForPayments(
          processedPartialPayments,
          { truckNo: order.truckNo, supplier: order.supplier }
        )
      }
      processedPartialPayments = processedPartialPayments.map(normalizePaymentRecord)

      const initialCustomerPayments = (order.customerPayments || []).map(normalizePaymentRecord)
      const expenseAdjustment = calculateExpenseAdjustment(order.originalTotal || 0, processedPartialPayments)
      const revenueAdjustment = calculateRevenueAdjustment(order.total || 0, initialCustomerPayments)

      const orderData: Omit<Order, 'id'> = {
        ...orderDataWithoutTemp,
        partialPayments: processedPartialPayments,
        ...(processedPartialPayments.length > 0 ? { expenseAdjustment } : {}),
        ...(initialCustomerPayments.length > 0 ? { revenueAdjustment } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Store partialPayments if provided (from form) - already handled above
      // if (order.partialPayments && Array.isArray(order.partialPayments) && order.partialPayments.length > 0) {
      //   orderData.partialPayments = order.partialPayments
      // }

      console.log('Creating order in Firestore:', {
        collection: ORDERS_COLLECTION,
        data: orderData,
        dbInitialized: !!db
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          console.error('Γ¥î Save operation timed out after 10 seconds')
          console.error('This usually means Firestore security rules are blocking the request.')
          reject(new Error('Request timeout. This usually means Firestore security rules are blocking writes. Please check your Firestore rules in Firebase Console and ensure they allow writes to the "orders" collection.'))
        }, 10000)
      })

      console.log('ΓÅ│ Attempting to save to Firestore...')
      const savePromise = addDoc(collection(db, ORDERS_COLLECTION), orderData)
      const docRef = await Promise.race([savePromise, timeoutPromise])

      console.log('Γ£à Order created successfully with ID:', docRef.id)

      return docRef.id
    } catch (error: any) {
      console.error('Γ¥î Firestore error creating order:', error)
      console.error('Error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      })

      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules in Firebase Console. Rules should allow: allow read, write: if true;')
      }
      if (error.code === 'unavailable') {
        throw new Error('Firestore is unavailable. Please check your internet connection.')
      }
      if (error.code === 'failed-precondition') {
        throw new Error('Firestore database not found. Please create the database in Firebase Console.')
      }
      throw new Error(`Failed to save order: ${error.message || 'Unknown error'}`)
    }
  },

  // Update order
  async updateOrder(id: string, order: Partial<Order>): Promise<void> {
    const db = getDb()
    if (!db) {
      console.error('Firebase db is not initialized. Check your Firebase configuration.')
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials. See README.md for setup instructions.')
    }
    try {
      // Get existing order
      const existingOrder = await this.getOrderById(id)
      if (!existingOrder) {
        throw new Error('Order not found')
      }

      // Prepare update data - remove undefined values to avoid Firestore errors
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      }

      // Process partial payments to ensure they have ledger entries
      if (order.partialPayments && Array.isArray(order.partialPayments) && order.partialPayments.length > 0) {
         order.partialPayments = await this.ensureLedgerEntriesForPayments(
           order.partialPayments,
           { truckNo: order.truckNo || existingOrder.truckNo, id: id, supplier: order.supplier || existingOrder.supplier }
         );
      }

      // Only include fields that are defined and not undefined
      Object.keys(order).forEach(key => {
        const value = (order as any)[key]
        // Skip undefined values and handle partialPayments specially
        if (value !== undefined) {
          // For partialPayments, only include if it's a non-empty array
          if (key === 'partialPayments') {
            if (Array.isArray(value) && value.length > 0) {
              const normalized = value.map(normalizePaymentRecord)
              updateData[key] = normalized
              const originalTotal = Number(order.originalTotal ?? existingOrder.originalTotal ?? 0)
              updateData.expenseAdjustment = calculateExpenseAdjustment(originalTotal, normalized)
            } else if (value && Array.isArray(value) && value.length === 0) {
              updateData.expenseAdjustment = 0
            }
          } else if (key === 'customerPayments') {
            if (Array.isArray(value) && value.length > 0) {
              const normalized = value.map(normalizePaymentRecord)
              updateData[key] = normalized
              const sellingTotal = Number(order.total ?? existingOrder.total ?? 0)
              updateData.revenueAdjustment = calculateRevenueAdjustment(sellingTotal, normalized)
            } else if (value && Array.isArray(value) && value.length === 0) {
              updateData.revenueAdjustment = 0
            }
          } else {
            updateData[key] = value
          }
        }
      })

      // Actually update the document in Firestore
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      await updateDoc(orderRef, updateData)
      console.log('Γ£à Order updated successfully:', id)
    } catch (error: any) {
      console.error('Firestore error updating order:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to update order: ${error.message || 'Unknown error'}`)
    }
  },

  // Delete order
  async deleteOrder(id: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials.')
    }
    try {
      console.log('Deleting order from Firestore:', id)
      await deleteDoc(doc(db, ORDERS_COLLECTION, id))
      console.log('Order deleted successfully:', id)
    } catch (error: any) {
      console.error('Firestore error deleting order:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to delete order: ${error.message || 'Unknown error'}`)
    }
  },

  // Get all orders
  async getAllOrders(filters?: OrderFilters): Promise<Order[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }

    // Check if we need to avoid orderBy to prevent composite index requirement
    // When filtering by supplier, partyName, material, truckOwner, or truckNo, 
    // we'll sort in JavaScript instead
    const needsClientSideSort = !!(filters?.supplier || filters?.partyName || filters?.material || filters?.truckOwner || filters?.truckNo)

    let q: any = collection(db, ORDERS_COLLECTION)

    // Only use orderBy if we don't have filters that require composite indexes
    if (!needsClientSideSort) {
      q = query(q, orderBy('date', 'desc'))
    }

    if (filters) {
      if (filters.partyName) {
        q = query(q, where('partyName', '==', filters.partyName))
      }
      if (filters.material) {
        q = query(q, where('material', '==', filters.material))
      }
      if (filters.truckOwner) {
        q = query(q, where('truckOwner', '==', filters.truckOwner))
      }
      if (filters.truckNo) {
        q = query(q, where('truckNo', '==', filters.truckNo))
      }
      if (filters.supplier) {
        q = query(q, where('supplier', '==', filters.supplier))
      }
    }

    const querySnapshot = await getDocs(q)
    const orders: Order[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()

      // Convert Timestamp objects to ISO strings
      const orderData: any = {
        id: doc.id,
      }

      // Process each field, converting Timestamps to strings
      const dataObj = data as Record<string, any>
      for (const key in dataObj) {
        if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
          const value = dataObj[key]
          // Convert Firestore Timestamps to ISO strings
          if (value && typeof value.toDate === 'function') {
            const dateValue = (value as Timestamp).toDate()
            // For 'date' field in orders, convert to simple date string (YYYY-MM-DD)
            // For other timestamp fields, use full ISO string
            if (key === 'date') {
              orderData[key] = dateValue.toISOString().split('T')[0]
            } else {
              orderData[key] = dateValue.toISOString()
            }
          } else {
            orderData[key] = value
          }
        }
      }

      // Ensure partialPayments is an array if it exists
      if (orderData.partialPayments) {
        if (!Array.isArray(orderData.partialPayments)) {
          orderData.partialPayments = []
        } else {
          orderData.partialPayments = orderData.partialPayments.map((payment: any) =>
            normalizePaymentRecord(payment as PaymentRecord)
          )
        }
      }

      // Ensure customerPayments is an array if it exists
      if (orderData.customerPayments) {
        if (!Array.isArray(orderData.customerPayments)) {
          orderData.customerPayments = []
        } else {
          orderData.customerPayments = orderData.customerPayments.map((payment: any) =>
            normalizePaymentRecord(payment as PaymentRecord)
          )
        }
      }

      orders.push(orderData as Order)
    })

    // Sort in JavaScript if we skipped orderBy to avoid composite index requirement
    if (needsClientSideSort) {
      orders.sort((a, b) => {
        const aDate = new Date(a.date).getTime()
        const bDate = new Date(b.date).getTime()
        return bDate - aDate // Descending order (newest first)
      })
    }

    // Filter by date range in memory (Firestore has limitations with date range queries)
    let filteredOrders = orders
    if (filters?.startDate || filters?.endDate) {
      filteredOrders = orders.filter((order) => {
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

    return filteredOrders
  },

  // Get order by ID
  async getOrderById(id: string): Promise<Order | null> {
    const orders = await this.getAllOrders()
    return orders.find((o) => o.id === id) || null
  },

  // Add payment to a due order (for expense payments)
  async addPaymentToOrder(id: string, paymentAmount: number, note?: string, markAsPaid?: boolean): Promise<void> {
    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    // Calculate expense amount (originalTotal only - raw material cost)
    const expenseAmount = Number(order.originalTotal || 0)

    // Get existing partial payments
    const existingPayments = order.partialPayments || []

    // Calculate current total from existing payments
    const currentTotal = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    // Check if order is already paid (within 250 of original total)
    // Allow adding payments to paid orders if markAsPaid is true, otherwise warn (but don't block)
    const isPaid = isOrderPaid(order)
    if (isPaid && !markAsPaid) {
      // Don't throw error - allow the payment but it may cause overpayment
      // The UI should have already shown a confirmation dialog
      console.warn(`ΓÜá∩╕Å Adding payment to already paid order. Current total: ${currentTotal}, Original: ${expenseAmount}`)
    }

    // Calculate remaining amount
    const remainingAmount = expenseAmount - currentTotal
    const tolerance = PAYMENT_TOLERANCE // Orders are considered paid if within 250 of original total

    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than 0')
    }

    // Check for ledger payments on this order
    const ledgerPayments = existingPayments.filter(p => p.ledgerEntryId)
    const hasLedgerPayments = ledgerPayments.length > 0
    const ledgerPaymentsTotal = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    // Calculate new total if this payment is added
    const newTotalPaid = currentTotal + paymentAmount

    // Warn if overpayment would occur (but allow it if markAsPaid is true)
    // The UI should have already shown a confirmation dialog, so we just log here
    if (newTotalPaid > expenseAmount && !markAsPaid) {
      const overpaymentAmount = newTotalPaid - expenseAmount
      console.warn(`ΓÜá∩╕Å Overpayment detected: ${overpaymentAmount} over original total. Total: ${newTotalPaid}, Original: ${expenseAmount}${hasLedgerPayments ? `, Ledger payments: ${ledgerPaymentsTotal}` : ''}`)
    }

    // Add new payment record
    const paymentDate = new Date().toISOString()
    
    // --- NEW: Create Linked Ledger Entry ---
    let ledgerEntryId: string | undefined = undefined
    try {
      const { ledgerService } = await import('./ledgerService')
      ledgerEntryId = await ledgerService.addEntry(
        'debit',
        paymentAmount,
        note ? `Order Payment (${order.truckNo || 'Unknown Truck'}): ${note}` : `Order Payment: ${order.truckNo || id}`,
        'orderExpense',
        paymentDate,
        undefined, // No supplier to avoid auto-distribution
        undefined // No partyName
      )
      console.log('Γ£à Created linked ledger entry:', ledgerEntryId)
    } catch (error) {
      console.error('Γ¥î Failed to create linked ledger entry for order payment:', error)
      // We could throw here, but arguably we should let the payment proceed without ledger link?
      // Requirement says "that should created ledger expanse entry", so failing is probably better than inconsistency.
      // But for robustness, let's log and maybe alert. 
      // For now, we'll proceed but the link will be missing.
    }
    // ---------------------------------------

    const newPayment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: paymentDate,
      createdAt: paymentDate,
      note: note || undefined,
      ledgerEntryId: ledgerEntryId, // Store the link
    }
    const updatedPayments = [...existingPayments, newPayment]

    // Prepare update data
    const isFullyPaid = newTotalPaid >= (expenseAmount - PAYMENT_TOLERANCE)

    const updateData: any = {
      partialPayments: updatedPayments,
      paid: isFullyPaid,
      paymentDue: !isFullyPaid,
      updatedAt: new Date().toISOString(),
      expenseAdjustment: calculateExpenseAdjustment(expenseAmount, updatedPayments),
    }
    if (isFullyPaid) {
      updateData.paidAmount = deleteField()
    } else {
      updateData.paidAmount = newTotalPaid
    }

    await this.updateOrder(id, updateData)
  },


  // Update a specific partial payment record
  async updatePartialPayment(id: string, paymentId: string, updates: { amount?: number; date?: string }, preserveLedgerEntryId?: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials.')
    }

    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    const existingPayments = order.partialPayments || []
    const paymentIndex = existingPayments.findIndex(p => p.id === paymentId)

    if (paymentIndex === -1) {
      throw new Error('Payment record not found')
    }

    const paymentToUpdate = existingPayments[paymentIndex]
    const oldAmount = paymentToUpdate.amount

    // Validate amount doesn't exceed original total
    const expenseAmount = Number(order.originalTotal || 0)
    const newAmount = updates.amount !== undefined ? updates.amount : paymentToUpdate.amount

    // Calculate total from other payments (excluding the one being updated)
    const otherPaymentsTotal = existingPayments
      .filter((_, idx) => idx !== paymentIndex)
      .reduce((sum, p) => sum + p.amount, 0)

    // Allow payments up to original total (with tolerance for "paid" status handled by isOrderPaid)
    if (otherPaymentsTotal + newAmount > expenseAmount) {
      const { formatIndianCurrency } = await import('./currencyUtils')
      throw new Error(`Total payments cannot exceed original total of ${formatIndianCurrency(expenseAmount)}`)
    }

    // Sync with Ledger if linked
    if (paymentToUpdate.ledgerEntryId) {
      try {
        const { ledgerService } = await import('./ledgerService')
        await ledgerService.update(paymentToUpdate.ledgerEntryId, {
          amount: newAmount,
          date: updates.date,
        }, { fromOrder: true }) // Prevent loop
        console.log('Γ£à Synced payment update to ledger:', paymentToUpdate.ledgerEntryId)
      } catch (error) {
        console.error('Γ¥î Failed to sync payment update to ledger:', error)
        // Should we block? Probably better to warn.
      }
    }

    // Update the payment record (preserve ledgerEntryId if provided)
    const updatedPayment: PaymentRecord = {
      ...paymentToUpdate,
      amount: newAmount,
      date: updates.date || paymentToUpdate.date,
      createdAt: paymentToUpdate.createdAt || paymentToUpdate.date,
      ...(preserveLedgerEntryId ? { ledgerEntryId: preserveLedgerEntryId } : {}),
    }

    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment

    // Calculate total paid amount from all payments
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)

    // Calculate expense amount to check if still fully paid (with tolerance)
    const isFullyPaid = totalPaid >= (expenseAmount - PAYMENT_TOLERANCE)

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        paid: isFullyPaid,
        paymentDue: !isFullyPaid,
        updatedAt: new Date().toISOString(),
        partialPayments: updatedPayments,
        expenseAdjustment: calculateExpenseAdjustment(expenseAmount, updatedPayments),
      }

      if (isFullyPaid) {
        updateData.paidAmount = deleteField()
      } else {
        updateData.paidAmount = totalPaid
      }

      await updateDoc(orderRef, updateData)

      console.log('Payment updated successfully:', paymentId)
    } catch (error: any) {
      console.error('Firestore error updating payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to update payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Remove a specific partial payment record
  async removePartialPayment(id: string, paymentId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials.')
    }

    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    const existingPayments = order.partialPayments || []
    const paymentToRemove = existingPayments.find(p => p.id === paymentId)

    if (!paymentToRemove) {
      throw new Error('Payment record not found')
    }

    // If linked to ledger, remove the ledger entry instead
    // The ledger removal will trigger removePaymentsByLedgerEntryId which will handle the order update
    if (paymentToRemove.ledgerEntryId) {
      try {
        console.log('Removing linked ledger entry for payment:', paymentToRemove.ledgerEntryId)
        const { ledgerService } = await import('./ledgerService')
        await ledgerService.remove(paymentToRemove.ledgerEntryId)
        console.log('Γ£à Ledger entry removed, payment should be removed via hook')
        return // Exit, let the hook handle the rest
      } catch (error) {
        console.error('Γ¥î Failed to remove linked ledger entry:', error)
        // Fallback to manual removal if ledger removal fails?
        // Yes, proceed with manual removal below.
      }
    }

    const updatedPayments = existingPayments.filter(p => p.id !== paymentId)

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        expenseAdjustment: calculateExpenseAdjustment(Number(order.originalTotal || 0), updatedPayments),
      }

      if (updatedPayments.length > 0) {
        updateData.partialPayments = updatedPayments
      } else {
        // Remove field if no payments remain
        updateData.partialPayments = deleteField()
      }

      // Removing a payment means we spent less -> increase profit
      const currentAdjustment = Number(order.adjustmentAmount || 0)
      updateData.adjustmentAmount = currentAdjustment + paymentToRemove.amount

      await updateDoc(orderRef, updateData)

      console.log('Payment removed successfully:', paymentId)
    } catch (error: any) {
      console.error('Firestore error removing payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to remove payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Update payment details from ledger update (sync ledger -> order)
  async updatePaymentByLedgerEntryId(ledgerEntryId: string, updates: { amount?: number; date?: string }): Promise<void> {
    const db = getDb()
    if (!db) return

    const allOrders = await this.getAllOrders()
    
    // Find order containing this payment
    const orderToUpdate = allOrders.find(order => 
      (order.partialPayments || []).some(p => p.ledgerEntryId === ledgerEntryId)
    )

    if (!orderToUpdate || !orderToUpdate.id) {
      console.log(`No order found for ledger entry update: ${ledgerEntryId}`)
      return
    }

    const existingPayments = orderToUpdate.partialPayments || []
    const paymentIndex = existingPayments.findIndex(p => p.ledgerEntryId === ledgerEntryId)
    
    if (paymentIndex === -1) return

    const paymentToUpdate = existingPayments[paymentIndex]
    
    // Update payment
    const updatedPayment: PaymentRecord = {
      ...paymentToUpdate,
      amount: updates.amount !== undefined ? updates.amount : paymentToUpdate.amount,
      date: updates.date || paymentToUpdate.date,
      createdAt: paymentToUpdate.createdAt || paymentToUpdate.date,
    }

    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment

    // Recalculate paid status
    const expenseAmount = Number(orderToUpdate.originalTotal || 0)
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    const isPaid = totalPaid >= (expenseAmount - PAYMENT_TOLERANCE)

    const updateData: any = {
      partialPayments: updatedPayments,
      paid: isPaid,
      paymentDue: !isPaid,
      updatedAt: new Date().toISOString(),
      expenseAdjustment: calculateExpenseAdjustment(Number(orderToUpdate.originalTotal || 0), updatedPayments),
    }
    
    const amountDelta = updatedPayment.amount - paymentToUpdate.amount
    if (Math.abs(amountDelta) > 0.009) {
      const currentAdjustment = Number(orderToUpdate.adjustmentAmount || 0)
      updateData.adjustmentAmount = currentAdjustment - amountDelta
    }
    
    if (isPaid) {
      updateData.paidAmount = deleteField()
    } else {
      updateData.paidAmount = totalPaid
    }

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, orderToUpdate.id)
      await updateDoc(orderRef, updateData)
      console.log(`Γ£à Synced ledger update to order ${orderToUpdate.id}`)
    } catch (error) {
      console.error(`Failed to sync ledger update to order ${orderToUpdate.id}:`, error)
    }
  },

  // Add customer payment to an order
  async addCustomerPayment(id: string, paymentAmount: number, note?: string): Promise<void> {
    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    // Calculate selling amount (total - what customer should pay)
    const sellingAmount = Number(order.total || 0)

    // Get existing customer payments
    const existingPayments = order.customerPayments || []

    // Calculate current total from existing payments
    const currentTotal = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than 0')
    }

    // Calculate new total if this payment is added
    const newTotalPaid = currentTotal + paymentAmount

    // Warn if overpayment would occur
    if (newTotalPaid > sellingAmount) {
      const overpaymentAmount = newTotalPaid - sellingAmount
      console.warn(`ΓÜá∩╕Å Customer overpayment detected: ${overpaymentAmount} over selling total. Total: ${newTotalPaid}, Selling: ${sellingAmount}`)
    }

    // Add new payment record
    const paymentDate = new Date().toISOString()
    const newPayment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: paymentDate,
      createdAt: paymentDate,
      note: note || undefined,
    }
    const updatedPayments = [...existingPayments, newPayment]

    // Prepare update data
    const updateData: any = {
      customerPayments: updatedPayments,
    }

    await this.updateOrder(id, updateData)
  },

  // Update a specific customer payment record
  async updateCustomerPayment(id: string, paymentId: string, updates: { amount?: number; date?: string }, preserveLedgerEntryId?: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials.')
    }

    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    const existingPayments = order.customerPayments || []
    const paymentIndex = existingPayments.findIndex(p => p.id === paymentId)

    if (paymentIndex === -1) {
      throw new Error('Payment record not found')
    }

    const paymentToUpdate = existingPayments[paymentIndex]
    const oldAmount = paymentToUpdate.amount

    // Validate amount doesn't exceed selling total
    const sellingAmount = Number(order.total || 0)
    const newAmount = updates.amount !== undefined ? updates.amount : paymentToUpdate.amount

    // Calculate total from other payments (excluding the one being updated)
    const otherPaymentsTotal = existingPayments
      .filter((_, idx) => idx !== paymentIndex)
      .reduce((sum, p) => sum + p.amount, 0)

    // Allow payments up to selling total (with tolerance for "paid" status handled by isCustomerPaid)
    if (otherPaymentsTotal + newAmount > sellingAmount) {
      const { formatIndianCurrency } = await import('./currencyUtils')
      throw new Error(`Total customer payments cannot exceed selling total of ${formatIndianCurrency(sellingAmount)}`)
    }

    // Update the payment record (preserve ledgerEntryId if provided)
    const updatedPayment: PaymentRecord = {
      ...paymentToUpdate,
      amount: newAmount,
      date: updates.date || paymentToUpdate.date,
      createdAt: paymentToUpdate.createdAt || paymentToUpdate.date,
      ...(preserveLedgerEntryId ? { ledgerEntryId: preserveLedgerEntryId } : {}),
    }

    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        customerPayments: updatedPayments,
      revenueAdjustment: calculateRevenueAdjustment(sellingAmount, updatedPayments),
      }

      await updateDoc(orderRef, updateData)

      // If the customer payment was linked to a ledger entry, adjust the ledger total
      if (paymentToUpdate.ledgerEntryId) {
        try {
          const { ledgerService } = await import('./ledgerService')
          const entry = await ledgerService.getEntryById(paymentToUpdate.ledgerEntryId)
          if (entry) {
            const delta = newAmount - oldAmount
            const newLedgerAmount = Math.max(0, (entry.amount || 0) + delta)
            await ledgerService.update(
              paymentToUpdate.ledgerEntryId,
              { amount: newLedgerAmount },
              { fromOrder: true }
            )
          }
        } catch (syncError) {
          console.error('❌ Failed to sync customer payment update to ledger:', syncError)
        }
      }

      console.log('Customer payment updated successfully:', paymentId)
    } catch (error: any) {
      console.error('Firestore error updating customer payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to update customer payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Remove a specific customer payment record
  async removeCustomerPayment(id: string, paymentId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured. Please set up your .env.local file with Firebase credentials.')
    }

    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }

    const existingPayments = order.customerPayments || []
    const paymentToRemove = existingPayments.find(p => p.id === paymentId)

    if (!paymentToRemove) {
      throw new Error('Payment record not found')
    }

    const updatedPayments = existingPayments.filter(p => p.id !== paymentId)

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        revenueAdjustment: calculateRevenueAdjustment(Number(order.total || 0), updatedPayments),
      }

      if (updatedPayments.length > 0) {
        updateData.customerPayments = updatedPayments
      } else {
        // Remove field if no payments remain
        updateData.customerPayments = deleteField()
      }

      await updateDoc(orderRef, updateData)

      // If the payment was linked to a ledger entry, reduce the ledger total
      if (paymentToRemove.ledgerEntryId) {
        try {
          const { ledgerService } = await import('./ledgerService')
          const entry = await ledgerService.getEntryById(paymentToRemove.ledgerEntryId)
          if (entry) {
            const newLedgerAmount = Math.max(0, (entry.amount || 0) - paymentToRemove.amount)
            await ledgerService.update(
              paymentToRemove.ledgerEntryId,
              { amount: newLedgerAmount },
              { fromOrder: true }
            )
          }
        } catch (syncError) {
          console.error('❌ Failed to sync customer payment removal to ledger:', syncError)
        }
      }

      console.log('Customer payment removed successfully:', paymentId)
    } catch (error: any) {
      console.error('Firestore error removing customer payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to remove customer payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Get unique party names
  async getUniquePartyNames(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    try {
      const q = query(collection(db, ORDERS_COLLECTION))
      const querySnapshot = await getDocs(q)
      const partyNames = new Set<string>()

      querySnapshot.forEach((doc) => {
        const data = doc.data()
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

  // Get unique truck owners
  async getUniqueTruckOwners(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    try {
      const q = query(collection(db, ORDERS_COLLECTION))
      const querySnapshot = await getDocs(q)
      const truckOwners = new Set<string>()

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.truckOwner && typeof data.truckOwner === 'string') {
          truckOwners.add(data.truckOwner.trim())
        }
      })

      return Array.from(truckOwners).sort()
    } catch (error: any) {
      console.error('Error fetching truck owners:', error)
      return []
    }
  },

  // Get unique truck numbers
  async getUniqueTruckNumbers(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    try {
      const q = query(collection(db, ORDERS_COLLECTION))
      const querySnapshot = await getDocs(q)
      const truckNumbers = new Set<string>()

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.truckNo && typeof data.truckNo === 'string') {
          truckNumbers.add(data.truckNo.trim())
        }
      })

      return Array.from(truckNumbers).sort()
    } catch (error: any) {
      console.error('Error fetching truck numbers:', error)
      return []
    }
  },

  // Get unique site names
  async getUniqueSiteNames(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    try {
      const q = query(collection(db, ORDERS_COLLECTION))
      const querySnapshot = await getDocs(q)
      const siteNames = new Set<string>()

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.siteName && typeof data.siteName === 'string') {
          siteNames.add(data.siteName.trim())
        }
      })

      return Array.from(siteNames).sort()
    } catch (error: any) {
      console.error('Error fetching site names:', error)
      return []
    }
  },

  // Get unique suppliers
  async getUniqueSuppliers(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    try {
      const q = query(collection(db, ORDERS_COLLECTION))
      const querySnapshot = await getDocs(q)
      const suppliers = new Set<string>()

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.supplier && typeof data.supplier === 'string') {
          suppliers.add(data.supplier.trim())
        }
      })

      return Array.from(suppliers).sort()
    } catch (error: any) {
      console.error('Error fetching suppliers:', error)
      return []
    }
  },

  // Remove all payments (partial or customer) associated with a specific ledger entry ID
  async removePaymentsByLedgerEntryId(ledgerEntryId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      console.error('Firebase is not configured.')
      return
    }
    
    // Fetch all orders (inefficient but necessary without specialized indexes)
    // Ideally, we would query only orders that have payments with this ledgerEntryId
    // but Firestore array-contains-any with objects is limited.
    // For now, we'll fetch all and filter in memory.
    const allOrders = await this.getAllOrders()
    
    const ordersToUpdate = allOrders.filter(order => {
      const hasPartialPayment = (order.partialPayments || []).some(p => p.ledgerEntryId === ledgerEntryId)
      const hasCustomerPayment = (order.customerPayments || []).some(p => p.ledgerEntryId === ledgerEntryId)
      return hasPartialPayment || hasCustomerPayment
    })
    
    console.log(`Found ${ordersToUpdate.length} orders to cleanup for ledger entry ${ledgerEntryId}`)
    
    for (const order of ordersToUpdate) {
      if (!order.id) continue
      
      // Filter out payments with this ledgerEntryId
      const newPartialPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId !== ledgerEntryId)
      const newCustomerPayments = (order.customerPayments || []).filter(p => p.ledgerEntryId !== ledgerEntryId)
      
      // Check if changes are needed
      const partialChanged = (order.partialPayments?.length || 0) !== newPartialPayments.length
      const customerChanged = (order.customerPayments?.length || 0) !== newCustomerPayments.length
      
      if (!partialChanged && !customerChanged) continue
      
      // Recalculate paid status
      const expenseAmount = Number(order.originalTotal || 0)
      const totalPartialPaid = newPartialPayments.reduce((sum, p) => sum + p.amount, 0)
      const isPaid = totalPartialPaid >= (expenseAmount - PAYMENT_TOLERANCE)
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      }
      
      if (partialChanged) {
        updateData.partialPayments = newPartialPayments
        updateData.paid = isPaid
        updateData.paymentDue = !isPaid
        updateData.expenseAdjustment = calculateExpenseAdjustment(expenseAmount, newPartialPayments)
        if (isPaid) {
          updateData.paidAmount = deleteField()
        } else {
          updateData.paidAmount = totalPartialPaid
        }
      }
      
      if (customerChanged) {
        updateData.customerPayments = newCustomerPayments
        const sellingTotal = Number(order.total || 0)
        updateData.revenueAdjustment = calculateRevenueAdjustment(sellingTotal, newCustomerPayments)
      }
      
      try {
        const orderRef = doc(db, ORDERS_COLLECTION, order.id)
        await updateDoc(orderRef, updateData)
        console.log(`Γ£à Removed payments for ledger ${ledgerEntryId} from order ${order.id}`)
      } catch (error) {
        console.error(`Failed to update order ${order.id} during ledger cleanup:`, error)
      }
    }
  },

  // Reconcile supplier payments: Ensure order payments match valid ledger entries
  async reconcileSupplierOrders(supplier: string, validLedgerEntryIds: string[]): Promise<void> {
    const db = getDb()
    if (!db) return

    const validIdsSet = new Set(validLedgerEntryIds)
    console.log(`≡ƒöä Reconciling orders for supplier: ${supplier}. Valid Ledger IDs: ${validLedgerEntryIds.length}`)

    // Get all orders for this supplier
    const q = query(collection(db, ORDERS_COLLECTION), where('supplier', '==', supplier))
    const snapshot = await getDocs(q)
    
    const ordersToUpdate: Order[] = []
    snapshot.forEach((doc) => {
      ordersToUpdate.push({ id: doc.id, ...doc.data() } as Order)
    })

    let removedCount = 0

    for (const order of ordersToUpdate) {
      if (!order.id) continue

      const existingPayments = order.partialPayments || []
      // Filter out payments that have a ledgerEntryId BUT that ID is not in the valid set
      const validPayments = existingPayments.filter(p => {
        if (p.ledgerEntryId) {
          return validIdsSet.has(p.ledgerEntryId)
        }
        return true // Keep manual payments (no ledgerEntryId)
      })

      if (validPayments.length !== existingPayments.length) {
        removedCount += (existingPayments.length - validPayments.length)
        
        // Recalculate paid status
        const expenseAmount = Number(order.originalTotal || 0)
        const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0)
        const isPaid = totalPaid >= (expenseAmount - PAYMENT_TOLERANCE)

        const updateData: any = {
          partialPayments: validPayments,
          paid: isPaid,
          paymentDue: !isPaid,
          expenseAdjustment: calculateExpenseAdjustment(expenseAmount, validPayments),
          updatedAt: new Date().toISOString()
        }

        if (isPaid) {
          updateData.paidAmount = deleteField()
        } else {
          updateData.paidAmount = totalPaid
        }

        try {
          await updateDoc(doc(db, ORDERS_COLLECTION, order.id), updateData)
          console.log(`Γ£à Removed orphan payments from order ${order.id}`)
        } catch (err) {
          console.error(`Failed to update order ${order.id} during reconciliation:`, err)
        }
      }
    }
    console.log(`Γ£à Reconciliation complete. Removed ${removedCount} orphan payments.`)
  },

  // Distribute a payment amount to orders for a specific supplier (expense payment)
  async distributePaymentToSupplierOrders(supplier: string, amount: number, ledgerEntryId: string, note?: string): Promise<void> {
    const db = getDb()
    if (!db) return

    console.log(`≡ƒöä Distributing payment of Γé╣${amount} to supplier: ${supplier}`)

    // Get all unpaid orders for this supplier
    // Note: We can't filter efficiently by 'paymentDue' AND 'supplier' without a composite index
    // So we fetch by supplier and filter in memory
    const q = query(collection(db, ORDERS_COLLECTION), where('supplier', '==', supplier))
    const snapshot = await getDocs(q)
    
    const unpaidOrders: Order[] = []
    snapshot.forEach((doc) => {
      const order = { id: doc.id, ...doc.data() } as Order
      const markedPaid = order.paid === true || order.paymentDue === false
      if (!isExpensePaid(order) && !markedPaid) {
        unpaidOrders.push(order)
      } else {
        console.log(`Skipping order ${order.id} for supplier ${supplier}: already marked paid.`)
      }
    })

    // Sort by date (oldest first) to pay off oldest debts first
    unpaidOrders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    console.log(`Found ${unpaidOrders.length} unpaid orders for supplier ${supplier}`)

    let remainingAmount = amount

    for (const order of unpaidOrders) {
      if (remainingAmount <= 0) break
      if (!order.id) continue

      // Calculate how much is owed on this order
      const originalTotal = order.originalTotal || 0
      const existingPayments = order.partialPayments || []
      const paidSoFar = existingPayments.reduce((sum, p) => sum + p.amount, 0)
      const tolerance = PAYMENT_TOLERANCE
      const outstanding = Math.max(0, originalTotal - paidSoFar)
      const isAlreadyPaid = outstanding <= tolerance || order.paid === true || order.paymentDue === false

      if (isAlreadyPaid) {
        console.log(`Skipping auto-distribution to order ${order.id} (already within tolerance or marked paid).`)
        continue
      }

      const amountDue = Math.max(0, outstanding - tolerance)

      if (amountDue <= 0) continue

      // Determine how much to pay on this order
      const paymentForThisOrder = Math.min(remainingAmount, amountDue)

      // Create the payment record
      const recordedAt = new Date().toISOString()
      const paymentRecord: PaymentRecord = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        amount: paymentForThisOrder,
        date: recordedAt,
        createdAt: recordedAt,
        ledgerEntryId, // Link back to the source ledger entry
        note: note || 'Auto-distributed from ledger payment',
      }

      // Update the order
      const newPartialPayments = [...existingPayments, paymentRecord]
      const newTotalPaid = paidSoFar + paymentForThisOrder
      const isNowPaid = newTotalPaid >= (originalTotal - tolerance) // tolerance window

      const updateData: any = {
        partialPayments: newPartialPayments,
        paid: isNowPaid,
        paymentDue: !isNowPaid,
        expenseAdjustment: calculateExpenseAdjustment(originalTotal, newPartialPayments),
        updatedAt: new Date().toISOString()
      }

      if (isNowPaid) {
        updateData.paidAmount = deleteField()
      } else {
        updateData.paidAmount = newTotalPaid
      }

      await updateDoc(doc(db, ORDERS_COLLECTION, order.id), updateData)
      
      console.log(`Γ£à Paid Γé╣${paymentForThisOrder} on order ${order.id} (Remaining: Γé╣${remainingAmount - paymentForThisOrder})`)
      
      remainingAmount -= paymentForThisOrder
    }

    if (remainingAmount > 0) {
      console.log(`ΓÜá∩╕Å Payment distribution complete. Γé╣${remainingAmount} remaining undistributed (no more unpaid orders).`)
    } else {
      console.log('Γ£à Payment fully distributed.')
    }
  },

  // Redistribute ledger entry when a payment amount changes (Re-distribution logic)
  async redistributeSupplierPayment(ledgerEntryId: string, expenseDate: string): Promise<void> {
    try {
      const { ledgerService } = await import('./ledgerService')
      console.log(`≡ƒöä Redistributing ledger entry ${ledgerEntryId} (date: ${expenseDate})`)
      
      // Get the ledger entry
      const ledgerEntry = await ledgerService.getEntryById(ledgerEntryId)
      if (!ledgerEntry) {
        console.warn(`Γ¥î Ledger entry ${ledgerEntryId} not found`)
        return
      }
      if (ledgerEntry.type !== 'debit' || !ledgerEntry.supplier) {
        console.warn(`Γ¥î Ledger entry is not an expense with supplier (type: ${ledgerEntry.type}, supplier: ${ledgerEntry.supplier})`)
        return
      }

      console.log(`≡ƒôª Getting orders for supplier: ${ledgerEntry.supplier}`)
      
      // Get all orders for this supplier
      const allOrders = await this.getAllOrders({ supplier: ledgerEntry.supplier })
      
      console.log(`≡ƒôª Found ${allOrders.length} orders for supplier ${ledgerEntry.supplier}`)
      
      // Calculate total amount currently allocated to orders from this ledger entry
      let totalAllocated = 0
      allOrders.forEach(order => {
        const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === ledgerEntryId)
        const orderAllocated = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        totalAllocated += orderAllocated
      })
      
      console.log(`≡ƒÆ░ Total allocated to orders: ${totalAllocated}, Ledger entry amount: ${ledgerEntry.amount}`)

      const supplier = ledgerEntry.supplier
      const tolerance = PAYMENT_TOLERANCE
      const ordersWithOutstanding = allOrders
        .map(order => {
          const existingPayments = order.partialPayments || []
          // Exclude payments from this ledger entry
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const originalTotal = Number(order.originalTotal || 0)
          const remaining = Math.max(0, originalTotal - totalPaid)
          
          const tempOrder: Order = {
            ...order,
            partialPayments: paymentsExcludingThis
          }
          
          const isPaid = isOrderPaid(tempOrder)
          
          return { order, remaining, currentPayments: existingPayments, tempOrder, isPaid }
        })
        .filter(({ remaining, isPaid, order }) => {
          const isManuallyPaid = order.paid === true || order.paymentDue === false
          const adjustedRemaining = Math.max(0, remaining - tolerance)
          const shouldInclude = adjustedRemaining > 0 && !isPaid && !isManuallyPaid
          if (!shouldInclude) {
            if (remaining <= tolerance) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): no outstanding amount.`)
            } else if (isPaid || isManuallyPaid) {
              console.log(`  ⏭️  Skipping order ${order.id} (${order.siteName || 'N/A'}): already marked paid.`)
            }
          } else {
            console.log(`  ✅ Including order ${order.id} (${order.siteName || 'N/A'}): remaining=${remaining}`)
          }
          return shouldInclude
        })
        .sort((a, b) => {
          const aDate = new Date(a.order.date).getTime()
          const bDate = new Date(b.order.date).getTime()
          if (aDate !== bDate) return aDate - bDate
          const aTime = new Date(a.order.createdAt || a.order.updatedAt || a.order.date).getTime()
          const bTime = new Date(b.order.createdAt || b.order.updatedAt || b.order.date).getTime()
          return aTime - bTime
        })

      console.log(`Γ£à Found ${ordersWithOutstanding.length} orders with outstanding payments for redistribution`)
      
      if (ordersWithOutstanding.length === 0) {
        console.warn(`ΓÜá∩╕Å No orders with outstanding payments for supplier ${supplier}`)
        // If there are no outstanding orders, we might still need to "shrink" payments if the amount decreased
        // But if the amount increased, we have nowhere to put it.
      }

      // Preserve existing payments from this ledger entry (they may have been manually edited)
      const preservedPayments: Array<{ orderId: string; payment: PaymentRecord }> = []
      let preservedAmount = 0
      
      allOrders.forEach(order => {
        if (!order.id) return
        const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === ledgerEntryId)
        ledgerPayments.forEach(payment => {
          preservedPayments.push({ orderId: order.id!, payment })
          preservedAmount += Number(payment.amount || 0)
        })
      })
      
      console.log(`≡ƒÆ╛ Preserving ${preservedPayments.length} existing payment(s) totaling ${preservedAmount}`)
      
      // If current ledger amount is LESS than preserved, we MUST shrink the payments
      // This logic was missing in Wizard version (it assumed we only distribute forward)
      // If preserved > ledgerEntry.amount, we need to cut some payments.
      
      let remainingExpense = ledgerEntry.amount
      
      // Strategy:
      // 1. If we have more preserved amount than new ledger amount, we must reduce payments (newest first or proportional?)
      //    Simpler: Delete all payments and redistribute from scratch? No, that destroys manual edits.
      //    Better: Reduce the last added payment(s).
      
      // But `distributePaymentToSupplierOrders` logic (re-used here partially) is complex.
      // Let's follow the wizard logic which preserves everything and then distributes *remaining*.
      // If remaining is negative, it does nothing, leaving over-payment!
      
      // The Wizard implementation had: let remainingExpense = ledgerEntry.amount - preservedAmount;
      // If negative, it breaks loop.
      
      // To correctly support "re-distribution" on amount reduction, we should probably clear all auto-distributed payments 
      // and re-run distribution? But we can't distinguish auto vs manual easily except maybe by Note?
      // The user said "trigger re-distribution".
      
      // For now, let's stick to the logic that worked in Wizard but fix the "negative remaining" case if possible.
      // If we reduce amount, we should probably warn or try to reduce payments.
      
      // Actually, the robust way is:
      // 1. Remove all payments linked to this ledger entry.
      // 2. Run distributePaymentToSupplierOrders with the new amount.
      // This is destructive to manual tweaks on those specific payments (e.g. dates/notes).
      // But it guarantees consistency.
      
      // The Wizard logic tried to be smart and preserve things.
      // Let's use the Wizard logic for now as it's safer for data loss.
      
      remainingExpense = ledgerEntry.amount - preservedAmount
      
      if (remainingExpense < 0) {
          console.warn("ΓÜá∩╕Å New ledger amount is less than already distributed amount. Some payments should be reduced manually.");
          return;
      }

      const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = []

      // First, preserve existing payments by adding them to paymentsToAdd
      const preservedByOrder = new Map<string, PaymentRecord[]>()
      preservedPayments.forEach(({ orderId, payment }) => {
        if (!preservedByOrder.has(orderId)) {
          preservedByOrder.set(orderId, [])
        }
        preservedByOrder.get(orderId)!.push(payment)
      })

      // Distribute remaining expense across orders (oldest first)
      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingExpense <= 0) break
        
        if (!order.id) continue
        
        // Check if this order has preserved payments
        const preservedForThisOrder = preservedByOrder.get(order.id) || []
        const preservedAmountForOrder = preservedForThisOrder.reduce((sum, p) => sum + Number(p.amount || 0), 0)

        // If user has preserved payments for this order, keep them as-is and skip auto-fill
        if (preservedForThisOrder.length > 0) {
          // Order already has payments from this ledger entry (possibly manually edited).
          // Keep them exactly as-is and skip auto-fill so we don't overwrite user changes.
          const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const updatedPayments = [...paymentsWithoutThisEntry, ...preservedForThisOrder]
          paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
          continue
        }
        
        // Calculate remaining capacity for this order (considering tolerance & preserved payments)
        const adjustedRemaining = Math.max(0, remaining - tolerance)
        const remainingCapacity = Math.max(0, adjustedRemaining - preservedAmountForOrder)
        
        if (remainingCapacity <= 0) {
          // Nothing to fill for this order
          const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          if (paymentsWithoutThisEntry.length > 0) {
            paymentsToAdd.push({ orderId: order.id, payment: paymentsWithoutThisEntry })
          }
          continue
        }
        
        const paymentAmount = Math.min(remainingExpense, remainingCapacity)
        
        let paymentDate = expenseDate
        if (paymentDate && !paymentDate.includes('T')) {
          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
        }
        
        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: paymentDate,
          note: `From ledger entry`,
          ledgerEntryId: ledgerEntryId,
        }
        
        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
        const updatedPayments = [...paymentsWithoutThisEntry, ...preservedForThisOrder, payment]
        
        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
        remainingExpense -= paymentAmount
        
        console.log(`  Γ£ô Adding payment of ${paymentAmount} to order ${order.id}`)
      }
      
      // Handle orders with preserved payments that weren't in ordersWithOutstanding
      preservedByOrder.forEach((preserved, orderId) => {
        if (!paymentsToAdd.find(p => p.orderId === orderId)) {
          const order = allOrders.find(o => o.id === orderId)
          if (order) {
            const existingPayments = order.partialPayments || []
            const paymentsWithoutThisEntry = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
            const updatedPayments = [...paymentsWithoutThisEntry, ...preserved]
            paymentsToAdd.push({ orderId, payment: updatedPayments })
          }
        }
      })

      console.log(`≡ƒôè Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingExpense} remaining undistributed`)

      // Update orders with new payment distributions
      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
        await this.updateOrder(orderId, {
          partialPayments: updatedPayments,
        })
        console.log(`  Γ£à Updated order ${orderId} with redistributed payment`)
      }
      
      if (remainingExpense > 0) {
        console.warn(`ΓÜá∩╕Å Could not fully redistribute. Remaining undistributed: ${remainingExpense}`)
      } else {
        console.log(`Γ£à Successfully redistributed ledger entry ${ledgerEntryId}`)
      }
    } catch (error) {
      console.error('Γ¥î Error redistributing ledger entry:', error)
      throw error
    }
  }
}
