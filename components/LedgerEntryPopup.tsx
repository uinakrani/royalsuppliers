'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeft } from 'lucide-react'
import { orderService } from '@/lib/orderService'
import Button from '@/components/Button'

interface LedgerEntryPopupProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { amount: number; date: string; note?: string; supplier?: string; partyName?: string }) => void
  type: 'credit' | 'debit'
  initialData?: { amount: number; date: string; note?: string; supplier?: string; partyName?: string }
  mode: 'add' | 'edit'
}

export default function LedgerEntryPopup({ isOpen, onClose, onSave, type, initialData, mode }: LedgerEntryPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [step, setStep] = useState<'amount' | 'date' | 'supplier' | 'party' | 'note'>('amount')
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [supplier, setSupplier] = useState('')
  const [showCustomSupplier, setShowCustomSupplier] = useState(false)
  const [partyName, setPartyName] = useState('')
  const [showCustomPartyName, setShowCustomPartyName] = useState(false)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  const [loading, setLoading] = useState(false)

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

  const loadSuppliers = async () => {
    try {
      const supplierList = await orderService.getUniqueSuppliers()
      setSuppliers(supplierList)
      if (supplier && supplierList.length > 0 && !supplierList.includes(supplier)) {
        setShowCustomSupplier(true)
      }
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }

  const loadPartyNames = async () => {
    try {
      const names = await orderService.getUniquePartyNames()
      setPartyNames(names)
      if (partyName && names.length > 0 && !names.includes(partyName)) {
        setShowCustomPartyName(true)
      }
    } catch (error) {
      console.error('Error loading party names:', error)
    }
  }

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
        setSupplier(initialData.supplier || '')
        setPartyName(initialData.partyName || '')
      } else {
        setAmount('')
        setDate(new Date().toISOString().split('T')[0])
        setNote('')
        setSupplier('')
        setPartyName('')
      }
      setShowCustomSupplier(false)
      setShowCustomPartyName(false)
      setErrors({})
      loadSuppliers()
      loadPartyNames()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSupplier('')
      setPartyName('')
      setShowCustomSupplier(false)
      setShowCustomPartyName(false)
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
      // For expense entries, go to supplier step; for income, go to party step; otherwise go to note
      if (type === 'debit') {
        setStep('supplier')
      } else if (type === 'credit') {
        setStep('party')
      } else {
        setStep('note')
      }
    } else if (step === 'supplier' || step === 'party') {
      setStep('note')
    } else if (step === 'note') {
      setLoading(true)
      try {
        await handleSave()
      } finally {
        setLoading(false)
      }
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
        supplier: type === 'debit' ? (supplier.trim() || undefined) : undefined,
        partyName: type === 'credit' ? (partyName.trim() || undefined) : undefined,
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
    } else if (step === 'supplier' || step === 'party') {
      setStep('date')
    } else if (step === 'note') {
      if (type === 'debit') {
        setStep('supplier')
      } else if (type === 'credit') {
        setStep('party')
      } else {
        setStep('date')
      }
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
              <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'date' ? 'bg-primary-600 w-8' : (step === 'supplier' || step === 'party' || step === 'note') ? 'bg-primary-300 w-4' : 'bg-gray-200 w-4'}`} />
              {(type === 'debit' || type === 'credit') && (
                <div className={`h-1.5 rounded-full transition-all duration-300 ${(step === 'supplier' || step === 'party') ? 'bg-primary-600 w-8' : step === 'note' ? 'bg-primary-300 w-4' : 'bg-gray-200 w-4'}`} />
              )}
              <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'note' ? 'bg-primary-600 w-8' : 'bg-gray-200 w-4'}`} />
            </div>

            {/* Amount Step */}
            {step === 'amount' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {mode === 'edit' ? 'Update Amount' : `Enter ${type === 'credit' ? 'Income' : 'Expense'} Amount`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {mode === 'edit' 
                      ? 'Enter the new amount for this entry'
                      : `How much ${type === 'credit' ? 'did you receive' : 'did you spend'}?`
                    }
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Amount (₹)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-lg font-medium" style={{ fontSize: '18px' }}>₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9.]*"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all duration-200 text-lg font-medium"
                      style={{ fontSize: '18px' }}
                      autoFocus
                    />
                  </div>
                  {errors.amount && (
                    <p className="mt-2 text-sm text-red-600 font-medium">{errors.amount}</p>
                  )}
                </div>
              </div>
            )}

            {/* Date Step */}
            {step === 'date' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {mode === 'edit' ? 'Update Date' : 'Select Date'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {mode === 'edit' 
                      ? 'When did this transaction occur?'
                      : `When did this ${type === 'credit' ? 'income' : 'expense'} occur?`
                    }
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={handleDateChange}
                    className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all duration-200 text-base"
                    style={{ fontSize: '16px' }}
                    autoFocus
                  />
                  {errors.date && (
                    <p className="mt-2 text-sm text-red-600 font-medium">{errors.date}</p>
                  )}
                </div>
              </div>
            )}

            {/* Supplier Step (for expense entries) */}
            {step === 'supplier' && type === 'debit' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {mode === 'edit' ? 'Update Supplier' : 'Select Supplier (Optional)'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {mode === 'edit' 
                      ? 'Which supplier is this expense for?'
                      : 'Which supplier did you pay for raw materials? You can skip this step.'
                    }
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Supplier
                  </label>
                  {!showCustomSupplier ? (
                    <div className="space-y-2">
                      <select
                        value={supplier}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setShowCustomSupplier(true)
                          } else {
                            setSupplier(e.target.value)
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        style={{ fontSize: '16px' }}
                        autoFocus
                      >
                        <option value="">Select a supplier</option>
                        {suppliers.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                        <option value="__custom__">+ Add New Supplier</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="Enter supplier name"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        style={{ fontSize: '16px' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomSupplier(false)
                          setSupplier('')
                        }}
                        className="text-xs text-primary-600 active:text-primary-700"
                      >
                        ← Select from existing suppliers
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Party Step (for income entries) */}
            {step === 'party' && type === 'credit' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {mode === 'edit' ? 'Update Party Name' : 'Select Party Name (Optional)'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {mode === 'edit' 
                      ? 'Which party is this income from?'
                      : 'Which party did you receive payment from? You can skip this step.'
                    }
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Party Name
                  </label>
                  {!showCustomPartyName ? (
                    <div className="space-y-2">
                      <select
                        value={partyName}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setShowCustomPartyName(true)
                          } else {
                            setPartyName(e.target.value)
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        style={{ fontSize: '16px' }}
                        autoFocus
                      >
                        <option value="">Select a party name</option>
                        {partyNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value="__custom__">+ Add New Party Name</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={partyName}
                        onChange={(e) => setPartyName(e.target.value)}
                        placeholder="Enter party name"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        style={{ fontSize: '16px' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomPartyName(false)
                          setPartyName('')
                        }}
                        className="text-xs text-primary-600 active:text-primary-700"
                      >
                        ← Select from existing names
                      </button>
                    </div>
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
            {(step === 'supplier' || step === 'party') ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleNext}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={loading}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleNext}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                >
                  Next
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleNext}
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
              >
                {step === 'note' ? 'Save' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

