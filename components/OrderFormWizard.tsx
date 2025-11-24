'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Order, PaymentRecord } from '@/types/order'
import { X, ChevronLeft, ChevronRight, Check, Edit2, Calendar, User, MapPin, Package, Weight, DollarSign, Truck, ShoppingCart, Plus } from 'lucide-react'
import { orderService } from '@/lib/orderService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'
import NumberPad from '@/components/NumberPad'
import TextInputPad from '@/components/TextInputPad'
import SelectList from '@/components/SelectList'
import DatePicker from '@/components/DatePicker'
import { MATERIAL_OPTIONS } from '@/lib/constants'

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
  | 'review'
  | 'confirm'

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
  'review',
  'confirm'
]

export default function OrderFormWizard({ order, onClose, onSave }: OrderFormWizardProps) {
  const [currentStep, setCurrentStep] = useState<number>(0)
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
    
    // Auto-open first step input immediately
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
  }, [])

  // Auto-show input when step changes
  useEffect(() => {
    const step = STEP_ORDER[currentStep]
    
    // Skip auto-open for review and confirm steps
    if (step === 'review' || step === 'confirm') {
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
      review: 'Review',
      confirm: 'Confirm'
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
      review: Check,
      confirm: Check
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
      case 'review':
        return true
      case 'confirm':
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
                  setTimeout(() => handleNext(), 100)
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
                  setTimeout(() => handleNext(), 100)
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
                  setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                  setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                  setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                    setTimeout(() => handleNext(), 100)
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
                  setTimeout(() => handleNext(), 100)
                }}
                label="Enter Additional Cost"
              />
            )}
          </div>
        )

      case 'review':
        return renderReviewStep()

      case 'confirm':
        return renderConfirmStep()

      default:
        return null
    }
  }

  const renderConfirmStep = () => {
    const total = formData.weight * formData.rate
    const originalTotal = formData.originalWeight * formData.originalRate
    const profit = total - (originalTotal + formData.additionalCost)

    return (
      <div className="py-6">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Order</h2>
          <p className="text-gray-600 mb-6">Are you sure you want to save this order?</p>
        </div>

        {/* Summary Card */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200 mb-6">
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
            <div className="pt-2 border-t border-primary-200 flex justify-between">
              <span className="text-base font-semibold text-gray-700">Profit:</span>
              <span className={`text-base font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatIndianCurrency(profit)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-14 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {saving ? 'Saving...' : 'Yes, Save Order'}
            {!saving && <Check size={20} />}
          </button>
          <button
            onClick={() => handleStepClick(STEP_ORDER.indexOf('review'))}
            disabled={saving}
            className="w-full h-12 bg-gray-100 text-gray-700 rounded-xl font-semibold active:bg-gray-200 transition-colors disabled:opacity-50"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            No, Go Back
          </button>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Order</h2>
          <p className="text-gray-600">Review all details before saving</p>
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
      case 'confirm':
        return 'Confirm Order'
      default:
        return ''
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

      const orderData: Omit<Order, 'id'> = {
        ...formData,
        material: formData.material,
        total,
        originalTotal,
        profit,
        date: formData.date,
      }
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
              setTimeout(() => handleNext(), 300)
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
              setTimeout(() => handleNext(), 300)
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
                setTimeout(() => handleNext(), 300)
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
              setTimeout(() => handleNext(), 300)
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
              setTimeout(() => handleNext(), 300)
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
                <div className="text-xs text-gray-500">Step {currentStep + 1} of {STEP_ORDER.length}</div>
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

          {/* Previous Answers Summary */}
          {currentStep > 0 && STEP_ORDER[currentStep] !== 'review' && STEP_ORDER[currentStep] !== 'confirm' && (
            <div className="flex-shrink-0 px-6 pt-4 border-t border-gray-100 bg-gray-50">
              <div className="text-xs text-gray-500 mb-2">Previous Answers:</div>
              <div className="flex flex-wrap gap-2">
                {STEP_ORDER.slice(0, currentStep).map((step, idx) => {
                  const value = getStepValue(step)
                  if (value === 'Not set' || value === '₹0' || step === 'confirm') return null
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
          {STEP_ORDER[currentStep] !== 'review' && STEP_ORDER[currentStep] !== 'confirm' && (
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

          {STEP_ORDER[currentStep] === 'review' && (
            <div className="flex-shrink-0 p-4 border-t border-gray-200">
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="w-full h-12 bg-green-600 text-white rounded-xl font-semibold active:bg-green-700 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-green-600/30"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Confirm & Save
                <ChevronRight size={20} className="transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>
          )}
    </div>
  )

  if (typeof window === 'undefined') return null
  return createPortal(wizardContent, document.body)
}

