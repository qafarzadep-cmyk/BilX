export const A1_COURSE_ID = '17'
export const A1_COURSE_TITLE = 'Addım-addım ingiliscə (A1 səviyyəsi)'
export const A1_LEGACY_SLUG = 'sifirdan-ingilisce-danisiq-kursu-a1-level'

const A1_LEGACY_TITLE = 'Sıfırdan İngiliscə Danışıq kursu (A1 Level)'

export function normalizeSavedCourseText(value) {
  return typeof value === 'string' ? value.replaceAll(A1_LEGACY_TITLE, A1_COURSE_TITLE) : value
}
