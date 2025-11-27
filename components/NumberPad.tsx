'use client'

import { useState, useEffect } from 'react'
import { X, Delete } from 'lucide-react'

interface NumberPadProps {
  value: number | string
  onChange: (value: number) => void
  onClose: () => void
  label?: string
  maxDecimals?: number
  allowNegative?: boolean
  inline?: boolean // If true, render inline instead of as overlay
  hideDoneButton?: boolean // If true, hide the Done button
}

export default function NumberPad({ 
  value, 
  onChange, 
  onClose, 
  label = 'Enter Amount',
  maxDecimals = 2,
  allowNegative = false,
  inline = false,
  hideDoneButton = false
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
    const newValue = (() => {
      if (value === 0 || value === '0' || value === '' || !value) return '0'
      const str = value.toString()
      // Remove trailing zeros after decimal if it's a whole number
      if (str.includes('.')) {
        return str.replace(/\.?0+$/, '') || '0'
      }
      return str
    })()
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
      }
      setDisplayValue(newValue)
      onChange(parseFloat(newValue) || 0)
    } else {
      setDisplayValue('0')
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
        className={inline ? "bg-white rounded-xl w-full shadow-lg" : "bg-white rounded-t-3xl w-full max-w-md animate-slide-up shadow-2xl"}
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
      {/* Header */}
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

      {/* Display */}
      <div className="p-6 bg-gray-50">
        <div className="text-right">
          <div className="text-4xl font-bold text-gray-900 font-mono">
            {displayValue || '0'}
          </div>
        </div>
      </div>

      {/* Keypad */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          {/* Row 1 */}
          <button
            onClick={() => handleNumberPress('7')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            7
          </button>
          <button
            onClick={() => handleNumberPress('8')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            8
          </button>
          <button
            onClick={() => handleNumberPress('9')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            9
          </button>

          {/* Row 2 */}
          <button
            onClick={() => handleNumberPress('4')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            4
          </button>
          <button
            onClick={() => handleNumberPress('5')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            5
          </button>
          <button
            onClick={() => handleNumberPress('6')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            6
          </button>

          {/* Row 3 */}
          <button
            onClick={() => handleNumberPress('1')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            1
          </button>
          <button
            onClick={() => handleNumberPress('2')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            2
          </button>
          <button
            onClick={() => handleNumberPress('3')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            3
          </button>

          {/* Row 4 */}
          {allowNegative ? (
            <button
              onClick={handleToggleNegative}
              className="h-14 bg-white border border-gray-200 rounded-xl text-xl font-semibold text-gray-700 active:bg-gray-100 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              ±
            </button>
          ) : (
            <button
              onClick={handleClear}
              className="h-14 bg-white border border-gray-200 rounded-xl text-xl font-semibold text-gray-700 active:bg-gray-100 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              C
            </button>
          )}
          <button
            onClick={() => handleNumberPress('0')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            0
          </button>
          <button
            onClick={() => handleNumberPress('.')}
            className="h-14 bg-white border border-gray-200 rounded-xl text-2xl font-semibold text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            .
          </button>

          {/* Row 5 - Actions */}
          <button
            onClick={handleBackspace}
            className="h-14 bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center active:bg-gray-200 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Delete size={20} className="text-gray-700" />
          </button>
          {!hideDoneButton && (
            <button
              onClick={handleDone}
              className="h-14 bg-primary-600 text-white rounded-xl text-lg font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 col-span-2 shadow-lg shadow-primary-600/30"
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

