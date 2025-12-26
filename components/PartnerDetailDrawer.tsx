'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Trash2, Edit2, Calendar, FileText, Banknote, X, ChevronRight } from 'lucide-react'
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
    onWithdrawalsChange
}: PartnerDetailDrawerProps) {
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
    const [loading, setLoading] = useState(true)

    // Modal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false)
    const [editingWithdrawal, setEditingWithdrawal] = useState<Withdrawal | null>(null)

    // Form State
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [note, setNote] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const drawerRef = useRef<HTMLDivElement>(null)

    // Load withdrawals when partner changes or drawer opens
    useEffect(() => {
        if (isOpen && partner.id) {
            loadWithdrawals()
        }
    }, [isOpen, partner.id])

    const loadWithdrawals = async () => {
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
    }

    // Calculate stats
    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    const partnerShareAmount = totalProfit * (partner.percentage / 100)
    const netPayable = partnerShareAmount - totalWithdrawn

    const handleSaveWithdrawal = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !date) return

        setIsSaving(true)
        try {
            const withdrawalData: any = {
                partnerId: partner.id!,
                amount: parseFloat(amount),
                date,
                note
            }

            if (editingWithdrawal) {
                await partnerService.updateWithdrawal(editingWithdrawal.id!, withdrawalData)
            } else {
                await partnerService.addWithdrawal(withdrawalData)
            }

            // Notify parent to refresh
            if (onWithdrawalsChange) onWithdrawalsChange()

            closeModal()
            loadWithdrawals()
        } catch (error) {
            console.error(error)
            showToast('Failed to save withdrawal', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteWithdrawal = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this withdrawal?')) return
        try {
            await partnerService.deleteWithdrawal(id)
            // Notify parent to refresh
            if (onWithdrawalsChange) onWithdrawalsChange()
            loadWithdrawals()
        } catch (error) {
            showToast('Failed to delete withdrawal', 'error')
        }
    }

    const openAddModal = () => {
        setEditingWithdrawal(null)
        setAmount('')
        setDate(new Date().toISOString().split('T')[0])
        setNote('')
        setShowWithdrawModal(true)
    }

    const openEditModal = (w: Withdrawal) => {
        setEditingWithdrawal(w)
        setAmount(w.amount.toString())
        setDate(w.date)
        setNote(w.note || '')
        setShowWithdrawModal(true)
    }

    const closeModal = () => {
        setShowWithdrawModal(false)
        setEditingWithdrawal(null)
    }

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

                    {/* Main Action */}
                    <button
                        onClick={openAddModal}
                        className="w-full bg-primary-600 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-lg shadow-primary-500/30 active:scale-[0.98] transition-all"
                    >
                        <Plus size={20} />
                        Record New Withdrawal
                    </button>

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
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => openEditModal(w)}
                                                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteWithdrawal(w.id!)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
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

                {/* Withdrawal Modal (Nested) */}
                {showWithdrawModal && (
                    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
                        <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-xl animate-in slide-in-from-bottom duration-200">
                            <div className="flex justify-between items-center mb-5">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editingWithdrawal ? 'Edit Withdrawal' : 'New Withdrawal'}
                                </h3>
                                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                                    <Plus size={24} className="rotate-45" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveWithdrawal} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-500 font-serif">₹</span>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            step="0.01"
                                            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-7 pr-3 py-2.5 text-lg font-semibold outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Note (Optional)</label>
                                    <textarea
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all resize-none"
                                        placeholder="e.g. Advance payment"
                                        rows={2}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 disabled:opacity-70 transition-all mt-2"
                                >
                                    {isSaving ? 'Saving...' : 'Confirm Withdrawal'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
