'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

export default function FirebaseSetupAlert() {
  const [showAlert, setShowAlert] = useState(false)

  useEffect(() => {
    // Check if Firebase is configured
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

    if (!apiKey || !projectId || !appId) {
      setShowAlert(true)
    }
  }, [])

  if (!showAlert) return null

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 m-4 rounded">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-800 mb-1">
            Firebase Not Configured
          </h3>
          <p className="text-sm text-yellow-700 mb-2">
            To save orders, you need to set up Firebase. Create a <code className="bg-yellow-100 px-1 rounded">.env.local</code> file in the project root with your Firebase credentials.
          </p>
          <p className="text-xs text-yellow-600">
            See <code className="bg-yellow-100 px-1 rounded">QUICKSTART.md</code> for setup instructions.
          </p>
        </div>
        <button
          onClick={() => setShowAlert(false)}
          className="ml-2 text-yellow-600 hover:text-yellow-800"
        >
          ×
        </button>
      </div>
    </div>
  )
}

