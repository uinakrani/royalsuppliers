'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LedgerEntry } from '@/lib/ledgerService'
import { X, ChevronLeft, ChevronRight, Check, Edit2, Calendar, DollarSign, ShoppingCart, User, FileText, Trash2 } from 'lucide-react'
import { orderService } from '@/lib/orderService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import NumberPad from '@/components/NumberPad'
import TextInputPad from '@/components/TextInputPad'
import SelectList from '@/components/SelectList'
import DatePicker from '@/components/DatePicker'

// Helper function to format date as YYYY-MM-DD in local time (not UTC)
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper function to parse ISO date string or YYYY-MM-DD to YYYY-MM-DD in local time
const parseToLocalDateString = (dateString: string): string => {
  if (!dateString) return formatLocalDate(new Date())
  
  // If it's already YYYY-MM-DD, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString
  }
  
  // If it's an ISO string, parse it in local time
  try {
    const date = new Date(dateString)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString)
      return formatLocalDate(new Date())
    }
    return formatLocalDate(date)
  } catch (error) {
    console.warn('Error parsing date:', dateString, error)
    return formatLocalDate(new Date())
  }
}

interface LedgerEntryWizardProps {
  entry?: LedgerEntry | null
  type: 'credit' | 'debit'
  onClose: () => void
  onSave: (data: { amount: number; date: string; note?: string; supplier?: string; partyName?: string }) => Promise<void>
  onDelete?: (entryId: string) => void
}

type Step = 
  | 'amount'
  | 'date'
  | 'supplier'
  | 'partyName'
  | 'note'
  | 'review'

const getStepOrder = (type: 'credit' | 'debit'): Step[] => {
  const baseSteps: Step[] = ['amount', 'date']
  if (type === 'debit') {
    return [...baseSteps, 'supplier', 'note', 'review']
  } else {
    return [...baseSteps, 'partyName', 'note', 'review']
  }
}

