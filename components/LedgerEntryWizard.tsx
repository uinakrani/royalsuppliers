'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Partner } from '@/types/partner'

import { LedgerEntry } from '@/lib/ledgerService'
import { X, ChevronLeft, ChevronRight, Check, Edit2, Calendar, DollarSign, ShoppingCart, User, FileText, Trash2 } from 'lucide-react'
import { orderService } from '@/lib/orderService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import NumberPad from '@/components/NumberPad'
import SelectList from '@/components/SelectList'
import DatePicker from '@/components/DatePicker'
import BottomSheet from '@/components/BottomSheet'

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
  partners: Partner[]
  onClose: () => void
  onSave: (data: { amount: number; date: string; note?: string; supplier?: string; partyName?: string; partnerId?: string }) => Promise<void>
  onDelete?: (entryId: string) => void
  onDeleteConfirm?: (entryId: string) => Promise<void>
}

type Step =
  | 'amount'
  | 'date'
  | 'expenseType'
  | 'supplier'
  | 'partyName'
  | 'partnerId'
  | 'note'
  | 'review'

type ExpenseType = 'general' | 'supplier' | 'withdrawal'

export default function LedgerEntryWizard({ entry, type, partners, onClose, onSave, onDelete, onDeleteConfirm }: LedgerEntryWizardProps) {

  // Initialize expense type based on entry data
  const getInitialExpenseType = (): ExpenseType => {
    if (entry?.partnerId) return 'withdrawal'
    if (entry?.supplier) return 'supplier'
    return 'general'
  }

  const [expenseType, setExpenseType] = useState<ExpenseType>(getInitialExpenseType())

  const getStepOrder = (type: 'credit' | 'debit', expenseType: ExpenseType): Step[] => {
    const baseSteps: Step[] = ['amount', 'date']
    if (type === 'debit') {
      const steps = [...baseSteps, 'expenseType'] as Step[]
      if (expenseType === 'supplier') return [...steps, 'supplier', 'note']
      if (expenseType === 'withdrawal') return [...steps, 'partnerId', 'note']
      return [...steps, 'note'] // general
    } else {
      return [...baseSteps, 'partyName', 'note']
    }
  }

  const stepOrder = getStepOrder(type, expenseType)

  // If editing (entry has id), start at first step, otherwise start at step 0
  const isEditMode = !!(entry?.id)
  const initialStep = 0
  const [currentStep, setCurrentStep] = useState<number>(initialStep)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [formData, setFormData] = useState({
    amount: entry?.amount || 0,
    date: entry?.date ? parseToLocalDateString(entry.date) : formatLocalDate(new Date()),
    note: entry?.note || '',
    supplier: entry?.supplier || '',
    partyName: entry?.partyName || '',
    partnerId: entry?.partnerId || '',
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
        partnerId: entry.partnerId || '',
      })
      setExpenseType(getInitialExpenseType())
    }
  }, [entry?.id, entry?.date, entry?.amount, entry?.note, entry?.supplier, entry?.partyName, entry?.partnerId])

  const [suppliers, setSuppliers] = useState<string[]>([])
  const [partyNames, setPartyNames] = useState<string[]>([])
  const lastEnteredValue = useRef<number | string | null>(null)

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

    onClose()
  }, [saving, onClose])

  useEffect(() => {
    loadOptions()
  }, [])

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

  // Helper to navigate after editing a field - auto-advance for required fields
  const handleAfterEdit = () => {
    // Auto-advance for required fields (amount, date) if they're complete
    const step = stepOrder[currentStep]
    if (step === 'amount' && formData.amount > 0) {
      // Small delay to show the value before advancing
      setTimeout(() => {
        if (currentStep < stepOrder.length - 1) {
          setCurrentStep(currentStep + 1)
        }
      }, 300)
    } else if (step === 'date' && formData.date) {
      // Small delay to show the value before advancing
      setTimeout(() => {
        if (currentStep < stepOrder.length - 1) {
          setCurrentStep(currentStep + 1)
        }
      }, 300)
    } else if (step === 'expenseType') {
      // Always auto advance after selecting type
      setTimeout(() => {
        if (currentStep < stepOrder.length - 1) {
          setCurrentStep(currentStep + 1)
        }
      }, 100)
    }
  }

  const canSave = (): boolean => {
    if (formData.amount <= 0 || !formData.date) return false

    // For validation based on expense type
    if (type === 'debit') {
      if (expenseType === 'withdrawal' && !formData.partnerId) return false
      // Supplier is optional even if 'supplier' type is selected (can be general expense with supplier tag)
    }

    return true
  }

  // Allow editing dates for all expense entries (including carting and supplier payments)
  const canEditDate = !isEditMode || type === 'debit'

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex !== currentStep) {
      setCurrentStep(stepIndex)
    }
  }

  const getStepLabel = (step: Step): string => {
    const labels: Record<Step, string> = {
      amount: 'Amount',
      date: 'Date',
      expenseType: 'Expense Type',
      supplier: 'Supplier',
      partyName: 'Party Name (Optional)',
      partnerId: 'Select Partner',
      note: 'Note',
      review: 'Review',
    }
    return labels[step]
  }

  const getStepIcon = (step: Step) => {
    const icons: Record<Step, any> = {
      amount: DollarSign,
      date: Calendar,
      expenseType: FileText,
      supplier: ShoppingCart,
      partyName: User,
      partnerId: User,
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
      case 'expenseType':
        return !!expenseType
      case 'supplier':
        return true // Supplier is optional for expense entries
      case 'partyName':
        return true // Party is optional for income entries
      case 'partnerId':
        return !!formData.partnerId
      case 'note':
        return true // Optional
      case 'review':
        return true
      default:
        return false
    }
  }

  const canProceed = (): boolean => {
    const safeStepIndex = Math.max(0, Math.min(currentStep, stepOrder.length - 1))
    const step = stepOrder[safeStepIndex]
    if (!step) return false
    return isStepComplete(step)
  }

  const renderStep = () => {
    const safeStepIndex = Math.max(0, Math.min(currentStep, stepOrder.length - 1))
    const step = stepOrder[safeStepIndex]
    if (!step) return null

    switch (step) {
      case 'amount':
        return (
          <NumberPad
            value={formData.amount}
            onChange={(val) => {
              lastEnteredValue.current = val
              setFormData({ ...formData, amount: val })
            }}
            onClose={() => {
              // Don't auto-advance on first step - user will use Continue button
              lastEnteredValue.current = null
            }}
            label={`Enter ${type === 'credit' ? 'Income' : 'Expense'} Amount`}
            inline={true}
            hideDoneButton={true}
            showCurrency={true}
          />
        )

      case 'date':
        return (
          <div className="w-full">
            {isEditMode && !canEditDate ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                <p className="text-sm text-gray-500 mb-1">Date cannot be changed for existing entries</p>
                <p className="text-lg font-semibold text-gray-900">
                  {format(new Date(formData.date), 'dd MMM yyyy')}
                </p>
              </div>
            ) : (
              <DatePicker
                value={formData.date}
                onChange={(val) => {
                  setFormData({ ...formData, date: val })
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => { }}
                label="Select Date"
                inline={true}
              />
            )}
          </div>
        )

      case 'expenseType':
        return (
          <div className="space-y-3">
            <button
              onClick={() => {
                setExpenseType('general')
                handleAfterEdit()
              }}
              className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-3 transition-all ${expenseType === 'general' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-100 bg-white hover:bg-gray-50'
                }`}
            >
              <div className={`p-2 rounded-lg ${expenseType === 'general' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                <FileText size={20} />
              </div>
              <div>
                <div className="font-semibold">General Expense</div>
                <div className="text-xs opacity-70">Daily costs, travel, food, etc.</div>
              </div>
              {expenseType === 'general' && <Check size={20} className="ml-auto" />}
            </button>

            <button
              onClick={() => {
                setExpenseType('supplier')
                handleAfterEdit()
              }}
              className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-3 transition-all ${expenseType === 'supplier' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-100 bg-white hover:bg-gray-50'
                }`}
            >
              <div className={`p-2 rounded-lg ${expenseType === 'supplier' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                <ShoppingCart size={20} />
              </div>
              <div>
                <div className="font-semibold">Supplier Payment</div>
                <div className="text-xs opacity-70">Raw materials, specialized services</div>
              </div>
              {expenseType === 'supplier' && <Check size={20} className="ml-auto" />}
            </button>

            <button
              onClick={() => {
                setExpenseType('withdrawal')
                handleAfterEdit()
              }}
              className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-3 transition-all ${expenseType === 'withdrawal' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-100 bg-white hover:bg-gray-50'
                }`}
            >
              <div className={`p-2 rounded-lg ${expenseType === 'withdrawal' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                <User size={20} />
              </div>
              <div>
                <div className="font-semibold">Partner Withdrawal</div>
                <div className="text-xs opacity-70">Personal use, profit withdrawal</div>
              </div>
              {expenseType === 'withdrawal' && <Check size={20} className="ml-auto" />}
            </button>
          </div>
        )

      case 'supplier':
        return (
          <div className="w-full">
            <SelectList
              options={suppliers}
              value={formData.supplier}
              onChange={(val) => {
                setFormData({ ...formData, supplier: val })
                setTimeout(() => handleAfterEdit(), 100)
              }}
              onClose={() => { }}
              label="Select Supplier (Optional)"
              allowCustom={true}
              onCustomAdd={(val) => {
                setSuppliers([...suppliers, val])
              }}
              inline={true}
              autoFocusSearch={false}
            />
            {formData.supplier && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => {
                    setFormData({ ...formData, supplier: '' })
                    setTimeout(() => handleAfterEdit(), 100)
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  Clear Selection
                </button>
              </div>
            )}
            <div className="mt-2 text-xs text-gray-500 text-center">
              You can skip this step to create a general expense entry
            </div>
          </div>
        )

      case 'partnerId':
        return (
          <div className="w-full">
            <div className="space-y-2">
              {partners.length > 0 ? (
                partners.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setFormData({ ...formData, partnerId: p.id! })
                      handleAfterEdit()
                    }}
                    className={`w-full p-3 rounded-lg border flex items-center justify-between transition-all ${formData.partnerId === p.id
                      ? 'border-primary-500 bg-primary-50 text-primary-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    {formData.partnerId === p.id && <Check size={18} className="text-primary-600" />}
                  </button>
                ))
              ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg text-gray-500">
                  No partners found in this workspace.
                </div>
              )}
            </div>
          </div>
        )

      case 'partyName':
        return (
          <div className="w-full">
            <SelectList
              options={partyNames}
              value={formData.partyName}
              onChange={(val) => {
                setFormData({ ...formData, partyName: val })
                setTimeout(() => handleAfterEdit(), 100)
              }}
              onClose={() => { }}
              label="Select Party Name (Optional)"
              allowCustom={true}
              onCustomAdd={(val) => {
                setPartyNames([...partyNames, val])
              }}
              inline={true}
              autoFocusSearch={false}
            />
            <div className="mt-2 text-xs text-gray-500 text-center">
              Leave blank if this income is not from a party (e.g., refund)
            </div>
          </div>
        )

      case 'note':
        return (
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note (Optional)
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => {
                setFormData({ ...formData, note: e.target.value })
              }}
              placeholder="Add a note (optional)"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              rows={4}
              style={{
                WebkitTapHighlightColor: 'transparent',
                fontFamily: 'inherit'
              }}
            />
          </div>
        )

      default:
        return null
    }
  }

  const getStepValue = (step: Step): string => {
    switch (step) {
      case 'amount':
        return formData.amount > 0 ? formatIndianCurrency(formData.amount) : 'Not set'
      case 'date':
        if (!formData.date) return 'Not set'
        try {
          const dateStr = formData.date.includes('T') ? formData.date : formData.date + 'T12:00:00'
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) return 'Not set'
          return format(date, 'dd MMM yyyy')
        } catch (error) {
          console.error('Error formatting date:', error)
          return 'Not set'
        }
      case 'expenseType':
        if (type === 'credit') return 'Income'
        if (expenseType === 'supplier') return 'Supplier Payment'
        if (expenseType === 'withdrawal') return 'Withdrawal'
        return 'General Expense'
      case 'supplier':
        return formData.supplier || ''
      case 'partyName':
        return formData.partyName || ''
      case 'partnerId':
        return partners.find(p => p.id === formData.partnerId)?.name || 'Select Partner'
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

    if (type === 'debit' && expenseType === 'withdrawal' && !formData.partnerId) {
      alert('Please select a partner')
      return
    }

    setSaving(true)
    try {
      await onSave({
        amount: formData.amount,
        date: formData.date,
        note: (formData.note || '').trim() || undefined,
        supplier: type === 'debit' && expenseType === 'supplier' ? ((formData.supplier || '').trim() || undefined) : undefined,
        partyName: type === 'credit' ? ((formData.partyName || '').trim() || undefined) : undefined,
        partnerId: type === 'debit' && expenseType === 'withdrawal' ? formData.partnerId : undefined
      })
      handleClose()
    } catch (error: any) {
      console.error('Error saving entry:', error)
      alert(error?.message || 'Error saving entry. Please try again.')
      setSaving(false)
    }
  }

  // ... rest of the file (safeCurrentStep logic, return statement, etc)

  // Ensure currentStep is within bounds
  const safeCurrentStep = Math.max(0, Math.min(currentStep, stepOrder.length - 1))
  const currentStepData = stepOrder[safeCurrentStep]
  const currentStepLabel = currentStepData ? getStepLabel(currentStepData) : ''
  const currentStepIcon = currentStepData ? getStepIcon(currentStepData) : null
  const allSteps = stepOrder.filter(step => step !== 'review')
  const filledSteps = allSteps.filter((step) => {
    const value = getStepValue(step)
    return value && value !== 'Not set' && value !== '₹0' && value !== ''
  })

  // Ensure currentStep is within bounds - if not, reset it
  useEffect(() => {
    if (currentStep < 0 || currentStep >= stepOrder.length) {
      setCurrentStep(0)
    }
  }, [currentStep, stepOrder.length])

  return (
    <div
      className="bg-gray-50 min-h-screen flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header - Sticky */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleClose}
              className="p-1.5 active:bg-gray-100 active:scale-95 rounded-lg transition-all duration-150"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <X size={18} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {isEditMode ? `Edit ${getStepValue('expenseType')}` : `New ${type === 'credit' ? 'Income' : 'Expense'}`}
              </h1>
              <div className="text-xs text-gray-500">
                {filledSteps.length} / {allSteps.length} completed
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Delete Button - Show in header when editing on all steps */}
            {isEditMode && entry?.id && (
              <button
                onClick={() => {
                  if (entry?.id) {
                    setShowDeleteConfirm(true)
                  }
                }}
                disabled={saving}
                className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg active:bg-red-100 active:border-red-300 transition-all disabled:opacity-50 flex items-center gap-1.5"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
            {/* Quick Save Button - Show when required fields are filled */}
            {canSave() && currentStepData === 'note' && (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg active:bg-green-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Check size={14} />
                Save
              </button>
            )}
          </div>
        </div>

        {/* Compact Filled Details Summary - Always visible */}
        {filledSteps.length > 0 && (
          <div className="px-3 pb-2 border-b border-gray-100 bg-gradient-to-br from-gray-50 to-gray-100/50">
            <div className="flex flex-wrap gap-1">
              {allSteps.map((step, idx) => {
                const value = getStepValue(step)
                if (value === 'Not set' || value === '₹0' || value === '') return null
                const isCurrent = idx === safeCurrentStep
                const Icon = getStepIcon(step)
                if (!Icon) return null
                return (
                  <button
                    key={step}
                    onClick={() => handleStepClick(idx)}
                    className={`px-1.5 py-0.5 bg-white border rounded text-xs text-left active:bg-gray-50 active:scale-95 transition-all duration-150 flex items-center gap-1 ${isCurrent
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-200'
                      }`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Icon size={9} className={`flex-shrink-0 ${isCurrent ? 'text-primary-600' : 'text-gray-400'}`} />
                    <span className={`truncate max-w-[60px] ${isCurrent ? 'text-primary-700' : 'text-gray-600'}`}>
                      {value}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="flex gap-0.5">
            {stepOrder.map((step, idx) => {
              const isComplete = isStepComplete(step)
              const isCurrent = idx === safeCurrentStep
              return (
                <div
                  key={step}
                  className={`flex-1 h-0.5 rounded-full transition-all duration-200 ${isComplete
                    ? 'bg-green-500'
                    : isCurrent
                      ? 'bg-primary-600'
                      : 'bg-gray-300'
                    }`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Current Step Content - Scrollable area */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: '5rem' }}>
        <div className="max-w-2xl mx-auto w-full px-3 py-3">
          {/* Empty space for scrolling */}
        </div>
      </div>

      {/* Sticky Input Container at Bottom */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-lg z-20">
        <div className="max-w-2xl mx-auto w-full px-3 py-3">
          {/* Input Element */}
          <div className="mb-3">
            {renderStep()}
          </div>

          {/* Navigation Buttons - Always Visible */}
          {currentStepData === 'note' ? (
            // Save button on note step
            <div className="space-y-2">
              <button
                onClick={handleSubmit}
                disabled={saving || !canSave()}
                className="w-full h-11 bg-green-600 text-white rounded-lg font-semibold active:bg-green-700 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] shadow-md text-sm"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Save Entry')}
                {!saving && <Check size={16} />}
              </button>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrevious}
                    className="flex-1 h-10 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-all duration-100 flex items-center justify-center gap-1.5 active:scale-[0.98] text-sm"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <ChevronLeft size={14} />
                    Back
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Continue button for other steps
            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex-1 h-10 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-all duration-100 flex items-center justify-center gap-1.5 active:scale-[0.98] text-sm"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 h-10 bg-primary-600 text-white rounded-lg font-medium active:bg-primary-700 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 active:scale-[0.98] text-sm shadow-md"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Continue
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Bottom Sheet */}
      {isEditMode && entry?.id && (
        <BottomSheet
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            if (entry?.id) {
              if (onDeleteConfirm) {
                await onDeleteConfirm(entry.id)
              } else if (onDelete) {
                onDelete(entry.id)
              }
              setShowDeleteConfirm(false)
            }
          }}
          title="Delete Entry?"
          message="This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          confirmColor="red"
        />
      )}
    </div>
  )
}

