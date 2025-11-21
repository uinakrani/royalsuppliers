'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertCircle } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { createRipple } from '@/lib/rippleEffect'

interface ConfirmPaymentPopupProps {
  isOpen: boolean
  onClose: () => void
  remainingAmount: number
  onAddRemainingPayment: () => void
  onMarkAsPaidOnly: () => void
}

export default function ConfirmPaymentPopup({
  isOpen,
  onClose,
  remainingAmount,
  onAddRemainingPayment,
  onMarkAsPaidOnly,
}: ConfirmPaymentPopupProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

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
      setIsClosing(false)
      setIsMounted(false)
      requestAnimationFrame(() => {
        setIsMounted(true)
      })
      document.body.style.overflow = 'hidden'
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
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const handleAddRemaining = (e: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(e)
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onAddRemainingPayment()
      setIsClosing(false)
    }, 250)
  }

  const handleMarkAsPaidOnly = (e: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(e)
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onMarkAsPaidOnly()
      setIsClosing(false)
    }, 250)
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
        className="fixed z-[99999] flex items-center justify-center pointer-events-none popup-container"
        style={{
          WebkitTapHighlightColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '1rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
          zIndex: isStandalone ? 99999 : 99999,
        }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-2xl border border-gray-100 max-w-sm w-full pointer-events-auto ${
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
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 bg-orange-100 rounded-xl">
                <AlertCircle size={24} className="text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900">Mark Order as Paid</h3>
                <p className="text-sm text-gray-600 mt-1">
                  There are existing payments for raw materials
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Remaining Amount:</span>
                <span className="text-lg font-bold text-orange-600">
                  {formatIndianCurrency(remainingAmount)}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Choose how you want to proceed:
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <button
                onClick={handleAddRemaining}
                className="w-full p-4 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 transition-all native-press flex items-center justify-center gap-2"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span>Add Remaining as Payment</span>
              </button>
              <p className="text-xs text-gray-500 px-1">
                Adds {formatIndianCurrency(remainingAmount)} as a raw material payment entry
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleMarkAsPaidOnly}
                className="w-full p-4 bg-gray-100 text-gray-700 rounded-xl font-semibold active:bg-gray-200 transition-all native-press flex items-center justify-center gap-2"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span>Mark as Paid Only</span>
              </button>
              <p className="text-xs text-gray-500 px-1">
                Marks order as paid without adding remaining amount as payment
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="w-full px-4 py-3 bg-gray-50 text-gray-700 rounded-xl font-medium active:bg-gray-100 transition-colors touch-manipulation native-press"
              style={{
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )

  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

