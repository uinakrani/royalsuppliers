'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const { user, login, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/account')
    }
  }, [loading, user, router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary-50 text-primary-600">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sign in to Royal Suppliers</h1>
            <p className="text-gray-500 text-sm">Access your workspaces securely</p>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
          <div className="font-semibold">What to expect after login</div>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Choose your company workspace</li>
            <li>Stay signed in until you log out</li>
            <li>Manage your profile image and invitations</li>
          </ul>
        </div>

        <button
          onClick={() => login().catch(console.error)}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold shadow-lg shadow-primary-200 hover:bg-primary-700 transition-colors"
        >
          <LogIn size={20} />
          Login with Google
        </button>
      </div>
    </div>
  )
}

