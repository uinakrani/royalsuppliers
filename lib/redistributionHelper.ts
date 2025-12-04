// Manual redistribution helper for fixing payment distribution issues
import { getDb } from './firebase';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { orderService } from './orderService';

function calculateRevenueAdjustment(sellingTotal: number, payments: any[]): number {
  if (!payments || payments.length === 0) return 0;
  const expected = Number(sellingTotal || 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const delta = totalPaid - expected;
  return Math.abs(delta) < 0.01 ? 0 : Number(delta.toFixed(2));
}

export async function redistributePartyPayments(partyName: string) {
  console.log(`🔄 Redistributing all payments for party: ${partyName}`);

  const db = getDb();
  if (!db) {
    console.error('❌ Firebase not configured');
    return;
  }

  try {
    // Get all ledger entries (income) for this party
    const ledgerQuery = query(
      collection(db, 'ledgerEntries'),
      where('type', '==', 'credit'),
      where('partyName', '==', partyName)
    );

    const ledgerSnapshot = await getDocs(ledgerQuery);
    console.log(`Found ${ledgerSnapshot.size} income entries for party ${partyName}`);

    if (ledgerSnapshot.size === 0) {
      console.log(`No income entries found for party ${partyName}`);
      return;
    }

    // Calculate total income for this party
    let totalIncome = 0;
    const incomeEntries: any[] = [];

    for (const doc of ledgerSnapshot.docs) {
      const data = doc.data() as any;
      const entry = { id: doc.id, ...data };
      totalIncome += entry.amount;
      incomeEntries.push(entry);
      console.log(`Income entry ${entry.id}: ₹${entry.amount}`);
    }

    console.log(`Total income for ${partyName}: ₹${totalIncome}`);

    // Get all orders for this party
    const orders = await orderService.getAllOrders({ partyName });
    console.log(`Found ${orders.length} orders for party ${partyName}`);

    if (orders.length === 0) {
      console.log(`No orders found for party ${partyName}`);
      return;
    }

    // Calculate total order value
    const totalOrderValue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    console.log(`Total order value: ₹${totalOrderValue}`);

    if (totalOrderValue <= 0) {
      console.log(`No valid order totals found`);
      return;
    }

    // Clear existing customer payments for these orders (from income entries)
    console.log(`🧹 Clearing existing customer payments from income entries...`);
    for (const order of orders) {
      if (!order.id) continue;

      const existingPayments = order.customerPayments || [];
      const paymentsWithoutIncome = existingPayments.filter((p: any) =>
        !p.ledgerEntryId || !incomeEntries.some((entry: any) => entry.id === p.ledgerEntryId)
      );

      if (paymentsWithoutIncome.length !== existingPayments.length) {
        await updateDoc(doc(db, 'orders', order.id), {
          customerPayments: paymentsWithoutIncome,
        });
        console.log(`Cleared ${existingPayments.length - paymentsWithoutIncome.length} income payments from order ${order.id}`);
      }
    }

    // Redistribute income proportionally
    console.log(`🚀 Redistributing ₹${totalIncome} proportionally across ${orders.length} orders...`);

    let remainingIncome = totalIncome;
    const paymentsToAdd: Array<{ orderId: string; payment: any[] }> = [];

    for (const order of orders) {
      if (remainingIncome <= 0) break;
      if (!order.id) continue;

      const sellingTotal = order.total || 0;
      const existingPayments = order.customerPayments || [];
      const paidSoFar = existingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remaining = Math.max(0, sellingTotal - paidSoFar);

      // Calculate proportional amount
      const proportionalAmount = Math.round((sellingTotal / totalOrderValue) * totalIncome * 100) / 100;

      // Don't pay more than remaining
      const paymentAmount = Math.min(proportionalAmount, remainingIncome, remaining);

      if (paymentAmount <= 0) continue;

      // Create payment record - distribute proportionally across income entries
      const paymentRecords: any[] = [];
      let remainingPayment = paymentAmount;

      for (const entry of incomeEntries) {
        if (remainingPayment <= 0) break;

        const entryShare = Math.min(
          Math.round((entry.amount / totalIncome) * paymentAmount * 100) / 100,
          remainingPayment,
          entry.amount
        );

        if (entryShare > 0) {
          paymentRecords.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            amount: entryShare,
            date: entry.date,
            note: `Redistributed from income entries`,
            ledgerEntryId: entry.id,
          });
          remainingPayment -= entryShare;
        }
      }

      const newCustomerPayments = [...existingPayments, ...paymentRecords];
      paymentsToAdd.push({ orderId: order.id, payment: newCustomerPayments });

      remainingIncome -= paymentAmount;
      console.log(`✓ Added ₹${paymentAmount} to order ${order.id} (${paymentRecords.length} payment records)`);
    }

    // Update orders with new payments
    for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
      const order = orders.find(o => o.id === orderId);
      if (!order) continue;

      const sellingTotal = order.total || 0;
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const isNowPartyPaid = newTotalPaid >= (sellingTotal - 100); // 100 tolerance

      await updateDoc(doc(db, 'orders', orderId), {
        customerPayments: updatedPayments,
        partyPaid: isNowPartyPaid,
        revenueAdjustment: calculateRevenueAdjustment(sellingTotal, updatedPayments),
      });

      console.log(`✅ Updated order ${orderId} with redistributed payments`);
    }

    console.log(`🎉 Successfully redistributed ₹${totalIncome} for party ${partyName}`);

  } catch (error) {
    console.error('❌ Error redistributing payments:', error);
  }
}

// Make it available globally for console use
if (typeof window !== 'undefined') {
  (window as any).redistributePartyPayments = redistributePartyPayments;
}
