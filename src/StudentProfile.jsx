import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Play } from 'lucide-react'
import { UPCOMING_COURSES } from './courseCatalog'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import { getCourseUrl } from './courseUrl'
import { formatCoursePrice, getCoursePricing } from './coursePricing'
import { getWhatsAppUrl } from './contact'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function getStudentKeys(user) {
  return Array.from(new Set([
    user?.id,
    user?.email,
    user?.email?.toLowerCase(),
  ].filter(Boolean).map((item) => String(item))))
}

function StudentProfile({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [enrollments, setEnrollments] = useState([])
  const [progress, setProgress] = useState([])
  const [discoverCourses, setDiscoverCourses] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [courseRatings, setCourseRatings] = useState({})
  const [loading, setLoading] = useState(true)
  const { t } = useLanguage()

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (!user) {
        setLoading(false)
        return
      }

      const studentKeys = getStudentKeys(user)
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .in('user_id', studentKeys)
        .eq('status', 'active')

      const activeEnrollments = enrollmentError ? [] : enrollmentData || []
      const courseIds = Array.from(new Set(activeEnrollments.map((item) => item.course_id).filter(Boolean)))
      const [{ data: courseData }, { data: videoData }] = courseIds.length > 0
        ? await Promise.all([
            supabase.from('Courses').select('*').in('id', courseIds),
            supabase.from('videos').select('*').in('course_id', courseIds).order('order_index', { ascending: true }),
          ])
        : [{ data: [] }, { data: [] }]

      const videosByCourseId = new Map()
      ;(videoData || []).forEach((video) => {
        const key = String(video.course_id)
        const list = videosByCourseId.get(key) || []
        list.push(video)
        videosByCourseId.set(key, list)
      })

      const coursesWithVideos = (courseData || []).map((course) => ({
        ...course,
        videos: videosByCourseId.get(String(course.id)) || [],
      }))
      const coursesWithAuthors = await attachCourseAuthorNames(coursesWithVideos)
      const coursesById = new Map(coursesWithAuthors.map((course) => [course.id, course]))
      const nextEnrollments = activeEnrollments.map((item) => ({
        ...item,
        Courses: coursesById.get(item.course_id) || null,
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
  const discoverCourseItems = [
    ...discoverCourses.map((course) => ({ type: 'course', course })),
    ...UPCOMING_COURSES.map((course) => ({ type: 'upcoming', course })),
  ]
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )

  useEffect(() => {
    let mounted = true

    async function loadDiscoverCourses() {
      if (!user || loading) return

      setDiscoverLoading(true)
      const enrolledCourseIds = new Set(enrollments.map((item) => String(item.course_id)))
      const { data } = await supabase
        .from('Courses')
        .select('*')
        .eq('is_published', true)
        .order('id', { ascending: false })

      const coursesWithAuthors = await attachCourseAuthorNames(
        (data || []).filter((course) => !enrolledCourseIds.has(String(course.id)))
      )
      const ratingResult = coursesWithAuthors.length > 0
        ? await fetch(`/api/course-access?reviews=1&courseIds=${encodeURIComponent(coursesWithAuthors.map((course) => course.id).join(','))}`).then((response) => response.ok ? response.json() : null).catch(() => null)
        : null
      if (mounted) {
        setDiscoverCourses(coursesWithAuthors)
        setCourseRatings(ratingResult?.summaries || {})
        setDiscoverLoading(false)
      }
    }

    loadDiscoverCourses()
    return () => {
      mounted = false
    }
  }, [courses.length, enrollments, loading, user])

  const requestCourse = async (event, course) => {
    event.stopPropagation()
    const pricing = getCoursePricing(course)
    const requestPayload = {
      p_course_id: course.id,
      p_course_name: course.title,
      p_user_email: user.email,
      p_user_name: profile?.full_name || user.user_metadata?.full_name || user.email,
      p_requested_price: pricing.currentPrice,
    }
    await supabase.rpc('create_purchase_request', requestPayload)
    const message = `${t('whatsappHello')} ${t('whatsappInterested').replace('{title}', course.title)}\n\n${t('whatsappName')}: ${requestPayload.p_user_name}\n${t('whatsappEmail')}: ${user.email || ''}`
    window.open(getWhatsAppUrl(message), '_blank')
  }

  if (!user) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">
          <h2>{t('pleaseLogin')}</h2>
          <button className="primary-button" onClick={() => navigate('/login')}>{t('loginToContinue')}</button>
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
            <h1>{t('hello')}, {profile?.full_name || user.user_metadata?.full_name || user.email}</h1>
            <p>{t('continueLearning')}</p>
          </div>
          <button className="primary-button" onClick={() => navigate('/')}>{t('findCourse')}</button>
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>{t('myCoursesTitle')}</h2>
          </div>

          {loading ? (
            <p className="muted">{t('loading')}</p>
          ) : courses.length === 0 ? (
            <div className="empty-box">{t('noActiveCourses')}</div>
          ) : (
            <div className="course-grid">
              {courses.map((course) => {
                const videos = course.videos || []
                const watched = videos.filter((video) => watchedIds.has(String(video.id))).length
                const percent = videos.length ? Math.round((watched / videos.length) * 100) : 0
                const instructorName = getCourseAuthorName(course)
                const courseActionLabel = percent > 0 ? t('continueButton') : t('startLearningButton')

                return (
                  <article
                    key={course.id}
                    className="course-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(getCourseUrl(course), { state: { course } })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(getCourseUrl(course), { state: { course } })
                      }
                    }}
                  >
                    <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                    <div className="course-card-body">
                      <h3>{course.title}</h3>
                      {course.description && <p>{course.description}</p>}
                      {instructorName && <small className="course-instructor">{instructorName}</small>}
                      <strong>{Number(course.price) > 0 ? `${course.price} AZN` : t('freeLabel')}</strong>
                      <p>{videos.length} {t('courseLessons')}</p>
                      <div className="progress-bar"><span style={{ width: `${percent}%` }} /></div>
                      <small>{percent}% {t('completedPercent')}</small>
                      <button className="primary-button full">{courseActionLabel}</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>{t('discoverCoursesTitle')}</h2>
            <p>{t('discoverCoursesSubtitle')}</p>
          </div>

          {discoverLoading ? (
            <p className="muted">{t('loading')}</p>
          ) : discoverCourseItems.length === 0 ? (
            <div className="empty-box">{t('noPublicCourses')}</div>
          ) : (
            <div className="course-grid">
              {discoverCourseItems.map(({ type, course }) => {
                if (type === 'upcoming') {
                  return (
                    <article
                      key={course.id}
                      className="course-card upcoming-course-card"
                      aria-label={`${course.title} - ${t('upcomingCourseLabel')}`}
                    >
                      <div className="course-card-upcoming-thumb" aria-hidden="true">
                        <span>{course.title.charAt(0)}</span>
                      </div>
                      <div className="course-card-body">
                        <h3>{course.title}</h3>
                        <p>{t('upcomingCourseText')}</p>
                        <span className="upcoming-course-badge">{t('upcomingCourseLabel')}</span>
                      </div>
                    </article>
                  )
                }

                const instructorName = getCourseAuthorName(course)
                const isA1Course = String(course.id) === '17'
                const pricing = getCoursePricing(course)
                const rating = courseRatings[String(course.id)]
                const discountPercent = pricing.regularPrice > pricing.currentPrice
                  ? Math.round((1 - pricing.currentPrice / pricing.regularPrice) * 100)
                  : 0
                const savings = pricing.regularPrice > pricing.currentPrice
                  ? Math.round((pricing.regularPrice - pricing.currentPrice) * 100) / 100
                  : 0

                return (
                  <article
                    key={course.id}
                    className="course-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(getCourseUrl(course), { state: { course } })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(getCourseUrl(course), { state: { course } })
                      }
                    }}
                  >
                    <div className="course-card-thumbnail">
                      <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                      {isA1Course && <span className="course-card-play-icon" aria-hidden="true"><Play size={24} fill="currentColor" /></span>}
                    </div>
                    <div className="course-card-body">
                      <h3>{isA1Course ? t('a1LandingHeadline') : course.title}</h3>
                      {(course.description || isA1Course) && <p>{isA1Course ? t('a1LandingSubtitle') : course.description}</p>}
                      {instructorName && <small className="course-instructor">{instructorName}</small>}
                      {rating?.count > 0 && (
                        <button className="course-card-rating" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/course/${course.id}/reviews`) }}>
                          <strong>{rating.average}</strong><span aria-hidden="true">★★★★★</span><small>({rating.count} tələbə)</small>
                        </button>
                      )}
                      <div className="course-card-footer">
                        {pricing.isOffer ? (
                          <div className="course-card-offer">
                            <div className="course-card-price-row"><strong className="course-card-price">{formatCoursePrice(pricing.currentPrice)}</strong><del>{formatCoursePrice(pricing.regularPrice)}</del><span className="course-card-discount">{discountPercent}% endirim</span></div>
                            <small className="course-card-offer-message">{pricing.endsOn} yay endirimi — indi al və {Number.isInteger(savings) ? savings : savings.toFixed(2)} AZN qənaət et</small>
                          </div>
                        ) : <strong className="course-card-price">{pricing.currentPrice > 0 ? formatCoursePrice(pricing.currentPrice) : t('freeLabel')}</strong>}
                        <button className="course-card-whatsapp-button" type="button" onClick={(event) => requestCourse(event, course)}><MessageCircle size={16} /> {isA1Course ? t('courseStartNow') : t('courseAcquire')}</button>
                      </div>
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
