import { Resend } from 'resend'

const resendApiKey = import.meta.env.VITE_RESEND_API_KEY

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function sendWelcomeEmail({ name, email }) {
  if (!resendApiKey) {
    throw new Error('VITE_RESEND_API_KEY is missing.')
  }

  const firstName = escapeHtml(name || 'dost')
  const resend = new Resend(resendApiKey)

  return resend.emails.send({
    from: 'Bil-X <no-reply@bilx.org>',
    to: email,
    subject: `Bil-X-ə xoş gəldiniz, ${name || 'dost'}! 🎉`,
    html: `
      <!doctype html>
      <html lang="az">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Bil-X-ə xoş gəldiniz</title>
        </head>
        <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#171923;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e9f2;">
                  <tr>
                    <td style="padding:34px 34px 18px;">
                      <p style="margin:0 0 12px;font-size:15px;color:#6b7280;">Salam, ${firstName}!</p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#111827;">Bil-X-ə xoş gəldiniz! 🎉</h1>
                      <p style="margin:20px 0 0;font-size:16px;line-height:1.7;color:#374151;">
                        Hesabınız uğurla yaradıldı. İndi platformumuzda mövcud olan video kurslara baxa və öyrənməyə başlaya bilərsiniz.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 34px 12px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:14px;padding:18px;">
                        <tr>
                          <td style="font-size:16px;line-height:1.8;color:#1f2937;">
                            <div>📚 Peşəkar video kurslar</div>
                            <div>📱 İstənilən cihazdan əlçatan</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 34px 34px;">
                      <a href="https://bilx.org" style="display:inline-block;background:#863bff;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 24px;border-radius:12px;">
                        Kurslara bax →
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 34px;background:#111827;color:#d1d5db;font-size:13px;line-height:1.6;">
                      Hörmətlə, Bil-X komandası | <a href="https://bilx.org" style="color:#ffffff;text-decoration:none;">bilx.org</a>
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

export default sendWelcomeEmail
