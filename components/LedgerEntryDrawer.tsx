'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'

// Helper function to format date as YYYY-MM-DD in local time (not UTC)
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper function to parse ISO date string or YYYY-MM-DD to YYYY-MM-DD in local time
const parseToLocalDateString = (dateString: string): string => {
  // If it's already YYYY-MM-DD, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString
  }
  // If it's an ISO string, parse it in local time
  const date = new Date(dateString)
  return formatLocalDate(date)
}

interface LedgerEntryDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { amount: number; date: string; note?: string }) => void
  type: 'credit' | 'debit'
  initialData?: { amount: number; date: string; note?: string }
  mode: 'add' | 'edit'
}

export default function LedgerEntryDrawer({ isOpen, onClose, onSave, type, initialData, mode }: LedgerEntryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [step, setStep] = useState<'amount' | 'date' | 'note'>('amount')
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
      setStep('amount')
      if (mode === 'edit' && initialData) {
        setAmount(initialData.amount.toString())
        setDate(parseToLocalDateString(initialData.date))
        setNote(initialData.note || '')
      } else {
        setAmount('')
        setDate(formatLocalDate(new Date()))
        setNote('')
      }
      setErrors({})
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
  }, [isOpen, mode, initialData])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
      setStep('amount')
      setAmount('')
      setDate('')
      setNote('')
      setErrors({})
    }, 350)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const formatCurrencyInput = (value: string) => {
    // Remove all non-digit characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '')
    // Only allow one decimal point
    const parts = cleaned.split('.')
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('')
    }
    return cleaned
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value)
    setAmount(formatted)
    if (errors.amount) {
      setErrors(prev => ({ ...prev, amount: undefined }))
    }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value)
    if (errors.date) {
      setErrors(prev => ({ ...prev, date: undefined }))
    }
  }

  const handleNext = async () => {
    if (step === 'amount') {
      const amountNum = parseFloat(amount)
      if (!amount || isNaN(amountNum) || amountNum <= 0) {
        setErrors(prev => ({ ...prev, amount: 'Please enter a valid amount' }))
        return
      }
      setStep('date')
    } else if (step === 'date') {
      if (!date) {
        setErrors(prev => ({ ...prev, date: 'Please select a date' }))
        return
      }
      const dateObj = new Date(date)
      if (isNaN(dateObj.getTime())) {
        setErrors(prev => ({ ...prev, date: 'Invalid date' }))
        return
      }
      setStep('note')
    } else if (step === 'note') {
      await handleSave()
    }
  }

  const handleSave = async () => {
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setErrors(prev => ({ ...prev, amount: 'Please enter a valid amount' }))
      setStep('amount')
      return
    }
    if (!date) {
      setErrors(prev => ({ ...prev, date: 'Please select a date' }))
      setStep('date')
      return
    }
    try {
      await onSave({
        amount: amountNum,
        date,
        note: note.trim() || undefined,
      })
      handleClose()
    } catch (error) {
      // Show error in form - don't close drawer
      setErrors(prev => ({ ...prev, amount: 'Failed to save. Please try again.' }))
      setStep('amount')
    }
  }

  const handleBack = () => {
    if (step === 'date') {
      setStep('amount')
    } else if (step === 'note') {
      setStep('date')
    }
  }

  const typeLabel = type === 'credit' ? 'Income' : 'Expense'
  const title = mode === 'edit' ? `Edit ${typeLabel}` : `Add ${typeLabel}`

  if (!isOpen) return null

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
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 bottom-0 w-full max-w-full bg-white z-[100] shadow-2xl ${
          isClosing ? 'native-drawer-exit' : isMounted ? 'native-drawer-enter' : 'translate-x-full'
        }`}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          backfaceVisibility: 'hidden',
          willChange: 'transform',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 z-10 shadow-sm">
          <button
            onClick={handleClose}
            className="p-2 -ml-2 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-bold text-gray-900 flex-1">{title}</h2>
          {step !== 'amount' && (
            <button
              onClick={handleBack}
              className="p-2 -mr-2 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 pb-6 space-y-4" style={{ maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto' }}>
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'amount' ? 'bg-primary-600 w-8' : 'bg-primary-300 w-4'}`} />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'date' ? 'bg-primary-600 w-8' : step === 'note' ? 'bg-primary-300 w-4' : 'bg-gray-200 w-4'}`} />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'note' ? 'bg-primary-600 w-8' : 'bg-gray-200 w-4'}`} />
          </div>

          {/* Amount Step */}
          {step === 'amount' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" style={{ fontSize: '16px' }}>₹</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    style={{ fontSize: '16px' }}
                    autoFocus
                  />
                </div>
                {errors.amount && (
                  <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
                )}
              </div>
            </div>
          )}

          {/* Date Step */}
          {step === 'date' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                {errors.date && (
                  <p className="mt-1 text-xs text-red-600">{errors.date}</p>
                )}
              </div>
            </div>
          )}

          {/* Note Step */}
          {step === 'note' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Cash deposit / Vendor payout"
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
          <button
            onClick={handleNext}
            className="w-full py-3 bg-primary-600 text-white rounded-lg font-semibold active:bg-primary-700 transition-colors touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
          >
            {step === 'note' ? 'Save' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}
