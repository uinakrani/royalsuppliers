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
            .link-container { position: relative; background-color: #e8f5e8; border: 1px solid #4CAF50; padding: 15px; border-radius: 6px; margin: 10px 0; }
            .link-text { font-family: 'Courier New', monospace; font-size: 13px; word-break: break-all; color: #1b5e20; font-weight: bold; line-height: 1.4; }
            .copy-button { position: absolute; top: 10px; right: 10px; background-color: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
            .instructions { margin: 20px 0; line-height: 1.6; }
            .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            .copy-instructions { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 15px 0; }
          </style>
          <script>
            function copyToClipboard(text) {
              var button = document.getElementById('copyBtn');
              try {
                navigator.clipboard.writeText(text).then(function() {
                  if (button) {
                    button.innerHTML = '✅ Copied!';
                    button.style.backgroundColor = '#2E7D32';
                    setTimeout(function() {
                      button.innerHTML = '📋 Copy Magic Link';
                      button.style.backgroundColor = '#4CAF50';
                    }, 2000);
                  }
                }).catch(function(err) {
                  // Fallback for older browsers
                  var textArea = document.createElement("textarea");
                  textArea.value = text;
                  document.body.appendChild(textArea);
                  textArea.focus();
                  textArea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textArea);
                  if (button) {
                    button.innerHTML = '✅ Copied!';
                    button.style.backgroundColor = '#2E7D32';
                    setTimeout(function() {
                      button.innerHTML = '📋 Copy Magic Link';
                      button.style.backgroundColor = '#4CAF50';
                    }, 2000);
                  }
                });
              } catch (err) {
                if (button) {
                  button.innerHTML = '❌ Copy Failed - Select Link Manually';
                  button.style.backgroundColor = '#f44336';
                  setTimeout(function() {
                    button.innerHTML = '📋 Copy Magic Link';
                    button.style.backgroundColor = '#4CAF50';
                  }, 3000);
                }
              }
            }
          </script>
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

              <!-- Prominent Copy Button First -->
              <div style="text-align: center; margin: 20px 0;">
                <button onclick="copyToClipboard('${magicLink.replace(/'/g, "\\'")}')" id="copyBtn" class="copy-button" style="background-color: #4CAF50; color: white; border: none; padding: 15px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);">
                  📋 Copy Magic Link
                </button>
              </div>

              <!-- Link Text Below -->
              <div class="link-container" style="background-color: #f5f5f5; border: 1px solid #ddd; padding: 15px; border-radius: 6px; margin: 10px 0;">
                <div class="link-text" style="font-family: 'Courier New', monospace; font-size: 13px; word-break: break-all; color: #333; font-weight: bold; line-height: 1.4;">${magicLink}</div>
              </div>

              <p style="margin-top: 15px; font-size: 12px; color: #666; text-align: center;">
                <strong>Click the button above to copy</strong>, or select the link text below and copy it manually (Ctrl+C / Cmd+C)
              </p>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <a href="${magicLink}" class="button">🔗 Open Magic Link</a>
            </div>

            <div class="copy-instructions">
              <p><strong>📋 How to Copy the Link:</strong></p>
              <ol>
                <li><strong>Click and drag</strong> to select the entire link text above</li>
                <li><strong>Press Ctrl+C</strong> (Windows/Linux) or <strong>Cmd+C</strong> (Mac) to copy</li>
                <li><strong>Paste</strong> (Ctrl+V / Cmd+V) into your browser address bar</li>
                <li>You'll be signed in automatically!</li>
              </ol>
              <p style="margin-top: 10px; color: #856404;"><strong>💡 Tip:</strong> The link is already selected when you open this email. Just press Ctrl+C / Cmd+C to copy it!</p>
            </div>

            <div class="instructions">
              <p><strong>Alternative method:</strong></p>
              <ol>
                <li>Click the "🔗 Open Magic Link" button above</li>
                <li>You'll be taken directly to sign in</li>
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
        ============================================
        ROYAL SUPPLIERS - YOUR MAGIC LINK
        ============================================

        Hello!

        📋 CLICK THE GREEN "Copy Magic Link" BUTTON ABOVE (in HTML email)
        or copy this link manually:

        ${magicLink}

        ============================================

        HOW TO SIGN IN:
        1. Click the "📋 Copy Magic Link" button (if you see it)
        2. Or copy the link above (select all, Ctrl+C / Cmd+C)
        3. Paste it in your browser (Ctrl+V / Cmd+V)
        4. You'll be signed in automatically!

        ALTERNATIVE: Click the "🔗 Open Magic Link" button in the HTML version.

        ============================================

        SECURITY NOTE:
        - This link will expire in 1 hour
        - If you didn't request this, please ignore
        - Never share this link with anyone

        Royal Suppliers - Secure Access
        ============================================
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

// Function to generate a Firebase-compatible magic link URL
export function generateMagicLinkUrl(email: string, domain: string): string {
  // Get Firebase config
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''
  }

  // Generate a mock oobCode (Firebase will validate this)
  const mockOobCode = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  const timestamp = Date.now()

  // Create a Firebase-compatible link
  const magicLink = `${domain}/auth/finish?apiKey=${firebaseConfig.apiKey}&mode=signIn&oobCode=${mockOobCode}&email=${encodeURIComponent(email)}&timestamp=${timestamp}`

  return magicLink
}