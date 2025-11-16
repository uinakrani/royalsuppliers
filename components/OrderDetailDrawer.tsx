'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Edit, Trash2 } from 'lucide-react'
import { Order } from '@/types/order'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { format } from 'date-fns'

interface OrderDetailDrawerProps {
  order: Order | null
  isOpen: boolean
  onClose: () => void
  onEdit: (order: Order) => void
  onDelete: (id: string) => void
}

export default function OrderDetailDrawer({ order, isOpen, onClose, onEdit, onDelete }: OrderDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setIsClosing(false)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 250)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  if (!isOpen || !order) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black z-[90] ${
          isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter'
        }`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[100] overflow-y-auto max-h-[90vh] ${
          isClosing ? 'animate-drawer-exit' : 'animate-drawer-enter'
        }`}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center z-10 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Order Details</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pb-6 space-y-4">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Date</span>
              <span className="text-sm font-semibold text-gray-900">
                {format(new Date(order.date), 'dd MMM yyyy')}
              </span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Party Name</span>
              <span className="text-sm font-semibold text-gray-900 text-right">{order.partyName}</span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Site Name</span>
              <span className="text-sm font-semibold text-gray-900 text-right">{order.siteName}</span>
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Material</span>
              <span className="text-sm font-semibold text-gray-900 text-right">
                {Array.isArray(order.material) ? order.material.join(', ') : order.material}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Order Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Weight</span>
                <span className="text-sm font-semibold text-gray-900">{order.weight.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Rate</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.rate)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Total</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Original Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Weight</span>
                <span className="text-sm font-semibold text-gray-900">{order.originalWeight.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Rate</span>
                <span className={`text-sm font-semibold ${
                  order.originalRate > order.rate && order.rate > 0 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {formatIndianCurrency(order.originalRate)}
                </span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Original Total</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.originalTotal)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Financial Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Additional Cost</span>
                <span className="text-sm font-semibold text-gray-900">{formatIndianCurrency(order.additionalCost)}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Profit</span>
                <span className={`text-sm font-semibold ${
                  order.profit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatIndianCurrency(order.profit)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Transport Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Truck Owner</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{order.truckOwner}</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Truck No</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{order.truckNo}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Invoiced</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  order.invoiced 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {order.invoiced ? 'Yes' : 'No'}
                </span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">Payment Status</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  order.paid 
                    ? 'bg-green-100 text-green-700' 
                    : order.paymentDue
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {order.paid ? 'Paid' : order.paymentDue ? 'Payment Due' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 flex gap-2">
            <button
              onClick={() => {
                handleClose()
                setTimeout(() => onEdit(order), 300)
              }}
              className="flex-1 bg-primary-600 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Edit size={18} />
              Edit Order
            </button>
            <button
              onClick={() => {
                handleClose()
                setTimeout(() => onDelete(order.id!), 300)
              }}
              className="flex-1 bg-red-600 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

