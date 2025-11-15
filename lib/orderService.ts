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

const ORDERS_COLLECTION = 'orders'

export const orderService = {
  // Create order
  async createOrder(order: Omit<Order, 'id'>): Promise<string> {
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
      const orderData = {
        ...order,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      console.log('Creating order in Firestore:', {
        collection: ORDERS_COLLECTION,
        data: orderData,
        dbInitialized: !!db
      })
      
      // Add timeout to prevent hanging (reduced to 10 seconds for faster feedback)
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
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      console.log('Updating order in Firestore:', id, order)
      await updateDoc(orderRef, {
        ...order,
        updatedAt: new Date().toISOString(),
      })
      console.log('Order updated successfully:', id)
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
    let q = query(collection(db, ORDERS_COLLECTION), orderBy('date', 'desc'))

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
      if (filters.paymentDue !== undefined) {
        q = query(q, where('paymentDue', '==', filters.paymentDue))
      }
    }

    const querySnapshot = await getDocs(q)
    const orders: Order[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      // Ensure partialPayments is properly formatted as an array
      const orderData: any = {
        id: doc.id,
        ...data,
      }
      
      // Ensure partialPayments is an array if it exists
      if (orderData.partialPayments && !Array.isArray(orderData.partialPayments)) {
        orderData.partialPayments = []
      }
      
      orders.push(orderData as Order)
    })

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

  // Mark order as paid (fully or partially)
  async markAsPaid(id: string, paidAmount?: number): Promise<void> {
    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }
    
    const finalPaidAmount = paidAmount ?? order.total
    const isFullyPaid = finalPaidAmount >= order.total
    
    // Get existing partial payments
    const existingPayments = order.partialPayments || []
    
    // Calculate current total from existing payments
    const currentTotal = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Calculate the new payment amount (difference between final and current)
    const newPaymentAmount = finalPaidAmount - currentTotal
    
    let updatedPayments: PaymentRecord[]
    if (isFullyPaid) {
      // If fully paid, clear partial payments
      updatedPayments = []
    } else if (newPaymentAmount > 0) {
      // Add new payment record
      const newPayment: PaymentRecord = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        amount: newPaymentAmount,
        date: new Date().toISOString(),
      }
      updatedPayments = [...existingPayments, newPayment]
    } else {
      // No change needed
      updatedPayments = existingPayments
    }
    
    // Calculate total paid amount from payments array
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    
    await this.updateOrder(id, {
      paid: isFullyPaid,
      paidAmount: isFullyPaid ? undefined : totalPaid,
      partialPayments: updatedPayments,
      paymentDue: !isFullyPaid,
    })
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
    
    try {
      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        paid: false,
        paymentDue: true,
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
}

