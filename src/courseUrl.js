const AZERBAIJANI_CHAR_MAP = {
  '\u0259': 'e',
  '\u011f': 'g',
  '\u0131': 'i',
  '\u00f6': 'o',
  '\u015f': 's',
  '\u00fc': 'u',
  '\u00e7': 'c',
}

const AZERBAIJANI_CHARS = /[\u0259\u011f\u0131\u00f6\u015f\u00fc\u00e7]/g

export function slugifyCourseTitle(title, fallback = 'course') {
  const slug = String(title || '')
    .toLowerCase()
    .replace(AZERBAIJANI_CHARS, (char) => AZERBAIJANI_CHAR_MAP[char] || char)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || fallback
}

export function getCourseUrl(course) {
  if (!course) return '/course'
  return `/course/${slugifyCourseTitle(course.title, `course-${course.id || ''}`)}`
}

export function isNumericCourseParam(value) {
  return /^\d+$/.test(String(value || '').trim())
}
