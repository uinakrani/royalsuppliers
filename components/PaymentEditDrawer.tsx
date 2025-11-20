'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'

interface PaymentEditDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { amount: number; date: string }) => void
  initialData: { amount: number; date: string }
  maxAmount?: number
}

export default function PaymentEditDrawer({ isOpen, onClose, onSave, initialData, maxAmount }: PaymentEditDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [step, setStep] = useState<'amount' | 'date'>('amount')
  
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
      setStep('amount')
      setAmount(initialData.amount.toString())
      setDate(new Date(initialData.date).toISOString().split('T')[0])
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
  }, [isOpen, initialData])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 350)
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
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10 shadow-sm">
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
        <div className="p-4 pb-24" style={{ maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto' }}>
          {step === 'amount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
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
                <label className="block text-xs font-medium text-gray-700 mb-2">
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
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20 shadow-lg">
          <button
            onClick={handleNext}
            className="w-full bg-primary-600 text-white px-4 py-3 rounded-lg text-sm font-semibold active:bg-primary-700 transition-colors touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
          >
            {step === 'amount' ? 'Next' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

