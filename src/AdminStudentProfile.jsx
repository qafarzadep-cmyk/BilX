import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, Circle, Clock3, Mail } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from './Navbar'
import { formatCoursePrice, getCoursePricing } from './coursePricing'
import { getCourseUrl } from './courseUrl'
import { useLanguage } from './i18n'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const two = (part) => String(part).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`
}

function AdminStudentProfile({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!isAdmin(user)) {
        setLoading(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/course-access?studentId=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!active) return
      if (!response.ok) setError(result.error || t('adminLoadFailed'))
      else setData(result)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [id, t, user])

  const courseRows = useMemo(() => {
    if (!data) return []
    const progressByVideoId = new Map(data.progress.map((item) => [String(item.video_id), item]))
    return data.enrollments.map((enrollment) => {
      const course = data.courses.find((item) => String(item.id) === String(enrollment.course_id))
      const videos = data.videos.filter((item) => String(item.course_id) === String(enrollment.course_id))
      const progressRows = videos.map((video) => progressByVideoId.get(String(video.id))).filter(Boolean)
      const watched = progressRows.filter((item) => item.watched).length
      const started = progressRows.length > 0
      const percent = videos.length ? Math.round((watched / videos.length) * 100) : 0
      const latestActivity = progressRows.map((item) => item.last_opened_at || item.updated_at).filter(Boolean).sort().at(-1)
      const request = data.requests.find((item) => String(item.course_id) === String(enrollment.course_id))
      return { enrollment, course, videos, watched, started, percent, latestActivity, request }
    })
  }, [data])

  if (!isAdmin(user)) return <div className="page centered-page"><div className="empty-box compact">{t('adminNoAccess')}</div></div>

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell admin-student-profile-page">
        <button className="student-profile-back" type="button" onClick={() => navigate('/admin?tab=access')}>
          <ArrowLeft size={18} /> {t('backToAccessList')}
        </button>

        {loading ? <div className="panel-card">{t('loading')}</div> : error || !data ? (
          <div className="panel-card empty-box">{error || t('adminLoadFailed')}</div>
        ) : (
          <>
            <section className="admin-student-hero">
              <span className="admin-student-avatar">{data.student.fullName.charAt(0).toUpperCase()}</span>
              <div>
                <p className="role-pill">{t('student')}</p>
                <h1>{data.student.fullName}</h1>
                <div className="admin-student-facts">
                  <span><Mail size={16} /> {data.student.email}</span>
                  <span><Clock3 size={16} /> {t('registrationDate')}: {formatDateTime(data.student.registeredAt)}</span>
                  <span><Clock3 size={16} /> {t('lastActivity')}: {formatDateTime(data.student.lastSignInAt)}</span>
                </div>
              </div>
              <div className="admin-student-course-count"><strong>{courseRows.length}</strong><span>{t('coursesTitle')}</span></div>
            </section>

            <section className="admin-student-courses">
              <div className="section-heading"><h2>{t('studentLearningData')}</h2><p>{t('studentLearningDataSubtitle')}</p></div>
              {courseRows.length === 0 ? <div className="panel-card empty-box">{t('noActiveCourses')}</div> : courseRows.map((row) => {
                const status = row.percent >= 100 ? 'completed' : row.started ? 'inProgress' : 'notStarted'
                const StatusIcon = status === 'completed' ? CheckCircle2 : status === 'inProgress' ? BookOpen : Circle
                const purchasePrice = row.enrollment.price_paid ?? row.request?.requested_price ?? getCoursePricing(row.course).currentPrice
                return (
                  <article className="admin-student-course-row" key={row.enrollment.id}>
                    <div className="admin-student-course-main">
                      <span className={`student-progress-status ${status}`}><StatusIcon size={17} /> {t(status)}</span>
                      <h3>{row.course?.title || row.enrollment.course_id}</h3>
                      <div className="admin-student-course-meta">
                        <span>{t('requestDateLabel')}: <b>{formatDateTime(row.request?.created_at)}</b></span>
                        <span>{t('accessGrantedDateLabel')}: <b>{formatDateTime(row.enrollment.enrolled_at || row.request?.created_at)}</b></span>
                        <span>{t('purchasePriceLabel')}: <b>{formatCoursePrice(purchasePrice)}</b></span>
                        <span>{t('lastActivity')}: <b>{formatDateTime(row.latestActivity)}</b></span>
                      </div>
                    </div>
                    <div className="admin-student-progress-box">
                      <div><strong>{row.percent}%</strong><span>{row.watched}/{row.videos.length} {t('courseLessons')}</span></div>
                      <div className="progress-bar"><span style={{ width: `${row.percent}%` }} /></div>
                      {row.course && <button className="outline-button" type="button" onClick={() => navigate(getCourseUrl(row.course), { state: { course: row.course } })}>{t('viewCourse')}</button>}
                    </div>
                  </article>
                )
              })}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default AdminStudentProfile
