'use client'

import { useEffect, useMemo, useState } from 'react'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { PlusCircle, MinusCircle, Wallet, Trash2 } from 'lucide-react'
import { sweetAlert } from '@/lib/sweetalert'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import NavBar from '@/components/NavBar'

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const balance = useMemo(() => {
    return entries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
  }, [entries])

  // Balance at the time of each entry (running balance after that entry), keyed by id
  const balanceAtMap = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    let acc = 0
    const map = new Map<string, number>()
    for (const e of sorted) {
      acc += e.type === 'credit' ? e.amount : -e.amount
      if (e.id) map.set(e.id, acc)
    }
    return map
  }, [entries])

  const load = async () => {
    setLoading(true)
    try {
      const items = await ledgerService.list()
      setEntries(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // initial fetch then subscribe
    load()
    const unsub = ledgerService.subscribe((items) => {
      setEntries(items)
    })
    return () => unsub()
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
        inputType: 'text',
        formatCurrencyInr: true,
        confirmText: 'Save',
        cancelText: 'Cancel',
      })
      if (!amountStr) {
        setAdding(false)
        return
      }
      const amount = Math.abs(parseFloat(String(amountStr)))
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        setAdding(false)
        return
      }

      const note = await sweetAlert.prompt({
        title: 'Add Note (optional)',
        inputLabel: 'Note',
        inputPlaceholder: 'e.g. Cash deposit / Vendor payout',
        inputType: 'text',
        required: false,
        confirmText: 'Save',
        cancelText: 'Skip',
      })

      await ledgerService.addEntry(type, amount, note || undefined)
      // realtime will update UI automatically
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
      // realtime will update UI automatically
    } catch {}
  }

  return (
    <div className="bg-gray-50" style={{ minHeight: '100dvh', paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
      <div className="bg-primary-600 text-white p-2.5 pt-safe sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={20} />
            <h1 className="text-xl font-bold truncate">Ledger</h1>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => addEntry('credit')}
              disabled={adding}
              className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center justify-center"
              title="Add Credit"
              aria-label="Add Credit"
            >
              <PlusCircle size={16} />
            </button>
            <button
              onClick={() => addEntry('debit')}
              disabled={adding}
              className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center justify-center"
              title="Add Debit"
              aria-label="Add Debit"
            >
              <MinusCircle size={16} />
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
            {entries.map((e) => {
              const after = e.id ? balanceAtMap.get(e.id) ?? 0 : undefined
              const delta = e.type === 'credit' ? e.amount : -e.amount
              const before = after !== undefined ? after - delta : undefined
              const beforeAbs = before !== undefined ? Math.abs(before) : undefined
              const afterAbs = after !== undefined ? Math.abs(after) : undefined
              const beforeSign = before !== undefined && before < 0 ? ' (Dr)' : ''
              const afterSign = after !== undefined && after < 0 ? ' (Dr)' : ''
              const removable = (e.source ?? 'manual') === 'manual'
              return (
                <div key={e.id} className="bg-white rounded-lg border border-gray-200 p-2 flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    {e.type === 'credit' ? (
                      <div className="text-green-600 mt-0.5"><PlusCircle size={14} /></div>
                    ) : (
                      <div className="text-red-600 mt-0.5"><MinusCircle size={14} /></div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{formatIndianCurrency(e.amount)}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${e.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {e.type.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-gray-500">{format(new Date(e.date), 'dd MMM, HH:mm')}</span>
                        {e.source && e.source !== 'manual' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">{e.source}</span>
                        )}
                      </div>
                      {e.note && (
                        <div className="text-[11px] text-gray-600 mt-0.5 truncate" title={e.note}>{e.note}</div>
                      )}
                      {(beforeAbs !== undefined && afterAbs !== undefined) && (
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Bal: {formatIndianCurrency(beforeAbs)}{beforeSign}
                          <span className="mx-1 text-gray-400">→</span>
                          {formatIndianCurrency(afterAbs)}{afterSign}
                        </div>
                      )}
                    </div>
                  </div>
                  {e.id && removable && (
                    <button
                      onClick={() => removeEntry(e.id!)}
                      className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <NavBar />
    </div>
  )
}

