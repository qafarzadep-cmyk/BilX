import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Clock3, ExternalLink, PlayCircle } from 'lucide-react'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

const placeholderLessons = [
  {
    title: 'Kursa giriş',
    duration: '06:12',
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    title: 'İş mühitinin hazırlanması',
    duration: '09:45',
    url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
  },
  {
    title: 'Əsas anlayışlar və iş axını',
    duration: '14:08',
    url: 'https://www.youtube.com/embed/ysz5S6PUM-U',
  },
  {
    title: 'İlk funksiyanın qurulması',
    duration: '18:30',
    url: 'https://www.youtube.com/embed/tgbNymZ7vqY',
  },
]

function toYouTubeEmbedUrl(url, index = 0) {
  const fallback = placeholderLessons[index % placeholderLessons.length].url
  if (!url) return fallback

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace('www.', '')

    if (host === 'youtu.be') {
      return `https://www.youtube.com/embed/${parsed.pathname.replace('/', '')}`
    }

    if (host.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) return `https://www.youtube.com${parsed.pathname}`
      const videoId = parsed.searchParams.get('v')
      if (videoId) return `https://www.youtube.com/embed/${videoId}`
    }
  } catch {
    return fallback
  }

  return fallback
}

function getEmbedSrc(url) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}enablejsapi=1&autoplay=1&rel=0&modestbranding=1`
}

function isYouTubeUrl(url) {
  if (!url) return false

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace('www.', '')
    return host === 'youtu.be' || host.includes('youtube.com')
  } catch {
    return false
  }
}

function normalizeExternalUrl(url) {
  if (!url) return ''
  const trimmed = String(url).trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function CoursePage({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const playerFrameRef = useRef(null)
  const playerRef = useRef(null)
  const [course, setCourse] = useState(location.state?.course || null)
  const [videos, setVideos] = useState([])
  const [progress, setProgress] = useState([])
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requested, setRequested] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(null)
  const adminPreview = isAdmin(user)

  const lessons = useMemo(() => {
    if (videos.length === 0) {
      return placeholderLessons.map((lesson, index) => ({
        id: `placeholder-${index + 1}`,
        title: lesson.title,
        duration: lesson.duration,
        video_url: lesson.url,
        source_url: lesson.url,
        order_index: index + 1,
        isPlaceholder: true,
      }))
    }

    return videos.map((video, index) => ({
      ...video,
      title: video.title || placeholderLessons[index % placeholderLessons.length].title,
      duration: video.duration || placeholderLessons[index % placeholderLessons.length].duration,
      source_url: normalizeExternalUrl(video.video_url),
      video_url: isYouTubeUrl(video.video_url) ? toYouTubeEmbedUrl(video.video_url, index) : normalizeExternalUrl(video.video_url),
    }))
  }, [videos])

  const activeVideo = lessons.find((video) => String(video.id) === String(activeVideoId)) || lessons[0]
  const activeLessonIndex = lessons.findIndex((video) => String(video.id) === String(activeVideo?.id))
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )
  const completedCount = lessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
  const completionPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0

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
        setActiveVideoId(sortedVideos[0]?.id || 'placeholder-1')
      }

      if (!user) {
        if (mounted) setLoading(false)
        return
      }

      if (adminPreview) {
        if (mounted) {
          setHasAccess(true)
          setProgress([])
          setLoading(false)
        }
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
  }, [adminPreview, course, id, navigate, user])

  const markWatched = useCallback(async (videoId) => {
    if (!user || !videoId) return

    if (String(videoId).startsWith('placeholder-')) {
      setProgress((items) => {
        if (items.some((item) => String(item.video_id) === String(videoId))) {
          return items.map((item) => String(item.video_id) === String(videoId) ? { ...item, watched: true } : item)
        }
        return [...items, { user_id: user.id, video_id: videoId, watched: true }]
      })
      return
    }

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
  }, [user])

  const playNext = useCallback(async () => {
    if (!activeVideo) return
    await markWatched(activeVideo.id)
    const index = lessons.findIndex((video) => String(video.id) === String(activeVideo.id))
    if (lessons[index + 1]) setActiveVideoId(lessons[index + 1].id)
  }, [activeVideo, lessons, markWatched])

  useEffect(() => {
    if (!hasAccess || !activeVideo?.video_url || !isYouTubeUrl(activeVideo.video_url) || !playerFrameRef.current) return undefined

    let cancelled = false

    function attachPlayer() {
      if (cancelled || !window.YT?.Player || !playerFrameRef.current) return
      playerRef.current?.destroy?.()
      playerRef.current = new window.YT.Player(playerFrameRef.current, {
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              playNext()
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      attachPlayer()
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      if (!existingScript) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(script)
      }

      const previousReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.()
        attachPlayer()
      }
    }

    return () => {
      cancelled = true
    }
  }, [activeVideo, hasAccess, playNext])

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
    window.open(`https://wa.me/994773857252?text=${encodeURIComponent(message)}`, '_blank')
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
              <span>{lessons.length} dərs</span>
              <span>Ömürlük giriş</span>
            </div>
          </div>
          <img src={course.thumbnail_url || '/ortuksekli.jpg'} alt={course.title} />
        </section>

        {hasAccess ? (
          <section className="course-player-layout">
            <div className="course-player-main">
              <div className="youtube-player-shell">
                {activeVideo?.video_url && isYouTubeUrl(activeVideo.video_url) ? (
                  <iframe
                    key={activeVideo.id}
                    ref={playerFrameRef}
                    className="youtube-player"
                    src={getEmbedSrc(activeVideo.video_url)}
                    title={activeVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : activeVideo?.video_url ? (
                  <video key={activeVideo.id} controls autoPlay src={activeVideo.video_url} onEnded={playNext} className="youtube-player">
                    {t('videoNotSupported')}
                  </video>
                ) : (
                  <div className="empty-player">{t('videoNotSupported')}</div>
                )}
              </div>
              <div className="course-player-details">
                <div>
                  <p className="player-eyebrow">Dərs {activeLessonIndex + 1} / {lessons.length}</p>
                  <h2>{activeVideo?.title || 'Dərs seçin'}</h2>
                </div>
                <div className="player-actions">
                  {activeVideo?.source_url && (
                    <a className="outline-button complete-button" href={activeVideo.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} /> Linki aç
                    </a>
                  )}
                  <button className="primary-button complete-button" onClick={playNext}>
                    Tamamlandı kimi işarələ
                  </button>
                </div>
              </div>
            </div>

            <aside className="course-lesson-panel">
              <div className="lesson-panel-header">
                <div>
                  <h2>Kurs məzmunu</h2>
                  <p>{completedCount}/{lessons.length} tamamlandı</p>
                </div>
                <strong>{completionPercent}%</strong>
              </div>
              <div className="lesson-progress-track">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
              <div className="course-lesson-list">
                {lessons.map((video, index) => {
                  const isActive = String(video.id) === String(activeVideo?.id)
                  const isWatched = watchedIds.has(String(video.id))

                  return (
                    <button
                      key={video.id}
                      className={isActive ? 'course-lesson-item active' : 'course-lesson-item'}
                      onClick={() => setActiveVideoId(video.id)}
                    >
                      <span className="lesson-status">
                        {isWatched ? <CheckCircle2 size={20} /> : isActive ? <PlayCircle size={20} /> : <Circle size={20} />}
                      </span>
                      <span className="lesson-copy">
                        <strong>{index + 1}. {video.title}</strong>
                        <small><Clock3 size={14} /> {video.duration}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
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
              {lessons.length === 0 ? <p className="muted">Dərslər tezliklə əlavə olunacaq.</p> : lessons.map((video, index) => (
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
