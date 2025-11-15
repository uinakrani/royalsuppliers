'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, ExternalLink, X } from 'lucide-react'

export default function FirestoreRulesAlert() {
  const [showAlert, setShowAlert] = useState(false)

  useEffect(() => {
    // Listen for custom event to show alert
    const handleShowAlert = () => {
      setShowAlert(true)
    }

    window.addEventListener('show-firestore-rules-alert', handleShowAlert)

    return () => {
      window.removeEventListener('show-firestore-rules-alert', handleShowAlert)
    }
  }, [])

  if (!showAlert) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start mb-4">
          <AlertTriangle className="text-red-600 mr-3 flex-shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Firestore Security Rules Issue
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              Your orders are timing out because Firestore security rules are blocking writes.
            </p>
          </div>
          <button
            onClick={() => setShowAlert(false)}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-yellow-900 mb-2">Quick Fix:</h4>
          <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
            <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a></li>
            <li>Select project: <code className="bg-yellow-100 px-1 rounded">orders-38fca</code></li>
            <li>Click <strong>Firestore Database</strong> → <strong>Rules</strong></li>
            <li>Paste this code:</li>
          </ol>
          <pre className="mt-2 p-2 bg-yellow-100 rounded text-xs overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{document=**} {
      allow read, write: if true;
    }
  }
}`}
          </pre>
          <p className="text-xs text-yellow-700 mt-2">
            <strong>5.</strong> Click <strong>"Publish"</strong> and wait for confirmation
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href="https://console.firebase.google.com/project/orders-38fca/firestore/rules"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg font-medium text-center flex items-center justify-center gap-2 hover:bg-primary-700"
          >
            <ExternalLink size={16} />
            Open Firebase Console
          </a>
          <button
            onClick={() => setShowAlert(false)}
            className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300"
          >
            I'll Fix It Later
          </button>
        </div>
      </div>
    </div>
  )
}

