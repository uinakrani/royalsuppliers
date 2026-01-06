import { MetadataRoute } from 'next'
import { cookies } from 'next/headers'

export default function manifest(): MetadataRoute.Manifest {
    const cookieStore = cookies()
    const workspaceName = cookieStore.get('activeWorkspaceName')?.value
        ? decodeURIComponent(cookieStore.get('activeWorkspaceName')?.value || '')
        : 'Royal Suppliers'

    const shortName = workspaceName.length > 12 ? workspaceName.substring(0, 12) + '...' : workspaceName

    return {
        name: workspaceName,
        short_name: shortName,
        description: 'Order and invoice management system',
        start_url: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#2e31fb',
        icons: [
            {
                src: '/api/icon?size=192p',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable'
            },
            {
                src: '/api/icon',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
            }
        ],
    }
}
