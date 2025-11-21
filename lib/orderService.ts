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
import { ledgerService } from './ledgerService'

const ORDERS_COLLECTION = 'orders'

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

      // Prepare update data
      const updateData: any = {
        ...order,
        updatedAt: new Date().toISOString(),
      }
      
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
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const value = data[key]
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
    
    if (order.paid && !markAsPaid) {
      throw new Error('Order is already fully paid')
    }
    
    // Calculate expense amount (originalTotal only - raw material cost)
    const expenseAmount = Number(order.originalTotal || 0)
    
    // Get existing partial payments
    const existingPayments = order.partialPayments || []
    
    // Calculate current total from existing payments
    const currentTotal = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Calculate remaining amount
    const remainingAmount = expenseAmount - currentTotal
    
    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than 0')
    }
    
    // Payment cannot exceed the original total (expense amount)
    if (paymentAmount > expenseAmount) {
      throw new Error(`Payment amount (${paymentAmount}) cannot exceed original total (${expenseAmount})`)
    }
    
    // If markAsPaid is not true, validate that payment doesn't exceed remaining amount
    if (!markAsPaid && paymentAmount > remainingAmount) {
      throw new Error(`Payment amount (${paymentAmount}) exceeds remaining amount (${remainingAmount})`)
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
    
    // Calculate total paid amount from payments array
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Prepare update data
    const updateData: any = {
      partialPayments: updatedPayments,
    }
    
    await this.updateOrder(id, updateData)
  },


  // Update a specific partial payment record
  async updatePartialPayment(id: string, paymentId: string, updates: { amount?: number; date?: string }): Promise<void> {
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
    
    if (otherPaymentsTotal + newAmount > expenseAmount) {
      const { formatIndianCurrency } = await import('./currencyUtils')
      throw new Error(`Total payments cannot exceed original total of ${formatIndianCurrency(expenseAmount)}`)
    }
    
    // Update the payment record
    const updatedPayment: PaymentRecord = {
      ...paymentToUpdate,
      amount: newAmount,
      date: updates.date || paymentToUpdate.date,
    }
    
    const updatedPayments = [...existingPayments]
    updatedPayments[paymentIndex] = updatedPayment
    
    // Calculate total paid amount from all payments
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Calculate expense amount to check if still fully paid
    const isFullyPaid = totalPaid >= expenseAmount
    
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
    
    // Calculate total paid amount from remaining payments
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Calculate expense amount to check if still fully paid
    const expenseAmount = Number(order.originalTotal || 0)
    const isFullyPaid = totalPaid >= expenseAmount
    
    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        paid: isFullyPaid,
        paymentDue: !isFullyPaid,
        updatedAt: new Date().toISOString(),
      }
      
      if (totalPaid > 0) {
        updateData.paidAmount = totalPaid
        updateData.partialPayments = updatedPayments
      } else {
        // Remove fields if no payments remain
        updateData.paidAmount = deleteField()
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
}

