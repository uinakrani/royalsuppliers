import { NextRequest, NextResponse } from 'next/server'
import { sendMagicLinkEmail, generateMagicLinkUrl } from '@/lib/customEmailService'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Get the domain from the request
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const domain = `${protocol}://${host}`

    // Generate the magic link
    const magicLink = await generateMagicLinkUrl(email, domain)

    // Send the email
    const result = await sendMagicLinkEmail(email, magicLink, domain)

    console.log('Magic link email sent successfully:', result)

    return NextResponse.json({
      success: true,
      message: 'Magic link sent successfully',
      method: 'custom'
    })

  } catch (error: any) {
    console.error('Failed to send magic link:', error)

    // Return a more generic error message for security
    return NextResponse.json(
      { error: 'Failed to send email. Please try again later.' },
      { status: 500 }
    )
  }
}