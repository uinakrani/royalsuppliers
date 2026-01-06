import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
    const cookieStore = cookies()
    const workspaceName = cookieStore.get('activeWorkspaceName')?.value
        ? decodeURIComponent(cookieStore.get('activeWorkspaceName')?.value || '')
        : 'Royal Suppliers'

    // Parse size if needed, default to 512x512
    const { searchParams } = new URL(request.url)
    const sizeParam = searchParams.get('size')
    const size = sizeParam === '192p' ? 192 : 512

    // Create initials or use full name if it fits
    const words = workspaceName.trim().split(/\s+/)
    let text = ''
    if (words.length === 1) {
        text = words[0].substring(0, 2).toUpperCase()
    } else {
        text = (words[0][0] + words[1][0]).toUpperCase()
    }

    // If user really wants the full name, we can try to fit it, but for an icon, Initials are standard.
    // The user request was "icon to be the name". I'll try to put the full name if it's short, else initials.
    // Actually, let's just make it look good.

    const fontSize = size / 3

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#2e31fb',
                    color: 'white',
                    borderRadius: sizeParam === '192p' ? '0px' : '0px', // Maskable icons usually should be square, the OS crops them.
                }}
            >
                <div style={{
                    fontSize: `${fontSize}px`,
                    fontWeight: 'bold',
                    display: 'flex',
                    textAlign: 'center',
                    padding: '20px',
                    lineHeight: 1.2
                }}>
                    {workspaceName}
                </div>
            </div>
        ),
        {
            width: size,
            height: size,
        }
    )
}
