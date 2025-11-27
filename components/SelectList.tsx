'use client'

import { X, Search, Plus } from 'lucide-react'
import { useState } from 'react'

interface SelectListProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  onClose: () => void
  label?: string
  allowCustom?: boolean
  onCustomAdd?: (value: string) => void
  multiSelect?: boolean
  selectedValues?: string[]
  onMultiChange?: (values: string[]) => void
  inline?: boolean // If true, render inline instead of as overlay
}

export default function SelectList({
  options,
  value,
  onChange,
  onClose,
  label = 'Select Option',
  allowCustom = false,
  onCustomAdd,
  multiSelect = false,
  selectedValues = [],
  onMultiChange,
  inline = false
}: SelectListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = (option: string) => {
    if (multiSelect && onMultiChange) {
      const newValues = selectedValues.includes(option)
        ? selectedValues.filter(v => v !== option)
        : [...selectedValues, option]
      onMultiChange(newValues)
    } else {
      onChange(option)
      onClose()
    }
  }

  const handleCustomAdd = () => {
    if (customValue.trim() && onCustomAdd) {
      onCustomAdd(customValue.trim())
      onChange(customValue.trim())
      onClose()
    }
  }

  const renderContent = () => {
    return (
      <div
        className={inline ? "w-full flex flex-col" : "bg-white rounded-t-3xl w-full max-w-md max-h-[80vh] flex flex-col animate-slide-up shadow-2xl"}
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          ...(inline ? { maxHeight: '60vh' } : {})
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Only show when not inline */}
        {!inline && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
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

        {/* Search */}
        {!showCustomInput && (
          <div className={`${inline ? 'p-2' : 'p-4'} flex-shrink-0 ${inline ? '' : 'border-b border-gray-200'}`}>
            <div className="relative">
              <Search size={inline ? 16 : 18} className={`absolute ${inline ? 'left-2' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className={`w-full ${inline ? 'pl-8 pr-3 py-2' : 'pl-10 pr-4 py-2.5'} bg-gray-50 border border-gray-200 ${inline ? 'rounded-lg' : 'rounded-xl'} focus:outline-none focus:ring-2 focus:ring-primary-500`}
                style={{ fontSize: inline ? '14px' : '16px' }}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Custom Input */}
        {showCustomInput ? (
          <div className="p-4 flex-1 flex flex-col">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter New {label}
              </label>
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                style={{ fontSize: '16px' }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => setShowCustomInput(false)}
                className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl font-semibold active:bg-gray-200 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCustomAdd}
                disabled={!customValue.trim()}
                className="flex-1 h-12 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Options List */}
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              {filteredOptions.length > 0 ? (
                <div className={inline ? "p-1.5" : "p-2"}>
                  {/* Clear/None option for single select when a value is selected */}
                  {!multiSelect && value && (
                    <button
                      onClick={() => {
                        onChange('')
                        if (!inline) onClose()
                      }}
                      className={`w-full text-left ${inline ? 'px-3 py-2 rounded-lg mb-0.5' : 'px-4 py-3 rounded-xl mb-1'} transition-all duration-100 bg-gray-50 border border-gray-300 text-gray-600 active:bg-gray-100 active:scale-[0.98]`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className={inline ? "text-sm font-medium" : "text-base font-medium"}>Clear selection</span>
                        <X size={inline ? 16 : 18} className="text-gray-400" />
                      </div>
                    </button>
                  )}
                  {filteredOptions.map((option) => {
                    const isSelected = multiSelect
                      ? selectedValues.includes(option)
                      : value === option
                    return (
                      <button
                        key={option}
                        onClick={() => handleSelect(option)}
                        className={`w-full text-left ${inline ? 'px-3 py-2 rounded-lg mb-0.5' : 'px-4 py-3 rounded-xl mb-1'} transition-all duration-100 ${
                          isSelected
                            ? 'bg-primary-50 border-2 border-primary-500 text-primary-700 shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-900 active:bg-gray-50 active:scale-[0.98]'
                        }`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className={inline ? "text-sm font-medium" : "text-base font-medium"}>{option}</span>
                          {isSelected && (
                            <div className={`${inline ? "w-4 h-4" : "w-5 h-5"} bg-primary-600 rounded-full flex items-center justify-center`}>
                              <span className="text-white text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No options found
                </div>
              )}
            </div>

            {/* Add Custom Button - Only show when allowCustom is true and not inline */}
            {allowCustom && !showCustomInput && !inline && (
              <div className="p-4 border-t border-gray-200 flex-shrink-0 bg-white">
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="w-full h-12 bg-gray-100 border border-gray-200 rounded-xl font-semibold text-gray-700 active:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Plus size={18} />
                  Add New
                </button>
              </div>
            )}

            {/* Done Button for Multi-Select */}
            {multiSelect && (
              <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <button
                  onClick={onClose}
                  disabled={selectedValues.length === 0}
                  className="w-full h-12 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-600/30"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  Done {selectedValues.length > 0 && `(${selectedValues.length} selected)`}
                </button>
              </div>
            )}
          </>
        )}
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

