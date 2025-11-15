'use client'

import { useState, useEffect } from 'react'
import { Order } from '@/types/order'
import { X } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { orderService } from '@/lib/orderService'

interface OrderFormProps {
  order?: Order | null
  onClose: () => void
  onSave: (order: Omit<Order, 'id'>) => Promise<void>
}

export default function OrderForm({ order, onClose, onSave }: OrderFormProps) {
  const [formData, setFormData] = useState({
    date: order?.date || new Date().toISOString().split('T')[0],
    partyName: order?.partyName || '',
    siteName: order?.siteName || '',
    material: Array.isArray(order?.material) ? order.material : (order?.material ? [order.material] : []),
    weight: order?.weight || 0,
    rate: order?.rate || 0,
    truckOwner: order?.truckOwner || '',
    truckNo: order?.truckNo || '',
    originalWeight: order?.originalWeight || 0,
    originalRate: order?.originalRate || 0,
    additionalCost: order?.additionalCost || 0,
    paymentDue: order?.paymentDue ?? true,
    paid: order?.paid || false,
  })

  const [saving, setSaving] = useState(false)
  const [partyNames, setPartyNames] = useState<string[]>([])
  const [showCustomPartyName, setShowCustomPartyName] = useState(false)

  useEffect(() => {
    loadPartyNames()
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
        originalWeight: order.originalWeight || 0,
        originalRate: order.originalRate || 0,
        additionalCost: order.additionalCost || 0,
        paymentDue: order.paymentDue ?? true,
        paid: order.paid || false,
      })
      // Check if party name exists in the list
      if (order.partyName && partyNames.length > 0 && !partyNames.includes(order.partyName)) {
        setShowCustomPartyName(true)
      }
    }
  }, [order, partyNames])

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

  const calculateFields = () => {
    const total = formData.weight * formData.rate
    const originalTotal = formData.originalWeight * formData.originalRate
    const profit = total - (originalTotal + formData.additionalCost)

    return { total, originalTotal, profit }
  }

  const { total, originalTotal, profit } = calculateFields()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate material selection
    const materials = Array.isArray(formData.material) ? formData.material : (formData.material ? [formData.material] : [])
    if (materials.length === 0) {
      showToast('Please select at least one material', 'error')
      return
    }
    
    setSaving(true)

    try {
      const orderData: Omit<Order, 'id'> = {
        ...formData,
        material: materials, // Store as array
        total,
        originalTotal,
        profit,
        date: formData.date,
      }
      console.log('Attempting to save order:', orderData)
      await onSave(orderData)
      console.log('Order saved successfully')
      // Reset saving state - parent will close the form
      setSaving(false)
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
      
      showToast(`Failed to save order: ${errorMessage}`, 'error')
      setSaving(false) // Reset saving state on error so user can try again
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
      <div className="bg-white w-full max-h-[90vh] rounded-t-2xl overflow-y-auto shadow-lg">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {order ? 'Edit Order' : 'Add New Order'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomPartyName(false)
                    setFormData({ ...formData, partyName: '' })
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  ← Select from existing names
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site Name *
            </label>
            <input
              type="text"
              value={formData.siteName}
              onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Material *
            </label>
            <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
              {['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth'].map((materialOption) => {
                const currentMaterials = Array.isArray(formData.material) 
                  ? formData.material 
                  : formData.material ? [formData.material] : []
                const isChecked = currentMaterials.includes(materialOption)
                
                return (
                  <label key={materialOption} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={isChecked}
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
                      }}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{materialOption}</span>
                  </label>
                )
              })}
            </div>
            {(Array.isArray(formData.material) && formData.material.length === 0) && (
              <p className="mt-1 text-xs text-red-600">Please select at least one material</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rate *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Total:</span>
              <span className="font-semibold">₹{total.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Truck Owner *
            </label>
            <input
              type="text"
              value={formData.truckOwner}
              onChange={(e) => setFormData({ ...formData, truckOwner: e.target.value })}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Truck No *
            </label>
            <input
              type="text"
              value={formData.truckNo}
              onChange={(e) => setFormData({ ...formData, truckNo: e.target.value })}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Original Weight *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.originalWeight}
                onChange={(e) => setFormData({ ...formData, originalWeight: parseFloat(e.target.value) || 0 })}
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Original Rate *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.originalRate}
                onChange={(e) => setFormData({ ...formData, originalRate: parseFloat(e.target.value) || 0 })}
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 ${
                  formData.originalRate > formData.rate && formData.rate > 0
                    ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {formData.originalRate > formData.rate && formData.rate > 0 && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  ⚠️ Original rate is greater than selling rate!
                </p>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Original Total:</span>
              <span className="font-semibold">₹{originalTotal.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Cost
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.additionalCost}
              onChange={(e) => setFormData({ ...formData, additionalCost: parseFloat(e.target.value) || 0 })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Profit:</span>
              <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{profit.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="paymentDue"
              checked={formData.paymentDue}
              onChange={(e) => setFormData({ ...formData, paymentDue: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="paymentDue" className="text-sm text-gray-700">
              Payment Due
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="paid"
              checked={formData.paid}
              onChange={(e) => setFormData({ ...formData, paid: e.target.checked, paymentDue: !e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="paid" className="text-sm text-gray-700">
              Paid
            </label>
          </div>

          <div className="flex gap-2 pt-4 pb-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

