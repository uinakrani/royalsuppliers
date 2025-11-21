'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, 5000) // Auto-close after 5 seconds

    return () => clearTimeout(timer)
  }, [toast.id, onClose])

  const bgColor = {
    success: 'bg-green-50 border-green-400',
    error: 'bg-red-50 border-red-400',
    info: 'bg-blue-50 border-blue-400',
  }[toast.type]

  const textColor = {
    success: 'text-green-800',
    error: 'text-red-800',
    info: 'text-blue-800',
  }[toast.type]

  const iconColor = {
    success: 'text-green-600',
    error: 'text-red-600',
    info: 'text-blue-600',
  }[toast.type]

  const Icon = toast.type === 'success' ? CheckCircle : XCircle

  return (
    <div
      className={`${bgColor} border-l-4 p-2 rounded-lg border border-gray-200 mb-2 flex items-center animate-slide-in`}
    >
      <Icon className={`${iconColor} mr-2 flex-shrink-0`} size={16} />
      <div className="flex-1">
        <p className={`text-xs font-medium ${textColor}`}>{toast.message}</p>
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className={`ml-2 ${textColor} hover:opacity-70`}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Listen for toast events
    const handleToast = (event: CustomEvent<Omit<Toast, 'id'>>) => {
      const newToast: Toast = {
        ...event.detail,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      }
      setToasts((prev) => [...prev, newToast])
    }

    window.addEventListener('show-toast' as any, handleToast as EventListener)

    return () => {
      window.removeEventListener('show-toast' as any, handleToast as EventListener)
    }
  }, [])

  const handleClose = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-sm px-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={handleClose} />
      ))}
    </div>
  )
}

// Helper function to show toast
export function showToast(message: string, type: ToastType = 'info') {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('show-toast', {
      detail: { message, type },
    })
    window.dispatchEvent(event)
  }
}

