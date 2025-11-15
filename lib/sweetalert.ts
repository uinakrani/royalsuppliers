// Use SweetAlert2 from CDN (loaded in layout.tsx)
// This works even if npm install fails
declare global {
  interface Window {
    Swal: any
  }
}

const getSwal = async (): Promise<any> => {
  if (typeof window === 'undefined') {
    throw new Error('SweetAlert2 can only be used in the browser')
  }

  // Check if Swal is available on window (from CDN)
  if (window.Swal) {
    console.log('✅ SweetAlert2 found immediately')
    return window.Swal
  }

  // Wait for script to load (with timeout)
  return new Promise((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds max wait
    
    const checkSwal = () => {
      attempts++
      console.log(`Checking for SweetAlert2 (attempt ${attempts}/${maxAttempts})...`)
      
      if (window.Swal) {
        console.log('✅ SweetAlert2 found on window:', typeof window.Swal)
        resolve(window.Swal)
      } else if (attempts < maxAttempts) {
        setTimeout(checkSwal, 100)
      } else {
        console.error('❌ SweetAlert2 not found after', maxAttempts, 'attempts')
        // Final fallback: try to import from npm package if available
        try {
          // @ts-ignore
          const Swal = require('sweetalert2')
          console.log('✅ SweetAlert2 loaded from npm package')
          resolve(Swal)
        } catch (err) {
          console.error('❌ SweetAlert2 not found in npm package either:', err)
          reject(new Error('SweetAlert2 is not loaded. Please refresh the page.'))
        }
      }
    }
    
    checkSwal()
  })
}

// Mobile-friendly SweetAlert configuration - Compact
const swalConfig = {
  confirmButtonColor: '#0ea5e9', // primary-600
  cancelButtonColor: '#6b7280', // gray-500
  buttonsStyling: true,
  reverseButtons: true, // Cancel on left, Confirm on right (mobile-friendly)
  allowOutsideClick: false,
  allowEscapeKey: true,
  width: '90%',
  padding: '1rem',
  showClass: {
    popup: 'animate-fade-in',
    backdrop: 'animate-fade-in'
  },
  hideClass: {
    popup: 'animate-fade-out',
    backdrop: 'animate-fade-out'
  },
  customClass: {
    popup: 'swal2-popup-mobile',
    confirmButton: 'swal2-confirm-mobile',
    cancelButton: 'swal2-cancel-mobile',
    title: 'swal2-title-mobile',
    htmlContainer: 'swal2-html-container-mobile'
  }
}

export const sweetAlert = {
  // Confirmation dialog
  confirm: async (options: {
    title?: string
    text?: string
    confirmText?: string
    cancelText?: string
    icon?: 'warning' | 'error' | 'success' | 'info' | 'question'
  }): Promise<boolean> => {
    try {
      console.log('SweetAlert.confirm called with options:', options)
      const Swal = await Promise.race([
        getSwal(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SweetAlert2 loading timeout')), 5000)
        )
      ]) as any
      
      console.log('Swal object obtained:', !!Swal)
      const result = await Swal.fire({
        ...swalConfig,
        title: options.title || 'Are you sure?',
        text: options.text || '',
        icon: options.icon || 'question',
        showCancelButton: true,
        confirmButtonText: options.confirmText || 'Yes',
        cancelButtonText: options.cancelText || 'Cancel',
      })
      console.log('SweetAlert result:', result)
      return result.isConfirmed
    } catch (error: any) {
      console.error('SweetAlert.confirm error:', error)
      throw error
    }
  },

  // Success message
  success: async (title: string, text?: string) => {
    const Swal = await getSwal()
    return Swal.fire({
      ...swalConfig,
      title,
      text,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false,
    })
  },

  // Error message
  error: async (title: string, text?: string) => {
    const Swal = await getSwal()
    return Swal.fire({
      ...swalConfig,
      title,
      text,
      icon: 'error',
      confirmButtonText: 'OK',
    })
  },

  // Info message
  info: async (title: string, text?: string) => {
    const Swal = await getSwal()
    return Swal.fire({
      ...swalConfig,
      title,
      text,
      icon: 'info',
      confirmButtonText: 'OK',
    })
  },

  // Warning message
  warning: async (title: string, text?: string) => {
    const Swal = await getSwal()
    return Swal.fire({
      ...swalConfig,
      title,
      text,
      icon: 'warning',
      confirmButtonText: 'OK',
    })
  },

  // Prompt with input
  prompt: async (options: {
    title?: string
    text?: string
    inputLabel?: string
    inputPlaceholder?: string
    inputValue?: string
    inputType?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'textarea'
    confirmText?: string
    cancelText?: string
    showCancelButton?: boolean
  }): Promise<string | null> => {
    try {
      const Swal = await getSwal()
      const result = await Swal.fire({
        ...swalConfig,
        title: options.title || 'Enter value',
        text: options.text || '',
        input: options.inputType || 'text',
        inputLabel: options.inputLabel || '',
        inputPlaceholder: options.inputPlaceholder || '',
        inputValue: options.inputValue || '',
        showCancelButton: options.showCancelButton !== false,
        confirmButtonText: options.confirmText || 'OK',
        cancelButtonText: options.cancelText || 'Cancel',
        inputValidator: (value: string) => {
          if (!value) {
            return 'Please enter a value'
          }
          return null
        },
      })
      return result.isConfirmed ? result.value : null
    } catch (error: any) {
      console.error('SweetAlert.prompt error:', error)
      throw error
    }
  },
}

