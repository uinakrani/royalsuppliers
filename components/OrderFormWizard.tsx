'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order, PaymentRecord } from '@/types/order'
import { X, ChevronLeft, ChevronRight, Check, Edit2, Calendar, User, MapPin, Package, Weight, DollarSign, Truck, ShoppingCart, Plus, Trash2 } from 'lucide-react'
import { orderService, isOrderPaid } from '@/lib/orderService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import NumberPad from '@/components/NumberPad'
import TextInputPad from '@/components/TextInputPad'
import SelectList from '@/components/SelectList'
import DatePicker from '@/components/DatePicker'
import { MATERIAL_OPTIONS } from '@/lib/constants'
import { sweetAlert } from '@/lib/sweetalert'
import { showToast } from '@/components/Toast'
import { ledgerService } from '@/lib/ledgerService'
import { getDb } from '@/lib/firebase'
import { updateDoc, doc } from 'firebase/firestore'

interface OrderFormWizardProps {
  order?: Order | null
  onClose: () => void
  onSave: (order: Omit<Order, 'id'>) => Promise<void>
}

type Step = 
  | 'date'
  | 'partyName'
  | 'siteName'
  | 'material'
  | 'weight'
  | 'rate'
  | 'truckOwner'
  | 'truckNo'
  | 'supplier'
  | 'originalWeight'
  | 'originalRate'
  | 'additionalCost'
  | 'payment'
  | 'review'

const STEP_ORDER: Step[] = [
  'date',
  'partyName',
  'siteName',
  'material',
  'weight',
  'rate',
  'truckOwner',
  'truckNo',
  'supplier',
  'originalWeight',
  'originalRate',
  'additionalCost',
  'payment',
  'review'
]

