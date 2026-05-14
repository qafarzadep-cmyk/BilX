import { supabase } from './supabase'

export function getCourseAuthorName(course) {
  return course?.instructor_name || course?.profiles?.full_name || ''
}

export async function attachCourseAuthorNames(courses) {
  const nextCourses = courses || []
  const instructorIds = [...new Set(nextCourses.map((course) => course.instructor_id).filter(Boolean))]

  if (instructorIds.length === 0) return nextCourses

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', instructorIds)

  if (error) {
    console.error('Could not load course authors:', error)
    return nextCourses
  }

  const namesById = new Map((data || []).map((item) => [item.user_id, item.full_name]))
  return nextCourses.map((course) => ({
    ...course,
    instructor_name: namesById.get(course.instructor_id) || course.instructor_name || '',
  }))
}
