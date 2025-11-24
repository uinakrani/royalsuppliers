'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import Button from '@/components/Button'

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
  isClosing?: boolean
}

let popupStateRef: {
  setState: (state: PopupState) => void
  state?: PopupState
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
      
      // Auto close after 2.5 seconds (with animation)
      setTimeout(() => {
        if (popupStateRef && popupStateRef.state?.isOpen) {
          // Trigger closing animation
          const currentState = popupStateRef.state
          popupStateRef.setState({ ...currentState, isClosing: true })
          setTimeout(() => {
            if (popupStateRef && popupStateRef.state) {
              const finalState = popupStateRef.state
              popupStateRef.setState({ ...finalState, isOpen: false, inputValue: '', isClosing: false })
              if (popupStateRef?.resolve) {
                popupStateRef.resolve(undefined)
                popupStateRef.resolve = () => {}
              }
            }
          }, 325) // Match exit animation duration
        }
      }, 2500)
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

  // Generic fire method for custom dialogs
  fire: async (options: {
    title?: string
    message?: string
    icon?: 'success' | 'error' | 'warning' | 'info'
    confirmText?: string
    showCancelButton?: boolean
    cancelText?: string
  }): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!popupStateRef) {
        reject(new Error('NativePopup not initialized'))
        return
      }
      const isConfirm = options.showCancelButton !== false
      popupStateRef.setState({
        isOpen: true,
        type: isConfirm ? 'confirm' : (options.icon || 'info') as PopupType,
        title: options.title || '',
        message: options.message || '',
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        inputValue: '',
      })
      popupStateRef.resolve = (value: any) => resolve({ isConfirmed: value === true || value !== null })
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
  const [isStandalone, setIsStandalone] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
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
    // Re-check on class changes
    const observer = new MutationObserver(checkStandalone)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Register the setState function
    popupStateRef = {
      setState: (newState: PopupState) => {
        if (newState.isClosing) {
          // Handle closing animation
          setIsClosing(true)
          setIsMounted(false)
          setTimeout(() => {
            setState(prev => ({ ...prev, isOpen: false, isClosing: false }))
            setIsClosing(false)
          }, 325)
        } else {
          setIsClosing(false)
          setIsMounted(false)
          setState(newState)
          // Update state ref for auto-close
          if (popupStateRef) {
            popupStateRef.state = newState
          }
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
              }, 500)
            }
          }
        }
      },
      state: state,
      resolve: () => {},
      reject: () => {},
    }

    return () => {
      popupStateRef = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    // Wait for exit animation to complete (300ms for modal + 25ms for backdrop)
    setTimeout(() => {
      setState(prev => ({ ...prev, isOpen: false }))
      setIsClosing(false)
      if (popupStateRef?.resolve) {
        if (state.type === 'prompt') {
          popupStateRef.resolve(null)
        } else if (state.type === 'confirm') {
          popupStateRef.resolve(false)
        } else {
          popupStateRef.resolve(undefined)
        }
      }
    }, 325) // Match CSS animation duration
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
      }, 325) // Match CSS animation duration
    } else if (state.type === 'confirm') {
      setIsClosing(true)
      setIsMounted(false)
      setTimeout(() => {
        setState(prev => ({ ...prev, isOpen: false }))
        setIsClosing(false)
        if (popupStateRef?.resolve) {
          popupStateRef.resolve(true)
        }
      }, 325) // Match CSS animation duration
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
    const iconClass = 'w-14 h-14'
    switch (state.type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-600`} strokeWidth={2.5} />
      case 'error':
        return <AlertCircle className={`${iconClass} text-red-600`} strokeWidth={2.5} />
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-yellow-600`} strokeWidth={2.5} />
      case 'info':
        return <Info className={`${iconClass} text-blue-600`} strokeWidth={2.5} />
      default:
        return <AlertCircle className={`${iconClass} text-primary-600`} strokeWidth={2.5} />
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

  const popupContent = (
    <>
      {/* Backdrop with smooth blur animation */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 backdrop-blur-md z-[99999] popup-backdrop ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{ 
          willChange: 'opacity, backdrop-filter',
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
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none popup-container"
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
        }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-3xl border-0 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] max-w-sm w-full pointer-events-auto overflow-hidden ${
            isClosing
              ? 'native-modal-exit'
              : isMounted
              ? 'native-modal-enter'
              : 'opacity-0 scale-90 translate-y-8'
          }`}
          style={{
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Header with enhanced styling - Native app feel */}
          <div className="relative">
            {/* Gradient background for header */}
            <div className={`absolute inset-0 ${
              state.type === 'success' ? 'bg-gradient-to-br from-green-50 to-white' :
              state.type === 'error' ? 'bg-gradient-to-br from-red-50 to-white' :
              state.type === 'warning' ? 'bg-gradient-to-br from-yellow-50 to-white' :
              state.type === 'info' ? 'bg-gradient-to-br from-blue-50 to-white' :
              'bg-gradient-to-br from-gray-50 to-white'
            }`} />
            <div className="relative flex items-start justify-between p-6 border-b border-gray-100/80">
              <div className="flex items-center gap-4 flex-1">
                {state.type !== 'prompt' && state.type !== 'confirm' && (
                  <div className="flex-shrink-0 animate-pulse-once relative">
                    <div className="absolute inset-0 bg-white/60 rounded-full blur-xl" />
                    <div className="relative">{getIcon()}</div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">{state.title}</h3>
                  {state.message && (
                    <p className="text-sm text-gray-600 mt-2.5 leading-relaxed whitespace-pre-line">{state.message}</p>
                  )}
                </div>
              </div>
              {(state.type === 'success' || state.type === 'error' || state.type === 'info' || state.type === 'warning') && (
                <button
                  onClick={handleClose}
                  className="flex-shrink-0 p-2.5 rounded-2xl active:bg-gray-100/80 active:scale-95 transition-all duration-200 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Close"
                >
                  <X size={22} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Content with enhanced styling - Native app feel */}
          <div className="p-6 bg-white">
            {(state.type === 'prompt' || state.type === 'confirm') && (
              <div className="space-y-5">
                {state.type === 'prompt' && (
                  <div>
                    {state.inputLabel && (
                      <label className="block text-sm font-semibold text-gray-800 mb-3">
                        {state.inputLabel}
                      </label>
                    )}
                    {state.inputType === 'textarea' ? (
                      <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={state.inputValue}
                        onChange={handleInputChange}
                        placeholder={state.inputPlaceholder}
                        className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-white resize-none transition-all duration-200 text-gray-900 placeholder:text-gray-400"
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
                        className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 focus:bg-white transition-all duration-200 text-gray-900 placeholder:text-gray-400"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with enhanced button styling - Native app feel */}
          <div className="relative bg-gray-50/50">
            <div className="flex gap-3 p-5">
              {(state.type === 'confirm' || state.type === 'prompt') && (
                <Button
                  onClick={handleClose}
                  variant="ghost"
                  size="lg"
                  fullWidth
                >
                  {state.cancelText || 'Cancel'}
                </Button>
              )}
              <Button
                onClick={handleConfirm}
                disabled={state.type === 'prompt' && state.required && !state.inputValue.trim()}
                variant="primary"
                size="lg"
                fullWidth
              >
                {state.confirmText || 'OK'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(popupContent, document.body)
}

