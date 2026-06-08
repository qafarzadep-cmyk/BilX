import { createClient } from '@supabase/supabase-js'

const BUNNY_API_BASE = 'https://video.bunnycdn.com'

function getConfig() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const config = getConfig()
  if (!config) {
    res.status(500).json({ error: 'Course deletion is not configured.' })
    return
  }

  const courseId = Number(req.body?.courseId)
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(400).json({ error: 'Invalid course id.' })
    return
  }

  const requester = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: authData, error: authError } = await requester.auth.getUser(token)
  const user = authData?.user
  if (authError || !user) {
    res.status(401).json({ error: 'Your login session could not be verified.' })
    return
  }

  const { data: deletion, error: deletionError } = await requester
    .rpc('delete_course_authorized', { p_course_id: courseId })
  if (deletionError) {
    const status = deletionError.message?.includes('cannot delete') ? 403 : 500
    res.status(status).json({ error: deletionError.message })
    return
  }

  const bunnyApiKey = process.env.BUNNY_API_KEY
  const bunnyLibraryId = process.env.BUNNY_LIBRARY_ID
  const bunnyVideoIds = Array.isArray(deletion?.videoIds) ? deletion.videoIds.filter(Boolean) : []
  let cleanupFailures = []

  if (bunnyApiKey && bunnyLibraryId) {
    const cleanupResults = await Promise.all(bunnyVideoIds.map(async (videoId) => {
      try {
        const response = await fetch(
          `${BUNNY_API_BASE}/library/${bunnyLibraryId}/videos/${encodeURIComponent(videoId)}`,
          { method: 'DELETE', headers: { AccessKey: bunnyApiKey } }
        )
        return response.ok || response.status === 404 ? null : videoId
      } catch {
        return videoId
      }
    }))
    cleanupFailures = cleanupResults.filter(Boolean)
  } else if (bunnyVideoIds.length > 0) {
    cleanupFailures = bunnyVideoIds
  }

  res.status(200).json({
    deleted: true,
    cleanupWarning: cleanupFailures.length > 0,
  })
}
