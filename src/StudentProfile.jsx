import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { supabase } from './supabase'

function StudentProfile({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [enrollments, setEnrollments] = useState([])
  const [progress, setProgress] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (!user) {
        setLoading(false)
        return
      }

      const studentKeys = [user.id, user.email].filter(Boolean)
      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select('*, Courses(*, videos(*))')
        .in('user_id', studentKeys)
        .eq('status', 'active')

      const coursesWithAuthors = await attachCourseAuthorNames((enrollmentData || []).map((item) => item.Courses).filter(Boolean))
      const coursesById = new Map(coursesWithAuthors.map((course) => [course.id, course]))
      const nextEnrollments = (enrollmentData || []).map((item) => ({
        ...item,
        Courses: item.Courses ? coursesById.get(item.Courses.id) || item.Courses : item.Courses,
      }))

      const videoIds = nextEnrollments
        .flatMap((item) => item.Courses?.videos || [])
        .map((video) => video.id)

      let progressData = []
      if (videoIds.length > 0) {
        const { data } = await supabase
          .from('video_progress')
          .select('*')
          .eq('user_id', user.id)
          .in('video_id', videoIds)
        progressData = data || []
      }

      if (mounted) {
        setEnrollments(nextEnrollments)
        setProgress(progressData)
        setLoading(false)
      }
    }

    loadProfile()
    return () => {
      mounted = false
    }
  }, [user])

  const courses = enrollments.map((item) => item.Courses).filter(Boolean)
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )

  if (!user) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">
          <h2>Zəhmət olmasa daxil olun</h2>
          <button className="primary-button" onClick={() => navigate('/login')}>Daxil ol</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="dashboard-shell">
        <section className="dashboard-header">
          <div>
            <h1>Salam, {profile?.full_name || user.user_metadata?.full_name || user.email}</h1>
            <p>Kurslarınıza buradan davam edin.</p>
          </div>
          <button className="primary-button" onClick={() => navigate('/')}>Kurs tap</button>
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Mənim kurslarım</h2>
          </div>

          {loading ? (
            <p className="muted">Yüklənir...</p>
          ) : courses.length === 0 ? (
            <div className="empty-box">Hələ aktiv kursunuz yoxdur.</div>
          ) : (
            <div className="course-grid">
              {courses.map((course) => {
                const videos = course.videos || []
                const watched = videos.filter((video) => watchedIds.has(String(video.id))).length
                const percent = videos.length ? Math.round((watched / videos.length) * 100) : 0
                const instructorName = getCourseAuthorName(course)

                return (
                  <article key={course.id} className="course-card" onClick={() => navigate(`/course/${course.id}`, { state: { course } })}>
                    <img src={course.thumbnail_url || '/ortuksekli.jpg'} alt={course.title} />
                    <div className="course-card-body">
                      <h3>{course.title}</h3>
                      {course.description && <p>{course.description}</p>}
                      {instructorName && <small className="course-instructor">{instructorName}</small>}
                      <strong>{Number(course.price) > 0 ? `${course.price} AZN` : 'Pulsuz'}</strong>
                      <p>{videos.length} dərs</p>
                      <div className="progress-bar"><span style={{ width: `${percent}%` }} /></div>
                      <small>{percent}% tamamlandı</small>
                      <button className="primary-button full">Davam et</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default StudentProfile
