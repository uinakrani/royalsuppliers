
import { getDb } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

export interface ClearOptions {
  clearOrders?: boolean;
  clearInvestment?: boolean;
  clearLedger?: boolean;
  clearActivityLogs?: boolean;
  clearPartyPayments?: boolean;
  clearOrderPayments?: boolean;
}

export const clearFinancials = async (options: ClearOptions = {
  // Default to clearing everything except orders themselves (legacy behavior)
  clearOrders: false,
  clearInvestment: true,
  clearLedger: true,
  clearActivityLogs: true,
  clearPartyPayments: true,
  clearOrderPayments: true
}) => {
  const db = getDb();
  if (!db) {
    console.error('Firebase not initialized');
    return;
  }

  const batch = writeBatch(db);
  let operationCount = 0;
  const MAX_BATCH_SIZE = 450;

  const commitBatch = async () => {
    if (operationCount > 0) {
      await batch.commit();
      console.log(`Committed batch of ${operationCount} operations`);
      operationCount = 0;
    }
  };

  // 1. Clear Ledger Entries
  if (options.clearLedger) {
    console.log('Clearing ledger entries...');
    const ledgerSnapshot = await getDocs(collection(db, 'ledgerEntries'));
    ledgerSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });
  }

  // 2. Clear Party Payments
  if (options.clearPartyPayments) {
    console.log('Clearing party payments...');
    const partyPaymentsSnapshot = await getDocs(collection(db, 'partyPayments'));
    partyPaymentsSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });
  }

  // 3. Clear Activity Logs (Ledger + Investment)
  if (options.clearActivityLogs) {
    console.log('Clearing ledger activities...');
    const activitiesSnapshot = await getDocs(collection(db, 'ledgerActivities'));
    activitiesSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });

    console.log('Clearing investment activities...');
    const investmentActivitiesSnapshot = await getDocs(collection(db, 'investmentActivity'));
    investmentActivitiesSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });
  }

  // 4. Clear Investment
  if (options.clearInvestment) {
    console.log('Clearing investment...');
    const investmentSnapshot = await getDocs(collection(db, 'investment'));
    investmentSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });
  }

  if (operationCount >= MAX_BATCH_SIZE) await commitBatch();

  // 5. Update Orders (Clear payments) OR Delete Orders
  if (options.clearOrders) {
    console.log('Deleting all orders...');
    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    ordersSnapshot.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
      operationCount++;
    });
  } else if (options.clearOrderPayments) {
    console.log('Clearing order payments...');
    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    
    for (const orderDoc of ordersSnapshot.docs) {
      const orderRef = doc(db, 'orders', orderDoc.id);
      
      // Only update if there are payments to clear
      const data = orderDoc.data();
      if ((data.partialPayments && data.partialPayments.length > 0) || 
          (data.customerPayments && data.customerPayments.length > 0) ||
          data.adjustmentAmount) {
        
        batch.update(orderRef, {
          partialPayments: [],
          customerPayments: [],
          adjustmentAmount: 0
        });
        operationCount++;
      }

      if (operationCount >= MAX_BATCH_SIZE) {
        await commitBatch();
      }
    }
  }

  await commitBatch();
  console.log('Selected financial data cleared successfully.');
};
