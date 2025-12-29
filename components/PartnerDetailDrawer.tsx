'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Calendar, FileText, Banknote, X } from 'lucide-react'
import { Partner, Withdrawal } from '@/types/partner'
import { partnerService } from '@/lib/partnerService'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { showToast } from '@/components/Toast'
import { format } from 'date-fns'

interface PartnerDetailDrawerProps {
    isOpen: boolean
    onClose: () => void
    partner: Partner
    totalProfit: number
    onWithdrawalsChange?: () => void
}

export default function PartnerDetailDrawer({
    isOpen,
    onClose,
    partner,
    totalProfit,
    onWithdrawalsChange,
}: PartnerDetailDrawerProps) {
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
    const [loading, setLoading] = useState(true)

    const drawerRef = useRef<HTMLDivElement>(null)

    const loadWithdrawals = useCallback(async () => {
        try {
            setLoading(true)
            const data = await partnerService.getWithdrawals(partner.id!)
            setWithdrawals(data)
        } catch (error) {
            console.error('Error loading withdrawals:', error)
            showToast('Failed to load withdrawals', 'error')
        } finally {
            setLoading(false)
        }
    }, [partner.id])

    // Load withdrawals when partner changes or drawer opens
    useEffect(() => {
        if (isOpen && partner.id) {
            loadWithdrawals()
        }
    }, [isOpen, partner.id, loadWithdrawals])

    // Calculate stats
    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    const partnerShareAmount = totalProfit * (partner.percentage / 100)
    const netPayable = partnerShareAmount - totalWithdrawn

    if (!isOpen) return null

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50 z-50 transition-opacity"
                onClick={onClose}
            />

            <div
                ref={drawerRef}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl w-[90%] max-w-lg max-h-[85vh] flex flex-col shadow-2xl transition-transform transform"
            >

                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{partner.name}</h2>
                        <p className="text-sm text-gray-500">{partner.percentage}% Profit Share</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-4 text-white shadow-lg">
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <Banknote size={18} />
                                <span className="text-xs font-medium uppercase tracking-wider">Net Payable</span>
                            </div>
                            <div className="text-3xl font-bold">{formatIndianCurrency(netPayable)}</div>
                            <p className="text-[11px] opacity-75 mt-1">Available to withdraw</p>
                        </div>

                        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Share</p>
                            <p className="text-lg font-bold text-green-600">{formatIndianCurrency(partnerShareAmount)}</p>
                        </div>

                        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Withdrawn</p>
                            <p className="text-lg font-bold text-red-600">{formatIndianCurrency(totalWithdrawn)}</p>
                        </div>
                    </div>

                    {/* Withdrawals List */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <FileText size={16} className="text-gray-500" />
                                Withdrawal History
                            </h3>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                Managed in Ledger
                            </span>
                        </div>

                        <div className="divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                            {loading ? (
                                <div className="p-8 flex justify-center">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                                </div>
                            ) : withdrawals.length > 0 ? (
                                withdrawals.map((w) => (
                                    <div key={w.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <p className="text-base font-bold text-gray-900">{formatIndianCurrency(w.amount)}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                        <Calendar size={10} />
                                                        {format(new Date(w.date), 'dd MMM yyyy')}
                                                    </span>
                                                    {w.note && (
                                                        <span className="text-xs text-gray-600 italic">&quot;{w.note}&quot;</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center text-gray-400 text-sm">
                                    <p>No withdrawals yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
