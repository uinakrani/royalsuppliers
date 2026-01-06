'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function WorkspaceManifestUpdater() {
    const { activeWorkspaceId, workspaces } = useAuth()
    const currentLink = useRef<HTMLLinkElement | null>(null)

    useEffect(() => {
        // Find or create the manifest link
        let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement
        if (!link) {
            link = document.createElement('link')
            link.rel = 'manifest'
            document.head.appendChild(link)
        }
        currentLink.current = link

        const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

        // Construct the new manifest URL
        // We pass iconUrl as a param if available so the server doesn't need to fetch db
        const workspaceName = activeWorkspace?.name || 'Royal Suppliers'
        const iconUrl = activeWorkspace?.iconUrl ? encodeURIComponent(activeWorkspace.iconUrl) : ''

        const newHref = `/api/manifest?workspaceId=${activeWorkspaceId || ''}&name=${encodeURIComponent(workspaceName)}&iconUrl=${iconUrl}`

        // Update the href
        link.href = newHref

        console.log('Updated manifest to:', newHref)

    }, [activeWorkspaceId, workspaces])

    return null
}