export default function LedgerEntryWizard({ entry, type, onClose, onSave, onDelete }: LedgerEntryWizardProps) {
  const stepOrder = getStepOrder(type)
  // If editing (entry has id), start at review step, otherwise start at step 0
  const isEditMode = !!(entry?.id)
  const initialStep = isEditMode ? stepOrder.length - 1 : 0 // Review step is last step
  const [currentStep, setCurrentStep] = useState<number>(initialStep)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    amount: entry?.amount || 0,
    date: entry?.date ? parseToLocalDateString(entry.date) : formatLocalDate(new Date()),
    note: entry?.note || '',
    supplier: entry?.supplier || '',
    partyName: entry?.partyName || '',
  })

  // Update formData when entry prop changes
  useEffect(() => {
    if (entry) {
      setFormData({
        amount: entry.amount || 0,
        date: entry.date ? parseToLocalDateString(entry.date) : formatLocalDate(new Date()),
        note: entry.note || '',
        supplier: entry.supplier || '',
        partyName: entry.partyName || '',
      })
    }
  }, [entry?.id, entry?.date, entry?.amount, entry?.note, entry?.supplier, entry?.partyName])

  const [showNumberPad, setShowNumberPad] = useState(false)
  const [showTextPad, setShowTextPad] = useState(false)
  const [showSelectList, setShowSelectList] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [currentInput, setCurrentInput] = useState<string>('')
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [partyNames, setPartyNames] = useState<string[]>([])
  const lastEnteredValue = useRef<number | string | null>(null)
  const isClosingRef = useRef(false)

  const loadOptions = async () => {
    try {
      const [supplierList, names] = await Promise.all([
        orderService.getUniqueSuppliers(),
        orderService.getUniquePartyNames()
      ])
      setSuppliers(supplierList)
      setPartyNames(names)
    } catch (error) {
      console.error('Error loading options:', error)
    }
  }

  const handleClose = useCallback(() => {
    // Don't allow closing while saving
    if (saving) return
    
    // Mark that we're closing to prevent reopening
    isClosingRef.current = true
    
    // Close any open overlays first
    setShowNumberPad(false)
    setShowTextPad(false)
    setShowSelectList(false)
    setShowDatePicker(false)
    
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
      // Reset after delay to allow component to unmount
      setTimeout(() => {
        isClosingRef.current = false
      }, 100)
    }, 300)
  }, [saving, onClose])

  useEffect(() => {
    // Don't mount if we're in the process of closing
    if (isClosingRef.current) return
    
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      if (!isClosingRef.current) {
        setIsMounted(true)
      }
    })
    loadOptions()
    
    // If in edit mode, we start at review step, so don't auto-open any input
    if (isEditMode) {
      return () => {
        document.body.style.overflow = ''
      }
    }
    
    // Auto-open first step input immediately (only for new entries)
    // Skip optional steps (supplier, partyName) - they have buttons instead
    const firstStep = stepOrder[0]
    if (firstStep === 'date') {
      setCurrentInput('date')
      setShowDatePicker(true)
    } else if (firstStep === 'amount') {
      setCurrentInput('amount')
      setShowNumberPad(true)
    }
    // supplier and partyName don't auto-open - user clicks button to select
    
    return () => {
      document.body.style.overflow = ''
      // Reset closing flag on unmount
      isClosingRef.current = false
    }
  }, [isEditMode, stepOrder])

  // Add Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [saving, handleClose])

  // Auto-show input when step changes
  useEffect(() => {
    const step = stepOrder[currentStep]
    
    // Skip auto-open for review step
    if (step === 'review') {
      setShowNumberPad(false)
      setShowTextPad(false)
      setShowSelectList(false)
      setShowDatePicker(false)
      return
    }
    
    // Immediately open the appropriate input for the current step
    if (step === 'date') {
      setCurrentInput('date')
      setShowDatePicker(true)
      setShowNumberPad(false)
      setShowTextPad(false)
      setShowSelectList(false)
    } else if (step === 'amount') {
      setCurrentInput('amount')
      setShowNumberPad(true)
      setShowDatePicker(false)
      setShowTextPad(false)
      setShowSelectList(false)
    } else if (step === 'supplier' || step === 'partyName') {
      // Don't auto-open SelectList for optional steps - let user click button
      setShowSelectList(false)
      setShowNumberPad(false)
      setShowTextPad(false)
      setShowDatePicker(false)
    } else if (step === 'note') {
      setCurrentInput('note')
      setShowTextPad(true)
      setShowNumberPad(false)
      setShowSelectList(false)
      setShowDatePicker(false)
    }
  }, [currentStep, stepOrder])

  const handleNext = () => {
    if (currentStep < stepOrder.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Helper to navigate after editing a field - in edit mode, go to review, otherwise continue
  const handleAfterEdit = () => {
    if (isEditMode) {
      // Go to review step (last step)
      setCurrentStep(stepOrder.length - 1)
    } else {
      handleNext()
    }
  }

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex !== currentStep) {
      setCurrentStep(stepIndex)
    }
  }

  const getStepLabel = (step: Step): string => {
    const labels: Record<Step, string> = {
      amount: 'Amount',
      date: 'Date',
      supplier: 'Supplier',
      partyName: 'Party Name',
      note: 'Note',
      review: 'Review',
    }
    return labels[step]
  }

  const getStepIcon = (step: Step) => {
    const icons: Record<Step, any> = {
      amount: DollarSign,
      date: Calendar,
      supplier: ShoppingCart,
      partyName: User,
      note: FileText,
      review: Check
    }
    return icons[step]
  }

  const isStepComplete = (step: Step): boolean => {
    switch (step) {
      case 'amount':
        return formData.amount > 0
      case 'date':
        return !!formData.date
      case 'supplier':
        return true // Optional
      case 'partyName':
        return true // Optional
      case 'note':
        return true // Optional
      case 'review':
        return true
      default:
        return false
    }
  }

  const canProceed = (): boolean => {
    const step = stepOrder[currentStep]
    return isStepComplete(step)
  }

  const renderStep = () => {
    const step = stepOrder[currentStep]

    switch (step) {
      case 'amount':
        return (
          <div className="text-center py-2">
            <DollarSign size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Amount</h2>
            <p className="text-sm text-gray-600 mb-4">
              {type === 'credit' ? 'How much did you receive?' : 'How much did you spend?'}
            </p>
            {formData.amount > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formatIndianCurrency(formData.amount)}</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'amount' && (
              <NumberPad
                value={formData.amount}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, amount: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  const enteredValue = lastEnteredValue.current as number
                  if (enteredValue > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label={`Enter ${type === 'credit' ? 'Income' : 'Expense'} Amount`}
              />
            )}
          </div>
        )

      case 'date':
        return (
          <div className="text-center py-2">
            <Calendar size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Select Date</h2>
            <p className="text-sm text-gray-600 mb-4">When did this transaction occur?</p>
            {showDatePicker && (
              <DatePicker
                value={formData.date}
                onChange={(val) => {
                  setFormData({ ...formData, date: val })
                  setShowDatePicker(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => setShowDatePicker(false)}
                label="Select Date"
              />
            )}
          </div>
        )

      case 'supplier':
        return (
          <div className="text-center py-2">
            <ShoppingCart size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Supplier (Optional)</h2>
            <p className="text-sm text-gray-600 mb-4">Which supplier did you pay for raw materials?</p>
            {formData.supplier && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-sm font-semibold text-primary-700">{formData.supplier}</span>
                </div>
              </div>
            )}
            {!showSelectList && (
              <button
                onClick={() => {
                  setCurrentInput('supplier')
                  setShowSelectList(true)
                }}
                className="px-6 py-3 bg-primary-50 border-2 border-primary-200 rounded-xl text-primary-700 font-semibold active:bg-primary-100 active:scale-95 transition-all duration-150"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {formData.supplier ? 'Change Supplier' : 'Select Supplier (Optional)'}
              </button>
            )}
            {showSelectList && currentInput === 'supplier' && (
              <SelectList
                options={suppliers}
                value={formData.supplier}
                onChange={(val) => {
                  setFormData({ ...formData, supplier: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => {
                  setShowSelectList(false)
                  // Don't auto-advance when closing without selection - let user click Continue
                }}
                label="Select Supplier"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setSuppliers([...suppliers, val])
                }}
              />
            )}
          </div>
        )

      case 'partyName':
        return (
          <div className="text-center py-2">
            <User size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Party Name (Optional)</h2>
            <p className="text-sm text-gray-600 mb-4">Which party did you receive payment from?</p>
            {formData.partyName && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-sm font-semibold text-primary-700">{formData.partyName}</span>
                </div>
              </div>
            )}
            {!showSelectList && (
              <button
                onClick={() => {
                  setCurrentInput('partyName')
                  setShowSelectList(true)
                }}
                className="px-6 py-3 bg-primary-50 border-2 border-primary-200 rounded-xl text-primary-700 font-semibold active:bg-primary-100 active:scale-95 transition-all duration-150"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {formData.partyName ? 'Change Party Name' : 'Select Party Name (Optional)'}
              </button>
            )}
            {showSelectList && currentInput === 'partyName' && (
              <SelectList
                options={partyNames}
                value={formData.partyName}
                onChange={(val) => {
                  setFormData({ ...formData, partyName: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => {
                  setShowSelectList(false)
                  // Don't auto-advance when closing without selection - let user click Continue
                }}
                label="Select Party Name"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setPartyNames([...partyNames, val])
                }}
              />
            )}
          </div>
        )

      case 'note':
        return (
          <div className="text-center py-2">
            <FileText size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Note (Optional)</h2>
            <p className="text-sm text-gray-600 mb-4">Add any additional details about this transaction</p>
            {formData.note && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-sm font-semibold text-primary-700">{formData.note}</span>
                </div>
              </div>
            )}
            {showTextPad && currentInput === 'note' && (
              <TextInputPad
                value={formData.note}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, note: val })
                }}
                onClose={() => {
                  setShowTextPad(false)
                  setTimeout(() => handleAfterEdit(), 100)
                  lastEnteredValue.current = null
                }}
                label="Enter Note"
              />
            )}
          </div>
        )

      case 'review':
        return renderReviewStep()

      default:
        return null
    }
  }

  const renderReviewStep = () => {
    return (
      <div className="py-6">
        <div className="text-center mb-6">
          <Check size={64} className="mx-auto mb-4 text-primary-600" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isEditMode ? 'Edit Entry' : 'Review Entry'}
          </h2>
          <p className="text-gray-600">
            {isEditMode ? 'Click on any field to edit, then save your changes' : 'Review all details before saving'}
          </p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {stepOrder.slice(0, -1).map((step, idx) => {
            const Icon = getStepIcon(step)
            const value = getStepValue(step)
            // Skip empty optional fields in review
            if ((step === 'supplier' || step === 'partyName' || step === 'note') && !value) {
              return null
            }
            return (
              <button
                key={step}
                onClick={() => handleStepClick(idx)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-50 rounded-lg">
                      <Icon size={20} className="text-primary-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">{getStepLabel(step)}</div>
                      <div className="text-sm font-semibold text-gray-900">{value}</div>
                    </div>
                  </div>
                  <Edit2 size={18} className="text-gray-400" />
                </div>
              </button>
            )
          })}
        </div>

        {/* Summary */}
        <div className="mt-6 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200">
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-gray-700">
              {type === 'credit' ? 'Income' : 'Expense'}:
            </span>
            <span className={`text-xl font-bold ${type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
              {formatIndianCurrency(formData.amount)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const getStepValue = (step: Step): string => {
    switch (step) {
      case 'amount':
        return formData.amount > 0 ? formatIndianCurrency(formData.amount) : 'Not set'
      case 'date':
        return formData.date ? format(new Date(formData.date + 'T12:00:00'), 'dd MMM yyyy') : 'Not set'
      case 'supplier':
        return formData.supplier || ''
      case 'partyName':
        return formData.partyName || ''
      case 'note':
        return formData.note || ''
      default:
        return ''
    }
  }

  const handleSubmit = async () => {
    if (formData.amount <= 0) {
      alert('Please enter a valid amount')
      return
    }

    setSaving(true)
    try {
      await onSave({
        amount: formData.amount,
        date: formData.date,
        note: formData.note.trim() || undefined,
        supplier: type === 'debit' ? (formData.supplier.trim() || undefined) : undefined,
        partyName: type === 'credit' ? (formData.partyName.trim() || undefined) : undefined,
      })
      handleClose()
    } catch (error: any) {
      console.error('Error saving entry:', error)
      alert(error?.message || 'Error saving entry. Please try again.')
      setSaving(false)
    }
  }

  const wizardContent = (
    <div
      className={`fixed inset-0 bg-white z-[99999] flex flex-col ${
        isClosing ? 'native-modal-exit' : isMounted ? 'native-modal-enter' : 'opacity-0'
      }`}
      style={{
        WebkitTapHighlightColor: 'transparent',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Header - Always on top with highest z-index to stay above overlays */}
      <div 
        className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white"
        style={{ 
          position: 'relative',
          zIndex: 100001 
        }}
      >
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <button
              onClick={handlePrevious}
              className="p-2 active:bg-gray-100 active:scale-[0.95] rounded-lg transition-transform duration-100"
              style={{ WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 100002 }}
            >
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
          )}
          <div>
            {!(isEditMode && stepOrder[currentStep] === 'review') && (
              <div className="text-xs text-gray-500">Step {currentStep + 1} of {stepOrder.length}</div>
            )}
            <h2 className="text-lg font-bold text-gray-900">
              {getStepLabel(stepOrder[currentStep])}
            </h2>
          </div>
        </div>
        <button
          onClick={handleClose}
          disabled={saving}
          className="p-2 active:bg-gray-100 active:scale-95 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 100002 }}
          aria-label="Close"
        >
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Progress Bar */}
      <div 
        className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-200"
        style={{ position: 'relative', zIndex: 100001 }}
      >
        <div className="flex gap-1">
          {stepOrder.map((step, idx) => {
            const isComplete = isStepComplete(step)
            const isCurrent = idx === currentStep
            return (
              <button
                key={step}
                onClick={() => handleStepClick(idx)}
                className={`flex-1 h-1.5 rounded-full transition-all duration-200 ease-out ${
                  isComplete
                    ? 'bg-green-500'
                    : isCurrent
                    ? 'bg-primary-600'
                    : 'bg-gray-300'
                }`}
                style={{ 
                  WebkitTapHighlightColor: 'transparent',
                  transform: isCurrent ? 'scaleY(1.2)' : 'scaleY(1)',
                }}
                title={getStepLabel(step)}
              />
            )
          })}
        </div>
      </div>

      {/* Previous Answers Summary */}
      {currentStep > 0 && stepOrder[currentStep] !== 'review' && (
        <div className="flex-shrink-0 px-6 pt-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500 mb-2">Previous Answers:</div>
          <div className="flex flex-wrap gap-2">
            {stepOrder.slice(0, currentStep).map((step, idx) => {
              const value = getStepValue(step)
              if (!value || value === 'Not set') return null
              // Skip empty optional fields
              if ((step === 'supplier' || step === 'partyName' || step === 'note') && !value) return null
              return (
                <button
                  key={step}
                  onClick={() => handleStepClick(idx)}
                  className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 active:bg-gray-100 active:scale-[0.95] transition-transform duration-100 flex items-center gap-1 shadow-sm"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="font-medium">{getStepLabel(step)}:</span>
                  <span className="truncate max-w-[100px]">{value}</span>
                  <Edit2 size={12} className="text-gray-400" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-2xl mx-auto w-full">
          {renderStep()}
        </div>
      </div>

      {/* Navigation */}
      {stepOrder[currentStep] !== 'review' && !showNumberPad && !showTextPad && !showSelectList && !showDatePicker && (
        <div className="flex-shrink-0 p-4 border-t border-gray-200">
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full h-12 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-primary-600/30"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Continue
            <ChevronRight size={20} className="transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      )}

      {stepOrder[currentStep] === 'review' && !showNumberPad && !showTextPad && !showSelectList && !showDatePicker && (
        <div className="flex-shrink-0 p-4 border-t border-gray-200 space-y-3">
          <button
            onClick={handleSubmit}
            disabled={saving || !canProceed()}
            className="w-full h-12 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-green-600/30"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {saving ? (isEditMode ? 'Saving changes...' : 'Saving...') : (isEditMode ? 'Save Changes' : 'Confirm & Save')}
            {!saving && <ChevronRight size={20} className="transition-transform duration-200 group-hover:translate-x-1" />}
          </button>
          {isEditMode && onDelete && entry?.id && (
            <button
              onClick={() => {
                if (entry?.id) {
                  onDelete(entry.id)
                }
              }}
              disabled={saving}
              className="w-full h-12 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl font-semibold active:bg-red-100 active:border-red-300 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Trash2 size={18} />
              Delete Entry
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(wizardContent, document.body)
}

