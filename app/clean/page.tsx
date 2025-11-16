'use client'

import { useCallback, useMemo, useState } from 'react'
import { getDb } from '@/lib/firebase'
import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	writeBatch,
} from 'firebase/firestore'

const COLLECTIONS = ['orders', 'invoices', 'ledgerEntries', 'partyPayments'] as const

type CollectionId = typeof COLLECTIONS[number]

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = []
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size))
	}
	return chunks
}

export default function CleanDatabasePage() {
	const [confirmText, setConfirmText] = useState('')
	const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
	const [log, setLog] = useState<string[]>([])
	const [progressByCollection, setProgressByCollection] = useState<Record<CollectionId, { total: number; deleted: number }>>({
		orders: { total: 0, deleted: 0 },
		invoices: { total: 0, deleted: 0 },
		ledgerEntries: { total: 0, deleted: 0 },
		partyPayments: { total: 0, deleted: 0 },
	})
	const [errorMessage, setErrorMessage] = useState<string>('')

	const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''

	const canRun = useMemo(() => {
		return confirmText.trim().toUpperCase() === 'DELETE' && Boolean(projectId)
	}, [confirmText, projectId])

	const appendLog = useCallback((line: string) => {
		setLog((prev) => [...prev, line])
	}, [])

	const deleteCollection = useCallback(async (name: CollectionId) => {
		const db = getDb()
		if (!db) {
			throw new Error('Firebase is not initialized on client. Check env variables.')
		}

		appendLog(`Listing documents in ${name}...`)
		const snapshot = await getDocs(collection(db, name))
		const docs = snapshot.docs
		setProgressByCollection((prev) => ({
			...prev,
			[name]: { total: docs.length, deleted: 0 },
		}))

		if (docs.length === 0) {
			appendLog(`No documents found in ${name}.`)
			return
		}

		const chunks = chunkArray(docs, 400) // stay under 500 writes per batch
		let deleted = 0
		for (let i = 0; i < chunks.length; i++) {
			const batch = writeBatch(db)
			for (const d of chunks[i]) {
				batch.delete(doc(db, name, d.id))
			}
			await batch.commit()
			deleted += chunks[i].length
			setProgressByCollection((prev) => ({
				...prev,
				[name]: { total: docs.length, deleted },
			}))
			appendLog(`Deleted ${deleted}/${docs.length} from ${name}...`)
		}

		appendLog(`Finished deleting ${docs.length} documents from ${name}.`)
	}, [appendLog])

	const runCleanup = useCallback(async () => {
		setStatus('running')
		setLog([])
		setErrorMessage('')

		try {
			if (!projectId) {
				throw new Error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID')
			}

			appendLog(`Project: ${projectId}`)
			appendLog('Starting database cleanup...')

			for (const c of COLLECTIONS) {
				await deleteCollection(c)
			}

			appendLog('All specified collections have been cleaned.')
			setStatus('done')
		} catch (e: any) {
			console.error(e)
			setErrorMessage(e?.message || 'Unknown error')
			appendLog(`Error: ${e?.message || 'Unknown error'}`)
			setStatus('error')
		}
	}, [appendLog, deleteCollection, projectId])

	const disabled = status === 'running' || !canRun

	return (
		<div className="max-w-2xl mx-auto p-4">
			<h1 className="text-2xl font-bold mb-4">Danger Zone: Clean Database</h1>
			<p className="mb-2 text-red-600 font-semibold">This will permanently delete all data in the following collections:</p>
			<ul className="list-disc list-inside mb-4">
				{COLLECTIONS.map((c) => (
					<li key={c} className="text-red-600">{c}</li>
				))}
			</ul>
			<p className="mb-4 text-sm text-gray-600">
				Make sure you are on the correct Firebase project. Current project id: <span className="font-mono">{projectId || '(not set)'}</span>
			</p>

			<label className="block mb-2 font-medium">Type DELETE to confirm:</label>
			<input
				type="text"
				className="border rounded px-3 py-2 w-full mb-4"
				placeholder="DELETE"
				value={confirmText}
				onChange={(e) => setConfirmText(e.target.value)}
			/>

			<button
				onClick={runCleanup}
				disabled={disabled}
				className={`px-4 py-2 rounded text-white ${disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
			>
				{status === 'running' ? 'Cleaning...' : 'Clean Database'}
			</button>

			<div className="mt-6 space-y-3">
				{COLLECTIONS.map((c) => {
					const p = progressByCollection[c]
					return (
						<div key={c}>
							<div className="flex justify-between text-sm">
								<span className="font-medium">{c}</span>
								<span>{p.deleted} / {p.total}</span>
							</div>
							<div className="h-2 bg-gray-200 rounded">
								<div
									className="h-2 bg-red-600 rounded"
									style={{ width: p.total ? `${(p.deleted / p.total) * 100}%` : '0%' }}
								/>
							</div>
						</div>
					)
				})}
			</div>

			{errorMessage && (
				<div className="mt-4 p-3 border border-red-300 bg-red-50 text-red-700 rounded">
					<strong>Error:</strong> {errorMessage}
				</div>
			)}

			<div className="mt-6">
				<label className="block mb-2 font-medium">Activity Log</label>
				<div className="border rounded p-3 h-48 overflow-auto bg-gray-50 text-sm font-mono whitespace-pre-wrap">
					{log.length === 0 ? 'No activity yet.' : log.join('\n')}
				</div>
			</div>
		</div>
	)
}


