import { Order, OrderFilters, PaymentRecord } from '@/types/order'
import { partyPaymentService } from './partyPaymentService';


const ORDERS_COLLECTION = 'orders'

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

      // 1. Save Order Updates First
      await updateDoc(orderRef, updateData)
      console.log('Payment updated successfully:', paymentId)

      // 2. Sync with Ledger if linked (After saving order to ensure redistribution reads correct state)
      if (paymentToUpdate.ledgerEntryId) {
        try {
          const { ledgerService } = await import('./ledgerService')
          
          // Fetch entry to check for supplier linkage
          const entry = await ledgerService.getEntryById(paymentToUpdate.ledgerEntryId)
          
          if (entry) {
            let newLedgerAmount = newAmount
            
            // If supplier exists (Distributed Payment), calculate delta and update total
            if (entry.supplier) {
                const delta = newAmount - oldAmount
                newLedgerAmount = (entry.amount || 0) + delta
                console.log(`Update partial payment for supplier ledger entry. Old total: ${entry.amount}, Delta: ${delta}, New Total: ${newLedgerAmount}`)
            }
            
            // Update Ledger Entry
            // This forces date to 'now' inside ledgerService
            await ledgerService.update(paymentToUpdate.ledgerEntryId, {
              amount: newLedgerAmount,
              date: updates.date, 
            }, { fromOrder: true }) // Prevent loop
            console.log('✅ Synced payment update to ledger:', paymentToUpdate.ledgerEntryId)
            
            // Trigger Redistribution for Supplier Payments
            // Since fromOrder: true skips auto-redistribution in ledgerService, we trigger it here manually
            if (entry.supplier) {
                 const newDate = new Date().toISOString() 
                 await this.redistributeSupplierPayment(paymentToUpdate.ledgerEntryId, newDate)
            }
          }
        } catch (error) {
          console.error('❌ Failed to sync payment update to ledger:', error)
          // Don't fail the whole operation if ledger sync fails, but log it
        }
      }

    } catch (error: any) {
      console.error('Firestore error updating payment:', error)
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your Firestore security rules.')
      }
      throw new Error(`Failed to update payment: ${error.message || 'Unknown error'}`)
    }
  },

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
       // If the payment was linked to a ledger, its removal should trigger redistribution
      if (paymentToRemove.ledgerEntryId) {
        const { ledgerService } = await import('./ledgerService');
        const entry = await ledgerService.getEntryById(paymentToRemove.ledgerEntryId);
        if (entry && entry.partyName) {
           console.log(`Customer payment removal from order requires redistribution for party ${entry.partyName}`);
           // This logic will be complex. For now, just remove and let reconciliation handle it later.
           // A better approach would be to update the ledger entry amount.
           const newAmount = (entry.amount || 0) - paymentToRemove.amount;
           await ledgerService.update(paymentToRemove.ledgerEntryId, { amount: newAmount });
        }
      }

      const orderRef = doc(db, ORDERS_COLLECTION, id)
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        customerPayments: updatedPayments,
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
    const oldAmount = paymentToUpdate.amount;

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
      // Allow overpayment, it will be handled as profit adjustment during redistribution
      console.warn(`Customer overpayment detected on order ${id}. Total payments will be ${otherPaymentsTotal + newAmount} but order total is ${sellingAmount}. This will be adjusted as profit.`);
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

      // If the payment was linked to a ledger, its update should trigger redistribution
      if (paymentToUpdate.ledgerEntryId) {
        const { ledgerService } = await import('./ledgerService');
        const entry = await ledgerService.getEntryById(paymentToUpdate.ledgerEntryId);
        if (entry && entry.partyName) {
           console.log(`Customer payment update on order requires redistribution for party ${entry.partyName}`);
           const delta = newAmount - oldAmount;
           const newLedgerAmount = (entry.amount || 0) + delta;
           await ledgerService.update(paymentToUpdate.ledgerEntryId, { amount: newLedgerAmount });
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
