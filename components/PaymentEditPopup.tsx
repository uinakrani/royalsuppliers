'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeft } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'

interface PaymentEditPopupProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { amount: number; date: string }) => void
  initialData: { amount: number; date: string }
  maxAmount?: number
}

export default function PaymentEditPopup({ isOpen, onClose, onSave, initialData, maxAmount }: PaymentEditPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [step, setStep] = useState<'amount' | 'date'>('amount')
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
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
      setAmount(initialData.amount.toString())
      setDate(new Date(initialData.date).toISOString().split('T')[0])
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
  }, [isOpen, initialData])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const handleNext = () => {
    if (step === 'amount') {
      const amountValue = parseFloat(amount)
      if (!amount || isNaN(amountValue) || amountValue <= 0) {
        setErrors({ amount: 'Please enter a valid amount' })
        return
      }
      if (maxAmount && amountValue > maxAmount) {
        setErrors({ amount: `Amount cannot exceed ${formatIndianCurrency(maxAmount)}` })
        return
      }
      setErrors({})
      setStep('date')
    } else if (step === 'date') {
      if (!date) {
        setErrors({ date: 'Please select a date' })
        return
      }
      setErrors({})
      handleSave()
    }
  }

  const handleSave = () => {
    const amountValue = parseFloat(amount)
    if (!amount || isNaN(amountValue) || amountValue <= 0) {
      setErrors({ amount: 'Please enter a valid amount' })
      setStep('amount')
      return
    }
    if (maxAmount && amountValue > maxAmount) {
      setErrors({ amount: `Amount cannot exceed ${formatIndianCurrency(maxAmount)}` })
      setStep('amount')
      return
    }
    if (!date) {
      setErrors({ date: 'Please select a date' })
      setStep('date')
      return
    }
    
    onSave({ amount: amountValue, date })
    handleClose()
  }

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
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
            {step !== 'amount' && (
              <button
                onClick={() => setStep('amount')}
                className="p-2 -ml-2 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900 flex-1 text-center">
              {step === 'amount' ? 'Edit Amount' : 'Edit Date'}
            </h2>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {step === 'amount' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      if (errors.amount) setErrors({})
                    }}
                    placeholder="Enter amount"
                    className={`w-full px-3 py-3 bg-gray-50 border rounded-lg focus:outline-none focus:ring-2 ${
                      errors.amount
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    style={{ fontSize: '16px' }}
                    autoFocus
                  />
                  {errors.amount && (
                    <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
                  )}
                  {maxAmount && (
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum: {formatIndianCurrency(maxAmount)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 'date' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value)
                      if (errors.date) setErrors({})
                    }}
                    className={`w-full px-3 py-3 bg-gray-50 border rounded-lg focus:outline-none focus:ring-2 ${
                      errors.date
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    style={{ fontSize: '16px' }}
                    autoFocus
                  />
                  {errors.date && (
                    <p className="mt-1 text-xs text-red-600">{errors.date}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-200 p-4">
            <button
              onClick={handleNext}
              className="w-full bg-primary-600 text-white px-4 py-3 rounded-lg text-sm font-semibold active:bg-primary-700 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {step === 'amount' ? 'Next' : 'Save'}
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

