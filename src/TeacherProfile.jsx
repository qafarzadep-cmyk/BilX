import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from './Navbar'
import { getCourseAuthorName } from './courseAuthors'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function TeacherProfile({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [teacher, setTeacher] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadTeacher() {
      setLoading(true)

      const [{ data: profileData }, { data: courseData, error: courseError }] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name').eq('user_id', id).maybeSingle(),
        supabase
          .from('Courses')
          .select('*')
          .eq('instructor_id', id)
          .eq('is_published', true)
          .order('id', { ascending: false }),
      ])

      if (!mounted) return
      const publicCourses = courseError ? [] : courseData || []
      const fallbackName = publicCourses.map(getCourseAuthorName).find(Boolean) || t('instructorLabel')
      setTeacher(profileData || { user_id: id, full_name: fallbackName })
      setCourses(publicCourses)
      setLoading(false)
    }

    loadTeacher()
    return () => {
      mounted = false
    }
  }, [id, t])

  const teacherName = teacher?.full_name || t('instructorLabel')

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell teacher-profile-page">
        <section className="teacher-profile-header">
          <span className="teacher-profile-avatar">{teacherName.charAt(0).toUpperCase()}</span>
          <div>
            <p className="role-pill">{t('instructorLabel')}</p>
            <h1>{teacherName}</h1>
            <p>{t('teacherPublicProfileSubtitle')}</p>
            <div className="tag-row">
              <span>{courses.length} {t('coursesTitle')}</span>
            </div>
          </div>
        </section>

        <section className="home-grid-section">
          <div className="section-heading">
            <h2>{t('teacherCoursesTitle')}</h2>
            <p>{t('teacherCoursesSubtitle')}</p>
          </div>

          {loading ? (
            <div className="course-grid">
              {[1, 2, 3].map((item) => <div className="home-course-card skeleton-card" key={item} />)}
            </div>
          ) : courses.length === 0 ? (
            <div className="panel-card empty-box">{t('teacherNoPublicCourses')}</div>
          ) : (
            <div className="course-grid">
              {courses.map((course) => (
                <article
                  key={course.id}
                  className="course-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/course/${course.id}`, { state: { course } })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(`/course/${course.id}`, { state: { course } })
                    }
                  }}
                >
                  <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                  <div className="course-card-body">
                    <h3>{course.title}</h3>
                    {course.description && <p>{course.description}</p>}
                    <small className="course-instructor">{teacherName}</small>
                    <strong>{Number(course.price) > 0 ? `${course.price} AZN` : t('freeLabel')}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default TeacherProfile
