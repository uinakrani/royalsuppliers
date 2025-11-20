'use client'

import { useEffect, useState, useRef } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export type PopupType = 'confirm' | 'prompt' | 'success' | 'error' | 'info' | 'warning'

export interface PopupOptions {
  type?: PopupType
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  inputLabel?: string
  inputPlaceholder?: string
  inputValue?: string
  inputType?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'textarea'
  required?: boolean
  formatCurrencyInr?: boolean
  onConfirm?: (value?: string) => void
  onCancel?: () => void
}

interface PopupState extends PopupOptions {
  isOpen: boolean
  inputValue: string
}

let popupStateRef: {
  setState: (state: PopupState) => void
  resolve: (value: any) => void
  reject: (error: any) => void
} | null = null

export const nativePopup = {
  confirm: async (options: {
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    icon?: 'warning' | 'error' | 'success' | 'info' | 'question'
  }): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'confirm',
        title: options.title || 'Are you sure?',
        message: options.message || '',
        confirmText: options.confirmText || 'Yes',
        cancelText: options.cancelText || 'Cancel',
        inputValue: '',
      })
      popupStateRef.resolve = (value: boolean) => resolve(value)
      popupStateRef.reject = reject
    })
  },

  prompt: async (options: {
    title?: string
    message?: string
    inputLabel?: string
    inputPlaceholder?: string
    inputValue?: string
    inputType?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'textarea'
    confirmText?: string
    cancelText?: string
    required?: boolean
    formatCurrencyInr?: boolean
  }): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'prompt',
        title: options.title || 'Enter value',
        message: options.message || '',
        inputLabel: options.inputLabel || '',
        inputPlaceholder: options.inputPlaceholder || '',
        inputValue: options.inputValue || '',
        inputType: options.inputType || 'text',
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        required: options.required !== false,
        formatCurrencyInr: options.formatCurrencyInr || false,
      })
      popupStateRef.resolve = (value: string | null) => resolve(value)
      popupStateRef.reject = reject
    })
  },

  success: async (title: string, message?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'success',
        title,
        message: message || '',
        confirmText: 'OK',
        inputValue: '',
      })
      popupStateRef.resolve = () => resolve()
      popupStateRef.reject = reject
      
      // Auto close after 2 seconds
      setTimeout(() => {
        if (popupStateRef) {
          popupStateRef.setState({ isOpen: false })
          setTimeout(() => {
            if (popupStateRef?.resolve) {
              popupStateRef.resolve()
              popupStateRef.resolve = () => {}
            }
          }, 300)
        }
      }, 2000)
    })
  },

  error: async (title: string, message?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'error',
        title,
        message: message || '',
        confirmText: 'OK',
        inputValue: '',
      })
      popupStateRef.resolve = () => resolve()
      popupStateRef.reject = reject
    })
  },

  info: async (title: string, message?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'info',
        title,
        message: message || '',
        confirmText: 'OK',
        inputValue: '',
      })
      popupStateRef.resolve = () => resolve()
      popupStateRef.reject = reject
    })
  },

  warning: async (title: string, message?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      popupStateRef.setState({
        isOpen: true,
        type: 'warning',
        title,
        message: message || '',
        confirmText: 'OK',
        inputValue: '',
      })
      popupStateRef.resolve = () => resolve()
      popupStateRef.reject = reject
    })
  },
}

