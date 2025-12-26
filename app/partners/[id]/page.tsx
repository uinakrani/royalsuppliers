'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Edit2, Calendar, FileText, Banknote, TrendingUp, AlertCircle } from 'lucide-react'
import NavBar from '@/components/NavBar'
import AuthGate from '@/components/AuthGate'
import { useAuth } from '@/contexts/AuthContext'
import { partnerService } from '@/lib/partnerService'
import { Partner, Withdrawal } from '@/types/partner'
import { formatIndianCurrency } from '@/lib/currencyUtils'
import { showToast } from '@/components/Toast'
import { format } from 'date-fns'
import { orderService } from '@/lib/orderService'
import { ledgerService } from '@/lib/ledgerService'
import { calculatePartyEffectiveProfit } from '@/lib/statsService'

export default function PartnerDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const { activeWorkspaceId } = useAuth()
    const partnerId = params.id as string

    const [partner, setPartner] = useState<Partner | null>(null)
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
    const [loading, setLoading] = useState(true)

    // Stats
    const [totalProfitShare, setTotalProfitShare] = useState(0)
    const [totalWithdrawn, setTotalWithdrawn] = useState(0)

    // Modal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false)
    const [editingWithdrawal, setEditingWithdrawal] = useState<Withdrawal | null>(null)

    // Form State
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [note, setNote] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // --- Logic duplication from Dashboard for "Realized Cash Profit" ---
    // Ideally this should be a hook or service method
    const calculateProfitShare = useCallback(async () => {
        try {
            const [allOrders, allLedgerEntries] = await Promise.all([
                orderService.getAllOrders(),
                ledgerService.list()
            ])

            // Calculate Total Profit using Party Page Logic (Effective Profit)
            // Consistent with Dashboard
            const totalProfit = calculatePartyEffectiveProfit(allOrders, allLedgerEntries)

            setTotalProfitShare(totalProfit)

        } catch (error) {
            console.error('Error calculating profit share:', error)
        }
    }, [setTotalProfitShare])

    const loadData = useCallback(async () => {
        try {
            const partners = await partnerService.getPartners(activeWorkspaceId!)
            const currentPartner = partners.find(p => p.id === partnerId)
            if (currentPartner) {
                setPartner(currentPartner)
                const withdrawalsData = await partnerService.getWithdrawals(partnerId)
                setWithdrawals(withdrawalsData)

                // Calculate total withdrawn
                const withdrawnSum = withdrawalsData.reduce((sum, w) => sum + w.amount, 0)
                setTotalWithdrawn(withdrawnSum)
            } else {
                showToast('Partner not found', 'error')
                router.push('/account')
            }
        } catch (error) {
            console.error(error)
            showToast('Failed to load partner data', 'error')
        } finally {
            setLoading(false)
        }
    }, [activeWorkspaceId, partnerId, setPartner, setWithdrawals, setTotalWithdrawn, router, setLoading])

    useEffect(() => {
        if (activeWorkspaceId && partnerId) {
            // Create wrapper function inside effect to handle async calls
            const init = async () => {
                await loadData()
                await calculateProfitShare()
            }
            init()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeWorkspaceId, partnerId, loadData, calculateProfitShare])

    const handleSaveWithdrawal = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !date) return

        setIsSaving(true)
        try {
            const withdrawalData: any = {
                partnerId,
                amount: parseFloat(amount),
                date,
                note
            }

            if (editingWithdrawal) {
                await partnerService.updateWithdrawal(editingWithdrawal.id!, withdrawalData)
                showToast('Withdrawal updated', 'success')
            } else {
                await partnerService.addWithdrawal(withdrawalData)
                showToast('Withdrawal recorded', 'success')
            }

            closeModal()
            loadData() // Refresh withdrawals list
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
            showToast('Withdrawal deleted', 'success')
            loadData()
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

    const partnerShareAmount = partner ? totalProfitShare * (partner.percentage / 100) : 0
    const netPayable = partnerShareAmount - totalWithdrawn

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
        )
    }

    if (!partner) return null

    return (
        <AuthGate>
            <div className="flex min-h-screen flex-col bg-gray-50">
                {/* Header */}
                <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 pt-safe">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft size={20} className="text-gray-600" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-lg font-bold text-gray-900 leading-tight">{partner.name}</h1>
                            <p className="text-xs text-gray-500">{partner.percentage}% Profit Share</p>
                        </div>
                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-1 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm hover:bg-primary-700 transition-colors"
                        >
                            <Plus size={16} />
                            Withdraw
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
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

                        <div className="divide-y divide-gray-100">
                            {withdrawals.length > 0 ? (
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
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </main>

                <NavBar />

                {/* Withdrawal Modal */}
                {showWithdrawModal && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
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
        </AuthGate>
    )
}
