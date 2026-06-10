import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY

function verifyRequest(req) {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return false
  return req.headers['x-webhook-secret'] === secret
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!verifyRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!resendApiKey) {
    res.status(500).json({ error: 'RESEND_API_KEY is missing.' })
    return
  }

  const { to, resetUrl } = req.body || {}
  if (!to || !resetUrl) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'BilX <no-reply@bilx.org>',
      to,
      subject: 'BilX - Şifrə Yeniləmə',
      html: `
      <!doctype html>
      <html lang="az">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BilX - Şifrə Yeniləmə</title>
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
                        Hörmətlə, BilX komandası
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

    res.status(200).json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
