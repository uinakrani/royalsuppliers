'use client'

import { useState } from 'react'
import { generateDummyOrders } from '@/lib/generateDummyOrders'
import { showToast } from '@/components/Toast'
import { sweetAlert } from '@/lib/sweetalert'
import NavBar from '@/components/NavBar'
import { Loader2 } from 'lucide-react'

export default function AdminPage() {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')

  const handleGenerateOrders = async () => {
    if (generating) return
    
    try {
      const confirmed = await sweetAlert.confirm({
        title: 'Generate Dummy Orders?',
        text: 'This will create multiple dummy orders with various party names, sites, and dates. Continue?',
        icon: 'question',
        confirmText: 'Generate',
        cancelText: 'Cancel'
      })
      if (!confirmed) return
    } catch (error: any) {
      if (error?.message && !error.message.includes('SweetAlert')) {
        showToast('Failed to show confirmation', 'error')
      }
      return
    }

    setGenerating(true)
    setProgress('Starting...')
    
    try {
      await generateDummyOrders()
      showToast('Dummy orders generated successfully!', 'success')
      setProgress('✅ Complete!')
    } catch (error: any) {
      console.error('Error generating orders:', error)
      showToast(`Failed to generate orders: ${error?.message || 'Unknown error'}`, 'error')
      setProgress('❌ Failed')
    } finally {
      setGenerating(false)
      setTimeout(() => setProgress(''), 3000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <NavBar />
      <div className="bg-primary-600 text-white p-4 sticky top-0 z-40">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-primary-100 text-sm mt-1">Generate dummy data</p>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Generate Dummy Orders</h2>
          <p className="text-gray-600 mb-4">
            This will create dummy orders with:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-6 space-y-1">
            <li>Different party names (ABC Construction, XYZ Builders, Premier Developers)</li>
            <li>Different sites for each party name</li>
            <li>Various materials</li>
            <li>Orders spread across the last 6 months</li>
            <li>Different payment statuses</li>
          </ul>
          
          <button
            onClick={handleGenerateOrders}
            disabled={generating}
            className="w-full bg-primary-600 text-white py-3 rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              'Generate Dummy Orders'
            )}
          </button>
          
          {progress && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-primary-600" />
              <p className="text-center text-sm text-gray-600">{progress}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

