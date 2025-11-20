'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Edit2, Trash2 } from 'lucide-react'
import { LedgerEntry } from '@/lib/ledgerService'
import { format } from 'date-fns'
import { formatIndianCurrency } from '@/lib/currencyUtils'

interface LedgerEntryModalProps {
  entry: LedgerEntry | null
  isOpen: boolean
  onClose: () => void
  onEdit: (entry: LedgerEntry) => void
  onDelete: (entryId: string) => void
}

export default function LedgerEntryModal({ entry, isOpen, onClose, onEdit, onDelete }: LedgerEntryModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
      // Trigger animation after mount
      requestAnimationFrame(() => {
        setIsMounted(true)
      })
    } else {
      setIsMounted(false)
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 300)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const handleEdit = () => {
    if (entry) {
      handleClose()
      setTimeout(() => {
        onEdit(entry)
      }, 300)
    }
  }

  const handleDelete = () => {
    if (entry?.id) {
      handleClose()
      setTimeout(() => {
        onDelete(entry.id!)
      }, 300)
    }
  }

  if (!isOpen || !entry) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black z-[90] ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      />
      
      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
        onClick={handleBackdropClick}
      >
        <div
          className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto ${
            isClosing ? 'native-modal-exit' : isMounted ? 'native-modal-enter' : 'opacity-0 scale-90'
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ 
            WebkitTapHighlightColor: 'transparent',
            backfaceVisibility: 'hidden',
            perspective: 1000,
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              {entry.type === 'credit' ? (
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 font-bold" style={{ fontSize: '16px' }}>+</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <span className="text-red-600 font-bold" style={{ fontSize: '16px' }}>−</span>
                </div>
              )}
              <div>
                <div className={`font-bold ${entry.type === 'credit' ? 'text-green-700' : 'text-red-700'}`} style={{ fontSize: '16px' }}>
                  {formatIndianCurrency(entry.amount)}
                </div>
                <div className="text-gray-500" style={{ fontSize: '12px' }}>
                  {entry.type === 'credit' ? 'Income' : 'Expense'}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 -mr-1.5 active:bg-gray-200 rounded-lg transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Date */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600 font-medium" style={{ fontSize: '12px' }}>Date</span>
              <span className="font-semibold text-gray-800" style={{ fontSize: '12px' }}>
                {format(new Date(entry.date), 'dd MMM, yyyy')}
              </span>
            </div>
            
            {/* Note */}
            {entry.note && (
              <div className="flex items-start justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600 font-medium" style={{ fontSize: '12px' }}>Note</span>
                <span className="text-gray-800 text-right flex-1 ml-3" style={{ fontSize: '12px' }}>
                  {entry.note}
                </span>
              </div>
            )}
            
            {/* Source */}
            {entry.source && entry.source !== 'manual' && (
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600 font-medium" style={{ fontSize: '12px' }}>Source</span>
                <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 uppercase font-medium" style={{ fontSize: '10px' }}>
                  {entry.source}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleEdit}
                className="flex-1 p-2.5 bg-blue-50 text-blue-600 rounded-lg active:bg-blue-100 transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Edit2 size={14} />
                <span className="font-semibold" style={{ fontSize: '12px' }}>Edit</span>
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 p-2.5 bg-red-50 text-red-600 rounded-lg active:bg-red-100 transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Trash2 size={14} />
                <span className="font-semibold" style={{ fontSize: '12px' }}>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
