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
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

function signEmbedUrl({ libraryId, videoId, tokenKey, expires, autoplay = true, muted = false }) {
  // Bunny embed token = SHA256(tokenAuthenticationKey + videoId + expires), hex.
  const token = crypto
    .createHash('sha256')
    .update(`${tokenKey}${videoId}${expires}`)
    .digest('hex')
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}&autoplay=${autoplay ? 'true' : 'false'}&muted=${muted ? 'true' : 'false'}`
}

async function hasAccess(client, user, video) {
  if (!user) return false

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
  if (adminEmail && user.email?.toLowerCase() === adminEmail) return true

  // The course's own instructor can always preview their lessons.
  const { data: course } = await client
    .from('Courses')
    .select('instructor_id')
    .eq('id', video.course_id)
    .maybeSingle()
  if (course?.instructor_id && course.instructor_id === user.id) return true

  // Enrollment is keyed by the student's id OR email (see CoursePage/giveAccess).
  const keys = [user.id, user.email, user.email?.toLowerCase()].filter(Boolean)
  const { data: enrollments } = await client
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
    res.status(500).json({ error: 'Supabase playback access is not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const client = createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  })

  let user = null
  if (token) {
    const { data, error: authError } = await client.auth.getUser(token)
    if (authError) {
      res.status(401).json({ error: 'Your login session could not be verified.' })
      return
    }
    user = data?.user || null
  }

  const rowId = req.body?.videoId
  const trailerCourseId = req.body?.trailerCourseId
  const autoplay = req.body?.autoplay !== false
  const muted = req.body?.muted === true
  if (!rowId && !trailerCourseId) {
    res.status(400).json({ error: 'Missing videoId or trailerCourseId' })
    return
  }

  if (trailerCourseId) {
    const { data: trailer, error: trailerError } = await client
      .from('course_trailers')
      .select('course_id, bunny_video_id')
      .eq('course_id', trailerCourseId)
      .maybeSingle()

    if (trailerError || !trailer?.bunny_video_id) {
      res.status(404).json({ error: 'Course preview not found' })
      return
    }

    const expires = Math.floor(Date.now() / 1000) + 3 * 60 * 60
    res.status(200).json({
      url: signEmbedUrl({ libraryId, videoId: trailer.bunny_video_id, tokenKey, expires, autoplay, muted }),
    })
    return
  }

  // RLS allows this row only for a free preview, the course owner/admin, or an
  // enrolled student. The Bunny GUID never needs to be exposed publicly.
  const { data: video, error } = await client
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
      url: signEmbedUrl({ libraryId, videoId: video.bunny_video_id, tokenKey, expires, autoplay, muted }),
    })
    return
  }

  // Paid lessons require an authenticated owner/admin or enrolled viewer.
  if (!(await hasAccess(client, user, video))) {
    res.status(403).json({ error: 'No access to this lesson.' })
    return
  }

  res.status(200).json({
    url: signEmbedUrl({ libraryId, videoId: video.bunny_video_id, tokenKey, expires, autoplay, muted }),
  })
}
