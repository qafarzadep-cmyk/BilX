import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return null
  return { url, serviceKey, anonKey }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const courseId = Number(req.query?.courseId)
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(400).json({ error: 'Invalid course id.' })
    return
  }

  const config = getConfig()
  if (!config) {
    res.status(500).json({ error: 'Course access check is not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const authClient = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const service = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: course } = await service
    .from('Courses')
    .select('id, instructor_id')
    .eq('id', courseId)
    .maybeSingle()

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
  const isAdmin = Boolean(adminEmail && user.email?.toLowerCase() === adminEmail)
  const isOwner = Boolean(course?.instructor_id && course.instructor_id === user.id)
  const keys = [user.id, user.email, user.email?.toLowerCase()].filter(Boolean).map((item) => String(item).toLowerCase())

  const { data: enrollments, error } = await service
    .from('enrollments')
    .select('id, user_id, status')
    .eq('course_id', courseId)

  if (error) {
    res.status(500).json({ error: 'Could not check course access.' })
    return
  }

  const isEnrolled = (enrollments || []).some((row) => (
    keys.includes(String(row.user_id || '').toLowerCase()) && (row.status || 'active') === 'active'
  ))
  res.status(200).json({
    access: Boolean(isAdmin || isOwner || isEnrolled),
    isEnrolled,
    isOwner,
    isAdmin,
  })
}
