'use client'

import { clearFinancials } from '@/lib/clearFinancials';
import { useState } from 'react';
import { sweetAlert } from '@/lib/sweetalert';
import NavBar from '@/components/NavBar';

export default function CleanPage() {
  const [status, setStatus] = useState('Idle');

  const handleClean = async () => {
    const confirmed = await sweetAlert.confirm({
      title: 'Clear Financial Data?',
      message: 'This will delete all ledger entries, payments, and reset order payment history. This cannot be undone.',
      icon: 'warning',
      confirmText: 'Yes, Clear Everything',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      setStatus('Cleaning...');
      try {
        await clearFinancials();
        setStatus('Done! Financials reset.');
        sweetAlert.success('Success', 'All financial data has been cleared.');
      } catch (error) {
        console.error(error);
        setStatus('Error: ' + error);
        sweetAlert.error('Error', 'Failed to clear data.');
      }
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Admin Maintenance</h1>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Clear all ledger entries, party payments, and reset all order payment histories. 
            Orders themselves will be preserved.
          </p>
          <button 
            onClick={handleClean}
            className="w-full bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 font-medium active:bg-red-800 transition-colors"
          >
            Clear All Financial Data
          </button>
          <p className="mt-4 text-sm text-gray-500 font-mono bg-gray-100 p-2 rounded">Status: {status}</p>
        </div>
      </div>
      <NavBar />
    </div>
  );
}
