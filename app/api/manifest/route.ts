
import { NextRequest, NextResponse } from 'next/server'
import { doc, getDoc } from 'firebase/firestore'
import { getServerDb } from '@/lib/firebaseServer'

export const dynamic = 'force-dynamic' // Ensure this doesn't get statically cached

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    // Default fallback values
    let workspaceName = searchParams.get('name') || 'Royal Suppliers'
    const defaultIconUrl = '/icon-192x192.png'
    let iconUrl = searchParams.get('iconUrl') || defaultIconUrl

    // 1. Try to fetch fresh data from Firestore if we have a workspaceId
    if (workspaceId && workspaceId !== 'default' && workspaceId !== 'undefined') {
        try {
            const db = getServerDb()
            if (db) {
                const wsRef = doc(db, 'workspaces', workspaceId)
                const snap = await getDoc(wsRef)

                if (snap.exists()) {
                    const data = snap.data()
                    // Update name if available
                    if (data.name) {
                        workspaceName = data.name
                    }
                    // Update icon if available
                    if (data.iconUrl) {
                        iconUrl = data.iconUrl
                    }
                }
            }
        } catch (error) {
            console.error('Manifest Error: Failed to fetch workspace data:', error)
            // Fallback to params is already set
        }
    }

    // 2. Validate Icon URL (Fallback logic)
    // If the fetched iconUrl is empty or null, revert to default
    if (!iconUrl || iconUrl.trim() === '') {
        iconUrl = defaultIconUrl
    }

    // Construct the manifest
    const manifest = {
        name: workspaceName,
        short_name: workspaceName,
        description: 'Order and invoice management system',
        // We keep the query params in start_url so the app still opens in the right workspace context
        start_url: `/?workspaceId=${workspaceId || ''}`,
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#2e31fb',
        // Unique ID ensures multiple installs if supported
        id: `/?workspaceId=${workspaceId || 'default'}`,
        icons: [
            {
                src: iconUrl,
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
            },
            {
                src: iconUrl,
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
            }
        ],
        shortcuts: [
            {
                name: "Orders",
                short_name: "Orders",
                description: "View Orders",
                url: `/orders?workspaceId=${workspaceId || ''}`,
                icons: [{ src: defaultIconUrl, sizes: "192x192" }]
            }
        ]
    }

    return NextResponse.json(manifest, {
        headers: {
            'Cache-Control': 'public, max-age=0, must-revalidate',
            'Content-Type': 'application/manifest+json',
        },
    })
}
