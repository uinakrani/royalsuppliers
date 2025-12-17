// This file is only used server-side in API routes
import nodemailer from 'nodemailer'

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password',
  },
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG)
  }
  return transporter
}

export async function sendMagicLinkEmail(email: string, magicLink: string, domain: string) {
  try {
    const transporter = getTransporter()

    // Create the email content with very simple, clean link
    const mailOptions = {
      from: `"Royal Suppliers" <${EMAIL_CONFIG.auth.user}>`,
      to: email,
      subject: 'Your Login Link - Royal Suppliers',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login Link - Royal Suppliers</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #ffffff; }
            .container { max-width: 500px; margin: 0 auto; background-color: white; padding: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Royal Suppliers</h2>
            <p>Copy the link below to sign in:</p>

            <p>${magicLink}</p>

            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This link expires in 1 hour.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
        Royal Suppliers - Your Login Link

        Copy the link below to sign in:

        ${magicLink}

        This link expires in 1 hour.
      `
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Magic link email sent:', info.messageId)

    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Failed to send magic link email:', error)
    throw new Error('Failed to send email')
  }
}

// Function to generate a proper Firebase magic link URL
export async function generateMagicLinkUrl(email: string, domain: string): Promise<string> {
  // For now, let's use a simple approach that works with our custom auth
  // We'll generate a link that our auth/finish page can handle
  const timestamp = Date.now()
  const sessionId = Math.random().toString(36).substring(2, 15)

  // Create a custom magic link that bypasses Firebase validation
  const magicLink = `${domain}/auth/finish?mode=magic&email=${encodeURIComponent(email)}&timestamp=${timestamp}&session=${sessionId}`

  return magicLink
}