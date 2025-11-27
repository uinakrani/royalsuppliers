'use client'

import { useEffect, useRef, useState } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  confirmColor?: 'red' | 'blue' | 'green'
}

export default function BottomSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'red',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
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
    }, 350)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const handleConfirm = () => {
    onConfirm()
    handleClose()
  }

  const confirmColorClasses = {
    red: 'bg-red-600 active:bg-red-700',
    blue: 'bg-blue-600 active:bg-blue-700',
    green: 'bg-green-600 active:bg-green-700',
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black z-[99990] ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      />
      
      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[100000] ${
          isClosing ? 'native-bottom-sheet-exit' : isMounted ? 'native-bottom-sheet-enter' : 'translate-y-full'
        }`}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          backfaceVisibility: 'hidden',
          willChange: 'transform',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Content */}
        <div className="px-4 pb-4">
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
          {message && (
            <p className="text-sm text-gray-600 mb-6">{message}</p>
          )}
          
          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleConfirm}
              className={`w-full py-3 ${confirmColorClasses[confirmColor]} text-white rounded-lg font-semibold transition-colors touch-manipulation`}
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {confirmText}
            </button>
            <button
              onClick={handleClose}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold active:bg-gray-200 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
