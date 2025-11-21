'use client'

import { useEffect, useMemo, useState } from 'react'
import { ledgerService, LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { PlusCircle, MinusCircle, Wallet, Plus } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import NavBar from '@/components/NavBar'
import LedgerEntryPopup from '@/components/LedgerEntryPopup'
import BottomSheet from '@/components/BottomSheet'
import LedgerEntryModal from '@/components/LedgerEntryModal'
import { createRipple } from '@/lib/rippleEffect'
import TruckLoading from '@/components/TruckLoading'

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
        onClick={(event) => {
          createRipple(event)
          handleEntryClick(e)
        }}
        className="w-full bg-white rounded-lg border border-gray-100 mb-1 p-2 active:bg-gray-50 transition-all duration-150 touch-manipulation native-press"
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div className="flex flex-col w-full">
          <div className="flex items-center justify-between w-full mb-1">
            <span className={`font-bold ${e.type === 'credit' ? 'text-green-700' : 'text-red-700'}`} style={{ fontSize: '13px' }}>
              {formatIndianCurrency(e.amount)}
            </span>
            <span className="text-gray-500 flex-shrink-0" style={{ fontSize: '10px' }}>
              {format(new Date(e.date), 'dd MMM')}
            </span>
          </div>
          {e.note && (
            <div className="text-gray-600 text-left w-full mt-0.5" style={{ fontSize: '11px', lineHeight: '1.3' }}>
              {e.note}
            </div>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="bg-gray-50" style={{ 
      height: '100dvh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header - Fixed at top */}
      <div className="bg-primary-600 text-white p-2 pt-safe sticky top-0 z-40" style={{ flexShrink: 0 }}>
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

      {/* Content Area - Fixed height, fits between header and buttons */}
      <div style={{ 
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '9.25rem' // NavBar (~4.75rem) + Buttons bar (~4rem) + spacing
      }}>
        {loading ? (
          <TruckLoading size={150} />
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-1.5 p-1.5" style={{ minHeight: 0 }}>
            {/* Income Column */}
            <div className="bg-green-50 rounded-lg p-1.5 border border-green-200 flex flex-col" style={{ minHeight: 0 }}>
              <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                <h2 className="font-semibold text-green-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                  <PlusCircle size={14} />
                  Income
                </h2>
              </div>
              <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-green-300 flex-shrink-0">
                <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                <div className="font-bold text-green-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalIncome)}</div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                {incomeEntries.length === 0 ? (
                  <div className="text-center text-gray-400 py-4" style={{ fontSize: '11px' }}>No entries</div>
                ) : (
                  incomeEntries.map(renderEntry)
                )}
              </div>
            </div>

            {/* Expenses Column */}
            <div className="bg-red-50 rounded-lg p-1.5 border border-red-200 flex flex-col" style={{ minHeight: 0 }}>
              <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                <h2 className="font-semibold text-red-800 flex items-center gap-1" style={{ fontSize: '12px' }}>
                  <MinusCircle size={14} />
                  Expenses
                </h2>
              </div>
              <div className="bg-white rounded-lg p-1.5 mb-1.5 border border-red-300 flex-shrink-0">
                <div className="text-gray-600" style={{ fontSize: '11px' }}>Total</div>
                <div className="font-bold text-red-700" style={{ fontSize: '12px' }}>{formatIndianCurrency(totalExpenses)}</div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
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

      {/* Add Buttons Bar - Floating at bottom, above NavBar */}
      <div 
        className="fixed left-0 right-0 z-30 flex items-end justify-center"
        style={{ 
          bottom: '5.25rem',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          pointerEvents: 'none',
        }}
      >
        <div 
          className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl w-full"
          style={{ 
            padding: '0.75rem',
            boxShadow: '0 2px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)',
            pointerEvents: 'auto',
          }}
        >
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                createRipple(e)
                handleAddEntry('credit')
              }}
              className="flex-1 bg-green-600 text-white rounded-xl active:bg-green-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation font-medium native-press"
              style={{ 
                WebkitTapHighlightColor: 'transparent', 
                fontSize: '14px',
                position: 'relative',
                overflow: 'hidden',
              }}
              title="Add Income"
              aria-label="Add Income"
            >
              <Plus size={18} />
              <span>Add Income</span>
            </button>
            <button
              onClick={(e) => {
                createRipple(e)
                handleAddEntry('debit')
              }}
              className="flex-1 bg-red-600 text-white rounded-xl active:bg-red-700 transition-colors flex items-center justify-center gap-2 py-3 touch-manipulation font-medium native-press"
              style={{ 
                WebkitTapHighlightColor: 'transparent', 
                fontSize: '14px',
                position: 'relative',
                overflow: 'hidden',
              }}
              title="Add Expense"
              aria-label="Add Expense"
            >
              <Plus size={18} />
              <span>Add Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* Entry Drawer */}
      <LedgerEntryPopup
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
