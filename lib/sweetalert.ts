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
  backdrop: true,
  allowEnterKey: true,
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
    htmlContainer: 'swal2-html-container-mobile',
    backdrop: 'swal2-backdrop-custom'
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
        willOpen: () => {
          // Ensure backdrop is enabled before opening
        },
        didOpen: () => {
          // Ensure backdrop is visible - try multiple selectors and methods
          const ensureBackdrop = () => {
            // Try different selectors
            let backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
            const container = document.querySelector('.swal2-container') as HTMLElement
            
            // If no backdrop element exists, create one
            if (!backdrop && container) {
              backdrop = document.createElement('div')
              backdrop.className = 'swal2-backdrop swal2-backdrop-show swal2-backdrop-manual'
              backdrop.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background-color: rgba(0, 0, 0, 0.5) !important;
                opacity: 1 !important;
                z-index: 1059 !important;
                display: block !important;
                visibility: visible !important;
              `
              document.body.appendChild(backdrop)
            }
            
            if (backdrop) {
              backdrop.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)', 'important')
              backdrop.style.setProperty('opacity', '1', 'important')
              backdrop.style.setProperty('z-index', '1059', 'important')
              backdrop.style.setProperty('position', 'fixed', 'important')
              backdrop.style.setProperty('top', '0', 'important')
              backdrop.style.setProperty('left', '0', 'important')
              backdrop.style.setProperty('width', '100%', 'important')
              backdrop.style.setProperty('height', '100%', 'important')
              backdrop.style.setProperty('display', 'block', 'important')
              backdrop.style.setProperty('visibility', 'visible', 'important')
            }
            
            // Also ensure container has backdrop-show class (but don't set background on container)
            if (container) {
              container.classList.add('swal2-backdrop-show')
            }
          }
          
          // Try immediately and with delays
          ensureBackdrop()
          setTimeout(ensureBackdrop, 10)
          setTimeout(ensureBackdrop, 50)
          setTimeout(ensureBackdrop, 100)
        },
        didClose: () => {
          // Clean up manually created backdrop after a short delay to let SweetAlert2 clean up first
          setTimeout(() => {
            const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
            if (manualBackdrop) {
              manualBackdrop.remove()
            }
            // Also clean up any remaining backdrop elements that weren't cleaned up by SweetAlert2
            const backdrops = document.querySelectorAll('.swal2-backdrop')
            backdrops.forEach(backdrop => {
              if (backdrop.parentNode && backdrop.classList.contains('swal2-backdrop-manual')) {
                backdrop.remove()
              }
            })
          }, 100)
        },
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
      didOpen: () => {
        // Ensure backdrop is visible
        const backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
        if (backdrop) {
          backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
          backdrop.style.opacity = '1'
          backdrop.style.zIndex = '1060'
        }
      },
      didClose: () => {
        // Clean up manually created backdrop
        const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
        if (manualBackdrop) {
          manualBackdrop.remove()
        }
        // Also clean up any backdrop elements that might remain
        const backdrops = document.querySelectorAll('.swal2-backdrop')
        backdrops.forEach(backdrop => {
          if (backdrop.parentNode) {
            backdrop.remove()
          }
        })
      },
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
      didOpen: () => {
        // Ensure backdrop is visible
        const backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
        if (backdrop) {
          backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
          backdrop.style.opacity = '1'
          backdrop.style.zIndex = '1060'
        }
      },
      didClose: () => {
        // Clean up manually created backdrop
        const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
        if (manualBackdrop) {
          manualBackdrop.remove()
        }
        // Also clean up any backdrop elements that might remain
        const backdrops = document.querySelectorAll('.swal2-backdrop')
        backdrops.forEach(backdrop => {
          if (backdrop.parentNode) {
            backdrop.remove()
          }
        })
      },
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
      didOpen: () => {
        // Ensure backdrop is visible
        const backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
        if (backdrop) {
          backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
          backdrop.style.opacity = '1'
          backdrop.style.zIndex = '1060'
        }
      },
      didClose: () => {
        // Clean up manually created backdrop
        const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
        if (manualBackdrop) {
          manualBackdrop.remove()
        }
        // Also clean up any backdrop elements that might remain
        const backdrops = document.querySelectorAll('.swal2-backdrop')
        backdrops.forEach(backdrop => {
          if (backdrop.parentNode) {
            backdrop.remove()
          }
        })
      },
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
      didOpen: () => {
        // Ensure backdrop is visible
        const backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
        if (backdrop) {
          backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
          backdrop.style.opacity = '1'
          backdrop.style.zIndex = '1060'
        }
      },
      didClose: () => {
        // Clean up manually created backdrop
        const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
        if (manualBackdrop) {
          manualBackdrop.remove()
        }
        // Also clean up any backdrop elements that might remain
        const backdrops = document.querySelectorAll('.swal2-backdrop')
        backdrops.forEach(backdrop => {
          if (backdrop.parentNode) {
            backdrop.remove()
          }
        })
      },
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
    required?: boolean
    formatCurrencyInr?: boolean
  }): Promise<string | null> => {
    try {
      const Swal = await getSwal()
      const isCurrency = !!options.formatCurrencyInr
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
          if (options.required !== false && !value) {
            return 'Please enter a value'
          }
          return null
        },
        didOpen: () => {
          const ensureBackdrop = () => {
            let backdrop = document.querySelector('.swal2-backdrop') as HTMLElement
            const container = document.querySelector('.swal2-container') as HTMLElement
            if (!backdrop && container) {
              backdrop = document.createElement('div')
              backdrop.className = 'swal2-backdrop swal2-backdrop-show swal2-backdrop-manual'
              backdrop.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background-color: rgba(0, 0, 0, 0.5) !important;
                opacity: 1 !important;
                z-index: 1059 !important;
                display: block !important;
                visibility: visible !important;
              `
              document.body.appendChild(backdrop)
            }
            if (backdrop) {
              backdrop.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)', 'important')
              backdrop.style.setProperty('opacity', '1', 'important')
              backdrop.style.setProperty('z-index', '1059', 'important')
              backdrop.style.setProperty('position', 'fixed', 'important')
              backdrop.style.setProperty('top', '0', 'important')
              backdrop.style.setProperty('left', '0', 'important')
              backdrop.style.setProperty('width', '100%', 'important')
              backdrop.style.setProperty('height', '100%', 'important')
              backdrop.style.setProperty('display', 'block', 'important')
              backdrop.style.setProperty('visibility', 'visible', 'important')
            }
            if (container) {
              container.classList.add('swal2-backdrop-show')
            }
          }
          ensureBackdrop()
          setTimeout(ensureBackdrop, 10)
          setTimeout(ensureBackdrop, 50)
          setTimeout(ensureBackdrop, 100)

          setTimeout(() => {
            const input = Swal.getInput() as HTMLInputElement | HTMLTextAreaElement | null
            if (input) {
              const el = input as HTMLInputElement
              if (isCurrency) {
                // Use text input with numeric keypad
                el.setAttribute('inputmode', 'numeric')
                // format current value
                const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
                const applyFormat = () => {
                  const raw = el.value.replace(/[^0-9]/g, '')
                  el.value = raw ? `₹${fmt.format(parseInt(raw, 10))}` : ''
                }
                applyFormat()
                el.addEventListener('input', applyFormat)
              } else if (options.inputType === 'number') {
                el.setAttribute('inputmode', 'decimal')
                el.setAttribute('pattern', '[0-9]*')
              }
              el.focus()
              if ((el as any).select) {
                ;(el as any).select()
              }
              if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                setTimeout(() => {
                  el.click()
                  el.focus()
                  if ((el as any).select) {
                    ;(el as any).select()
                  }
                  setTimeout(() => {
                    el.focus()
                    if ((el as any).select) {
                      ;(el as any).select()
                    }
                  }, 150)
                }, 100)
              }
            }
          }, 200)
        },
        didClose: () => {
          setTimeout(() => {
            const manualBackdrop = document.querySelector('.swal2-backdrop-manual') as HTMLElement
            if (manualBackdrop) {
              manualBackdrop.remove()
            }
            const backdrops = document.querySelectorAll('.swal2-backdrop')
            backdrops.forEach(backdrop => {
              if (backdrop.parentNode && backdrop.classList.contains('swal2-backdrop-manual')) {
                backdrop.remove()
              }
            })
          }, 100)
        },
        preConfirm: (value: string) => {
          if (isCurrency) {
            const cleaned = (value || '').toString().replace(/[^0-9]/g, '')
            return cleaned
          }
          return value
        }
      })
      return result.isConfirmed ? result.value : null
    } catch (error: any) {
      console.error('SweetAlert.prompt error:', error)
      throw error
    }
  },
}

