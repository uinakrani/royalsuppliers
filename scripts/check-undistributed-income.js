const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://orders-38fca.firebaseio.com'
});

const db = admin.firestore();

async function checkUndistributedIncome() {
  console.log('🔍 Checking for undistributed income entries...');

  const ledgerSnapshot = await db.collection('ledgerEntries')
    .where('type', '==', 'credit')
    .get();

  console.log(`Found ${ledgerSnapshot.size} income entries`);

  for (const doc of ledgerSnapshot.docs) {
    const entry = { id: doc.id, ...doc.data() };

    if (entry.partyName) {
      console.log(`Income entry ${entry.id}: ₹${entry.amount} for party '${entry.partyName}'`);

      // Check if this income has been distributed by looking for orders with payments from this ledger entry
      const ordersSnapshot = await db.collection('orders').get();
      let foundPayments = false;

      for (const orderDoc of ordersSnapshot.docs) {
        const order = orderDoc.data();
        if (order.customerPayments && Array.isArray(order.customerPayments)) {
          const hasPaymentFromEntry = order.customerPayments.some(payment =>
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
      } else {
        console.log(`  ✅ DISTRIBUTED - Found orders with payments from this entry`);
      }
    } else {
      console.log(`Income entry ${entry.id}: ₹${entry.amount} (no party name)`);
    }
  }

  process.exit(0);
}

async function manuallyDistributeIncome(entryId) {
  console.log(`🔄 Manually distributing income entry: ${entryId}`);

  const entryDoc = await db.collection('ledgerEntries').doc(entryId).get();
  if (!entryDoc.exists) {
    console.error(`Entry ${entryId} not found`);
    return;
  }

  const entry = { id: entryDoc.id, ...entryDoc.data() };
  if (entry.type !== 'credit' || !entry.partyName) {
    console.error(`Entry ${entryId} is not a valid income entry with party name`);
    return;
  }

  // Import the distribution logic from the app
  const { orderService } = require('../lib/orderService');

  try {
    await distributeIncomeToOrders(entry.id, entry.amount, entry.partyName, entry.date);
    console.log(`✅ Successfully distributed income entry ${entryId}`);
  } catch (error) {
    console.error(`❌ Failed to distribute income entry ${entryId}:`, error);
  }

  process.exit(0);
}

// Intelligent income distribution logic
async function distributeIncomeToOrders(entryId, incomeAmount, partyName, incomeDate) {
  try {
    console.log(`🔄 Intelligently distributing income ${incomeAmount} for party ${partyName} (ledger entry ${entryId})`);

    // Get all orders for this party
    const allOrders = await orderService.getAllOrders({ partyName });

    if (allOrders.length === 0) {
      console.warn(`No orders found for party ${partyName}`);
      return;
    }

    console.log(`📦 Found ${allOrders.length} orders for party ${partyName}`);

    // Calculate current payment status for each order
    const orderStatuses = allOrders.map(order => {
      if (!order.id) return null;

      const existingPayments = order.customerPayments || [];
      const totalPaid = existingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remaining = Math.max(0, (order.total || 0) - totalPaid);

      return {
        id: order.id,
        total: order.total || 0,
        totalPaid,
        remaining,
        existingPayments,
        profit: order.profit || 0
      };
    }).filter(Boolean);

    if (orderStatuses.length === 0) {
      console.warn(`No valid orders found for party ${partyName}`);
      return;
    }

    // Sort orders by remaining amount (smallest first) to prioritize exact matches
    orderStatuses.sort((a, b) => a.remaining - b.remaining);

    let remainingIncome = incomeAmount;
    const paymentsToAdd = [];

    // Strategy 1: Try exact matches first (orders that need exactly the remaining income)
    for (const orderStatus of orderStatuses) {
      if (remainingIncome <= 0) break;

      // Skip if this order is already fully paid
      if (orderStatus.remaining <= 0) continue;

      // Check if this payment exactly matches what the order needs
      if (Math.abs(orderStatus.remaining - remainingIncome) < 0.01) {
        const paymentAmount = orderStatus.remaining;

        const payment = createPayment(paymentAmount, incomeDate, entryId);
        const updatedPayments = [...orderStatus.existingPayments.filter(p => p.ledgerEntryId !== entryId), payment];

        paymentsToAdd.push({ orderId: orderStatus.id, payment: updatedPayments, orderStatus });
        remainingIncome -= paymentAmount;

        console.log(`  🎯 EXACT MATCH: Applied ${paymentAmount} to order ${orderStatus.id} (exactly what was needed)`);
        break; // Exact match found, move to next strategy
      }
    }

    // Strategy 2: Apply to orders that need payment, preferring those closest to the payment amount
    if (remainingIncome > 0) {
      // Sort by how well the remaining amount fits (closest to payment amount first)
      const payableOrders = orderStatuses
        .filter(order => order.remaining > 0)
        .map(order => ({
          ...order,
          fitScore: Math.abs(order.remaining - remainingIncome) // Lower score = better fit
        }))
        .sort((a, b) => a.fitScore - b.fitScore);

      for (const orderStatus of payableOrders) {
        if (remainingIncome <= 0) break;

        const paymentAmount = Math.min(remainingIncome, orderStatus.remaining);

        if (paymentAmount > 0) {
          const payment = createPayment(paymentAmount, incomeDate, entryId);
          const updatedPayments = [...orderStatus.existingPayments.filter(p => p.ledgerEntryId !== entryId), payment];

          paymentsToAdd.push({ orderId: orderStatus.id, payment: updatedPayments, orderStatus });
          remainingIncome -= paymentAmount;

          const overpayment = paymentAmount > orderStatus.remaining ? paymentAmount - orderStatus.remaining : 0;
          if (overpayment > 0) {
            console.log(`  ⚠️ OVERPAYMENT: Applied ${paymentAmount} to order ${orderStatus.id} (${orderStatus.remaining} needed, ${overpayment} extra will be deducted from profit)`);
          } else {
            console.log(`  ✓ Applied ${paymentAmount} to order ${orderStatus.id} (${orderStatus.remaining - paymentAmount} still needed)`);
          }
        }
      }
    }

    // Strategy 3: If still income remaining and we have overpaid orders, apply to any order (will be treated as overpayment)
    if (remainingIncome > 0 && paymentsToAdd.length > 0) {
      // Find the last order we paid to apply the remainder
      const lastPayment = paymentsToAdd[paymentsToAdd.length - 1];
      const additionalPayment = createPayment(remainingIncome, incomeDate, entryId);
      const updatedPayments = [...lastPayment.payment, additionalPayment];

      // Replace the last payment with the updated one
      paymentsToAdd[paymentsToAdd.length - 1] = {
        ...lastPayment,
        payment: updatedPayments
      };

      console.log(`  💰 OVERPAYMENT: Applied remaining ${remainingIncome} to order ${lastPayment.orderId} (will be deducted from profit as revenue adjustment)`);
      remainingIncome = 0;
    }

    console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingIncome} remaining undistributed`);

    // Update orders with new payment distributions
    for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
      await db.collection('orders').doc(orderId).update({
        customerPayments: updatedPayments,
      });
      console.log(`  ✅ Updated order ${orderId} with new customer payment distribution`);
    }

    if (remainingIncome > 0) {
      console.warn(`⚠️ Could not fully distribute income of ${incomeAmount}. Remaining undistributed: ${remainingIncome}`);
      console.log(`💡 Tip: This might indicate the party paid more than their outstanding orders. The overpayment will be tracked as revenue adjustment.`);
    } else {
      console.log(`✅ Successfully distributed income ${incomeAmount} across orders with intelligent matching`);
    }
  } catch (error) {
    console.error('❌ Error distributing income to orders:', error);
    throw error;
  }
}

function createPayment(amount, incomeDate, entryId) {
  // Convert date to ISO string if needed
  let paymentDate = incomeDate;
  if (paymentDate && !paymentDate.includes('T')) {
    paymentDate = new Date(paymentDate + 'T00:00:00').toISOString();
  }

  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    amount: amount,
    date: paymentDate,
    note: `From ledger entry`,
    ledgerEntryId: entryId,
  };
}

// Main execution
const command = process.argv[2];
const entryId = process.argv[3];

if (command === 'check') {
  checkUndistributedIncome().catch(console.error);
} else if (command === 'distribute' && entryId) {
  manuallyDistributeIncome(entryId).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node check-undistributed-income.js check');
  console.log('  node check-undistributed-income.js distribute <entryId>');
  process.exit(1);
}
