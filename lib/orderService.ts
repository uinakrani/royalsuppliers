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

      // If order is paid and paidAmountForRawMaterials is provided, create partial payment record
      if (!order.paymentDue && order.paid && paidAmountForRawMaterials && paidAmountForRawMaterials > 0) {
        const paymentRecord: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paidAmountForRawMaterials,
          date: new Date().toISOString(),
        }
        orderData.partialPayments = [paymentRecord]
        orderData.paidAmount = paidAmountForRawMaterials
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

      // Create ledger entry for the actual paid amount (not the full originalTotal)
      // Only add ledger entry if order is paid (not paymentDue)
      if (!order.paymentDue && order.paid) {
        try {
          // Use the paid amount if provided, otherwise use full originalTotal
          const ledgerAmount = paidAmountForRawMaterials && paidAmountForRawMaterials > 0 
            ? paidAmountForRawMaterials 
            : expenseAmount
          
          if (ledgerAmount > 0) {
            const note = `Order expense - ${order.partyName} (${order.siteName})`
            await ledgerService.addEntry('debit', ledgerAmount, note, 'orderExpense')
          }
          
          // If paid less than originalTotal, add the difference as additional profit (credit)
          if (paidAmountForRawMaterials && paidAmountForRawMaterials > 0 && paidAmountForRawMaterials < expenseAmount) {
            const additionalProfit = expenseAmount - paidAmountForRawMaterials
            const profitNote = `Order additional profit (saved on raw materials) - ${order.partyName} (${order.siteName})`
            await ledgerService.addEntry('credit', additionalProfit, profitNote, 'orderProfit')
          }
        } catch (e) {
          console.warn('Ledger entry for order expense failed (non-fatal):', e)
        }
      }

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
      // Get existing order to check payment status changes
      const existingOrder = await this.getOrderById(id)
      if (!existingOrder) {
        throw new Error('Order not found')
      }

      // Check if order is being changed from "due" to "paid"
      const wasDue = existingOrder.paymentDue && !existingOrder.paid
      // Order will be paid if: paid is explicitly true, or paymentDue is explicitly false and paid is not explicitly false
      const willBePaid = order.paid === true || (order.paymentDue === false && order.paid !== false)
      
      // Also check if we're just marking as paid without changing paymentDue
      const isMarkingAsPaid = order.paid === true && existingOrder.paymentDue && !existingOrder.paid
      
      // Get updated originalTotal value if provided (for expense calculation)
      let nextOriginal = 0
      if (Object.prototype.hasOwnProperty.call(order, 'originalTotal')) {
        nextOriginal = Number(order.originalTotal || 0)
      }

      // Prepare update data
      const updateData: any = {
        ...order,
        updatedAt: new Date().toISOString(),
      }
      
      // Handle ledger entries and payment status
      try {
        // If order changed from "due" to "paid", create ledger entry for full expense
        // This happens when:
        // 1. Order was due and is now being marked as paid
        // 2. Order was due and paymentDue is being set to false with paid being true
        if (wasDue && (willBePaid || isMarkingAsPaid)) {
          // Use updated value if provided, otherwise use existing value
          // Expense amount is just originalTotal (raw material cost)
          const expenseAmount = Object.prototype.hasOwnProperty.call(order, 'originalTotal')
            ? nextOriginal
            : Number(existingOrder.originalTotal || 0)
          
          // Get the final total paid amount (from update data if provided, otherwise from existing)
          const finalPayments = order.partialPayments || existingOrder.partialPayments || []
          const totalPaid = finalPayments.reduce((sum, p) => sum + p.amount, 0)
          const remainingAmount = expenseAmount - totalPaid
          
          if (remainingAmount > 0) {
            const note = `Order expense - ${existingOrder.partyName} (${existingOrder.siteName})`
            await ledgerService.addEntry('debit', remainingAmount, note, 'orderExpense')
          }
          
          // If total paid is less than expense amount, add the difference as additional profit (credit)
          if (totalPaid > 0 && totalPaid < expenseAmount) {
            const additionalProfit = expenseAmount - totalPaid
            try {
              const profitNote = `Order additional profit (saved on raw materials) - ${existingOrder.partyName} (${existingOrder.siteName})`
              await ledgerService.addEntry('credit', additionalProfit, profitNote, 'orderProfit')
            } catch (e) {
              console.warn('Ledger entry for additional profit failed (non-fatal):', e)
            }
          }
          
          // Add order's profit as income (credit) when marking a due order as paid
          const orderProfit = Number(existingOrder.profit || 0)
          if (orderProfit > 0) {
            try {
              const profitNote = `Order profit - ${existingOrder.partyName} (${existingOrder.siteName})`
              await ledgerService.addEntry('credit', orderProfit, profitNote, 'orderProfit')
            } catch (e) {
              console.warn('Ledger entry for order profit income failed (non-fatal):', e)
            }
          }
          
          // Clear partial payments when marking as paid directly (not through payment flow)
          // BUT only if partialPayments is not explicitly provided in the update data
          // (if it's provided, it means we're updating through addPaymentToOrder and want to keep the payments)
          if (isMarkingAsPaid && !Object.prototype.hasOwnProperty.call(order, 'partialPayments')) {
            updateData.partialPayments = []
            updateData.paidAmount = deleteField()
          }
        }
        // If expense amount changed and order is paid, post delta (only for originalTotal changes)
        else if (!existingOrder.paymentDue && existingOrder.paid) {
          // Only track changes to originalTotal, not additionalCost
          if (Object.prototype.hasOwnProperty.call(order, 'originalTotal')) {
            const prevOriginal = Number(existingOrder.originalTotal || 0)
            const newOriginal = nextOriginal
            const expenseDelta = newOriginal - prevOriginal
            
            if (expenseDelta !== 0) {
              if (expenseDelta > 0) {
                await ledgerService.addEntry(
                  'debit',
                  expenseDelta,
                  `Order expense updated - ${order.partyName || existingOrder.partyName}`.trim(),
                  'orderExpense'
                )
              } else {
                await ledgerService.addEntry(
                  'credit',
                  Math.abs(expenseDelta),
                  `Order expense reduced - ${order.partyName || existingOrder.partyName}`.trim(),
                  'orderExpense'
                )
              }
            }
          }
        }
      } catch (e) {
        console.warn('Ledger entry for order update failed (non-fatal):', e)
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
    const newPayment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: new Date().toISOString(),
    }
    const updatedPayments = [...existingPayments, newPayment]
    
    // Calculate total paid amount from payments array
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Check if fully paid (either by amount or by markAsPaid flag)
    const isFullyPaid = markAsPaid || totalPaid >= expenseAmount
    
    // Calculate profit adjustment: if marked as paid but paid less than expense, add difference to profit
    let profitAdjustment = 0
    if (isFullyPaid && totalPaid < expenseAmount) {
      // Remaining amount (expenseAmount - totalPaid) goes to profit
      profitAdjustment = expenseAmount - totalPaid
    }
    
    // Calculate new profit (current profit + adjustment)
    const currentProfit = Number(order.profit || 0)
    const newProfit = currentProfit + profitAdjustment
    
    // Create ledger entry for this payment (debit - expense)
    try {
      const ledgerNote = note && note.trim() 
        ? `Order expense payment - ${order.partyName} (${order.siteName}): ${note.trim()}`
        : `Order expense payment - ${order.partyName} (${order.siteName})`
      await ledgerService.addEntry('debit', paymentAmount, ledgerNote, 'orderExpense')
    } catch (e) {
      console.warn('Ledger entry for order payment failed (non-fatal):', e)
    }
    
    // If marked as paid with less than full payment, add the difference as additional profit (credit)
    if (profitAdjustment > 0) {
      try {
        const profitNote = `Order additional profit (saved on raw materials) - ${order.partyName} (${order.siteName})`
        await ledgerService.addEntry('credit', profitAdjustment, profitNote, 'orderProfit')
      } catch (e) {
        console.warn('Ledger entry for additional profit failed (non-fatal):', e)
      }
    }
    
    // Prepare update data
    const updateData: any = {
      paid: isFullyPaid,
      partialPayments: updatedPayments,
      paymentDue: !isFullyPaid,
    }
    
    // Set paidAmount only if not fully paid, otherwise delete it
    if (isFullyPaid) {
      updateData.paidAmount = deleteField()
    } else {
      updateData.paidAmount = totalPaid
    }
    
    // Update profit if there's an adjustment (when marked as paid with less than full payment)
    if (profitAdjustment > 0) {
      updateData.profit = newProfit
    }
    
    await this.updateOrder(id, updateData)
  },

  // Mark order as paid (fully or partially) - legacy function, kept for backward compatibility
  async markAsPaid(id: string, paidAmount?: number): Promise<void> {
    const order = await this.getOrderById(id)
    if (!order) {
      throw new Error('Order not found')
    }
    
    // Calculate expense amount (originalTotal only - raw material cost)
    const expenseAmount = Number(order.originalTotal || 0)
    const finalPaidAmount = paidAmount ?? expenseAmount
    const isFullyPaid = finalPaidAmount >= expenseAmount
    
    // Get existing partial payments
    const existingPayments = order.partialPayments || []
    
    // Calculate current total from existing payments
    const currentTotal = existingPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Calculate the new payment amount (difference between final and current)
    const newPaymentAmount = finalPaidAmount - currentTotal
    
    // If there's a new payment to add, create ledger entry
    if (newPaymentAmount > 0) {
      try {
        const note = `Order expense payment - ${order.partyName} (${order.siteName})`
        await ledgerService.addEntry('debit', newPaymentAmount, note, 'orderExpense')
      } catch (e) {
        console.warn('Ledger entry for order payment failed (non-fatal):', e)
      }
    }
    
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
      
      // Update ledger entries: credit old amount, debit new amount
      try {
        const amountDelta = newAmount - oldAmount
        if (amountDelta !== 0) {
          const note = `Payment updated - Order ${order.partyName} (${order.siteName})`
          if (amountDelta > 0) {
            // Payment increased, add debit entry
            await ledgerService.addEntry('debit', amountDelta, note, 'orderPaymentUpdate')
          } else {
            // Payment decreased, add credit entry
            await ledgerService.addEntry('credit', Math.abs(amountDelta), note, 'orderPaymentUpdate')
          }
        }
      } catch (e) {
        console.warn('Ledger entry for payment update failed (non-fatal):', e)
      }
      
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
      
      // Create credit ledger entry to reverse the payment
      try {
        const note = `Order expense payment removed - ${order.partyName} (${order.siteName})`
        await ledgerService.addEntry('credit', paymentToRemove.amount, note, 'orderExpense')
      } catch (e) {
        console.warn('Ledger entry for payment removal failed (non-fatal):', e)
      }
      
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

