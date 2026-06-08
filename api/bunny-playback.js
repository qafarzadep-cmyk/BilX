import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Mints a short-lived, token-authenticated Bunny embed URL for a lesson — but
// only after verifying the caller may watch it. Free preview lessons are open
// to anyone; every other lesson requires an authenticated, enrolled user (or the
// course's instructor, or the admin). With Bunny Token Authentication enabled on
// the library, the embed cannot be viewed without a URL signed here, so a shared
// link is useless once it expires.

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url, key }
}

function signEmbedUrl({ libraryId, videoId, tokenKey, expires }) {
  // Bunny embed token = SHA256(tokenAuthenticationKey + videoId + expires), hex.
  const token = crypto
    .createHash('sha256')
    .update(`${tokenKey}${videoId}${expires}`)
    .digest('hex')
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}&autoplay=true`
}

async function hasAccess(admin, user, video) {
  if (!user) return false

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
  if (adminEmail && user.email?.toLowerCase() === adminEmail) return true

  // The course's own instructor can always preview their lessons.
  const { data: course } = await admin
    .from('Courses')
    .select('instructor_id')
    .eq('id', video.course_id)
    .maybeSingle()
  if (course?.instructor_id && course.instructor_id === user.id) return true

  // Enrollment is keyed by the student's id OR email (see CoursePage/giveAccess).
  const keys = [user.id, user.email].filter(Boolean)
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('status')
    .eq('course_id', video.course_id)
    .in('user_id', keys)
  return (enrollments || []).some((row) => (row.status || 'active') === 'active')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const libraryId = process.env.BUNNY_LIBRARY_ID
  const tokenKey = process.env.BUNNY_TOKEN_AUTH_KEY
  if (!libraryId || !tokenKey) {
    res.status(500).json({ error: 'Bunny playback is not configured (BUNNY_LIBRARY_ID / BUNNY_TOKEN_AUTH_KEY).' })
    return
  }

  const supabaseConfig = getSupabaseConfig()
  if (!supabaseConfig) {
    res.status(500).json({ error: 'Supabase service role is not configured.' })
    return
  }
  const admin = createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const rowId = req.body?.videoId
  if (!rowId) {
    res.status(400).json({ error: 'Missing videoId' })
    return
  }

  // Look up the lesson with the service role (bypasses RLS) to learn its course,
  // Bunny id, and whether it's a free preview.
  const { data: video, error } = await admin
    .from('videos')
    .select('id, course_id, bunny_video_id, is_free')
    .eq('id', rowId)
    .maybeSingle()

  if (error || !video) {
    res.status(404).json({ error: 'Lesson not found' })
    return
  }
  if (!video.bunny_video_id) {
    res.status(409).json({ error: 'Lesson is not hosted on Bunny.' })
    return
  }

  const expires = Math.floor(Date.now() / 1000) + 3 * 60 * 60 // 3 hours

  // Free preview lessons play for anyone (logged in or not).
  if (video.is_free) {
    res.status(200).json({
      url: signEmbedUrl({ libraryId, videoId: video.bunny_video_id, tokenKey, expires }),
    })
    return
  }

  // Paid lessons require an authenticated, enrolled viewer.
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  let user = null
  if (token) {
    const authClient = createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await authClient.auth.getUser(token)
    user = data?.user || null
  }

  if (!(await hasAccess(admin, user, video))) {
    res.status(403).json({ error: 'No access to this lesson.' })
    return
  }

  res.status(200).json({
    url: signEmbedUrl({ libraryId, videoId: video.bunny_video_id, tokenKey, expires }),
  })
}
