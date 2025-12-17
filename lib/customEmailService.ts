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

    // Create the email content with visible link
    const mailOptions = {
      from: `"Royal Suppliers" <${EMAIL_CONFIG.auth.user}>`,
      to: email,
      subject: 'Your Magic Link - Royal Suppliers',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Magic Link - Royal Suppliers</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; }
            .header { text-align: center; margin-bottom: 30px; }
            .magic-link { background-color: #f0f8f0; border: 2px solid #4CAF50; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .link-text { font-family: monospace; font-size: 14px; word-break: break-all; color: #2E7D32; font-weight: bold; }
            .instructions { margin: 20px 0; line-height: 1.6; }
            .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Royal Suppliers</h1>
              <p>Your magic link is ready!</p>
            </div>

            <div class="instructions">
              <p>Hello!</p>
              <p>Click the link below to sign in to your Royal Suppliers account:</p>
            </div>

            <div class="magic-link">
              <p><strong>🔗 Your Magic Link:</strong></p>
              <div class="link-text">${magicLink}</div>
              <p style="margin-top: 10px; font-size: 12px; color: #666;">
                Copy and paste this link into your browser, or click it directly.
              </p>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <a href="${magicLink}" class="button">Open Magic Link</a>
            </div>

            <div class="instructions">
              <p><strong>How to use:</strong></p>
              <ol>
                <li>Copy the link above</li>
                <li>Paste it in your browser</li>
                <li>You'll be signed in automatically</li>
              </ol>
            </div>

            <div class="footer">
              <p>If you didn't request this link, you can safely ignore this email.</p>
              <p>This link will expire in 1 hour for security reasons.</p>
              <p>Royal Suppliers - Secure Access</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Royal Suppliers - Your Magic Link

        Hello!

        Your magic link: ${magicLink}

        Copy and paste this link into your browser to sign in.

        If you didn't request this link, please ignore this email.

        This link will expire in 1 hour for security reasons.

        Royal Suppliers - Secure Access
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

// Function to generate the magic link URL
export function generateMagicLinkUrl(email: string, domain: string): string {
  const timestamp = Date.now()
  const sessionId = Math.random().toString(36).substring(2, 15)

  // Create a temporary link that can be validated
  const magicLink = `${domain}/auth/finish?email=${encodeURIComponent(email)}&timestamp=${timestamp}&session=${sessionId}&mode=magic`

  return magicLink
}