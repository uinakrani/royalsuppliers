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

// Helper function to check if supplier expenses are paid (within 250 of originalTotal)
export const isExpensePaid = (order: Order): boolean => {
  const expenseAmount = Number(order.originalTotal || 0)
  if (expenseAmount <= 0) return false

  const partialPayments = order.partialPayments || []
  const totalPaid = partialPayments.reduce((sum, p) => sum + p.amount, 0)

  // Order expenses are paid if total payments are within 250 of original total
  return totalPaid >= (expenseAmount - 250)
}

// Helper function to check if customer has paid for the order (within 250 of total)
export const isCustomerPaid = (order: Order): boolean => {
  const sellingAmount = Number(order.total || 0)
  if (sellingAmount <= 0) return false

  const customerPayments = order.customerPayments || []
  const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0)

  // Customer payment is complete if total payments are within 250 of selling total
  return totalPaid >= (sellingAmount - 250)
}

// Keep isOrderPaid for backward compatibility (checks expense payments)
export const isOrderPaid = isExpensePaid


export const orderService = {
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
      const orderData: Omit<Order, 'id'> = {
        ...orderDataWithoutTemp,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Store partialPayments if provided (from form)
      if (order.partialPayments && Array.isArray(order.partialPayments) && order.partialPayments.length > 0) {
        orderData.partialPayments = order.partialPayments
      }

      console.log('Creating order in Firestore:', {
        collection: ORDERS_COLLECTION,
        data: orderData,
        dbInitialized: !!db
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          console.error('❌ Save operation timed out after 10 seconds')
          console.error('This usually means Firestore security rules are blocking the request.')
          reject(new Error('Request timeout. This usually means Firestore security rules are blocking writes. Please check your Firestore rules in Firebase Console and ensure they allow writes to the "orders" collection.'))
        }, 10000)
      })

      console.log('⏳ Attempting to save to Firestore...')
      const savePromise = addDoc(collection(db, ORDERS_COLLECTION), orderData)
      const docRef = await Promise.race([savePromise, timeoutPromise])

      console.log('✅ Order created successfully with ID:', docRef.id)

      return docRef.id
    } catch (error: any) {
      console.error('❌ Firestore error creating order:', error)
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

      // Only include fields that are defined and not undefined
      Object.keys(order).forEach(key => {
        const value = (order as any)[key]
        // Skip undefined values and handle partialPayments specially
        if (value !== undefined) {
          // For partialPayments, only include if it's a non-empty array
          if (key === 'partialPayments') {
            if (Array.isArray(value) && value.length > 0) {
              updateData[key] = value
            }
            // If empty array or undefined, don't include it (preserves existing value)
          } else {
            updateData[key] = value
          }
        }
      })

      // Actually update the document in Firestore
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      await updateDoc(orderRef, updateData)
      console.log('✅ Order updated successfully:', id)
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
      if (orderData.partialPayments && !Array.isArray(orderData.partialPayments)) {
        orderData.partialPayments = []
      }

      // Ensure customerPayments is an array if it exists
      if (orderData.customerPayments && !Array.isArray(orderData.customerPayments)) {
        orderData.customerPayments = []
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
      console.warn(`⚠️ Adding payment to already paid order. Current total: ${currentTotal}, Original: ${expenseAmount}`)
    }

    // Calculate remaining amount
    const remainingAmount = expenseAmount - currentTotal
    const tolerance = 250 // Orders are considered paid if within 250 of original total

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
      console.warn(`⚠️ Overpayment detected: ${overpaymentAmount} over original total. Total: ${newTotalPaid}, Original: ${expenseAmount}${hasLedgerPayments ? `, Ledger payments: ${ledgerPaymentsTotal}` : ''}`)
    }

    // Add new payment record
    const paymentDate = new Date().toISOString()
    const newPayment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: paymentDate,
      note: note || undefined,
    }
    const updatedPayments = [...existingPayments, newPayment]

    // Prepare update data
    const isFullyPaid = newTotalPaid >= (expenseAmount - 250)

    const updateData: any = {
      partialPayments: updatedPayments,
      paid: isFullyPaid,
      paymentDue: !isFullyPaid,
      updatedAt: new Date().toISOString(),
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

    // Update the payment record (preserve ledgerEntryId if provided)
    const updatedPayment: PaymentRecord = {
      ...paymentToUpdate,
      amount: newAmount,
      date: updates.date || paymentToUpdate.date,
      ...(preserveLedgerEntryId ? { ledgerEntryId: preserveLedgerEntryId } : {}),
    }

    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment

    // Calculate total paid amount from all payments
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)

    // Calculate expense amount to check if still fully paid (with 250 tolerance)
    const isFullyPaid = totalPaid >= (expenseAmount - 250)

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        paid: isFullyPaid,
        paymentDue: !isFullyPaid,
        updatedAt: new Date().toISOString(),
        partialPayments: updatedPayments,
      }

      if (isFullyPaid) {
        updateData.paidAmount = deleteField()
      } else {
        updateData.paidAmount = totalPaid
      }

      await updateDoc(orderRef, updateData)

      // Note: No automatic ledger entry creation - user must manually create ledger entries if needed

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

    const updatedPayments = existingPayments.filter(p => p.id !== paymentId)

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      }

      if (updatedPayments.length > 0) {
        updateData.partialPayments = updatedPayments
      } else {
        // Remove field if no payments remain
        updateData.partialPayments = deleteField()
      }

      await updateDoc(orderRef, updateData)

      // Note: No automatic ledger entry creation - user must manually create ledger entries if needed

      console.log('Payment removed successfully:', paymentId)
    } catch (error: any) {
      console.error('Firestore error removing payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to remove payment: ${error.message || 'Unknown error'}`)
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
      console.warn(`⚠️ Customer overpayment detected: ${overpaymentAmount} over selling total. Total: ${newTotalPaid}, Selling: ${sellingAmount}`)
    }

    // Add new payment record
    const paymentDate = new Date().toISOString()
    const newPayment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: paymentDate,
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
      ...(preserveLedgerEntryId ? { ledgerEntryId: preserveLedgerEntryId } : {}),
    }

    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment

    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        customerPayments: updatedPayments,
      }

      await updateDoc(orderRef, updateData)

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
      }

      if (updatedPayments.length > 0) {
        updateData.customerPayments = updatedPayments
      } else {
        // Remove field if no payments remain
        updateData.customerPayments = deleteField()
      }

      await updateDoc(orderRef, updateData)

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
      const isPaid = totalPartialPaid >= (expenseAmount - 250)
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      }
      
      if (partialChanged) {
        updateData.partialPayments = newPartialPayments
        updateData.paid = isPaid
        updateData.paymentDue = !isPaid
        if (isPaid) {
          updateData.paidAmount = deleteField()
        } else {
          updateData.paidAmount = totalPartialPaid
        }
      }
      
      if (customerChanged) {
        updateData.customerPayments = newCustomerPayments
      }
      
      try {
        const orderRef = doc(db, ORDERS_COLLECTION, order.id)
        await updateDoc(orderRef, updateData)
        console.log(`✅ Removed payments for ledger ${ledgerEntryId} from order ${order.id}`)
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
    console.log(`🔄 Reconciling orders for supplier: ${supplier}. Valid Ledger IDs: ${validLedgerEntryIds.length}`)

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
        const isPaid = totalPaid >= (expenseAmount - 250)

        const updateData: any = {
          partialPayments: validPayments,
          paid: isPaid,
          paymentDue: !isPaid,
          updatedAt: new Date().toISOString()
        }

        if (isPaid) {
          updateData.paidAmount = deleteField()
        } else {
          updateData.paidAmount = totalPaid
        }

        try {
          await updateDoc(doc(db, ORDERS_COLLECTION, order.id), updateData)
          console.log(`✅ Removed orphan payments from order ${order.id}`)
        } catch (err) {
          console.error(`Failed to update order ${order.id} during reconciliation:`, err)
        }
      }
    }
    console.log(`✅ Reconciliation complete. Removed ${removedCount} orphan payments.`)
  },

  // Distribute a payment amount to orders for a specific supplier (expense payment)
  async distributePaymentToSupplierOrders(supplier: string, amount: number, ledgerEntryId: string, note?: string): Promise<void> {
    const db = getDb()
    if (!db) return

    console.log(`🔄 Distributing payment of ₹${amount} to supplier: ${supplier}`)

    // Get all unpaid orders for this supplier
    // Note: We can't filter efficiently by 'paymentDue' AND 'supplier' without a composite index
    // So we fetch by supplier and filter in memory
    const q = query(collection(db, ORDERS_COLLECTION), where('supplier', '==', supplier))
    const snapshot = await getDocs(q)
    
    const unpaidOrders: Order[] = []
    snapshot.forEach((doc) => {
      const order = { id: doc.id, ...doc.data() } as Order
      if (!isExpensePaid(order)) {
        unpaidOrders.push(order)
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
      const amountDue = Math.max(0, originalTotal - paidSoFar)

      if (amountDue <= 0) continue

      // Determine how much to pay on this order
      const paymentForThisOrder = Math.min(remainingAmount, amountDue)

      // Create the payment record
      const paymentRecord: PaymentRecord = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        amount: paymentForThisOrder,
        date: new Date().toISOString(),
        ledgerEntryId, // Link back to the source ledger entry
        note: note || 'Auto-distributed from ledger payment',
      }

      // Update the order
      const newPartialPayments = [...existingPayments, paymentRecord]
      const newTotalPaid = paidSoFar + paymentForThisOrder
      const isNowPaid = newTotalPaid >= (originalTotal - 250) // 250 tolerance

      const updateData: any = {
        partialPayments: newPartialPayments,
        paid: isNowPaid,
        paymentDue: !isNowPaid,
        updatedAt: new Date().toISOString()
      }

      if (isNowPaid) {
        updateData.paidAmount = deleteField()
      } else {
        updateData.paidAmount = newTotalPaid
      }

      await updateDoc(doc(db, ORDERS_COLLECTION, order.id), updateData)
      
      console.log(`✅ Paid ₹${paymentForThisOrder} on order ${order.id} (Remaining: ₹${remainingAmount - paymentForThisOrder})`)
      
      remainingAmount -= paymentForThisOrder
    }

    if (remainingAmount > 0) {
      console.log(`⚠️ Payment distribution complete. ₹${remainingAmount} remaining undistributed (no more unpaid orders).`)
    } else {
      console.log('✅ Payment fully distributed.')
    }
  }
}
