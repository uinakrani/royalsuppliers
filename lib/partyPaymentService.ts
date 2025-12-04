
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, writeBatch } from 'firebase/firestore';
import { getDb } from './firebase';
import { orderService } from './orderService';
import { PaymentRecord } from '@/types/order';

export interface PartyPayment {
  id?: string
  partyName: string
  amount: number
  date: string
  ledgerEntryId?: string
  note?: string | null
  createdAt?: string
  updatedAt?: string
}

const calculateRevenueAdjustment = (sellingTotal: number, payments: PaymentRecord[]): number => {
  if (!payments || payments.length === 0) return 0
  const expected = Number(sellingTotal || 0)
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const delta = totalPaid - expected
  return Math.abs(delta) < 0.01 ? 0 : Number(delta.toFixed(2))
}

export const partyPaymentService = {
  async getAllPayments(): Promise<PartyPayment[]> {
    const db = getDb()
    if (!db) return []

    const payments: PartyPayment[] = []
    const q = query(collection(db, 'partyPayments'), orderBy('date', 'desc'))
    const snapshot = await getDocs(q)

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>
      let dateValue = data.date
      if (dateValue && typeof dateValue.toDate === 'function') {
        dateValue = data.date.toDate().toISOString()
      }

      let createdAtValue = data.createdAt
      if (createdAtValue && typeof (createdAtValue as any).toDate === 'function') {
        createdAtValue = (createdAtValue as any).toDate().toISOString()
      }
      let updatedAtValue = data.updatedAt
      if (updatedAtValue && typeof (updatedAtValue as any).toDate === 'function') {
        updatedAtValue = (updatedAtValue as any).toDate().toISOString()
      }

      payments.push({
        id: docSnap.id,
        partyName: data.partyName,
        amount: Number(data.amount || 0),
        date: dateValue,
        ledgerEntryId: data.ledgerEntryId,
        note: data.note ?? null,
        createdAt: createdAtValue,
        updatedAt: updatedAtValue,
      })
    })

    // Ensure newest first (fallback if Firestore ordering missing)
    payments.sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0
      const bTime = b.date ? new Date(b.date).getTime() : 0
      return bTime - aTime
    })

    return payments
  },

  async addPayment(partyName: string, amount: number, note?: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    if (!partyName?.trim()) {
      throw new Error('Party name is required')
    }
    if (!amount || amount <= 0) {
      throw new Error('Payment amount must be greater than zero')
    }

    const normalizedParty = partyName.trim()
    const paymentDate = new Date().toISOString()
    const preparedNote = note?.trim()

    const { ledgerService } = await import('./ledgerService')
    const ledgerEntryId = await ledgerService.addEntry(
      'credit',
      amount,
      preparedNote,
      'partyPayment',
      paymentDate,
      undefined,
      normalizedParty
    )

    await addDoc(collection(db, 'partyPayments'), {
      partyName: normalizedParty,
      amount,
      date: paymentDate,
      note: preparedNote || null,
      ledgerEntryId,
      createdAt: paymentDate,
      updatedAt: paymentDate,
    })
  },

  async removePayment(paymentId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    if (!paymentId) {
      throw new Error('Payment ID is required')
    }

    const paymentRef = doc(db, 'partyPayments', paymentId)
    const paymentSnap = await getDoc(paymentRef)

    if (!paymentSnap.exists()) {
      throw new Error('Payment not found')
    }

    const data = paymentSnap.data() as PartyPayment
    const ledgerEntryId = data.ledgerEntryId

    // Remove ledger entry first so that distribution & reconciliations happen
    if (ledgerEntryId) {
      const { ledgerService } = await import('./ledgerService')
      await ledgerService.remove(ledgerEntryId)
    }

    await deleteDoc(paymentRef)
  },

  // Distribute an income ledger entry across a party's unpaid orders
  async distributePaymentToPartyOrders(
    partyName: string,
    amount: number,
    ledgerEntryId: string,
    paymentDate: string,
    note?: string
  ): Promise<void> {
    const db = getDb();
    if (!db) {
      console.error('❌ Firebase not configured for party payment distribution');
      return;
    }

    console.log(`🔄 Distributing income of ₹${amount} to party: ${partyName} (ledger entry: ${ledgerEntryId})`);

    // Get all orders for this party
    const allOrders = await orderService.getAllOrders({ partyName });

    // Sort by date (oldest first)
    allOrders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`📋 Found ${allOrders.length} orders for party ${partyName}`);

    if (allOrders.length === 0) {
      console.warn(`⚠️ No orders found for party ${partyName}. Cannot distribute income.`);
      return;
    }

    // Calculate total order value across all orders for this party
    const totalOrderValue = allOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    if (totalOrderValue <= 0) {
      console.warn(`No valid order totals found for party ${partyName}`);
      return;
    }

    let remainingAmount = amount;
    const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = [];
    const batch = writeBatch(db);

    // Distribute income proportionally across all orders based on their total value
    for (const order of allOrders) {
      if (remainingAmount <= 0) break;
      if (!order.id) continue;

      const sellingTotal = order.total || 0;
      const existingPayments = order.customerPayments || [];
      const paidSoFar = existingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remaining = Math.max(0, sellingTotal - paidSoFar);

      // Calculate proportional amount based on order's share of total value
      const proportionalAmount = Math.round((sellingTotal / totalOrderValue) * amount * 100) / 100;

      // But don't pay more than the remaining amount for this order
      const paymentForThisOrder = Math.min(proportionalAmount, remainingAmount, remaining);

      if (paymentForThisOrder <= 0) continue;

      const recordedAt = new Date().toISOString();
      const paymentRecord: PaymentRecord = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        amount: paymentForThisOrder,
        date: paymentDate,
        createdAt: recordedAt,
        ledgerEntryId,
        note: note || 'Auto-distributed from party payment',
      };

      const newCustomerPayments = [...existingPayments, paymentRecord];

      paymentsToAdd.push({ orderId: order.id, payment: newCustomerPayments });

      console.log(`  ✓ Adding customer payment of ${paymentForThisOrder} to order ${order.id} (proportional share: ${proportionalAmount}, actual: ${paymentForThisOrder}, income remaining: ${remainingAmount})`);
      remainingAmount -= paymentForThisOrder;
    }

    console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingAmount} remaining undistributed`);

    // Update orders with new payment distributions
    for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
      const order = allOrders.find(o => o.id === orderId);
      if (!order) continue;

      const sellingTotal = order.total || 0;
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const isNowPartyPaid = newTotalPaid >= (sellingTotal - 250); // 250 tolerance

      const orderRef = doc(db, 'orders', orderId);
      batch.update(orderRef, {
        customerPayments: updatedPayments,
        partyPaid: isNowPartyPaid,
        revenueAdjustment: calculateRevenueAdjustment(sellingTotal, updatedPayments),
      });

      console.log(`  ✅ Updated order ${orderId} with new customer payment distribution`);
    }

    // Commit all the batch updates
    await batch.commit();

    // Handle overpayment by adding it to the last processed order's profit
    if (remainingAmount > 0 && paymentsToAdd.length > 0) {
      const lastProcessedOrderId = paymentsToAdd[paymentsToAdd.length - 1].orderId;
      const lastProcessedOrder = allOrders.find(o => o.id === lastProcessedOrderId);
      if (lastProcessedOrder && lastProcessedOrder.id) {
        console.log(
          `💰 Overpayment of ₹${remainingAmount} detected. Applying to order ${lastProcessedOrder.id} as revenue adjustment.`,
        );
        const orderRef = doc(db, 'orders', lastProcessedOrder.id);

        const existingRevenueAdj = Number(lastProcessedOrder.revenueAdjustment || 0);
        const batch2 = writeBatch(db);
        batch2.update(orderRef, {
          revenueAdjustment: existingRevenueAdj + remainingAmount,
        });
        await batch2.commit();
      }
    }
    console.log('✅ Party payment distribution complete.');
  },

  // Reconcile party payments: Remove payments linked to deleted ledger entries
  async reconcilePartyPayments(partyName: string, validLedgerEntryIds: string[]): Promise<void> {
    const db = getDb();
    if (!db) return;

    const validIdsSet = new Set(validLedgerEntryIds);
    console.log(`🔄 Reconciling payments for party: ${partyName}`);

    const allOrders = await orderService.getAllOrders({ partyName });
    const batch = writeBatch(db);

    for (const order of allOrders) {
      if (!order.id || !order.customerPayments || order.customerPayments.length === 0) {
        continue;
      }

      const validPayments = order.customerPayments.filter(p => 
        !p.ledgerEntryId || validIdsSet.has(p.ledgerEntryId)
      );

      if (validPayments.length < order.customerPayments.length) {
        const orderRef = doc(db, 'orders', order.id);
        const newTotalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
        const isNowPartyPaid = newTotalPaid >= ((order.total || 0) - 250);

        batch.update(orderRef, {
          customerPayments: validPayments,
          partyPaid: isNowPartyPaid,
          revenueAdjustment: calculateRevenueAdjustment(order.total || 0, validPayments),
        });
        console.log(`🧹 Cleaned up orphan customer payments from order ${order.id}`);
      }
    }

    await batch.commit();
    console.log('✅ Party payment reconciliation complete.');
  },
};

