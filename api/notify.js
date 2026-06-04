import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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

function buildEmail({ type, payload }) {
  const subjectMap = {
    'inbox.new': 'Bil-X: Yeni inbox mesajı',
    'comment.new': 'Bil-X: Yeni şərh',
    'rating.new': 'Bil-X: Yeni reytinq',
  }

  const subject = subjectMap[type] || 'Bil-X bildirişi'
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!verifyRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { to, type, payload } = req.body || {}
  if (!to || !type) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  try {
    const email = buildEmail({ type, payload })
    await resend.emails.send({
      from: 'Bil-X <no-reply@bilx.org>',
      to,
      subject: email.subject,
      html: email.html,
    })
    res.status(200).json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
