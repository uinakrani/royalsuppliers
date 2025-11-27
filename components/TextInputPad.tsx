'use client'

import { useState, useEffect } from 'react'
import { X, Delete } from 'lucide-react'

interface TextInputPadProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  label?: string
  placeholder?: string
  inline?: boolean // If true, render inline instead of as overlay
}

const KEYBOARD_LAYOUT = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
]

const NUMBERS_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export default function TextInputPad({ 
  value, 
  onChange, 
  onClose, 
  label = 'Enter Text',
  placeholder = 'Type here...',
  inline = false
}: TextInputPadProps) {
  const [text, setText] = useState(value || '')
  const [isUpperCase, setIsUpperCase] = useState(false)
  const [showNumbers, setShowNumbers] = useState(false)

  useEffect(() => {
    setText(value || '')
  }, [value])

  const handleKeyPress = (key: string) => {
    const newText = text + (isUpperCase ? key.toUpperCase() : key.toLowerCase())
    setText(newText)
    onChange(newText)
  }

  const handleSpace = () => {
    const newText = text + ' '
    setText(newText)
    onChange(newText)
  }

  const handleBackspace = () => {
    const newText = text.slice(0, -1)
    setText(newText)
    onChange(newText)
  }

  const handleClear = () => {
    setText('')
    onChange('')
  }

  const handleDone = () => {
    onChange(text)
    onClose()
  }

  const currentLayout = showNumbers ? [NUMBERS_ROW] : KEYBOARD_LAYOUT

  const renderContent = () => {
    return (
      <div 
        className={inline ? "w-full" : "bg-white rounded-t-3xl w-full max-w-md animate-slide-up shadow-2xl"}
        onClick={(e) => e.stopPropagation()}
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
        <div className={inline ? "p-2 bg-gray-50" : "p-4 bg-gray-50 border-b border-gray-200"}>
          <div className={`${inline ? 'min-h-[50px] p-2' : 'min-h-[60px] p-3'} bg-white rounded-lg border border-gray-200`}>
            <div className={inline ? "text-sm text-gray-900 break-words" : "text-base text-gray-900 break-words"}>
              {text || <span className="text-gray-400">{placeholder}</span>}
            </div>
          </div>
        </div>

        {/* Keyboard */}
        <div className={inline ? "p-2 max-h-[350px] overflow-y-auto" : "p-3 max-h-[400px] overflow-y-auto"}>
          {currentLayout.map((row, rowIdx) => (
            <div key={rowIdx} className={`flex justify-center ${inline ? 'gap-0.5 mb-0.5' : 'gap-1 mb-1'}`}>
              {row.map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className={inline ? "h-9 px-2 bg-white border border-gray-200 rounded text-xs font-medium text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm flex-shrink-0" : "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 active:bg-gray-100 active:scale-[0.97] transition-transform duration-100 shadow-sm flex-shrink-0"}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {isUpperCase && !showNumbers ? key.toUpperCase() : key}
                </button>
              ))}
            </div>
          ))}

          {/* Special Keys Row */}
          <div className={`flex ${inline ? 'gap-0.5 mt-1.5' : 'gap-1 mt-2'}`}>
            <button
              onClick={() => setIsUpperCase(!isUpperCase)}
              className={inline ? "h-9 px-3 bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 active:bg-gray-200 transition-colors" : "h-10 px-4 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 active:bg-gray-200 transition-colors"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {isUpperCase ? 'ABC' : 'abc'}
            </button>
            <button
              onClick={() => setShowNumbers(!showNumbers)}
              className={inline ? "h-9 px-3 bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-700 active:bg-gray-200 transition-colors" : "h-10 px-4 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 active:bg-gray-200 transition-colors"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {showNumbers ? 'ABC' : '123'}
            </button>
            <button
              onClick={handleSpace}
              className={inline ? "h-9 flex-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-700 active:bg-gray-100 transition-colors" : "h-10 flex-1 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 active:bg-gray-100 transition-colors"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Space
            </button>
            <button
              onClick={handleBackspace}
              className={inline ? "h-9 px-3 bg-gray-100 border border-gray-200 rounded flex items-center justify-center active:bg-gray-200 transition-colors" : "h-10 px-4 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center active:bg-gray-200 transition-colors"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Delete size={inline ? 16 : 18} className="text-gray-700" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className={`flex ${inline ? 'gap-1.5 mt-2' : 'gap-2 mt-3'}`}>
            <button
              onClick={handleClear}
              className={inline ? "h-10 flex-1 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 active:bg-gray-200 transition-colors" : "h-12 flex-1 bg-gray-100 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 active:bg-gray-200 transition-colors"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Clear
            </button>
            <button
              onClick={handleDone}
              className={inline ? "h-10 flex-1 bg-primary-600 text-white rounded-lg text-xs font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 shadow-lg shadow-primary-600/30" : "h-12 flex-1 bg-primary-600 text-white rounded-lg text-sm font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 shadow-lg shadow-primary-600/30"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Done
            </button>
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

