import { createClient } from '@supabase/supabase-js'

function getConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url, key }
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
    res.status(200).json({ quizzes: [] })
    return
  }

  const service = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: course } = await service
    .from('Courses')
    .select('id')
    .eq('id', courseId)
    .eq('is_published', true)
    .maybeSingle()

  if (!course) {
    res.status(200).json({ quizzes: [] })
    return
  }

  const { data, error } = await service
    .from('course_quizzes')
    .select('id, course_id, section_id, title, questions, order_index')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })

  if (error) {
    res.status(500).json({ error: 'Could not load quiz previews.' })
    return
  }

  const quizzes = (data || []).map((quiz) => ({
    id: quiz.id,
    course_id: quiz.course_id,
    section_id: quiz.section_id,
    title: quiz.title,
    question_count: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
    order_index: quiz.order_index,
  }))

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ quizzes })
}
