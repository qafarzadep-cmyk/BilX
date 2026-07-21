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

  const studentId = String(req.query?.studentId || '').trim()
  if (studentId) {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'qafarzadep@gmail.com').toLowerCase()
    if (user.email?.toLowerCase() !== adminEmail) {
      res.status(403).json({ error: 'Admin access required.' })
      return
    }

    const { data: studentData, error: studentError } = await service.auth.admin.getUserById(studentId)
    const student = studentData?.user
    if (studentError || !student) {
      res.status(404).json({ error: 'Student not found.' })
      return
    }

    const studentEmail = String(student.email || '').toLowerCase()
    const studentKeys = [student.id, student.email, studentEmail].filter(Boolean)
    const [{ data: profile }, { data: enrollmentData }, { data: allRequestData }] = await Promise.all([
      service.from('profiles').select('user_id, full_name, role').eq('user_id', student.id).maybeSingle(),
      service.from('enrollments').select('*').in('user_id', studentKeys).eq('status', 'active').order('enrolled_at', { ascending: false }),
      service.from('requests').select('*').order('created_at', { ascending: false }),
    ])

    const enrollments = enrollmentData || []
    const requests = (allRequestData || []).filter((item) => (
      String(item.user_id || '') === student.id
      || String(item.user_email || '').toLowerCase() === studentEmail
    ))
    const courseIds = [...new Set(enrollments.map((item) => item.course_id).filter(Boolean))]
    const [{ data: courses }, { data: videos }] = courseIds.length
      ? await Promise.all([
          service.from('Courses').select('*').in('id', courseIds),
          service.from('videos').select('*').in('course_id', courseIds).order('order_index'),
        ])
      : [{ data: [] }, { data: [] }]
    const videoIds = (videos || []).map((item) => item.id)
    const { data: progress } = videoIds.length
      ? await service.from('video_progress').select('video_id, watched, position_seconds, last_opened_at, updated_at').eq('user_id', student.id).in('video_id', videoIds)
      : { data: [] }

    res.status(200).json({
      student: {
        id: student.id,
        email: student.email,
        fullName: profile?.full_name || student.user_metadata?.full_name || student.email,
        registeredAt: student.created_at,
        lastSignInAt: student.last_sign_in_at,
      },
      enrollments,
      requests,
      courses: courses || [],
      videos: videos || [],
      progress: progress || [],
    })
    return
  }

  const courseId = Number(req.query?.courseId)
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(400).json({ error: 'Invalid course id.' })
    return
  }

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
