import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY

function verifyRequest(req) {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return false
  return req.headers['x-webhook-secret'] === secret
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getTemplate(req) {
  try {
    const parsed = new URL(req.url, 'https://bilx.org')
    return parsed.searchParams.get('template') || ''
  } catch {
    return ''
  }
}

function buildWelcomeEmail({ name }) {
  const firstName = escapeHtml(name || 'dost')

  return {
    subject: `BilX-ə xoş gəldiniz, ${name || 'dost'}!`,
    html: `
      <!doctype html>
      <html lang="az">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BilX-ə xoş gəldiniz</title>
        </head>
        <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#171923;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e9f2;">
                  <tr>
                    <td style="padding:34px 34px 18px;">
                      <p style="margin:0 0 12px;font-size:15px;color:#6b7280;">Salam, ${firstName}!</p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#111827;">BilX-ə xoş gəldiniz!</h1>
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
                            <div>Peşəkar video kurslar</div>
                            <div>İstənilən cihazdan əlçatan</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 34px 34px;">
                      <a href="https://bilx.org" style="display:inline-block;background:#1435c3;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 24px;border-radius:12px;">
                        Kurslara bax
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 34px;background:#111827;color:#d1d5db;font-size:13px;line-height:1.6;">
                      Hörmətlə, BilX komandası | <a href="https://bilx.org" style="color:#ffffff;text-decoration:none;">bilx.org</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  }
}

function buildPasswordResetEmail({ resetUrl }) {
  return {
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
                      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1435c3;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 24px;border-radius:12px;">
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
  }
}

function buildNotificationEmail({ type, payload }) {
  const subjectMap = {
    'inbox.new': 'BilX: Yeni inbox mesajı',
    'comment.new': 'BilX: Yeni şərh',
    'rating.new': 'BilX: Yeni reytinq',
  }

  const subject = subjectMap[type] || 'BilX bildirişi'
  const message = payload?.message || 'Yeni bildiriş var.'

  return {
    subject,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111;">
        <h2>${escapeHtml(subject)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `,
  }
}

function buildEmail(template, body) {
  if (template === 'welcome') {
    if (!body?.to) return { error: 'Missing required fields' }
    return buildWelcomeEmail({ name: body.name })
  }

  if (template === 'password-reset') {
    if (!body?.to || !body?.resetUrl) return { error: 'Missing required fields' }
    return buildPasswordResetEmail({ resetUrl: body.resetUrl })
  }

  if (template === 'notify') {
    if (!body?.to || !body?.type) return { error: 'Missing required fields' }
    return buildNotificationEmail({ type: body.type, payload: body.payload })
  }

  return { error: 'Unknown email template' }
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

  const template = getTemplate(req)
  const email = buildEmail(template, req.body || {})
  if (email.error) {
    res.status(email.error === 'Unknown email template' ? 404 : 400).json({ error: email.error })
    return
  }

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'BilX <no-reply@bilx.org>',
      to: req.body.to,
      subject: email.subject,
      html: email.html,
    })
    res.status(200).json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
