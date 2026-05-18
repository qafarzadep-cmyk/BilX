import { Resend } from 'resend'
import { appUrl } from './appUrl'

const resendApiKey = import.meta.env.VITE_RESEND_API_KEY

export async function sendPasswordResetEmail(email) {
  if (!resendApiKey) {
    throw new Error('VITE_RESEND_API_KEY is missing.')
  }

  const resend = new Resend(resendApiKey)
  const resetUrl = appUrl('/reset-password')

  return resend.emails.send({
    from: 'Bil-X <no-reply@bilx.org>',
    to: email,
    subject: 'Bil-X - Şifrə Yeniləmə',
    html: `
      <!doctype html>
      <html lang="az">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Bil-X - Şifrə Yeniləmə</title>
        </head>
        <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#171923;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e9f2;">
                  <tr>
                    <td style="padding:34px;">
                      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Salam!</p>
                      <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151;">
                        Şifrənizi yeniləmək üçün aşağıdakı linkə klikləyin:
                      </p>
                      <a href="${resetUrl}" style="display:inline-block;background:#863bff;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 24px;border-radius:12px;">
                        Şifrəni Yenilə
                      </a>
                      <p style="margin:24px 0 0;font-size:16px;line-height:1.7;color:#374151;">
                        Bu linkin müddəti 1 saat ərzində bitir.
                      </p>
                      <p style="margin:24px 0 0;font-size:16px;line-height:1.7;color:#374151;">
                        Hörmətlə, Bil-X komandası
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  })
}

export default sendPasswordResetEmail
