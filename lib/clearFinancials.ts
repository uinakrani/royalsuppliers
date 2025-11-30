
import { getDb } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

export const clearFinancials = async () => {
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
  console.log('Clearing ledger entries...');
  const ledgerSnapshot = await getDocs(collection(db, 'ledger'));
  ledgerSnapshot.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
    operationCount++;
  });

  // 2. Clear Party Payments (linked to ledger or otherwise)
  console.log('Clearing party payments...');
  const partyPaymentsSnapshot = await getDocs(collection(db, 'partyPayments'));
  partyPaymentsSnapshot.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
    operationCount++;
  });

  // 3. Clear Ledger Activities
  console.log('Clearing ledger activities...');
  const activitiesSnapshot = await getDocs(collection(db, 'ledgerActivities'));
  activitiesSnapshot.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
    operationCount++;
  });
  
  if (operationCount >= MAX_BATCH_SIZE) await commitBatch();


  // 4. Update Orders (Clear partialPayments and customerPayments)
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
        adjustmentAmount: 0 // Clear adjustment amount too as it relates to profit
      });
      operationCount++;
    }

    if (operationCount >= MAX_BATCH_SIZE) {
      await commitBatch();
    }
  }

  await commitBatch();
  console.log('Financial data cleared successfully.');
};

