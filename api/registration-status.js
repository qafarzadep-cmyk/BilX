import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return { url, serviceKey }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const config = getConfig()
  if (!config) return res.status(500).json({ error: 'Registration check is not configured.' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email || email.length > 254 || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' })
  }

  const service = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let page = 1
  let confirmed = false
  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return res.status(500).json({ error: 'Could not check registration.' })

    const users = data?.users || []
    const user = users.find((item) => String(item.email || '').toLowerCase() === email)
    if (user) {
      confirmed = Boolean(user.email_confirmed_at || user.confirmed_at)
      break
    }
    if (users.length < 1000) break
    page += 1
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(200).json({ confirmed })
}
