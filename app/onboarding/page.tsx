'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceService } from '@/lib/workspaceService'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { Loader2, Building2, Mail, Phone, ArrowRight } from 'lucide-react'

export default function OnboardingPage() {
    const { user, workspaces, loading: authLoading } = useAuth()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [companyName, setCompanyName] = useState('')
    const [contactInfo, setContactInfo] = useState('')
    const [isEmailLogin, setIsEmailLogin] = useState(false)

    useEffect(() => {
        if (authLoading) return

        if (!user) {
            router.replace('/login')
            return
        }

        if (workspaces.length > 0) {
            router.replace('/account')
            return
        }

        // Determine missing info based on login method
        // If email is present, we need phone. If phone is present, we need email.
        if (user.email) {
            setIsEmailLogin(true)
        } else {
            setIsEmailLogin(false)
        }
    }, [user, workspaces, authLoading, router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!companyName.trim()) {
            setError('Please enter your company name')
            return
        }
        if (!contactInfo.trim()) {
            setError(`Please enter your ${isEmailLogin ? 'phone number' : 'email address'}`)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const db = getDb()
            if (!db || !user) throw new Error('System not ready')

            // 1. Update User Profile in Firestore
            const userDocRef = doc(db, 'users', user.uid)

            // Check if doc exists first to merge properly
            const userSnap = await getDoc(userDocRef)
            const updateData: any = {
                updatedAt: new Date().toISOString()
            }

            if (isEmailLogin) {
                // Logged in with email, saving phone
                updateData.phoneNumber = contactInfo.trim()
                // Ensure email is also saved if not present
                if (!userSnap.exists() || !userSnap.data().email) {
                    updateData.email = user.email
                }
            } else {
                // Logged in with phone, saving email
                updateData.email = contactInfo.trim()
                // Ensure phone is also saved if not present
                if (!userSnap.exists() || !userSnap.data().phoneNumber) {
                    updateData.phoneNumber = user.phoneNumber
                }
            }

            await setDoc(userDocRef, updateData, { merge: true })

            // 2. Create Workspace
            // If logged in via phone, user.email is null, so we must use the collected email
            const ownerEmail = isEmailLogin ? user.email : contactInfo.trim()

            await workspaceService.createWorkspace(companyName, {
                uid: user.uid,
                email: ownerEmail
            })

            // 3. Force reload or redirect
            // AuthContext should pick up the new workspace on next fetch, or we can force a reload
            // Since AuthContext doesn't expose a 'refresh' method, forcing a page reload is safest 
            // to ensure all contexts (Context, LocalStorage, etc.) are in sync.
            window.location.href = '/account'

        } catch (err: any) {
            console.error(err)
            setError(err?.message || 'Failed to complete setup. Please try again.')
            setLoading(false)
        }
    }

    if (authLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="animate-spin text-primary-600" size={32} />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
                <div className="text-center space-y-2">
                    <div className="bg-primary-50 w-12 h-12 rounded-xl flex items-center justify-center mx-auto text-primary-600 mb-4">
                        <Building2 size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome to Royal Suppliers</h1>
                    <p className="text-gray-500">Let&apos;s set up your workspace to get started</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="e.g. Acme Corp"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                autoFocus
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {isEmailLogin ? 'Phone Number' : 'Email Address'}
                        </label>
                        <div className="relative">
                            {isEmailLogin ? (
                                <Phone className="absolute left-3 top-3 text-gray-400" size={20} />
                            ) : (
                                <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                            )}
                            <input
                                type={isEmailLogin ? 'tel' : 'email'}
                                placeholder={isEmailLogin ? '+91 98765 43210' : 'you@company.com'}
                                value={contactInfo}
                                onChange={(e) => {
                                    let val = e.target.value
                                    if (isEmailLogin && /^\d/.test(val) && !val.startsWith('+')) {
                                        val = '+91' + val
                                    }
                                    setContactInfo(val)
                                }}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                disabled={loading}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {isEmailLogin
                                ? "We'll use this for urgent notifications."
                                : "We'll use this for account recovery and notifications."}
                        </p>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-70 mt-4"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : (
                            <>
                                Create Workspace <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
