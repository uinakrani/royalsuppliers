'use client'

import { useState, useEffect } from 'react'
import { X, Delete, RotateCcw } from 'lucide-react'
import { formatIndianCurrency } from '@/lib/currencyUtils'

interface NumberPadProps {
  value: number | string
  onChange: (value: number) => void
  onClose: () => void
  label?: string
  maxDecimals?: number
  allowNegative?: boolean
  inline?: boolean // If true, render inline instead of as overlay
  hideDoneButton?: boolean // If true, hide the Done button
  showCurrency?: boolean // If true, show formatted currency in display
}

export default function NumberPad({
  value,
  onChange,
  onClose,
  label = 'Enter Amount',
  maxDecimals = 2,
  allowNegative = false,
  inline = false,
  hideDoneButton = false,
  showCurrency = false
}: NumberPadProps) {
  const getInitialValue = () => {
    if (value === 0 || value === '0' || value === '' || !value) return '0'
    const str = value.toString()
    // Remove trailing zeros after decimal if it's a whole number
    if (str.includes('.')) {
      return str.replace(/\.?0+$/, '') || '0'
    }
    return str
  }

  const [displayValue, setDisplayValue] = useState(getInitialValue())
  const [hasDecimal, setHasDecimal] = useState(getInitialValue().includes('.'))

  // Reset display value when component opens with new value
  useEffect(() => {
    // Prevent overriding local input state if the value is numerically equivalent
    // This allows typing "0." without it being reset to "0" by the parent
    if (parseFloat(displayValue) === value && displayValue.endsWith('.')) {
      return
    }
    // Also prevent reset if active typing is happening (simple equality check)
    // If displayValue "5." and value is 5, we shouldn't reset to "5"
    if (parseFloat(displayValue) === value && displayValue.includes('.')) {
      return
    }

    const newValue = (() => {
      if (value === 0 || value === '0' || value === '' || !value) return '0'
      const str = value.toString()
      // Remove trailing zeros after decimal if it's a whole number
      if (str.includes('.')) {
        return str.replace(/\.?0+$/, '') || '0'
      }
      return str
    })()

    // one final check: if we are about to set it to the same string, skip
    if (newValue === displayValue) return

    setDisplayValue(newValue)
    setHasDecimal(newValue.includes('.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleNumberPress = (num: string) => {
    let newDisplayValue = displayValue

    if (num === '.') {
      if (!hasDecimal) {
        newDisplayValue = displayValue === '0' ? '0.' : displayValue + '.'
        setHasDecimal(true)
      } else {
        return // Already has decimal
      }
    } else {
      // Remove leading zero if adding a new digit
      if (displayValue === '0' && num !== '.') {
        newDisplayValue = num
      } else {
        newDisplayValue = displayValue + num
      }

      // Check decimal places
      if (hasDecimal) {
        const parts = newDisplayValue.split('.')
        if (parts[1] && parts[1].length > maxDecimals) {
          return // Don't allow more decimals
        }
      }
    }

    setDisplayValue(newDisplayValue)
    const numValue = parseFloat(newDisplayValue) || 0
    onChange(numValue)
  }

  const handleBackspace = () => {
    if (displayValue.length > 1) {
      const newValue = displayValue.slice(0, -1)
      if (newValue.endsWith('.')) {
        setHasDecimal(false)
        setDisplayValue(newValue.slice(0, -1))
        onChange(parseFloat(newValue.slice(0, -1)) || 0)
      } else {
        setDisplayValue(newValue)
        onChange(parseFloat(newValue) || 0)
      }
    } else {
      setDisplayValue('0')
      setHasDecimal(false)
      onChange(0)
    }
  }

  const handleClear = () => {
    setDisplayValue('0')
    setHasDecimal(false)
    onChange(0)
  }

  const handleToggleNegative = () => {
    if (allowNegative) {
      const newValue = displayValue.startsWith('-')
        ? displayValue.slice(1)
        : '-' + displayValue
      setDisplayValue(newValue)
      onChange(parseFloat(newValue) || 0)
    }
  }

  const handleDone = () => {
    const finalValue = parseFloat(displayValue) || 0
    // Update the value first, then close after a brief delay to ensure state update
    onChange(finalValue)
    // Small delay to ensure onChange has processed
    setTimeout(() => {
      onClose()
    }, 50)
  }

  const renderContent = () => {
    return (
      <div
        className={inline ? "w-full" : "bg-white rounded-t-3xl w-full max-w-md animate-slide-up shadow-2xl"}
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {/* Header - Only show when not inline */}
        {!inline && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
            <button
              onClick={onClose}
              className="p-2 active:bg-gray-100 rounded-lg"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        )}

        {/* Display */}
        <div className={inline ? "p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl mb-3 flex flex-col justify-center min-h-[96px]" : "p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl mb-2 flex flex-col justify-center min-h-[120px]"}>
          <div className="text-right w-full">
            {/* Always render the full structure if showCurrency is enabled to prevent layout jumps */}
            {showCurrency ? (
              <>
                <div className={inline ? "text-xs text-gray-500 mb-1" : "text-sm text-gray-500 mb-1"}>
                  {label}
                </div>
                <div className={inline ? "text-2xl font-bold text-primary-600 truncate" : "text-3xl font-bold text-primary-600 truncate"}>
                  {formatIndianCurrency(parseFloat(displayValue) || 0)}
                </div>
                <div className={inline ? "text-sm text-gray-400 mt-1 font-mono truncate" : "text-base text-gray-400 mt-1 font-mono truncate"}>
                  {displayValue || '0'}
                </div>
              </>
            ) : (
              <div className={inline ? "text-3xl font-bold text-gray-900 font-mono tracking-tight truncate" : "text-4xl font-bold text-gray-900 font-mono tracking-tight truncate"}>
                {displayValue || '0'}
              </div>
            )}
          </div>
        </div>

        {/* Keypad */}
        <div className={inline ? "p-2" : "p-4"}>
          <div className="grid grid-cols-3 gap-2.5">
            {/* Row 1 */}
            <button
              onClick={() => handleNumberPress('7')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              7
            </button>
            <button
              onClick={() => handleNumberPress('8')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              8
            </button>
            <button
              onClick={() => handleNumberPress('9')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              9
            </button>

            {/* Row 2 */}
            <button
              onClick={() => handleNumberPress('4')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              4
            </button>
            <button
              onClick={() => handleNumberPress('5')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              5
            </button>
            <button
              onClick={() => handleNumberPress('6')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              6
            </button>

            {/* Row 3 */}
            <button
              onClick={() => handleNumberPress('1')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              1
            </button>
            <button
              onClick={() => handleNumberPress('2')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              2
            </button>
            <button
              onClick={() => handleNumberPress('3')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              3
            </button>

            {/* Row 4 */}
            {allowNegative ? (
              <button
                onClick={handleToggleNegative}
                className="h-16 bg-gray-50 border-2 border-gray-200 rounded-2xl text-xl font-bold text-gray-700 active:bg-gray-100 active:scale-[0.95] transition-all duration-150 shadow-sm touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                ±
              </button>
            ) : (
              <button
                onClick={handleClear}
                className="h-16 bg-gray-50 border-2 border-gray-200 rounded-2xl flex items-center justify-center active:bg-gray-100 active:scale-[0.95] transition-all duration-150 shadow-sm touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <RotateCcw size={22} className="text-gray-700" />
              </button>
            )}
            <button
              onClick={() => handleNumberPress('0')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              0
            </button>
            <button
              onClick={() => handleNumberPress('.')}
              className="h-16 bg-white border-2 border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 active:bg-gray-50 active:scale-[0.95] active:border-primary-300 transition-all duration-150 shadow-sm hover:shadow-md touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              .
            </button>

            {/* Row 5 - Actions */}
            <button
              onClick={handleBackspace}
              className="h-16 bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300 rounded-2xl flex items-center justify-center active:from-gray-200 active:to-gray-300 active:scale-[0.95] transition-all duration-150 shadow-sm touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Delete size={22} className="text-gray-700" />
            </button>
            {!hideDoneButton && (
              <button
                onClick={handleDone}
                className={inline ? "h-14 bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-xl text-base font-bold active:from-primary-700 active:to-primary-800 active:scale-[0.97] transition-all duration-150 col-span-2 shadow-lg shadow-primary-600/40 touch-manipulation" : "h-16 bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-2xl text-lg font-bold active:from-primary-700 active:to-primary-800 active:scale-[0.97] transition-all duration-150 col-span-2 shadow-lg shadow-primary-600/40 touch-manipulation"}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Done
              </button>
            )}
            {hideDoneButton && (
              <div className="col-span-2" />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (inline) {
    return renderContent()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100000] flex items-end justify-center backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {renderContent()}
    </div>
  )
}

