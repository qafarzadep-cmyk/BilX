import { createClient } from '@supabase/supabase-js'

const BUNNY_API_BASE = 'https://video.bunnycdn.com'

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  const parts = hours > 0 ? [hours, minutes, remainder] : [minutes, remainder]
  return parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join(':')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const bunnyApiKey = process.env.BUNNY_API_KEY
  const bunnyLibraryId = process.env.BUNNY_LIBRARY_ID
  if (!supabaseUrl || !anonKey || !bunnyApiKey || !bunnyLibraryId) {
    res.status(500).json({ error: 'Video duration service is not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const videoId = Number(req.body?.videoId)
  if (!token || !Number.isInteger(videoId) || videoId <= 0) {
    res.status(400).json({ error: 'Missing authentication or video id.' })
    return
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData?.user) {
    res.status(401).json({ error: 'Your login session could not be verified.' })
    return
  }

  const { data: video, error: videoError } = await client
    .from('videos')
    .select('id, course_id, bunny_video_id')
    .eq('id', videoId)
    .maybeSingle()
  if (videoError || !video?.bunny_video_id) {
    res.status(404).json({ error: 'Bunny lesson not found.' })
    return
  }

  const { data: course } = await client
    .from('Courses')
    .select('instructor_id')
    .eq('id', video.course_id)
    .maybeSingle()
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
  const isAdmin = adminEmail && authData.user.email?.toLowerCase() === adminEmail
  if (course?.instructor_id !== authData.user.id && !isAdmin) {
    res.status(403).json({ error: 'Only the course instructor can sync lesson duration.' })
    return
  }

  const bunnyResponse = await fetch(
    `${BUNNY_API_BASE}/library/${bunnyLibraryId}/videos/${encodeURIComponent(video.bunny_video_id)}`,
    { headers: { AccessKey: bunnyApiKey, Accept: 'application/json' } }
  )
  if (!bunnyResponse.ok) {
    res.status(502).json({ error: 'Could not read video duration from Bunny.' })
    return
  }

  const bunnyVideo = await bunnyResponse.json()
  const duration = formatDuration(bunnyVideo.length)
  if (!duration || duration === '0:00') {
    res.status(409).json({ error: 'Video processing is not complete yet.' })
    return
  }

  const { error: updateError } = await client
    .from('videos')
    .update({ duration })
    .eq('id', video.id)
  if (updateError && !isAdmin) {
    res.status(500).json({ error: updateError.message })
    return
  }

  res.status(200).json({ duration })
}
