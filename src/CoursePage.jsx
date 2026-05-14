import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function CoursePage({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const [course, setCourse] = useState(location.state?.course || null)
  const [videos, setVideos] = useState([])
  const [progress, setProgress] = useState([])
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requested, setRequested] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(null)

  const activeVideo = videos.find((video) => String(video.id) === String(activeVideoId)) || videos[0]
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )

  useEffect(() => {
    let mounted = true

    async function loadCourse() {
      const courseId = course?.id || id
      if (!courseId) {
        navigate('/')
        return
      }

      let currentCourse = course
      if (!currentCourse) {
        const { data } = await supabase.from('Courses').select('*').eq('id', courseId).single()
        currentCourse = data
      }

      if (currentCourse && !getCourseAuthorName(currentCourse)) {
        const [courseWithAuthor] = await attachCourseAuthorNames([currentCourse])
        currentCourse = courseWithAuthor
      }

      if (mounted && currentCourse && currentCourse !== course) {
        setCourse(currentCourse)
      }

      const { data: videoData } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true })

      const sortedVideos = videoData || []
      if (mounted) {
        setVideos(sortedVideos)
        setActiveVideoId(sortedVideos[0]?.id || null)
      }

      if (!user) {
        if (mounted) setLoading(false)
        return
      }

      const studentKeys = [user.id, user.email].filter(Boolean)
      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .in('user_id', studentKeys)

      const access = enrollmentData?.some((item) => (item.status || 'active') === 'active') || false
      let progressData = []
      if (access && sortedVideos.length > 0) {
        const { data } = await supabase
          .from('video_progress')
          .select('*')
          .eq('user_id', user.id)
          .in('video_id', sortedVideos.map((video) => video.id))
        progressData = data || []
      }

      if (mounted) {
        setHasAccess(access)
        setProgress(progressData)
        setLoading(false)
      }
    }

    loadCourse()
    return () => {
      mounted = false
    }
  }, [course, id, navigate, user])

  const markWatched = async (videoId) => {
    if (!user || !videoId) return
    await supabase.from('video_progress').upsert({
      user_id: user.id,
      video_id: videoId,
      watched: true,
      updated_at: new Date().toISOString(),
    })
    setProgress((items) => {
      if (items.some((item) => String(item.video_id) === String(videoId))) {
        return items.map((item) => String(item.video_id) === String(videoId) ? { ...item, watched: true } : item)
      }
      return [...items, { user_id: user.id, video_id: videoId, watched: true }]
    })
  }

  const playNext = async () => {
    if (!activeVideo) return
    await markWatched(activeVideo.id)
    const index = videos.findIndex((video) => video.id === activeVideo.id)
    if (videos[index + 1]) setActiveVideoId(videos[index + 1].id)
  }

  const handleWhatsApp = async () => {
    if (user) {
      await supabase.from('requests').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: profile?.full_name || user.user_metadata?.full_name || user.email,
        course_id: course.id,
        course_name: course.title,
        status: 'pending',
      })
      setRequested(true)
    }

    const message = `Salam! "${course.title}" kursu ilə maraqlanıram.\n\nAd: ${profile?.full_name || user?.user_metadata?.full_name || ''}\nE-poçt: ${user?.email || ''}`
    window.open(`https://wa.me/994553839118?text=${encodeURIComponent(message)}`, '_blank')
  }

  if (!course) return null
  const instructorName = getCourseAuthorName(course)

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell">
        <section className="course-hero">
          <div>
            <p className="role-pill course-brand-pill">Bil-X</p>
            <h1>{course.title}</h1>
            {instructorName && <small className="course-instructor hero-author">Müəllim: {instructorName}</small>}
            <p>{course.description}</p>
            <div className="tag-row">
              <span>{videos.length} dərs</span>
              <span>Ömürlük giriş</span>
            </div>
          </div>
          <img src={course.thumbnail_url || '/ortuksekli.jpg'} alt={course.title} />
        </section>

        {hasAccess ? (
          <section className="learning-grid">
            <div className="panel-card">
              {activeVideo?.video_url ? (
                <video key={activeVideo.id} controls autoPlay src={activeVideo.video_url} onEnded={playNext} className="video-player">
                  {t('videoNotSupported')}
                </video>
              ) : (
                <div className="empty-player">Bu kursda hələ video dərs yoxdur.</div>
              )}
              <h2>{activeVideo?.title || 'Dərs seçin'}</h2>
            </div>
            <aside className="panel-card sticky-panel">
              <h2>Kurs məzmunu</h2>
              {videos.map((video, index) => (
                <button
                  key={video.id}
                  className={String(video.id) === String(activeVideo?.id) ? 'lesson-button active' : 'lesson-button'}
                  onClick={() => setActiveVideoId(video.id)}
                >
                  <span>{watchedIds.has(String(video.id)) ? '✓' : index + 1}</span>
                  {video.title}
                </button>
              ))}
            </aside>
          </section>
        ) : (
          <section className="purchase-grid">
            <div className="panel-card">
              <h2>Bu kursda nə öyrənəcəksiniz</h2>
              <p className="muted">
                Kursu almaq üçün WhatsApp vasitəsilə əlaqə saxlayın.
              </p>
              <h3>Dərs siyahısı</h3>
              {videos.length === 0 ? <p className="muted">Dərslər tezliklə əlavə olunacaq.</p> : videos.map((video, index) => (
                <div key={video.id} className="locked-lesson"><span>{index + 1}</span>{video.title}<small>Bağlı</small></div>
              ))}
            </div>
            <aside className="panel-card sticky-panel">
              <p className="muted">{t('coursePrice')}</p>
              <h2 className="price">{course.price} AZN</h2>
              {loading ? (
                <p className="muted">Yüklənir...</p>
              ) : requested ? (
                <div className="success-box">Sorğunuz göndərildi. Tezliklə sizinlə əlaqə saxlanılacaq.</div>
              ) : (
                <>
                  <button className="whatsapp-button" onClick={handleWhatsApp}>WhatsApp ilə əlaqə</button>
                  {!user && (
                    <>
                      <button className="primary-button full" onClick={() => navigate('/login')}>Daxil ol</button>
                      <button className="outline-button full" onClick={() => navigate('/register')}>Qeydiyyat</button>
                    </>
                  )}
                </>
              )}
            </aside>
          </section>
        )}
      </main>
    </div>
  )
}

export default CoursePage
