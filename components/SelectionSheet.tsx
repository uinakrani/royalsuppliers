'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface SelectionSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export default function SelectionSheet({
  isOpen,
  onClose,
  title,
  children,
}: SelectionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
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

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 z-[99990] transition-opacity duration-300 ${
          isClosing || !isMounted ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          backdropFilter: 'blur(2px)'
        }}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[100000] transition-transform duration-300 ease-out ${
          isClosing || !isMounted ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          backfaceVisibility: 'hidden',
          willChange: 'transform',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0" onClick={handleClose}>
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={handleClose}
            className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  )
}

