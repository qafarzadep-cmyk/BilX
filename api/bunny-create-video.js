import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Creates a video object in the Bunny Stream library and returns a short-lived,
// presigned TUS upload so the browser can push the file bytes DIRECTLY to Bunny.
// The Bunny API key never leaves the server, and the file never passes through
// this function (serverless bodies are capped at ~4.5 MB — far below a lesson).

const BUNNY_API_BASE = 'https://video.bunnycdn.com'

function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Only an approved instructor (or the admin) may create Bunny videos — otherwise
// anyone with a login could spawn uploads and run up the bill.
async function resolveInstructor(admin, token) {
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  const user = data.user

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
  if (adminEmail && user.email?.toLowerCase() === adminEmail) return user

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profile?.role === 'instructor') return user

  const { data: application } = await admin
    .from('teacher_applications')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .limit(1)
  if ((application || []).length > 0) return user

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.BUNNY_API_KEY
  const libraryId = process.env.BUNNY_LIBRARY_ID
  if (!apiKey || !libraryId) {
    res.status(500).json({ error: 'Bunny is not configured (BUNNY_API_KEY / BUNNY_LIBRARY_ID).' })
    return
  }

  const admin = getAdminClient()
  if (!admin) {
    res.status(500).json({ error: 'Supabase service role is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const user = await resolveInstructor(admin, token)
  if (!user) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const title = `${req.body?.title || 'Untitled lesson'}`.slice(0, 200)

  try {
    // 1. Create the video object in Bunny → returns its GUID.
    const createRes = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos`, {
      method: 'POST',
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ title }),
    })

    if (!createRes.ok) {
      const detail = await createRes.text()
      res.status(502).json({ error: `Bunny create failed: ${detail.slice(0, 300)}` })
      return
    }

    const created = await createRes.json()
    const videoId = created.guid
    if (!videoId) {
      res.status(502).json({ error: 'Bunny did not return a video id.' })
      return
    }

    // 2. Presign the TUS upload. Signature = SHA256(libraryId + apiKey + expire + videoId).
    //    Valid for two hours — plenty for a single upload.
    const expire = Date.now() + 2 * 60 * 60 * 1000
    const signature = crypto
      .createHash('sha256')
      .update(`${libraryId}${apiKey}${expire}${videoId}`)
      .digest('hex')

    res.status(200).json({ videoId, libraryId: String(libraryId), signature, expire })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
