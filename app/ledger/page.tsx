'use client'

import { useEffect, useMemo, useState } from 'react'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { PlusCircle, MinusCircle, Wallet, Trash2 } from 'lucide-react'
import { sweetAlert } from '@/lib/sweetalert'
import { showToast } from '@/components/Toast'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import NavBar from '@/components/NavBar'

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const balance = useMemo(() => {
    return entries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
  }, [entries])

  const load = async () => {
    setLoading(true)
    try {
      const items = await ledgerService.list()
      setEntries(items)
    } catch (e: any) {
      console.error(e)
      showToast('Failed to load transactions', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const addEntry = async (type: 'credit' | 'debit') => {
    if (adding) return
    setAdding(true)
    try {
      const label = type === 'credit' ? 'Credit amount (₹ +)' : 'Debit amount (₹ -)'
      const amountStr = await sweetAlert.prompt({
        title: type === 'credit' ? 'Add Credit' : 'Add Debit',
        inputLabel: label,
        inputPlaceholder: 'Enter amount',
        inputType: 'number',
        confirmText: 'Save',
        cancelText: 'Cancel',
      })
      if (!amountStr) {
        setAdding(false)
        return
      }
      const amount = Math.abs(parseFloat(String(amountStr)))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error')
        setAdding(false)
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Add Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. Cash deposit / Vendor payout',
        inputType: 'text',
        confirmText: 'Save',
        cancelText: 'Skip',
      })

      await ledgerService.addEntry(type, amount, note || undefined)
      await load()
      showToast('Transaction added', 'success')
    } catch (e: any) {
      if (!String(e?.message || '').includes('SweetAlert')) {
        console.error(e)
        showToast('Failed to add transaction', 'error')
      }
    } finally {
      setAdding(false)
    }
  }

  const removeEntry = async (id: string) => {
    try {
      const ok = await sweetAlert.confirm({
        title: 'Delete transaction?',
        text: 'This cannot be undone.',
        icon: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      })
      if (!ok) return
      await ledgerService.remove(id)
      await load()
      showToast('Deleted', 'success')
    } catch (e: any) {
      if (!String(e?.message || '').includes('SweetAlert')) {
        console.error(e)
        showToast('Failed to delete', 'error')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
      <div className="bg-primary-600 text-white p-2.5 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={20} />
            <h1 className="text-xl font-bold">Ledger</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addEntry('credit')}
              disabled={adding}
              className="px-2 py-1 bg-green-600 text-white rounded text-[10px] font-medium hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              <PlusCircle size={16} />
              Credit
            </button>
            <button
              onClick={() => addEntry('debit')}
              disabled={adding}
              className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-medium hover:bg-red-700 transition-colors"
            >
              <MinusCircle size={16} />
              Debit
            </button>
          </div>
        </div>
        <div className="mt-2 bg-white rounded-lg p-3 text-gray-800 flex items-center justify-between">
          <span className="text-sm">Current Balance</span>
          <span className={`text-base font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatIndianCurrency(Math.abs(balance))} {balance >= 0 ? '' : '(Dr)'}
          </span>
        </div>
      </div>

      <div className="p-2">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-6">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-6">No transactions yet</div>
        ) : (
          <div className="space-y-2 pb-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {e.type === 'credit' ? (
                    <div className="text-green-600 mt-0.5"><PlusCircle size={18} /></div>
                  ) : (
                    <div className="text-red-600 mt-0.5"><MinusCircle size={18} /></div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatIndianCurrency(e.amount)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100'}${e.type === 'credit' ? '' : ' text-red-700'}`}>
                        {e.type.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {format(new Date(e.date), 'dd MMM yyyy, HH:mm')}
                    </div>
                    {e.note && <div className="text-xs text-gray-700 mt-1">{e.note}</div>}
                  </div>
                </div>
                {e.id && (
                  <button
                    onClick={() => removeEntry(e.id!)}
                    className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <NavBar />
    </div>
  )
}

