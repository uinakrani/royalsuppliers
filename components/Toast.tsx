'use client'

// Re-export nativePopup methods as showToast for backward compatibility
// All toasts now use popup windows with smooth animations
import { nativePopup } from '@/components/NativePopup'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

// Empty component for backward compatibility
export default function ToastContainer() {
  return null
}

// Helper function to show toast - now uses popup windows
export function showToast(message: string, type: ToastType = 'info') {
  if (typeof window !== 'undefined') {
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info'
    nativePopup[type](title, message).catch(() => {
      // Silently handle errors
    })
  }
}

