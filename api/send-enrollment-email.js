import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeLink(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()

  if (!supabaseUrl || !supabaseAnonKey || !resendApiKey || !adminEmail) {
    res.status(500).json({ error: 'Email service is not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error: userError } = await client.auth.getUser(token)
  const user = data?.user
  if (userError || !user || user.email?.toLowerCase() !== adminEmail) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const { email, courseTitle, link } = req.body || {}
  if (!email || !courseTitle) {
    res.status(400).json({ error: 'Missing email or course title.' })
    return
  }

  const href = safeLink(link)
  const title = String(courseTitle)
  const subject = 'BilX: Kursa girişiniz açıldı 🎉'
  const message = `Təbriklər! Seçdiyiniz "${title}" kursuna tam girişiniz açıldı. İndi öyrənməyə başlaya bilərsiniz.`
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.5;">
      <h2>${escapeHtml(subject)}</h2>
      <p>${escapeHtml(message)}</p>
      ${href ? `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1435c3;color:#fff;text-decoration:none;font-weight:700;">Kursa keç</a></p>` : ''}
    </div>
  `

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'BilX <no-reply@bilx.org>',
      to: email,
      subject,
      html,
    })
    res.status(200).json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
