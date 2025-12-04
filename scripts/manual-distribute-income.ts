import { getDb } from '../lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { orderService } from '../lib/orderService';

async function findUndistributedIncome() {
  console.log('🔍 Finding undistributed income entries...');

  const db = getDb();
  if (!db) {
    console.error('Firebase not configured');
    return [];
  }

  // Get all credit (income) entries
  const ledgerQuery = query(
    collection(db, 'ledgerEntries'),
    where('type', '==', 'credit')
  );

  const ledgerSnapshot = await getDocs(ledgerQuery);
  console.log(`Found ${ledgerSnapshot.size} income entries`);

  const undistributed: any[] = [];

  for (const doc of ledgerSnapshot.docs) {
    const data = doc.data() as any;
    const entry = { id: doc.id, ...data };

    if (entry.partyName) {
      console.log(`Checking income entry ${entry.id}: ₹${entry.amount} for party '${entry.partyName}'`);

      // Check if this income has been distributed by looking for orders with payments from this ledger entry
      const allOrders = await orderService.getAllOrders({ partyName: entry.partyName });
      let foundPayments = false;

      for (const order of allOrders) {
        if (order.customerPayments && Array.isArray(order.customerPayments)) {
          const hasPaymentFromEntry = order.customerPayments.some((payment: any) =>
            payment.ledgerEntryId === entry.id
          );
          if (hasPaymentFromEntry) {
            foundPayments = true;
            break;
          }
        }
      }

      if (!foundPayments) {
        console.log(`  ❌ NOT DISTRIBUTED - No orders found with payments from this entry`);
        undistributed.push(entry);
      } else {
        console.log(`  ✅ DISTRIBUTED - Found orders with payments from this entry`);
      }
    }
  }

  return undistributed;
}

async function distributeIncomeToOrders(entryId: string, incomeAmount: number, partyName: string, incomeDate: string) {
  console.log(`🔄 Distributing income ${incomeAmount} for party ${partyName} (ledger entry ${entryId})`);

  const db = getDb();
  if (!db) return;

  // Get all orders for this party
  const allOrders = await orderService.getAllOrders({ partyName });

  if (allOrders.length === 0) {
    console.warn(`No orders found for party ${partyName}`);
    return;
  }

  console.log(`📦 Found ${allOrders.length} orders for party ${partyName}`);

  // Calculate total order value across all orders for this party
  const totalOrderValue = allOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  console.log(`💰 Total order value across ${allOrders.length} orders: ${totalOrderValue}`);

  if (totalOrderValue <= 0) {
    console.warn(`No valid order totals found for party ${partyName}`);
    return;
  }

  let remainingIncome = incomeAmount;
  const paymentsToAdd: Array<{ orderId: string; payment: any[] }> = [];

  // Distribute income proportionally across all orders based on their total value
  for (const order of allOrders) {
    if (remainingIncome <= 0) break;

    if (!order.id) {
      console.warn(`  ⚠️ Order missing ID, skipping`);
      continue;
    }

    const sellingTotal = order.total || 0;
    const existingPayments = order.customerPayments || [];
    const totalPaid = existingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remaining = Math.max(0, sellingTotal - totalPaid);

    // Calculate proportional amount based on order's share of total value
    const proportionalAmount = Math.round((sellingTotal / totalOrderValue) * incomeAmount * 100) / 100;

    // But don't pay more than the remaining amount for this order
    const paymentAmount = Math.min(proportionalAmount, remainingIncome, remaining);

    if (paymentAmount <= 0) continue;

    // Convert date to ISO string if needed
    let paymentDate = incomeDate;
    if (paymentDate && !paymentDate.includes('T')) {
      paymentDate = new Date(paymentDate + 'T00:00:00').toISOString();
    }

    const payment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: paymentAmount,
      date: paymentDate,
      note: `From ledger entry`,
      ledgerEntryId: entryId,
    };

    const paymentsWithoutThisEntry = existingPayments.filter(p => p.ledgerEntryId !== entryId);
    const updatedPayments = [...paymentsWithoutThisEntry, payment];

    paymentsToAdd.push({ orderId: order.id, payment: updatedPayments });
    remainingIncome -= paymentAmount;

    console.log(`  ✓ Adding customer payment of ${paymentAmount} to order ${order.id} (proportional share: ${proportionalAmount}, actual: ${paymentAmount}, income remaining: ${remainingIncome})`);
  }

  console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingIncome} remaining undistributed`);

  // Update orders with new payment distributions
  for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
    await updateDoc(doc(db, 'orders', orderId), {
      customerPayments: updatedPayments,
    });
    console.log(`  ✅ Updated order ${orderId} with new customer payment distribution`);
  }

  if (remainingIncome > 0) {
    console.warn(`⚠️ Could not fully distribute income of ${incomeAmount}. Remaining undistributed: ${remainingIncome}`);
  } else {
    console.log(`✅ Successfully distributed income ${incomeAmount} across orders`);
  }
}

async function main() {
  try {
    const undistributed = await findUndistributedIncome();

    if (undistributed.length === 0) {
      console.log('🎉 All income entries are already distributed!');
      return;
    }

    console.log(`\n📋 Found ${undistributed.length} undistributed income entries:`);
    undistributed.forEach(entry => {
      console.log(`- ${entry.id}: ₹${entry.amount} for party '${entry.partyName}'`);
    });

    // Auto-distribute all undistributed entries
    for (const entry of undistributed) {
      console.log(`\n🚀 Distributing entry ${entry.id}...`);
      await distributeIncomeToOrders(entry.id, entry.amount, entry.partyName, entry.date);
    }

    console.log(`\n🎉 Successfully distributed ${undistributed.length} income entries!`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
main().catch(console.error);
