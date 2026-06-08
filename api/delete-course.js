import { createClient } from '@supabase/supabase-js'

const BUNNY_API_BASE = 'https://video.bunnycdn.com'

function getConfig() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return { url, serviceKey }
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

  const admin = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const user = authData?.user
  if (authError || !user) {
    res.status(401).json({ error: 'Your login session could not be verified.' })
    return
  }

  const { data: course, error: courseError } = await admin
    .from('Courses')
    .select('id, instructor_id, is_published, status')
    .eq('id', courseId)
    .maybeSingle()
  if (courseError) {
    res.status(500).json({ error: courseError.message })
    return
  }
  if (!course) {
    res.status(404).json({ error: 'Course not found.' })
    return
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const requesterIsAdmin = adminEmail && user.email?.toLowerCase() === adminEmail
  const requesterOwnsDraft = (
    course.instructor_id === user.id
    && course.is_published !== true
    && course.status !== 'approved'
  )
  if (!requesterIsAdmin && !requesterOwnsDraft) {
    res.status(403).json({ error: 'You cannot delete this course.' })
    return
  }

  const { data: videos, error: videosError } = await admin
    .from('videos')
    .select('bunny_video_id')
    .eq('course_id', courseId)
  if (videosError) {
    res.status(500).json({ error: videosError.message })
    return
  }

  const bunnyApiKey = process.env.BUNNY_API_KEY
  const bunnyLibraryId = process.env.BUNNY_LIBRARY_ID
  const bunnyVideoIds = (videos || []).map((video) => video.bunny_video_id).filter(Boolean)
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

  const { data: deleted, error: deleteError } = await admin
    .from('Courses')
    .delete()
    .eq('id', courseId)
    .select('id')
    .maybeSingle()

  if (deleteError) {
    res.status(500).json({ error: deleteError.message })
    return
  }
  if (!deleted) {
    res.status(404).json({ error: 'Course was not deleted.' })
    return
  }

  res.status(200).json({
    deleted: true,
    cleanupWarning: cleanupFailures.length > 0,
  })
}
