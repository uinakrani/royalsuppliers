'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeft } from 'lucide-react'

interface LedgerEntryPopupProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { amount: number; date: string; note?: string }) => void
  type: 'credit' | 'debit'
  initialData?: { amount: number; date: string; note?: string }
  mode: 'add' | 'edit'
}

export default function LedgerEntryPopup({ isOpen, onClose, onSave, type, initialData, mode }: LedgerEntryPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [step, setStep] = useState<'amount' | 'date' | 'note'>('amount')
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})

  useEffect(() => {
    // Check if app is in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.documentElement.classList.contains('standalone')
      setIsStandalone(isStandaloneMode)
    }
    checkStandalone()
    const observer = new MutationObserver(checkStandalone)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
      setIsMounted(false)
      setStep('amount')
      if (mode === 'edit' && initialData) {
        setAmount(initialData.amount.toString())
        setDate(new Date(initialData.date).toISOString().split('T')[0])
        setNote(initialData.note || '')
      } else {
        setAmount('')
        setDate(new Date().toISOString().split('T')[0])
        setNote('')
      }
      setErrors({})
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
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const formatCurrencyInput = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '')
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

  const popupContent = (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 z-[99999] popup-backdrop ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{
          willChange: 'opacity',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
        }}
      />

      {/* Popup */}
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none popup-container"
        style={{
          WebkitTapHighlightColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
          padding: '1rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-2xl border border-gray-100 max-w-sm w-full pointer-events-auto flex flex-col ${
            isClosing
              ? 'native-modal-exit'
              : isMounted
              ? 'native-modal-enter'
              : 'opacity-0 scale-95 translate-y-4'
          }`}
          style={{
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            maxHeight: 'calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center gap-3 p-4 border-b border-gray-200">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
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
          <div className="flex-shrink-0 border-t border-gray-200 p-4">
            <button
              onClick={handleNext}
              className="w-full py-3 bg-primary-600 text-white rounded-lg font-semibold active:bg-primary-700 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {step === 'note' ? 'Save' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

