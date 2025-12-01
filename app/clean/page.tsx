'use client'

import { clearFinancials, ClearOptions } from '@/lib/clearFinancials';
import { useState } from 'react';
import { sweetAlert } from '@/lib/sweetalert';
import NavBar from '@/components/NavBar';
import { AlertTriangle, CheckSquare, Square, Trash2 } from 'lucide-react';

export default function CleanPage() {
  const [status, setStatus] = useState('Idle');
  const [options, setOptions] = useState<ClearOptions>({
    clearOrders: false,
    clearInvestment: false,
    clearLedger: false,
    clearActivityLogs: false,
    clearPartyPayments: false,
    clearOrderPayments: false,
  });

  const toggleOption = (key: keyof ClearOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClean = async () => {
    // Check if any option is selected
    if (!Object.values(options).some(v => v)) {
      sweetAlert.error('No Selection', 'Please select at least one data type to clear.');
      return;
    }

    const confirmed = await sweetAlert.confirm({
      title: 'Clear Selected Data?',
      message: 'This action is irreversible. Are you sure you want to proceed with deleting the selected data?',
      icon: 'warning',
      confirmText: 'Yes, Delete Selected',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      setStatus('Cleaning...');
      try {
        await clearFinancials(options);
        setStatus('Done! Cleanup complete.');
        sweetAlert.success('Success', 'Selected data has been cleared.');
        // Reset selections
        setOptions({
          clearOrders: false,
          clearInvestment: false,
          clearLedger: false,
          clearActivityLogs: false,
          clearPartyPayments: false,
          clearOrderPayments: false,
        });
      } catch (error) {
        console.error(error);
        setStatus('Error: ' + error);
        sweetAlert.error('Error', 'Failed to clear data.');
      }
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <div className="p-4 pb-24">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Data Management</h1>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-red-50">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <AlertTriangle size={20} />
              <h2 className="text-lg font-semibold">Danger Zone</h2>
            </div>
            <p className="text-xs text-red-600">
              Select the data you want to permanently delete from the database.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearOrders ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearOrders} 
                onChange={() => toggleOption('clearOrders')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Orders</span>
                <p className="text-xs text-gray-500">Delete all order records permanently</p>
              </div>
            </label>

            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearOrderPayments ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearOrderPayments} 
                onChange={() => toggleOption('clearOrderPayments')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Order Payments</span>
                <p className="text-xs text-gray-500">Clear partial & customer payments inside orders (keeps orders)</p>
              </div>
            </label>

            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearLedger ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearLedger} 
                onChange={() => toggleOption('clearLedger')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Ledger & Timeline</span>
                <p className="text-xs text-gray-500">Delete all ledger entries (Income/Expense)</p>
              </div>
            </label>

            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearPartyPayments ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearPartyPayments} 
                onChange={() => toggleOption('clearPartyPayments')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Party Payments</span>
                <p className="text-xs text-gray-500">Delete standalone party payment records</p>
              </div>
            </label>

            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearInvestment ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearInvestment} 
                onChange={() => toggleOption('clearInvestment')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Investment</span>
                <p className="text-xs text-gray-500">Reset investment capital data</p>
              </div>
            </label>

            <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex-shrink-0 mr-3 text-primary-600">
                {options.clearActivityLogs ? <CheckSquare size={24} /> : <Square size={24} />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={!!options.clearActivityLogs} 
                onChange={() => toggleOption('clearActivityLogs')} 
              />
              <div>
                <span className="font-semibold text-gray-900">Activity Logs</span>
                <p className="text-xs text-gray-500">Clear history of changes (Ledger/Investment logs)</p>
              </div>
            </label>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={handleClean}
              className="w-full bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 font-medium active:bg-red-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Trash2 size={18} />
              Delete Selected Data
            </button>
            <p className="mt-3 text-xs text-center text-gray-500 font-mono">Status: {status}</p>
          </div>
        </div>
      </div>
      <NavBar />
    </div>
  );
}
