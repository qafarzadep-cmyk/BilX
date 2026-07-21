import { createClient } from '@supabase/supabase-js'

const LEGACY_A1_SUMMARY = { ratingTotal: 178.6, ratingCount: 38 }

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  return url && serviceKey && anonKey ? { url, serviceKey, anonKey } : null
}

function summarize(rows, courseId) {
  const ratings = (rows || []).filter((row) => String(row.course_id) === String(courseId))
  const legacy = String(courseId) === '17' ? LEGACY_A1_SUMMARY : { ratingTotal: 0, ratingCount: 0 }
  const ratingTotal = ratings.reduce((sum, row) => sum + Number(row.rating || 0), legacy.ratingTotal)
  const ratingCount = ratings.length + legacy.ratingCount
  return {
    average: ratingCount ? Math.round((ratingTotal / ratingCount) * 10) / 10 : null,
    count: ratingCount,
  }
}

export default async function handler(req, res) {
  const config = getConfig()
  if (!config) return res.status(500).json({ error: 'Reviews are not configured.' })
  const service = createClient(config.url, config.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  if (req.method === 'GET') {
    const requestedIds = String(req.query?.courseIds || req.query?.courseId || '')
      .split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    if (!requestedIds.length) return res.status(400).json({ error: 'Invalid course id.' })

    const { data, error } = await service.from('course_ratings').select('id,user_id,course_id,rating,review,created_at').in('course_id', requestedIds).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    const rows = data || []
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]
    const { data: profiles } = userIds.length
      ? await service.from('profiles').select('user_id,full_name').in('user_id', userIds)
      : { data: [] }
    const names = new Map((profiles || []).map((item) => [String(item.user_id), item.full_name]))
    const summaries = Object.fromEntries(requestedIds.map((courseId) => [String(courseId), summarize(rows, courseId)]))
    const reviews = rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      rating: row.rating,
      review: row.review,
      createdAt: row.created_at,
      author: names.get(String(row.user_id)) || 'BilX tələbəsi',
    }))
    return res.status(200).json({ summaries, reviews })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const authClient = createClient(config.url, config.anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData } = await authClient.auth.getUser(token)
  const user = userData?.user
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const courseId = Number(req.body?.courseId)
  const rating = Number(req.body?.rating)
  const review = String(req.body?.review || '').trim().slice(0, 2000)
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid review.' })
  }
  const keys = [user.id, user.email, user.email?.toLowerCase()].filter(Boolean)
  const { data: enrollment } = await service.from('enrollments').select('id').eq('course_id', courseId).in('user_id', keys).eq('status', 'active').limit(1).maybeSingle()
  if (!enrollment) return res.status(403).json({ error: 'Only enrolled students can review this course.' })
  const { error } = await service.from('course_ratings').upsert({ user_id: user.id, course_id: courseId, rating, review }, { onConflict: 'user_id,course_id' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
