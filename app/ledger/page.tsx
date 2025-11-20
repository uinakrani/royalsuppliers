'use client'

import { useEffect, useMemo, useState } from 'react'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { PlusCircle, MinusCircle, Wallet, Plus } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import NavBar from '@/components/NavBar'
import LedgerEntryDrawer from '@/components/LedgerEntryDrawer'
import BottomSheet from '@/components/BottomSheet'
import LedgerEntryModal from '@/components/LedgerEntryModal'

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerType, setDrawerType] = useState<'credit' | 'debit'>('credit')
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add')
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null)
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)
  
  // Bottom sheet state
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)

  const balance = useMemo(() => {
    return entries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
  }, [entries])

  // Separate income (credit) and expenses (debit)
  // Sort by creation time (most recent first) - use createdAt, then date as fallback
  const incomeEntries = useMemo(() => {
    return entries.filter(e => e.type === 'credit').sort((a, b) => {
      const aTime = a.createdAt 
        ? new Date(a.createdAt).getTime()
        : (a.date ? new Date(a.date).getTime() : 0)
      const bTime = b.createdAt 
        ? new Date(b.createdAt).getTime()
        : (b.date ? new Date(b.date).getTime() : 0)
      return bTime - aTime // Descending order (newest first)
    })
  }, [entries])

  const expenseEntries = useMemo(() => {
    return entries.filter(e => e.type === 'debit').sort((a, b) => {
      const aTime = a.createdAt 
        ? new Date(a.createdAt).getTime()
        : (a.date ? new Date(a.date).getTime() : 0)
      const bTime = b.createdAt 
        ? new Date(b.createdAt).getTime()
        : (b.date ? new Date(b.date).getTime() : 0)
      return bTime - aTime // Descending order (newest first)
    })
  }, [entries])

  // Calculate totals
  const totalIncome = useMemo(() => {
    return incomeEntries.reduce((acc, e) => acc + e.amount, 0)
  }, [incomeEntries])

  const totalExpenses = useMemo(() => {
    return expenseEntries.reduce((acc, e) => acc + e.amount, 0)
  }, [expenseEntries])

  const load = async () => {
    setLoading(true)
    try {
      const items = await ledgerService.list()
      setEntries(items)
    } catch (error) {
      console.error('Failed to load ledger entries:', error)
      setEntries([])
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

  const handleEntryClick = (entry: LedgerEntry) => {
    setSelectedEntry(entry)
    setModalOpen(true)
  }

  const handleAddEntry = (type: 'credit' | 'debit') => {
    setDrawerType(type)
    setDrawerMode('add')
    setEditingEntry(null)
    setDrawerOpen(true)
  }

  const handleEditEntry = (entry: LedgerEntry) => {
    setEditingEntry(entry)
    setDrawerType(entry.type)
    setDrawerMode('edit')
    setDrawerOpen(true)
    setModalOpen(false)
  }

  const handleSaveEntry = async (data: { amount: number; date: string; note?: string }) => {
    if (drawerMode === 'edit' && editingEntry?.id) {
      await ledgerService.update(editingEntry.id, {
        amount: data.amount,
        date: data.date,
        note: data.note,
      })
    } else {
      await ledgerService.addEntry(drawerType, data.amount, data.note, 'manual', data.date)
    }
    // Drawer will close automatically on success
  }

  const handleDeleteClick = (entryId: string) => {
    setEntryToDelete(entryId)
    setDeleteSheetOpen(true)
    setModalOpen(false)
  }

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return
    try {
      await ledgerService.remove(entryToDelete)
      // Entry will be removed from list automatically via realtime subscription
      setDeleteSheetOpen(false)
      setEntryToDelete(null)
    } catch (error: any) {
      // Error handling - could show error in bottom sheet or just log
      console.error('Failed to delete entry:', error)
      setDeleteSheetOpen(false)
      setEntryToDelete(null)
    }
  }

  const renderEntry = (e: LedgerEntry) => {
    if (!e.id) return null
    return (
      <button
        key={e.id}
        onClick={() => handleEntryClick(e)}
        className="w-full bg-white rounded-lg border border-gray-200 mb-1 p-2 flex items-center justify-between active:bg-gray-50 transition-all duration-150 touch-manipulation shadow-sm"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="flex items-center justify-between flex-1 min-w-0">
          <span className={`font-bold ${e.type === 'credit' ? 'text-green-700' : 'text-red-700'}`} style={{ fontSize: '12px' }}>
            {formatIndianCurrency(e.amount)}
          </span>
          <span className="text-gray-500 ml-2 flex-shrink-0" style={{ fontSize: '10px' }}>
            {format(new Date(e.date), 'dd MMM')}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-gray-50" style={{ minHeight: '100dvh', paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0))' }}>
      <div className="bg-primary-600 text-white p-2 pt-safe sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Wallet size={18} />
            <h1 className="text-lg font-bold truncate">Ledger</h1>
          </div>
        </div>
        <div className="bg-white rounded-lg p-2 text-gray-800 flex items-center justify-between">
          <span className="font-medium" style={{ fontSize: '12px' }}>Balance</span>
          <span className={`font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`} style={{ fontSize: '12px' }}>
            {formatIndianCurrency(Math.abs(balance))} {balance >= 0 ? '' : '(Dr)'}
          </span>
        </div>
      </div>

      {/* Sticky Add Buttons Bar - Positioned at thumb depth */}
      <div 
        className="bg-white border-b border-gray-200 sticky z-30 shadow-sm"
        style={{ 
          top: 'calc(70px + env(safe-area-inset-top, 0px))',
          padding: '0.75rem',
        }}
      >
        <div className="flex gap-2">
          <button
            onClick={() => handleAddEntry('credit')}
            className="flex-1 bg-green-600 text-white rounded-lg active:bg-green-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation shadow-md font-medium"
            style={{ WebkitTapHighlightColor: 'transparent', fontSize: '14px' }}
            title="Add Income"
            aria-label="Add Income"
          >
            <Plus size={18} />
            <span>Add Income</span>
          </button>
          <button
            onClick={() => handleAddEntry('debit')}
            className="flex-1 bg-red-600 text-white rounded-lg active:bg-red-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation shadow-md font-medium"
            style={{ WebkitTapHighlightColor: 'transparent', fontSize: '14px' }}
            title="Add Expense"
            aria-label="Add Expense"
          >
            <Plus size={18} />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Content spacing for sticky header and add buttons bar */}
      <div style={{ paddingTop: '0.75rem' }}></div>

      <div className="p-1.5">
        {loading ? (
          <div className="text-center text-gray-500 py-6" style={{ fontSize: '12px' }}>Loading...</div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {/* Income Column */}
            <div className="bg-green-50 rounded-lg p-1.5 border border-green-200">
              <div className="flex items-center justify-between mb-1.5">
                <h2 className="font-semibold text-green-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                  <PlusCircle size={14} />
                  Income
                </h2>
              </div>
              <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-green-300">
                <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                <div className="font-bold text-green-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalIncome)}</div>
              </div>
              <div className="space-y-1" style={{ maxHeight: 'calc(100dvh - 260px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {incomeEntries.length === 0 ? (
                  <div className="text-center text-gray-400 py-4" style={{ fontSize: '11px' }}>No entries</div>
                ) : (
                  incomeEntries.map(renderEntry)
                )}
              </div>
            </div>

            {/* Expenses Column */}
            <div className="bg-red-50 rounded-lg p-1.5 border border-red-200">
              <div className="flex items-center justify-between mb-1.5">
                <h2 className="font-semibold text-red-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                  <MinusCircle size={14} />
                  Expenses
                </h2>
              </div>
              <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-red-300">
                <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                <div className="font-bold text-red-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalExpenses)}</div>
              </div>
              <div className="space-y-1" style={{ maxHeight: 'calc(100dvh - 260px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {expenseEntries.length === 0 ? (
                  <div className="text-center text-gray-400 py-4" style={{ fontSize: '11px' }}>No entries</div>
                ) : (
                  expenseEntries.map(renderEntry)
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Entry Drawer */}
      <LedgerEntryDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveEntry}
        type={drawerType}
        mode={drawerMode}
        initialData={editingEntry ? {
          amount: editingEntry.amount,
          date: editingEntry.date,
          note: editingEntry.note,
        } : undefined}
      />

      {/* Entry Details Modal */}
      <LedgerEntryModal
        entry={selectedEntry}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedEntry(null)
        }}
        onEdit={handleEditEntry}
        onDelete={handleDeleteClick}
      />

      {/* Delete Confirmation Bottom Sheet */}
      <BottomSheet
        isOpen={deleteSheetOpen}
        onClose={() => {
          setDeleteSheetOpen(false)
          setEntryToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Entry?"
        message="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />

      <NavBar />
    </div>
  )
}