export default function NativePopup() {
  const [state, setState] = useState<PopupState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    inputValue: '',
  })
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Register the setState function
    popupStateRef = {
      setState: (newState: PopupState) => {
        setIsClosing(false)
        setIsMounted(false)
        setState(newState)
        // Trigger animation after mount
        if (newState.isOpen) {
          requestAnimationFrame(() => {
            setIsMounted(true)
          })
          if (newState.type === 'prompt') {
            // Focus input after animation
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus()
                if (inputRef.current instanceof HTMLInputElement) {
                  inputRef.current.select()
                }
              }
            }, 400)
          }
        }
      },
      resolve: () => {},
      reject: () => {},
    }

    return () => {
      popupStateRef = null
    }
  }, [])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      setState(prev => ({ ...prev, isOpen: false }))
      setIsClosing(false)
      if (popupStateRef?.resolve) {
        if (state.type === 'prompt') {
          popupStateRef.resolve(null)
        } else if (state.type === 'confirm') {
          popupStateRef.resolve(false)
        } else {
          popupStateRef.resolve()
        }
      }
    }, 250)
  }

  const handleConfirm = () => {
    if (state.type === 'prompt') {
      if (state.required && !state.inputValue.trim()) {
        return // Don't close if required and empty
      }
      setIsClosing(true)
      setIsMounted(false)
      setTimeout(() => {
        setState(prev => ({ ...prev, isOpen: false }))
        setIsClosing(false)
        if (popupStateRef?.resolve) {
          let value = state.inputValue
          if (state.formatCurrencyInr) {
            value = value.replace(/[^0-9]/g, '')
          }
          popupStateRef.resolve(value || null)
        }
      }, 250)
    } else if (state.type === 'confirm') {
      setIsClosing(true)
      setIsMounted(false)
      setTimeout(() => {
        setState(prev => ({ ...prev, isOpen: false }))
        setIsClosing(false)
        if (popupStateRef?.resolve) {
          popupStateRef.resolve(true)
        }
      }, 250)
    } else {
      handleClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const getIcon = () => {
    const iconClass = 'w-12 h-12'
    switch (state.type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-600`} />
      case 'error':
        return <AlertCircle className={`${iconClass} text-red-600`} />
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-yellow-600`} />
      case 'info':
        return <Info className={`${iconClass} text-blue-600`} />
      default:
        return <AlertCircle className={`${iconClass} text-primary-600`} />
    }
  }

  const formatCurrency = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '')
    if (!cleaned) return ''
    const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
    return `₹${fmt.format(parseInt(cleaned, 10))}`
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let value = e.target.value
    if (state.formatCurrencyInr) {
      value = formatCurrency(value)
    }
    setState(prev => ({ ...prev, inputValue: value }))
  }

  if (!state.isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 z-[9998] ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{ 
          willChange: 'opacity, backdrop-filter',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'none',
        }}
      />

      {/* Popup */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-2xl shadow-2xl max-w-sm w-full pointer-events-auto ${
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
              {state.type !== 'prompt' && state.type !== 'confirm' && (
                <div className="flex-shrink-0">{getIcon()}</div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">{state.title}</h3>
                {state.message && (
                  <p className="text-sm text-gray-600 mt-1">{state.message}</p>
                )}
              </div>
            </div>
            {(state.type === 'success' || state.type === 'error' || state.type === 'info' || state.type === 'warning') && (
              <button
                onClick={handleClose}
                className="flex-shrink-0 p-1.5 rounded-lg active:bg-gray-100 transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label="Close"
              >
                <X size={20} className="text-gray-500" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            {(state.type === 'prompt' || state.type === 'confirm') && (
              <div className="space-y-3">
                {state.type === 'prompt' && (
                  <div>
                    {state.inputLabel && (
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {state.inputLabel}
                      </label>
                    )}
                    {state.inputType === 'textarea' ? (
                      <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={state.inputValue}
                        onChange={handleInputChange}
                        placeholder={state.inputPlaceholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none"
                        rows={3}
                      />
                    ) : (
                      <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        type={state.inputType === 'number' ? 'text' : state.inputType}
                        inputMode={state.formatCurrencyInr ? 'numeric' : state.inputType === 'number' ? 'decimal' : 'text'}
                        value={state.inputValue}
                        onChange={handleInputChange}
                        placeholder={state.inputPlaceholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-gray-200">
            {(state.type === 'confirm' || state.type === 'prompt') && (
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {state.cancelText || 'Cancel'}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={state.type === 'prompt' && state.required && !state.inputValue.trim()}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors touch-manipulation ${
                state.type === 'prompt' && state.required && !state.inputValue.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white active:bg-primary-700'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {state.confirmText || 'OK'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

