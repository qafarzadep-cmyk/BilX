import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return null
  return { url, serviceKey, anonKey }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const config = getConfig()
  if (!config) return res.status(500).json({ error: 'Server configuration is missing.' })

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const studentId = String(req.query?.id || '').trim()
  if (!token || !studentId) return res.status(400).json({ error: 'Missing authorization or student id.' })

  const authClient = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: adminData } = await authClient.auth.getUser(token)
  const adminEmail = String(process.env.ADMIN_EMAIL || 'qafarzadep@gmail.com').toLowerCase()
  if (!adminData?.user || adminData.user.email?.toLowerCase() !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required.' })
  }

  const service = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: studentData, error: studentError } = await service.auth.admin.getUserById(studentId)
  const student = studentData?.user
  if (studentError || !student) return res.status(404).json({ error: 'Student not found.' })

  const studentEmail = String(student.email || '').toLowerCase()
  const studentKeys = [student.id, student.email, studentEmail].filter(Boolean)
  const [{ data: profile }, { data: enrollmentData }, { data: requestData }] = await Promise.all([
    service.from('profiles').select('user_id, full_name, role').eq('user_id', student.id).maybeSingle(),
    service.from('enrollments').select('*').in('user_id', studentKeys).eq('status', 'active').order('enrolled_at', { ascending: false }),
    service.from('requests').select('*').or(`user_id.eq.${student.id},user_email.ilike.${studentEmail}`).order('created_at', { ascending: false }),
  ])

  const enrollments = enrollmentData || []
  const courseIds = [...new Set(enrollments.map((item) => item.course_id).filter(Boolean))]
  const [{ data: courses }, { data: videos }] = courseIds.length
    ? await Promise.all([
        service.from('Courses').select('id, title, slug, instructor_id, instructor_name').in('id', courseIds),
        service.from('videos').select('id, course_id, title').in('course_id', courseIds).order('order_index'),
      ])
    : [{ data: [] }, { data: [] }]
  const videoIds = (videos || []).map((item) => item.id)
  const { data: progress } = videoIds.length
    ? await service.from('video_progress').select('video_id, watched, position_seconds, last_opened_at, updated_at').eq('user_id', student.id).in('video_id', videoIds)
    : { data: [] }

  return res.status(200).json({
    student: {
      id: student.id,
      email: student.email,
      fullName: profile?.full_name || student.user_metadata?.full_name || student.email,
      registeredAt: student.created_at,
      lastSignInAt: student.last_sign_in_at,
    },
    enrollments,
    requests: requestData || [],
    courses: courses || [],
    videos: videos || [],
    progress: progress || [],
  })
}
