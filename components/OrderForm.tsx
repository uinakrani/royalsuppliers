'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Order, PaymentRecord } from '@/types/order'
import { X, Plus, Trash2, Edit2 } from 'lucide-react'
import { orderService } from '@/lib/orderService'
import { formatIndianCurrency } from '@/lib/currencyUtils'

interface OrderFormProps {
  order?: Order | null
  onClose: () => void
  onSave: (order: Omit<Order, 'id'>) => Promise<void>
}

export default function OrderForm({ order, onClose, onSave }: OrderFormProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

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

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ material?: string; payments?: string }>({})
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [showCustomPartyName, setShowCustomPartyName] = useState(false)
  const [siteNames, setSiteNames] = useState<string[]>([])
  const [showCustomSiteName, setShowCustomSiteName] = useState(false)
  const [truckOwners, setTruckOwners] = useState<string[]>([])
  const [showCustomTruckOwner, setShowCustomTruckOwner] = useState(false)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [showCustomSupplier, setShowCustomSupplier] = useState(false)
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null)
  const [newPayment, setNewPayment] = useState({ amount: '', note: '' })
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Check if app is in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.documentElement.classList.contains('standalone')
      setIsStandalone(isStandaloneMode)
    }
    checkStandalone()
    const observer = new MutationObserver(checkStandalone)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    // Trigger animation after mount
    requestAnimationFrame(() => {
      setIsMounted(true)
      // Auto-focus first input after animation
      setTimeout(() => {
        if (firstInputRef.current) {
          firstInputRef.current.focus()
        }
      }, 300)
    })
    loadPartyNames()
    loadSiteNames()
    loadTruckOwners()
    loadSuppliers()
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    // Update form data when order prop changes
    if (order) {
      setFormData({
        date: order.date || new Date().toISOString().split('T')[0],
        partyName: order.partyName || '',
        siteName: order.siteName || '',
        material: Array.isArray(order.material) ? order.material : (order.material ? [order.material] : []),
        weight: order.weight || 0,
        rate: order.rate || 0,
        truckOwner: order.truckOwner || '',
        truckNo: order.truckNo || '',
        supplier: order.supplier || '',
        originalWeight: order.originalWeight || 0,
        originalRate: order.originalRate || 0,
        additionalCost: order.additionalCost || 0,
        partialPayments: order.partialPayments || [],
      })
      // Check if party name exists in the list
      if (order.partyName && partyNames.length > 0 && !partyNames.includes(order.partyName)) {
        setShowCustomPartyName(true)
      }
      // Check if site name exists in the list
      if (order.siteName && siteNames.length > 0 && !siteNames.includes(order.siteName)) {
        setShowCustomSiteName(true)
      }
      // Check if truck owner exists in the list
      if (order.truckOwner && truckOwners.length > 0 && !truckOwners.includes(order.truckOwner)) {
        setShowCustomTruckOwner(true)
      }
      // Check if supplier exists in the list
      if (order.supplier && suppliers.length > 0 && !suppliers.includes(order.supplier)) {
        setShowCustomSupplier(true)
      }
    }
  }, [order, partyNames, siteNames, truckOwners, suppliers])

  const loadPartyNames = async () => {
    try {
      const names = await orderService.getUniquePartyNames()
      setPartyNames(names)
      // If current party name is not in the list, show custom input
      if (formData.partyName && !names.includes(formData.partyName)) {
        setShowCustomPartyName(true)
      }
    } catch (error) {
      console.error('Error loading party names:', error)
    }
  }

  const loadTruckOwners = async () => {
    try {
      const owners = await orderService.getUniqueTruckOwners()
      setTruckOwners(owners)
      // If current truck owner is not in the list, show custom input
      if (formData.truckOwner && !owners.includes(formData.truckOwner)) {
        setShowCustomTruckOwner(true)
      }
    } catch (error) {
      console.error('Error loading truck owners:', error)
    }
  }

  const loadSiteNames = async () => {
    try {
      const names = await orderService.getUniqueSiteNames()
      setSiteNames(names)
      // If current site name is not in the list, show custom input
      if (formData.siteName && !names.includes(formData.siteName)) {
        setShowCustomSiteName(true)
      }
    } catch (error) {
      console.error('Error loading site names:', error)
    }
  }

  const loadSuppliers = async () => {
    try {
      const supplierList = await orderService.getUniqueSuppliers()
      setSuppliers(supplierList)
      // If current supplier is not in the list, show custom input
      if (formData.supplier && !supplierList.includes(formData.supplier)) {
        setShowCustomSupplier(true)
      }
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }

  const calculateFields = () => {
    const total = formData.weight * formData.rate
    const originalTotal = formData.originalWeight * formData.originalRate
    const profit = total - (originalTotal + formData.additionalCost)

    return { total, originalTotal, profit }
  }

  const { total, originalTotal, profit } = calculateFields()

  // Calculate total paid from partial payments
  const totalPaid = useMemo(() => {
    return formData.partialPayments.reduce((sum, p) => sum + p.amount, 0)
  }, [formData.partialPayments])

  const remainingAmount = useMemo(() => {
    return Math.max(0, originalTotal - totalPaid)
  }, [originalTotal, totalPaid])

  // Add new payment
  const handleAddPayment = () => {
    const amount = parseFloat(newPayment.amount)
    if (!amount || amount <= 0) {
      setErrors({ payments: 'Please enter a valid payment amount' })
      return
    }
    if (totalPaid + amount > originalTotal) {
      setErrors({ payments: `Total payments cannot exceed original total of ${formatIndianCurrency(originalTotal)}` })
      return
    }

    const payment: PaymentRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount,
      date: new Date().toISOString(),
      note: newPayment.note.trim() || undefined,
    }

    setFormData(prev => ({
      ...prev,
      partialPayments: [...prev.partialPayments, payment],
    }))
    setNewPayment({ amount: '', note: '' })
    setErrors({})
  }

  // Update existing payment
  const handleUpdatePayment = (index: number) => {
    const amount = parseFloat(newPayment.amount)
    if (!amount || amount <= 0) {
      setErrors({ payments: 'Please enter a valid payment amount' })
      return
    }

    const otherPaymentsTotal = formData.partialPayments
      .filter((_, i) => i !== index)
      .reduce((sum, p) => sum + p.amount, 0)

    if (otherPaymentsTotal + amount > originalTotal) {
      setErrors({ payments: `Total payments cannot exceed original total of ${formatIndianCurrency(originalTotal)}` })
      return
    }

    const updatedPayments = [...formData.partialPayments]
    updatedPayments[index] = {
      ...updatedPayments[index],
      amount,
      note: newPayment.note.trim() || undefined,
    }

    setFormData(prev => ({
      ...prev,
      partialPayments: updatedPayments,
    }))
    setEditingPaymentIndex(null)
    setNewPayment({ amount: '', note: '' })
    setErrors({})
  }

  // Delete payment
  const handleDeletePayment = (index: number) => {
    const updatedPayments = formData.partialPayments.filter((_, i) => i !== index)
    setFormData(prev => ({
      ...prev,
      partialPayments: updatedPayments,
    }))
  }

  // Start editing payment
  const handleStartEditPayment = (index: number) => {
    const payment = formData.partialPayments[index]
    setEditingPaymentIndex(index)
    setNewPayment({
      amount: payment.amount.toString(),
      note: payment.note || '',
    })
  }

  // Cancel editing payment
  const handleCancelEditPayment = () => {
    setEditingPaymentIndex(null)
    setNewPayment({ amount: '', note: '' })
    setErrors({})
  }

  const handleClose = () => {
    setIsClosing(true)
    setIsMounted(false)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 350)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate material selection
    const materials = Array.isArray(formData.material) ? formData.material : (formData.material ? [formData.material] : [])
    if (materials.length === 0) {
      setErrors({ material: 'Please select at least one material' })
      return
    }

    // Validate payments don't exceed original total
    if (totalPaid > originalTotal) {
      setErrors({ payments: `Total payments cannot exceed original total of ${formatIndianCurrency(originalTotal)}` })
      return
    }
    
    setSaving(true)
    setErrors({})

    try {
      const orderData: Omit<Order, 'id'> = {
        ...formData,
        material: materials, // Store as array
        total,
        originalTotal,
        profit,
        date: formData.date,
      }
      await onSave(orderData)
      handleClose()
    } catch (error: any) {
      console.error('Error saving order:', error)
      let errorMessage = error?.message || 'Error saving order. Please try again.'
      
      // Provide helpful message for timeout errors
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        errorMessage = 'Request timed out. Firestore security rules are blocking writes. A popup with fix instructions should appear.'
        // Trigger the alert component
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show-firestore-rules-alert'))
        }
      }
      
      setErrors({ material: errorMessage })
      setSaving(false) // Reset saving state on error so user can try again
    }
  }

  const formContent = (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black/50 z-[99999] popup-backdrop ${
          isClosing ? 'native-backdrop-exit' : isMounted ? 'native-backdrop-enter' : 'opacity-0'
        }`}
        style={{ 
          WebkitTapHighlightColor: 'transparent', 
          backdropFilter: 'blur(2px)',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
        }}
      />
      
      {/* Popup */}
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none popup-container"
        style={{
          WebkitTapHighlightColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: isStandalone ? 99999 : 99999,
          padding: '1rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div
          ref={popupRef}
          className={`bg-white rounded-2xl border border-gray-100 max-w-md w-full pointer-events-auto flex flex-col ${
            isClosing ? 'native-modal-exit' : isMounted ? 'native-modal-enter' : 'opacity-0 scale-95 translate-y-4'
          }`}
          style={{ 
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            backfaceVisibility: 'hidden',
            willChange: 'transform, opacity',
            maxHeight: 'calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {order ? 'Edit Order' : 'Add New Order'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content - Scrollable */}
        <form 
          ref={formRef}
          onSubmit={handleSubmit} 
          className="flex-1 overflow-y-auto p-4 space-y-2.5"
          style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: 'smooth',
          }}
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Date *
            </label>
            <input
              ref={firstInputRef}
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 touch-manipulation"
              style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Party Name *
            </label>
            {!showCustomPartyName ? (
              <div className="space-y-2">
                <select
                  value={formData.partyName}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setShowCustomPartyName(true)
                    } else {
                      setFormData({ ...formData, partyName: e.target.value })
                    }
                  }}
                  required={!showCustomPartyName}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 touch-manipulation active:bg-gray-50"
                  style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                >
                  <option value="">Select a party name</option>
                  {partyNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__custom__">+ Add New Party Name</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.partyName}
                  onChange={(e) => setFormData({ ...formData, partyName: e.target.value })}
                  placeholder="Enter party name"
                  required
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 touch-manipulation"
                  style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomPartyName(false)
                    setFormData({ ...formData, partyName: '' })
                  }}
                  className="text-xs text-primary-600 active:text-primary-700 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ← Select from existing names
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Site Name *
            </label>
            {!showCustomSiteName ? (
              <div className="space-y-2">
                <select
                  value={formData.siteName}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setShowCustomSiteName(true)
                    } else {
                      setFormData({ ...formData, siteName: e.target.value })
                    }
                  }}
                  required={!showCustomSiteName}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 touch-manipulation active:bg-gray-50"
                  style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                >
                  <option value="">Select a site name</option>
                  {siteNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__custom__">+ Add New Site Name</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.siteName}
                  onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
                  placeholder="Enter site name"
                  required
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 touch-manipulation"
                  style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSiteName(false)
                    setFormData({ ...formData, siteName: '' })
                  }}
                  className="text-xs text-primary-600 active:text-primary-700 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ← Select from existing names
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Material *
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-2 border border-gray-300 rounded-lg bg-gray-50">
              {['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth'].map((materialOption) => {
                const currentMaterials = Array.isArray(formData.material) 
                  ? formData.material 
                  : formData.material ? [formData.material] : []
                const isChecked = currentMaterials.includes(materialOption)
                
                return (
                  <label key={materialOption} className="flex items-center space-x-1.5 cursor-pointer active:bg-gray-100 p-1.5 rounded transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      className="custom-checkbox"
                      onChange={(e) => {
                        let newMaterials: string[]
                        if (Array.isArray(formData.material)) {
                          newMaterials = [...formData.material]
                        } else if (formData.material) {
                          newMaterials = [formData.material]
                        } else {
                          newMaterials = []
                        }
                        
                        if (e.target.checked) {
                          if (!newMaterials.includes(materialOption)) {
                            newMaterials.push(materialOption)
                          }
                        } else {
                          newMaterials = newMaterials.filter(m => m !== materialOption)
                        }
                        
                        setFormData({ ...formData, material: newMaterials })
                        if (errors.material) {
                          setErrors({})
                        }
                      }}
                    />
                    <span className="text-xs text-gray-700">{materialOption}</span>
                  </label>
                )
              })}
            </div>
            {errors.material && (
              <p className="mt-1 text-xs text-red-600">{errors.material}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Weight *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.weight || ''}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                required
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Rate *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.rate || ''}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                required
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          <div className="bg-gray-50 p-2 rounded-lg">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Total:</span>
              <span className="font-semibold text-sm">{formatIndianCurrency(total)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Truck Owner *
            </label>
            {!showCustomTruckOwner ? (
              <div className="space-y-2">
                <select
                  value={formData.truckOwner}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setShowCustomTruckOwner(true)
                    } else {
                      setFormData({ ...formData, truckOwner: e.target.value })
                    }
                  }}
                  required={!showCustomTruckOwner}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                >
                  <option value="">Select a truck owner</option>
                  {truckOwners.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                  <option value="__custom__">+ Add New Truck Owner</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.truckOwner}
                  onChange={(e) => setFormData({ ...formData, truckOwner: e.target.value })}
                  placeholder="Enter truck owner name"
                  required
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTruckOwner(false)
                    setFormData({ ...formData, truckOwner: '' })
                  }}
                  className="text-xs text-primary-600 active:text-primary-700 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ← Select from existing owners
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Truck No *
            </label>
            <input
              type="text"
              value={formData.truckNo}
              onChange={(e) => setFormData({ ...formData, truckNo: e.target.value })}
              placeholder="Enter truck number"
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Supplier *
            </label>
            {!showCustomSupplier ? (
              <div className="space-y-2">
                <select
                  value={formData.supplier}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setShowCustomSupplier(true)
                    } else {
                      setFormData({ ...formData, supplier: e.target.value })
                    }
                  }}
                  required={!showCustomSupplier}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                >
                  <option value="">Select a supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                  <option value="__custom__">+ Add New Supplier</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Enter supplier name"
                  required
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ fontSize: '16px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSupplier(false)
                    setFormData({ ...formData, supplier: '' })
                  }}
                  className="text-xs text-primary-600 active:text-primary-700 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ← Select from existing suppliers
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Original Weight *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.originalWeight || ''}
                onChange={(e) => setFormData({ ...formData, originalWeight: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                required
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 ${
                  formData.originalWeight > formData.weight && formData.weight > 0
                    ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 bg-gray-50 focus:ring-primary-500 focus:border-transparent'
                }`}
                style={{ fontSize: '16px' }}
              />
              {formData.originalWeight > formData.weight && formData.weight > 0 && (
                <p className="mt-1 text-[11px] text-red-600 font-medium">
                  ⚠️ Original weight is greater than selling weight!
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Original Rate *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.originalRate || ''}
                onChange={(e) => setFormData({ ...formData, originalRate: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                required
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 ${
                  formData.originalRate > formData.rate && formData.rate > 0
                    ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 bg-gray-50 focus:ring-primary-500 focus:border-transparent'
                }`}
                style={{ fontSize: '16px' }}
              />
              {formData.originalRate > formData.rate && formData.rate > 0 && (
                <p className="mt-1 text-[11px] text-red-600 font-medium">
                  ⚠️ Original rate is greater than selling rate!
                </p>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-2 rounded-lg">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Original Total:</span>
              <span className="font-semibold text-sm">{formatIndianCurrency(originalTotal)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Additional Cost
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.additionalCost}
              onChange={(e) => setFormData({ ...formData, additionalCost: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="bg-gray-50 p-2 rounded-lg">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Profit:</span>
              <span className={`font-semibold text-sm ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatIndianCurrency(profit)}
              </span>
            </div>
          </div>

          {/* Partial Payments Section */}
          <div className="border-t border-gray-200 pt-3 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">
                Raw Material Payments
              </label>
              <div className="text-xs text-gray-500">
                Paid: {formatIndianCurrency(totalPaid)} / {formatIndianCurrency(originalTotal)}
              </div>
            </div>
            
            {/* Existing Payments */}
            {formData.partialPayments.length > 0 && (
              <div className="space-y-2 mb-3">
                {formData.partialPayments.map((payment, index) => (
                  <div key={payment.id} className="bg-gray-50 p-2 rounded-lg border border-gray-200">
                    {editingPaymentIndex === index ? (
                      <div className="space-y-2">
                        <input
                          type="number"
                          step="0.01"
                          value={newPayment.amount}
                          onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                          placeholder="Amount"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <input
                          type="text"
                          value={newPayment.note}
                          onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })}
                          placeholder="Note (optional)"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(index)}
                            className="flex-1 px-2 py-1.5 text-xs bg-primary-600 text-white rounded active:bg-primary-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditPayment}
                            className="flex-1 px-2 py-1.5 text-xs bg-gray-200 text-gray-700 rounded active:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900">
                              {formatIndianCurrency(payment.amount)}
                            </span>
                          </div>
                          {payment.note && (
                            <p className="text-xs text-gray-600 mt-1">{payment.note}</p>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => handleStartEditPayment(index)}
                            className="p-1.5 text-gray-600 hover:text-primary-600 active:text-primary-700 rounded"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(index)}
                            className="p-1.5 text-gray-600 hover:text-red-600 active:text-red-700 rounded"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add New Payment */}
            {editingPaymentIndex === null && (
              <div className="space-y-2 border border-gray-200 rounded-lg p-2 bg-white">
                <input
                  type="number"
                  step="0.01"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  placeholder="Amount"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={newPayment.note}
                  onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })}
                  placeholder="Note (optional)"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={handleAddPayment}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg active:bg-primary-700 transition-colors"
                >
                  <Plus size={14} />
                  Add Payment
                </button>
              </div>
            )}

            {errors.payments && (
              <p className="mt-1 text-xs text-red-600">{errors.payments}</p>
            )}

            {remainingAmount > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                Remaining: <span className="font-semibold">{formatIndianCurrency(remainingAmount)}</span>
              </p>
            )}
          </div>
        </form>
        
        {/* Fixed buttons at bottom */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg text-sm font-semibold active:bg-gray-200 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (formRef.current) {
                  formRef.current.requestSubmit()
                }
              }}
              disabled={saving}
              className="flex-1 bg-primary-600 text-white px-4 py-3 rounded-lg text-sm font-semibold active:bg-primary-700 transition-colors disabled:opacity-50 touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )

  // Use portal to render at document body level
  if (typeof window === 'undefined') return null
  return createPortal(formContent, document.body)
}
