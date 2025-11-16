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
import { Order } from '@/types/order'
import { format } from 'date-fns'

const INVOICES_COLLECTION = 'invoices'

// Generate invoice number: ROYAL + short timestamp
const generateInvoiceNumber = (): string => {
  const now = new Date()
  const timestamp = format(now, 'yyMMddHHmm')
  return `ROYAL${timestamp}`
}

export const invoiceService = {
  // Create invoice from orders
  async createInvoice(orderIds: string[]): Promise<string> {
    const db = getDb()
    
    if (!db) {
      throw new Error('Firebase db is not initialized. Check your Firebase configuration and .env.local file.')
    }
    
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
      
      // Calculate total amount
      const totalAmount = orders.reduce((sum, order) => sum + order.total, 0)
      
      // Get party name and site name from first order
      const partyName = orders[0].partyName
      const siteName = orders[0].siteName
      
      // Create invoice
      const createdAt = new Date().toISOString()
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week from now
      
      const invoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: generateInvoiceNumber(),
        orderIds,
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
      }
      
      const docRef = await addDoc(collection(db, INVOICES_COLLECTION), invoiceData)
      
      // Mark orders as invoiced
      for (const orderId of orderIds) {
        const order = await orderService.getOrderById(orderId)
        if (order) {
          await orderService.updateOrder(orderId, { 
            invoiced: true,
            invoiceId: docRef.id 
          } as any)
        }
      }
      
      console.log('✅ Invoice created successfully with ID:', docRef.id)
      return docRef.id
    } catch (error: any) {
      console.error('❌ Firestore error creating invoice:', error)
      throw new Error(`Failed to create invoice: ${error.message || 'Unknown error'}`)
    }
  },

  // Get all invoices
  async getAllInvoices(filters?: InvoiceFilters): Promise<Invoice[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    
    let q = query(collection(db, INVOICES_COLLECTION), orderBy('createdAt', 'desc'))

    if (filters) {
      if (filters.partyName) {
        q = query(q, where('partyName', '==', filters.partyName))
      }
      if (filters.paid !== undefined) {
        q = query(q, where('paid', '==', filters.paid))
      }
    }

    const querySnapshot = await getDocs(q)
    const invoices: Invoice[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      const invoiceData: Invoice = {
        id: doc.id,
        ...data,
      } as Invoice
      
      // Calculate overdue status
      if (!invoiceData.paid) {
        const dueDate = new Date(invoiceData.dueDate)
        const now = new Date()
        invoiceData.overdue = now > dueDate
      } else {
        invoiceData.overdue = false
      }
      
      invoices.push(invoiceData)
    })

    // Filter by date range in memory
    let filteredInvoices = invoices
    if (filters?.startDate || filters?.endDate) {
      filteredInvoices = invoices.filter((invoice) => {
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
    
    // Filter by overdue in memory
    if (filters?.overdue !== undefined) {
      filteredInvoices = filteredInvoices.filter((invoice) => invoice.overdue === filters.overdue)
    }

    return filteredInvoices
  },

  // Get invoice by ID
  async getInvoiceById(id: string): Promise<Invoice | null> {
    const invoices = await this.getAllInvoices()
    return invoices.find((inv) => inv.id === id) || null
  },

  // Add partial payment to invoice
  async addPayment(invoiceId: string, amount: number, note?: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    
    const invoice = await this.getInvoiceById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    
    const currentPaid = invoice.paidAmount || 0
    const newPaid = currentPaid + amount
    const isFullyPaid = newPaid >= invoice.totalAmount
    
    const newPayment: InvoicePayment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount,
      date: new Date().toISOString(),
      note,
    }
    
    const updatedPayments = [...(invoice.partialPayments || []), newPayment]
    
    try {
      const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId)
      await updateDoc(invoiceRef, {
        paidAmount: newPaid,
        partialPayments: updatedPayments,
        paid: isFullyPaid,
        overdue: false, // Reset overdue when payment is made
        updatedAt: new Date().toISOString(),
      })
      
      // If fully paid, archive the orders
      if (isFullyPaid && !invoice.archived) {
        await this.archiveOrders(invoiceId)
      }
      
      console.log('✅ Payment added successfully')
    } catch (error: any) {
      console.error('Error adding payment:', error)
      throw new Error(`Failed to add payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Remove a partial payment
  async removePayment(invoiceId: string, paymentId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    
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
    
    try {
      const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId)
      await updateDoc(invoiceRef, {
        paidAmount: newPaid,
        partialPayments: updatedPayments.length > 0 ? updatedPayments : deleteField(),
        paid: isFullyPaid,
        updatedAt: new Date().toISOString(),
      })
      
      // If no longer fully paid, unarchive orders
      if (!isFullyPaid && invoice.archived) {
        await this.unarchiveOrders(invoiceId)
      }
      
      console.log('✅ Payment removed successfully')
    } catch (error: any) {
      console.error('Error removing payment:', error)
      throw new Error(`Failed to remove payment: ${error.message || 'Unknown error'}`)
    }
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

  // Delete invoice
  async deleteInvoice(id: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    
    try {
      const invoice = await this.getInvoiceById(id)
      if (invoice) {
        // Unmark orders as invoiced
        for (const orderId of invoice.orderIds) {
          const orderRef = doc(db, 'orders', orderId)
          await updateDoc(orderRef, {
            invoiced: false,
            invoiceId: deleteField(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
      
      await deleteDoc(doc(db, INVOICES_COLLECTION, id))
      console.log('✅ Invoice deleted successfully')
    } catch (error: any) {
      console.error('Error deleting invoice:', error)
      throw new Error(`Failed to delete invoice: ${error.message || 'Unknown error'}`)
    }
  },

  // Get unique party names from invoices
  async getUniquePartyNames(): Promise<string[]> {
    const db = getDb()
    if (!db) {
      return []
    }
    
    try {
      const q = query(collection(db, INVOICES_COLLECTION))
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
}

