import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return null
  return { url, anonKey, serviceKey }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const config = getConfig()
  if (!config) {
    res.status(500).json({ error: 'Section reordering is not configured.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const courseId = Number(req.body?.courseId)
  const sectionIds = Array.isArray(req.body?.sectionIds)
    ? req.body.sectionIds.map(Number)
    : []

  if (!token) {
    res.status(401).json({ error: 'Please sign in again.' })
    return
  }
  if (!Number.isFinite(courseId) || courseId <= 0 || sectionIds.some((id) => !Number.isFinite(id))) {
    res.status(400).json({ error: 'Invalid section order.' })
    return
  }
  if (new Set(sectionIds).size !== sectionIds.length) {
    res.status(400).json({ error: 'Duplicate sections are not allowed.' })
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

  const { data: sections, error: sectionsError } = await service
    .from('course_sections')
    .select('id, order_index')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })

  if (sectionsError) {
    res.status(500).json({ error: sectionsError.message })
    return
  }
  if (sections.length !== sectionIds.length || sections.some((section) => !sectionIds.includes(Number(section.id)))) {
    res.status(409).json({ error: 'The section list changed. Refresh and try again.' })
    return
  }

  const originalOrder = sections.map((section) => Number(section.id))
  try {
    for (let index = 0; index < sectionIds.length; index += 1) {
      const { error } = await service
        .from('course_sections')
        .update({ order_index: -100000 - index })
        .eq('id', sectionIds[index])
        .eq('course_id', courseId)
      if (error) throw error
    }

    for (let index = 0; index < sectionIds.length; index += 1) {
      const { error } = await service
        .from('course_sections')
        .update({ order_index: index + 1 })
        .eq('id', sectionIds[index])
        .eq('course_id', courseId)
      if (error) throw error
    }
  } catch (error) {
    for (let index = 0; index < originalOrder.length; index += 1) {
      await service
        .from('course_sections')
        .update({ order_index: -200000 - index })
        .eq('id', originalOrder[index])
        .eq('course_id', courseId)
    }
    for (let index = 0; index < originalOrder.length; index += 1) {
      await service
        .from('course_sections')
        .update({ order_index: index + 1 })
        .eq('id', originalOrder[index])
        .eq('course_id', courseId)
    }
    res.status(500).json({ error: error.message || 'Could not reorder sections.' })
    return
  }

  res.status(200).json({ sectionIds })
}