export default function OrderFormWizard({ order, onClose, onSave }: OrderFormWizardProps) {
  // If editing (order has id), start at review step, otherwise start at step 0
  const isEditMode = !!(order?.id)
  const initialStep = isEditMode ? STEP_ORDER.length - 1 : 0 // Review step is last step
  const [currentStep, setCurrentStep] = useState<number>(initialStep)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    date: order?.date || new Date().toISOString().split('T')[0],
    partyName: order?.partyName || '',
    siteName: order?.siteName || '',
    material: Array.isArray(order?.material) ? order.material : (order?.material ? [order.material] : []),
    weight: order?.weight || 0,
    rate: order?.rate || 0,
    truckOwner: order?.truckOwner || '',
    truckNo: order?.truckNo || '',
    supplier: order?.supplier || '',
    originalWeight: order?.originalWeight || 0,
    originalRate: order?.originalRate || 0,
    additionalCost: order?.additionalCost || 0,
    partialPayments: order?.partialPayments || [],
  })

  const [showNumberPad, setShowNumberPad] = useState(false)
  const [showTextPad, setShowTextPad] = useState(false)
  const [showSelectList, setShowSelectList] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [currentInput, setCurrentInput] = useState<string>('')
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [siteNames, setSiteNames] = useState<string[]>([])
  const [truckOwners, setTruckOwners] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const lastEnteredValue = useRef<number | string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      setIsMounted(true)
    })
    loadOptions()
    
    // If in edit mode, we start at review step, so don't auto-open any input
    if (isEditMode) {
      return () => {
        document.body.style.overflow = ''
      }
    }
    
    // Auto-open first step input immediately (only for new orders)
    const firstStep = STEP_ORDER[0]
    if (firstStep === 'date') {
      setCurrentInput('date')
      setShowDatePicker(true)
    } else if (['partyName', 'siteName', 'truckOwner', 'supplier', 'material'].includes(firstStep)) {
      setCurrentInput(firstStep)
      setShowSelectList(true)
    } else if (firstStep === 'truckNo') {
      setCurrentInput('truckNo')
      setShowTextPad(true)
    } else if (['weight', 'rate', 'originalWeight', 'originalRate', 'additionalCost'].includes(firstStep)) {
      setCurrentInput(firstStep)
      setShowNumberPad(true)
    }
    
    return () => {
      document.body.style.overflow = ''
    }
  }, [isEditMode])

  // Auto-show input when step changes
  useEffect(() => {
    const step = STEP_ORDER[currentStep]
    
    // Skip auto-open for review and payment steps
    if (step === 'review' || step === 'payment') {
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
    } else if (step === 'partyName' || step === 'siteName' || step === 'truckOwner' || step === 'supplier') {
      setCurrentInput(step)
      setShowSelectList(true)
      setShowNumberPad(false)
      setShowTextPad(false)
      setShowDatePicker(false)
    } else if (step === 'material') {
      setCurrentInput('material')
      setShowSelectList(true)
      setShowNumberPad(false)
      setShowTextPad(false)
      setShowDatePicker(false)
    } else if (step === 'truckNo') {
      setCurrentInput('truckNo')
      setShowTextPad(true)
      setShowNumberPad(false)
      setShowSelectList(false)
      setShowDatePicker(false)
    } else if (['weight', 'rate', 'originalWeight', 'originalRate', 'additionalCost'].includes(step)) {
      setCurrentInput(step)
      setShowNumberPad(true)
      setShowTextPad(false)
      setShowSelectList(false)
      setShowDatePicker(false)
    }
  }, [currentStep])

  const loadOptions = async () => {
    try {
      const [parties, sites, owners, supplierList] = await Promise.all([
        orderService.getUniquePartyNames(),
        orderService.getUniqueSiteNames(),
        orderService.getUniqueTruckOwners(),
        orderService.getUniqueSuppliers()
      ])
      setPartyNames(parties)
      setSiteNames(sites)
      setTruckOwners(owners)
      setSuppliers(supplierList)
    } catch (error) {
      console.error('Error loading options:', error)
    }
  }

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 300)
  }

  const handleNext = () => {
    if (currentStep < STEP_ORDER.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  // Helper to navigate after editing a field - in edit mode, go to review, otherwise continue
  const handleAfterEdit = () => {
    if (isEditMode) {
      // Go to review step (last step)
      setCurrentStep(STEP_ORDER.length - 1)
    } else {
      handleNext()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex !== currentStep) {
      setCurrentStep(stepIndex)
    }
  }

  const getStepLabel = (step: Step): string => {
    const labels: Record<Step, string> = {
      date: 'Date',
      partyName: 'Party Name',
      siteName: 'Site Name',
      material: 'Material',
      weight: 'Weight',
      rate: 'Rate',
      truckOwner: 'Truck Owner',
      truckNo: 'Truck Number',
      supplier: 'Supplier',
      originalWeight: 'Original Weight',
      originalRate: 'Original Rate',
      additionalCost: 'Additional Cost',
      payment: 'Payment',
      review: 'Review',
    }
    return labels[step]
  }

  const getStepIcon = (step: Step) => {
    const icons: Record<Step, any> = {
      date: Calendar,
      partyName: User,
      siteName: MapPin,
      material: Package,
      weight: Weight,
      rate: DollarSign,
      truckOwner: Truck,
      truckNo: Truck,
      supplier: ShoppingCart,
      originalWeight: Weight,
      originalRate: DollarSign,
      additionalCost: DollarSign,
      payment: DollarSign,
      review: Check
    }
    return icons[step]
  }

  const isStepComplete = (step: Step): boolean => {
    switch (step) {
      case 'date':
        return !!formData.date
      case 'partyName':
        return !!formData.partyName
      case 'siteName':
        return !!formData.siteName
      case 'material':
        return Array.isArray(formData.material) && formData.material.length > 0
      case 'weight':
        return formData.weight > 0
      case 'rate':
        return formData.rate > 0
      case 'truckOwner':
        return !!formData.truckOwner
      case 'truckNo':
        return !!formData.truckNo
      case 'supplier':
        return !!formData.supplier
      case 'originalWeight':
        return formData.originalWeight > 0
      case 'originalRate':
        return formData.originalRate > 0
      case 'additionalCost':
        return true // Optional
      case 'payment':
        return true // Optional - can skip payments
      case 'review':
        return true
      default:
        return false
    }
  }

  const canProceed = (): boolean => {
    const step = STEP_ORDER[currentStep]
    return isStepComplete(step)
  }

  const renderStep = () => {
    const step = STEP_ORDER[currentStep]

    switch (step) {
      case 'date':
        return (
          <div className="text-center py-2">
            <Calendar size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Select Date</h2>
            <p className="text-sm text-gray-600 mb-4">When was this order placed?</p>
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

      case 'partyName':
        return (
          <div className="text-center py-2">
            <User size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Party Name</h2>
            <p className="text-sm text-gray-600 mb-4">Who is the customer for this order?</p>
            {showSelectList && currentInput === 'partyName' && (
              <SelectList
                options={partyNames}
                value={formData.partyName}
                onChange={(val) => {
                  setFormData({ ...formData, partyName: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => setShowSelectList(false)}
                label="Select Party Name"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setPartyNames([...partyNames, val])
                }}
              />
            )}
          </div>
        )

      case 'siteName':
        return (
          <div className="text-center py-2">
            <MapPin size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Site Name</h2>
            <p className="text-sm text-gray-600 mb-4">Where is the delivery location?</p>
            {showSelectList && currentInput === 'siteName' && (
              <SelectList
                options={siteNames}
                value={formData.siteName}
                onChange={(val) => {
                  setFormData({ ...formData, siteName: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => setShowSelectList(false)}
                label="Select Site Name"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setSiteNames([...siteNames, val])
                }}
              />
            )}
          </div>
        )

      case 'material':
        return (
          <div className="text-center py-2">
            <Package size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Material</h2>
            <p className="text-sm text-gray-600 mb-4">Select the material(s) for this order</p>
            {showSelectList && currentInput === 'material' && (
              <SelectList
                options={[...MATERIAL_OPTIONS]}
                value=""
                onChange={() => {}}
                onClose={() => {
                  setShowSelectList(false)
                  // Only advance if materials are selected and user clicked Done
                  if (formData.material.length > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                }}
                label="Select Material"
                multiSelect={true}
                selectedValues={formData.material}
                onMultiChange={(vals) => {
                  setFormData({ ...formData, material: vals })
                  // Don't auto-advance, wait for Done button
                }}
              />
            )}
          </div>
        )

      case 'weight':
        return (
          <div className="text-center py-2">
            <Weight size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Weight</h2>
            <p className="text-sm text-gray-600 mb-4">Enter the weight in tons</p>
            {formData.weight > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formData.weight} tons</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'weight' && (
              <NumberPad
                value={formData.weight}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, weight: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  const enteredValue = lastEnteredValue.current as number
                  if (enteredValue > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label="Enter Weight (tons)"
              />
            )}
          </div>
        )

      case 'rate':
        return (
          <div className="text-center py-2">
            <DollarSign size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Rate</h2>
            <p className="text-sm text-gray-600 mb-4">Enter the rate per ton</p>
            {formData.rate > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formatIndianCurrency(formData.rate)}</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'rate' && (
              <NumberPad
                value={formData.rate}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, rate: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  const enteredValue = lastEnteredValue.current as number
                  if (enteredValue > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label="Enter Rate"
              />
            )}
          </div>
        )

      case 'truckOwner':
        return (
          <div className="text-center py-2">
            <Truck size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Truck Owner</h2>
            <p className="text-sm text-gray-600 mb-4">Who owns the delivery truck?</p>
            {showSelectList && currentInput === 'truckOwner' && (
              <SelectList
                options={truckOwners}
                value={formData.truckOwner}
                onChange={(val) => {
                  setFormData({ ...formData, truckOwner: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => setShowSelectList(false)}
                label="Select Truck Owner"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setTruckOwners([...truckOwners, val])
                }}
              />
            )}
          </div>
        )

      case 'truckNo':
        return (
          <div className="text-center py-2">
            <Truck size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Truck Number</h2>
            <p className="text-sm text-gray-600 mb-4">Enter the truck registration number</p>
            {formData.truckNo && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formData.truckNo}</span>
                </div>
              </div>
            )}
            {showTextPad && currentInput === 'truckNo' && (
              <TextInputPad
                value={formData.truckNo}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, truckNo: val })
                }}
                onClose={() => {
                  setShowTextPad(false)
                  const enteredValue = lastEnteredValue.current as string
                  if (enteredValue && enteredValue.trim()) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label="Enter Truck Number"
              />
            )}
          </div>
        )

      case 'supplier':
        return (
          <div className="text-center py-2">
            <ShoppingCart size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Supplier</h2>
            <p className="text-sm text-gray-600 mb-4">Who is the raw material supplier?</p>
            {showSelectList && currentInput === 'supplier' && (
              <SelectList
                options={suppliers}
                value={formData.supplier}
                onChange={(val) => {
                  setFormData({ ...formData, supplier: val })
                  setShowSelectList(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                onClose={() => setShowSelectList(false)}
                label="Select Supplier"
                allowCustom={true}
                onCustomAdd={(val) => {
                  setSuppliers([...suppliers, val])
                }}
              />
            )}
          </div>
        )

      case 'originalWeight':
        return (
          <div className="text-center py-2">
            <Weight size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Original Weight</h2>
            <p className="text-sm text-gray-600 mb-4">Enter the original weight from supplier</p>
            {formData.originalWeight > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formData.originalWeight} tons</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'originalWeight' && (
              <NumberPad
                value={formData.originalWeight}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, originalWeight: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  const enteredValue = lastEnteredValue.current as number
                  if (enteredValue > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label="Enter Original Weight (tons)"
              />
            )}
          </div>
        )

      case 'originalRate':
        return (
          <div className="text-center py-2">
            <DollarSign size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Original Rate</h2>
            <p className="text-sm text-gray-600 mb-4">Enter the original rate per ton from supplier</p>
            {formData.originalRate > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formatIndianCurrency(formData.originalRate)}</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'originalRate' && (
              <NumberPad
                value={formData.originalRate}
                onChange={(val) => {
                  lastEnteredValue.current = val
                  setFormData({ ...formData, originalRate: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  const enteredValue = lastEnteredValue.current as number
                  if (enteredValue > 0) {
                    setTimeout(() => handleAfterEdit(), 100)
                  }
                  lastEnteredValue.current = null
                }}
                label="Enter Original Rate"
              />
            )}
          </div>
        )

      case 'additionalCost':
        return (
          <div className="text-center py-2">
            <DollarSign size={48} className="mx-auto mb-3 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Additional Cost</h2>
            <p className="text-sm text-gray-600 mb-4">Any additional costs? (Optional)</p>
            {formData.additionalCost > 0 && (
              <div className="mb-4 animate-value-appear">
                <div className="inline-block px-4 py-2 bg-primary-50 border border-primary-200 rounded-xl shadow-sm">
                  <span className="text-lg font-semibold text-primary-700">{formatIndianCurrency(formData.additionalCost)}</span>
                </div>
              </div>
            )}
            {showNumberPad && currentInput === 'additionalCost' && (
              <NumberPad
                value={formData.additionalCost}
                onChange={(val) => {
                  setFormData({ ...formData, additionalCost: val })
                }}
                onClose={() => {
                  setShowNumberPad(false)
                  setTimeout(() => handleAfterEdit(), 100)
                }}
                label="Enter Additional Cost"
              />
            )}
          </div>
        )

      case 'payment':
        return renderPaymentStep()

      case 'review':
        return renderReviewStep()

      default:
        return null
    }
  }

  const renderPaymentStep = () => {
    const originalTotal = formData.originalWeight * formData.originalRate
    const existingPayments = formData.partialPayments || []
    const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const remainingAmount = originalTotal - totalPaid

    const handleAddPayment = async () => {
      if (remainingAmount <= 0) {
        showToast('Order is already fully paid', 'error')
        return
      }

      try {
        const amountStr = await sweetAlert.prompt({
          title: 'Add Payment',
          message: `Remaining amount: ${formatIndianCurrency(remainingAmount)}`,
          inputLabel: 'Payment Amount',
          inputPlaceholder: 'Enter amount',
          inputType: 'text',
          formatCurrencyInr: true,
          confirmText: 'Add Payment',
          cancelText: 'Cancel',
        })

        if (!amountStr) return

        const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
        if (!amount || Number.isNaN(amount) || amount <= 0) {
          showToast('Invalid amount', 'error')
          return
        }

        if (amount > remainingAmount) {
          showToast(`Payment amount cannot exceed remaining amount (${formatIndianCurrency(remainingAmount)})`, 'error')
          return
        }

        const note = await sweetAlert.prompt({
          title: 'Add Note (optional)',
          inputLabel: 'Note',
          inputPlaceholder: 'e.g. Cash payment / Bank transfer',
          inputType: 'text',
          required: false,
          confirmText: 'Save',
          cancelText: 'Skip',
        })

        const newPayment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount,
          date: new Date().toISOString(),
          note: note || undefined,
        }

        setFormData({
          ...formData,
          partialPayments: [...existingPayments, newPayment],
        })
        showToast('Payment added successfully!', 'success')
      } catch (error: any) {
        if (error?.message && !error.message.includes('SweetAlert')) {
          showToast(error.message || 'Failed to add payment', 'error')
        }
      }
    }

    const handleEditPayment = async (paymentId: string) => {
      const payment = existingPayments.find(p => p.id === paymentId)
      if (!payment) return

      const otherPaymentsTotal = existingPayments
        .filter(p => p.id !== paymentId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
      const maxAmount = originalTotal - otherPaymentsTotal

      const isLedgerPayment = !!payment.ledgerEntryId

      try {
        const amountStr = await sweetAlert.prompt({
          title: 'Edit Payment',
          message: `Max amount: ${formatIndianCurrency(maxAmount)}`,
          inputLabel: 'Payment Amount',
          inputPlaceholder: 'Enter amount',
          inputType: 'text',
          formatCurrencyInr: true,
          inputValue: payment.amount.toString(),
          confirmText: 'Save',
          cancelText: 'Cancel',
        })

        if (!amountStr) return

        const amount = Math.abs(parseFloat(String(amountStr).replace(/,/g, '')))
        if (!amount || Number.isNaN(amount) || amount <= 0) {
          showToast('Invalid amount', 'error')
          return
        }

        if (amount > maxAmount) {
          showToast(`Payment amount cannot exceed ${formatIndianCurrency(maxAmount)}`, 'error')
          return
        }

        const note = await sweetAlert.prompt({
          title: 'Edit Note (optional)',
          inputLabel: 'Note',
          inputPlaceholder: 'e.g. Cash payment / Bank transfer',
          inputType: 'text',
          required: false,
          inputValue: payment.note || '',
          confirmText: 'Save',
          cancelText: 'Skip',
        })

        // Preserve ledgerEntryId if it exists
        const updatedPayment = {
          ...payment,
          amount,
          note: note || undefined,
          ...(isLedgerPayment && { ledgerEntryId: payment.ledgerEntryId }),
        }

        // Check if amount changed (for ledger payments)
        const amountChanged = isLedgerPayment && payment
          ? Math.abs(Number(amount) - Number(payment.amount)) > 0.01
          : false
        
        setFormData({
          ...formData,
          partialPayments: existingPayments.map(p =>
            p.id === paymentId ? updatedPayment : p
          ),
        })
        
        if (isLedgerPayment && amountChanged) {
          showToast('Payment amount updated. Ledger entry will be redistributed after saving.', 'success')
        } else if (isLedgerPayment) {
          showToast('Payment updated successfully! (Date/note only - no redistribution needed)', 'success')
        } else {
          showToast('Payment updated successfully!', 'success')
        }
      } catch (error: any) {
        if (error?.message && !error.message.includes('SweetAlert')) {
          showToast(error.message || 'Failed to update payment', 'error')
        }
      }
    }

    const handleRemovePayment = async (paymentId: string) => {
      const payment = existingPayments.find(p => p.id === paymentId)
      if (!payment) return

      const isLedgerPayment = !!payment.ledgerEntryId

      try {
        const confirmed = await sweetAlert.confirm({
          title: 'Remove Payment?',
          message: `Are you sure you want to remove payment of ${formatIndianCurrency(payment.amount)}?`,
          icon: 'warning',
          confirmText: 'Remove',
          cancelText: 'Cancel',
        })

        if (!confirmed) return

        setFormData({
          ...formData,
          partialPayments: existingPayments.filter(p => p.id !== paymentId),
        })
        
        if (isLedgerPayment) {
          showToast('Payment removed. Ledger entry will be redistributed after saving.', 'success')
        } else {
          showToast('Payment removed successfully!', 'success')
        }
      } catch (error: any) {
        if (error?.message && !error.message.includes('SweetAlert')) {
          // User cancelled, ignore
        }
      }
    }

    return (
      <div className="py-6">
        <div className="text-center mb-6">
          <DollarSign size={48} className="mx-auto mb-3 text-primary-600" />
          <h2 className="text-xl font-bold text-gray-900 mb-1">Partial Payment</h2>
          <p className="text-sm text-gray-600 mb-4">Add payments for raw materials (Optional)</p>
        </div>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Original Total:</span>
                <span className="font-bold text-gray-900">{formatIndianCurrency(originalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Paid:</span>
                <span className="font-bold text-green-600">{formatIndianCurrency(totalPaid)}</span>
              </div>
              <div className="pt-2 border-t border-blue-200 flex justify-between">
                <span className="text-base font-semibold text-gray-700">Remaining:</span>
                <span className={`text-base font-bold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatIndianCurrency(Math.abs(remainingAmount))}
                </span>
              </div>
            </div>
          </div>

          {/* Payments List */}
          {existingPayments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Payment History</h3>
              {existingPayments.map((payment) => {
                const paymentDate = payment.date ? new Date(payment.date) : new Date()
                return (
                  <div
                    key={payment.id}
                    className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900">{formatIndianCurrency(payment.amount)}</span>
                        <span className="text-xs text-gray-500">{format(paymentDate, 'dd MMM yyyy')}</span>
                      </div>
                      {payment.note && (
                        <div className="text-xs text-gray-600 mt-1">• {payment.note}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => handleEditPayment(payment.id)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded active:bg-blue-100 transition-colors"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        title={payment.ledgerEntryId ? "Edit payment (from ledger)" : "Edit payment"}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleRemovePayment(payment.id)}
                        className="p-1.5 bg-red-50 text-red-600 rounded active:bg-red-100 transition-colors"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        title={payment.ledgerEntryId ? "Remove payment (from ledger)" : "Remove payment"}
                      >
                        <Trash2 size={14} />
                      </button>
                      {payment.ledgerEntryId && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                          From Ledger
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Payment Button */}
          {remainingAmount > 0 && (
            <button
              onClick={handleAddPayment}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 transition-colors flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-primary-600/30"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Plus size={20} />
              Add Payment
            </button>
          )}

          {existingPayments.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No payments added yet. You can skip this step or add payments later.
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderReviewStep = () => {
    const total = formData.weight * formData.rate
    const originalTotal = formData.originalWeight * formData.originalRate
    const profit = total - (originalTotal + formData.additionalCost)

    return (
      <div className="py-6">
        <div className="text-center mb-6">
          <Check size={64} className="mx-auto mb-4 text-primary-600" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isEditMode ? 'Edit Order' : 'Review Order'}
          </h2>
          <p className="text-gray-600">
            {isEditMode ? 'Click on any field to edit, then save your changes' : 'Review all details before saving'}
          </p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {STEP_ORDER.slice(0, -1).map((step, idx) => {
            const Icon = getStepIcon(step)
            const value = getStepValue(step)
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
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total:</span>
              <span className="font-bold text-gray-900">{formatIndianCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Original Total:</span>
              <span className="font-bold text-gray-900">{formatIndianCurrency(originalTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Additional Cost:</span>
              <span className="font-bold text-gray-900">{formatIndianCurrency(formData.additionalCost)}</span>
            </div>
            {(() => {
              const payments = formData.partialPayments || []
              const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
              const remainingAmount = originalTotal - totalPaid
              if (payments.length > 0) {
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Payments:</span>
                      <span className="font-bold text-green-600">{formatIndianCurrency(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Remaining:</span>
                      <span className={`font-bold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatIndianCurrency(Math.abs(remainingAmount))}
                      </span>
                    </div>
                  </>
                )
              }
              return null
            })()}
            <div className="pt-2 border-t border-primary-200 flex justify-between">
              <span className="text-base font-semibold text-gray-700">Profit:</span>
              <span className={`text-base font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatIndianCurrency(profit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const getStepValue = (step: Step): string => {
    switch (step) {
      case 'date':
        return formData.date ? format(new Date(formData.date), 'dd MMM yyyy') : 'Not set'
      case 'partyName':
        return formData.partyName || 'Not set'
      case 'siteName':
        return formData.siteName || 'Not set'
      case 'material':
        return formData.material.length > 0 ? formData.material.join(', ') : 'Not set'
      case 'weight':
        return formData.weight > 0 ? `${formData.weight} tons` : 'Not set'
      case 'rate':
        return formData.rate > 0 ? formatIndianCurrency(formData.rate) : 'Not set'
      case 'truckOwner':
        return formData.truckOwner || 'Not set'
      case 'truckNo':
        return formData.truckNo || 'Not set'
      case 'supplier':
        return formData.supplier || 'Not set'
      case 'originalWeight':
        return formData.originalWeight > 0 ? `${formData.originalWeight} tons` : 'Not set'
      case 'originalRate':
        return formData.originalRate > 0 ? formatIndianCurrency(formData.originalRate) : 'Not set'
      case 'additionalCost':
        return formData.additionalCost > 0 ? formatIndianCurrency(formData.additionalCost) : '₹0'
      case 'payment':
        const payments = formData.partialPayments || []
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return payments.length > 0 
          ? `${payments.length} payment(s) - ${formatIndianCurrency(totalPaid)}`
          : 'No payments'
      default:
        return ''
    }
  }

  // Redistribute ledger entry when a payment amount changes
  const redistributeLedgerEntry = async (ledgerEntryId: string, expenseDate: string) => {
    try {
      console.log(`🔄 Redistributing ledger entry ${ledgerEntryId} (date: ${expenseDate})`)
      
      // Get the ledger entry
      const ledgerEntry = await ledgerService.getEntryById(ledgerEntryId)
      if (!ledgerEntry) {
        console.warn(`❌ Ledger entry ${ledgerEntryId} not found`)
        return
      }
      if (ledgerEntry.type !== 'debit' || !ledgerEntry.supplier) {
        console.warn(`❌ Ledger entry is not an expense with supplier (type: ${ledgerEntry.type}, supplier: ${ledgerEntry.supplier})`)
        return
      }

      console.log(`📦 Getting orders for supplier: ${ledgerEntry.supplier}`)
      
      // Get all orders for this supplier
      const allOrders = await orderService.getAllOrders({ supplier: ledgerEntry.supplier })
      
      console.log(`📦 Found ${allOrders.length} orders for supplier ${ledgerEntry.supplier}`)
      
      // Calculate total amount currently allocated to orders from this ledger entry
      let totalAllocated = 0
      allOrders.forEach(order => {
        const ledgerPayments = (order.partialPayments || []).filter(p => p.ledgerEntryId === ledgerEntryId)
        const orderAllocated = ledgerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        totalAllocated += orderAllocated
        if (orderAllocated > 0) {
          console.log(`  Order ${order.id} (${order.siteName || 'N/A'}): allocated ${orderAllocated} from this ledger entry`)
        }
      })
      
      console.log(`💰 Total allocated to orders: ${totalAllocated}, Ledger entry amount: ${ledgerEntry.amount}`)

      // NOTE: We do NOT automatically update the ledger entry amount
      // The ledger entry amount should only be changed manually by the user
      // We use the original ledger entry amount for redistribution

      // Redistribute using the original ledger entry amount (not the calculated totalAllocated)
      // This ensures we redistribute the actual ledger entry amount, not what's currently allocated
      const supplier = ledgerEntry.supplier
      const ordersWithOutstanding = allOrders
        .map(order => {
          const existingPayments = order.partialPayments || []
          // Exclude payments from this ledger entry
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const originalTotal = Number(order.originalTotal || 0)
          const remaining = Math.max(0, originalTotal - totalPaid)
          
          const tempOrder: Order = {
            ...order,
            partialPayments: paymentsExcludingThis
          }
          
          const isPaid = isOrderPaid(tempOrder)
          
          return { order, remaining, currentPayments: existingPayments, tempOrder, isPaid }
        })
        .filter(({ remaining, isPaid, order }) => {
          const shouldInclude = remaining > 0 && !isPaid
          if (!shouldInclude) {
            console.log(`  ⏭️  Skipping order ${order.id}: remaining=${remaining}, isPaid=${isPaid}`)
          }
          return shouldInclude
        })
        .sort((a, b) => {
          const aDate = new Date(a.order.date).getTime()
          const bDate = new Date(b.order.date).getTime()
          if (aDate !== bDate) return aDate - bDate
          const aTime = new Date(a.order.createdAt || a.order.updatedAt || a.order.date).getTime()
          const bTime = new Date(b.order.createdAt || b.order.updatedAt || b.order.date).getTime()
          return aTime - bTime
        })

      console.log(`✅ Found ${ordersWithOutstanding.length} orders with outstanding payments for redistribution`)
      
      if (ordersWithOutstanding.length === 0) {
        console.warn(`⚠️ No orders with outstanding payments for supplier ${supplier}`)
        return
      }

      // Use the original ledger entry amount for redistribution, not the calculated totalAllocated
      // This ensures we redistribute the actual ledger entry amount
      let remainingExpense = ledgerEntry.amount
      const paymentsToAdd: Array<{ orderId: string; payment: PaymentRecord[] }> = []

      console.log(`💰 Starting redistribution: ledger entry amount=${ledgerEntry.amount}, currently allocated=${totalAllocated}`)

      // Distribute expense across orders (oldest first)
      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingExpense <= 0) break
        
        if (!order.id) continue
        
        const paymentAmount = Math.min(remainingExpense, remaining)
        
        let paymentDate = expenseDate
        if (paymentDate && !paymentDate.includes('T')) {
          paymentDate = new Date(paymentDate + 'T00:00:00').toISOString()
        }
        
        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: paymentDate,
          note: `From ledger entry`,
          ledgerEntryId: ledgerEntryId,
        }
        
        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
        const updatedPayments = [...paymentsWithoutThisEntry, payment]
        
        paymentsToAdd.push({ orderId: order.id, payment: updatedPayments })
        remainingExpense -= paymentAmount
        
        console.log(`  ✓ Adding payment of ${paymentAmount} to order ${order.id} (order remaining: ${remaining - paymentAmount}, expense remaining: ${remainingExpense})`)
      }

      console.log(`📊 Distribution summary: ${paymentsToAdd.length} orders will be updated, ${remainingExpense} remaining undistributed`)

      // Update orders with new payment distributions
      for (const { orderId, payment: updatedPayments } of paymentsToAdd) {
        await orderService.updateOrder(orderId, {
          partialPayments: updatedPayments,
        })
        console.log(`  ✅ Updated order ${orderId} with redistributed payment`)
      }
      
      if (remainingExpense > 0) {
        console.warn(`⚠️ Could not fully redistribute. Remaining undistributed: ${remainingExpense}`)
      } else {
        console.log(`✅ Successfully redistributed ledger entry ${ledgerEntryId}`)
      }
    } catch (error) {
      console.error('❌ Error redistributing ledger entry:', error)
      throw error
    }
  }

  const handleSubmit = async () => {
    // Validate material
    if (formData.material.length === 0) {
      alert('Please select at least one material')
      return
    }

    setSaving(true)
    try {
      const total = formData.weight * formData.rate
      const originalTotal = formData.originalWeight * formData.originalRate
      const profit = total - (originalTotal + formData.additionalCost)

      // Ensure all payments have valid dates and amounts
      const validatedPayments = (formData.partialPayments || [])
        .filter(payment => payment && payment.id) // Filter out null/undefined or payments without id
        .map(payment => {
          // Ensure amount is a valid number
          const amount = typeof payment.amount === 'number' 
            ? payment.amount 
            : Number(String(payment.amount).replace(/,/g, '')) || 0
          
          // Ensure date is a valid ISO string
          let date = payment.date
          if (!date || typeof date !== 'string') {
            date = new Date().toISOString()
          } else if (!date.includes('T')) {
            // If date is just a date string, convert to ISO
            try {
              date = new Date(date + 'T00:00:00').toISOString()
            } catch {
              date = new Date().toISOString()
            }
          }
          
          // Build the payment object, preserving all fields
          const validatedPayment: PaymentRecord = {
            id: String(payment.id), // Ensure id is a string
            amount: amount,
            date: date,
            ...(payment.note && payment.note.trim() && { note: payment.note.trim() }),
            ...(payment.ledgerEntryId && { ledgerEntryId: String(payment.ledgerEntryId) }),
          }
          
          return validatedPayment
        })
        .filter(payment => payment.amount > 0 && payment.id) // Remove any invalid payments (must have amount > 0 and id)

      // Build order data explicitly to ensure all fields are correct
      const orderData: Omit<Order, 'id'> = {
        date: formData.date,
        partyName: formData.partyName,
        siteName: formData.siteName,
        material: formData.material,
        weight: formData.weight,
        rate: formData.rate,
        total,
        truckOwner: formData.truckOwner,
        truckNo: formData.truckNo,
        supplier: formData.supplier,
        originalWeight: formData.originalWeight,
        originalRate: formData.originalRate,
        originalTotal,
        additionalCost: formData.additionalCost,
        profit,
        partialPayments: validatedPayments.length > 0 ? validatedPayments : undefined,
        // Preserve existing fields if editing
        ...(order?.invoiced !== undefined && { invoiced: order.invoiced }),
        ...(order?.invoiceId && { invoiceId: order.invoiceId }),
        ...(order?.archived !== undefined && { archived: order.archived }),
      }

      // Save the order - handleSaveOrder will handle redistribution
      await onSave(orderData)
      
      handleClose()
    } catch (error: any) {
      console.error('Error saving order:', error)
      alert(error?.message || 'Error saving order. Please try again.')
      setSaving(false)
    }
  }

  const getSelectListProps = () => {
    switch (currentInput) {
      case 'partyName':
        return {
          options: partyNames,
          value: formData.partyName,
          onChange: (val: string) => {
            setFormData({ ...formData, partyName: val })
            setShowSelectList(false)
            if (canProceed()) {
              setTimeout(() => handleAfterEdit(), 300)
            }
          },
          label: 'Select Party Name',
          allowCustom: true,
          onCustomAdd: (val: string) => {
            setPartyNames([...partyNames, val])
          }
        }
      case 'siteName':
        return {
          options: siteNames,
          value: formData.siteName,
          onChange: (val: string) => {
            setFormData({ ...formData, siteName: val })
            setShowSelectList(false)
            if (canProceed()) {
              setTimeout(() => handleAfterEdit(), 300)
            }
          },
          label: 'Select Site Name',
          allowCustom: true,
          onCustomAdd: (val: string) => {
            setSiteNames([...siteNames, val])
          }
        }
      case 'material':
        return {
          options: [...MATERIAL_OPTIONS],
          value: '',
          onChange: () => {},
          label: 'Select Material',
          multiSelect: true,
          selectedValues: formData.material,
          onMultiChange: (vals: string[]) => {
            setFormData({ ...formData, material: vals })
            // Auto-advance if at least one material is selected
            if (vals.length > 0) {
              setTimeout(() => {
                setShowSelectList(false)
                setTimeout(() => handleAfterEdit(), 300)
              }, 100)
            }
          }
        }
      case 'truckOwner':
        return {
          options: truckOwners,
          value: formData.truckOwner,
          onChange: (val: string) => {
            setFormData({ ...formData, truckOwner: val })
            setShowSelectList(false)
            if (canProceed()) {
              setTimeout(() => handleAfterEdit(), 300)
            }
          },
          label: 'Select Truck Owner',
          allowCustom: true,
          onCustomAdd: (val: string) => {
            setTruckOwners([...truckOwners, val])
          }
        }
      case 'supplier':
        return {
          options: suppliers,
          value: formData.supplier,
          onChange: (val: string) => {
            setFormData({ ...formData, supplier: val })
            setShowSelectList(false)
            if (canProceed()) {
              setTimeout(() => handleAfterEdit(), 300)
            }
          },
          label: 'Select Supplier',
          allowCustom: true,
          onCustomAdd: (val: string) => {
            setSuppliers([...suppliers, val])
          }
        }
      default:
        return null
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
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="p-2 active:bg-gray-100 active:scale-[0.95] rounded-lg transition-transform duration-100"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ChevronLeft size={20} className="text-gray-600" />
                </button>
              )}
              <div>
                {!(isEditMode && STEP_ORDER[currentStep] === 'review') && (
                  <div className="text-xs text-gray-500">Step {currentStep + 1} of {STEP_ORDER.length}</div>
                )}
                <h2 className="text-lg font-bold text-gray-900">
                  {getStepLabel(STEP_ORDER[currentStep])}
                </h2>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 active:bg-gray-100 active:scale-95 rounded-lg transition-all duration-150"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-200">
            <div className="flex gap-1">
              {STEP_ORDER.map((step, idx) => {
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

          {/* All Filled Details Summary - Show on all steps except review */}
          {STEP_ORDER[currentStep] !== 'review' && (() => {
            const allSteps = STEP_ORDER.filter(step => step !== 'review')
            const filledSteps = allSteps.filter((step, idx) => {
              const value = getStepValue(step)
              return value !== 'Not set' && value !== '₹0' && value !== '' && value !== 'No payments'
            })
            
            if (filledSteps.length === 0) return null
            
            return (
              <div className="flex-shrink-0 px-4 pt-3 pb-2 border-t border-gray-100 bg-gradient-to-br from-gray-50 to-gray-100/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <Check size={14} className="text-green-600" />
                    Filled Details
                  </div>
                  <div className="text-xs text-gray-500">
                    {filledSteps.length} / {allSteps.length} completed
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {allSteps.map((step, idx) => {
                    const value = getStepValue(step)
                    if (value === 'Not set' || value === '₹0' || value === '' || value === 'No payments') return null
                    const isCurrentStep = idx === currentStep
                    const Icon = getStepIcon(step)
                    return (
                      <button
                        key={step}
                        onClick={() => handleStepClick(idx)}
                        className={`px-2.5 py-1.5 bg-white border rounded-lg text-xs text-left active:bg-gray-50 active:scale-[0.98] transition-all duration-150 flex items-center gap-1.5 shadow-sm ${
                          isCurrentStep 
                            ? 'border-primary-400 bg-primary-50/50' 
                            : 'border-gray-200'
                        }`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Icon size={12} className={`flex-shrink-0 ${isCurrentStep ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-700 truncate" style={{ fontSize: '10px' }}>
                            {getStepLabel(step)}
                          </div>
                          <div className={`truncate ${isCurrentStep ? 'text-primary-700 font-semibold' : 'text-gray-600'}`} style={{ fontSize: '11px' }}>
                            {value}
                          </div>
                        </div>
                        <Edit2 size={10} className={`flex-shrink-0 ${isCurrentStep ? 'text-primary-500' : 'text-gray-400'}`} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="max-w-2xl mx-auto w-full">
              {renderStep()}
            </div>
          </div>

          {/* Navigation */}
          {STEP_ORDER[currentStep] !== 'review' && !showNumberPad && !showTextPad && !showSelectList && !showDatePicker && (
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

          {STEP_ORDER[currentStep] === 'review' && !showNumberPad && !showTextPad && !showSelectList && !showDatePicker && (
            <div className="flex-shrink-0 p-4 border-t border-gray-200">
              <button
                onClick={handleSubmit}
                disabled={saving || !canProceed()}
                className="w-full h-12 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-green-600/30"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {saving ? (isEditMode ? 'Saving changes...' : 'Saving...') : (isEditMode ? 'Save Changes' : 'Confirm & Save')}
                {!saving && <ChevronRight size={20} className="transition-transform duration-200 group-hover:translate-x-1" />}
              </button>
            </div>
          )}
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(wizardContent, document.body)
}

