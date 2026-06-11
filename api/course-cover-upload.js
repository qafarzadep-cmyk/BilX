import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return null
  return { url, anonKey, serviceKey }
}

function getExtension(fileName = '') {
  const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return extension && extension.length <= 5 ? extension : 'jpg'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const config = getConfig()
  if (!config) {
    res.status(500).json({ error: 'Course cover uploads are not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Please sign in again.' })
    return
  }

  const authClient = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData?.user
  if (authError || !user) {
    res.status(401).json({ error: 'Your login session could not be verified.' })
    return
  }

  const courseId = Number(req.body?.courseId)
  const fileName = String(req.body?.fileName || '')
  if (!Number.isFinite(courseId) || courseId <= 0) {
    res.status(400).json({ error: 'Invalid course.' })
    return
  }

  const service = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: course, error: courseError } = await service
    .from('Courses')
    .select('id, instructor_id, status, is_published')
    .eq('id', courseId)
    .maybeSingle()

  if (courseError || !course) {
    res.status(404).json({ error: 'Course not found.' })
    return
  }
  if (course.instructor_id !== user.id) {
    res.status(403).json({ error: 'You cannot edit this course.' })
    return
  }
  if (course.status === 'approved' || course.is_published) {
    res.status(409).json({ error: 'Approved courses cannot be edited.' })
    return
  }

  const extension = getExtension(fileName)
  const path = `${user.id}/course-${course.id}-${Date.now()}.${extension}`
  const { data: upload, error: uploadError } = await service.storage
    .from('thumbnails')
    .createSignedUploadUrl(path)

  if (uploadError || !upload?.token) {
    res.status(500).json({ error: uploadError?.message || 'Could not prepare the cover upload.' })
    return
  }

  const publicUrl = service.storage.from('thumbnails').getPublicUrl(path).data.publicUrl
  res.status(200).json({ path, token: upload.token, publicUrl })
}
