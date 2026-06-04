import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Clock3, ExternalLink, PlayCircle } from 'lucide-react'
import { getWhatsAppUrl, WHATSAPP_PHONE_DISPLAY } from './contact'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

const placeholderLessons = [
  {
    titleKey: 'placeholderLessonIntro',
    duration: '06:12',
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    titleKey: 'placeholderLessonSetup',
    duration: '09:45',
    url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
  },
  {
    titleKey: 'placeholderLessonWorkflow',
    duration: '14:08',
    url: 'https://www.youtube.com/embed/ysz5S6PUM-U',
  },
  {
    titleKey: 'placeholderLessonFirstFunction',
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
  const [lessonPreviews, setLessonPreviews] = useState([])
  const [progress, setProgress] = useState([])
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requested, setRequested] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const [ratings, setRatings] = useState([])
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingReview, setRatingReview] = useState('')
  const adminPreview = isAdmin(user)
  // Stable id for data loading: route param, or the course passed via navigation
  // state. Keying the load effect on this (not the `course` object it also sets)
  // avoids redundant reloads.
  const courseId = id || location.state?.course?.id

  // Map of lessons the current viewer can actually play (full set for
  // enrolled/admin/owner; only free-preview lessons for everyone else).
  const playableById = useMemo(
    () => new Map(videos.map((video) => [String(video.id), video])),
    [videos]
  )

  const lessons = useMemo(() => {
    // The full, ordered curriculum comes from the public preview list (titles
    // only) for published courses; fall back to `videos` for draft/pending
    // courses an owner/admin is viewing.
    const source = lessonPreviews.length > 0 ? lessonPreviews : videos
    if (source.length === 0) return []

    return source.map((item, index) => {
      const playable = playableById.get(String(item.id))
      const rawUrl = playable?.video_url || item.video_url || null
      const embedUrl = rawUrl
        ? (isYouTubeUrl(rawUrl) ? toYouTubeEmbedUrl(rawUrl, index) : normalizeExternalUrl(rawUrl))
        : null
      return {
        id: item.id,
        title: item.title || t(placeholderLessons[index % placeholderLessons.length].titleKey),
        duration: item.duration || placeholderLessons[index % placeholderLessons.length].duration,
        is_free: item.is_free,
        order_index: item.order_index,
        source_url: rawUrl ? normalizeExternalUrl(rawUrl) : null,
        video_url: embedUrl,
        locked: !rawUrl,
      }
    })
  }, [lessonPreviews, videos, playableById, t])

  const activeVideo = lessons.find((video) => String(video.id) === String(activeVideoId)) || lessons[0]
  // Anything the viewer can play without enrolling is a preview — that's the
  // free-marked lessons plus the course's first lesson (see videos RLS).
  const previewLessons = !hasAccess && lessons.length > 0
    ? lessons.filter((lesson) => !lesson.locked)
    : []
  const previewLesson = previewLessons[0] || null
  const activeLessonIndex = lessons.findIndex((video) => String(video.id) === String(activeVideo?.id))
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )
  const completedCount = lessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
  const completionPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0
  const ratingAverage = ratings.length
    ? Math.round((ratings.reduce((sum, item) => sum + (item.rating || 0), 0) / ratings.length) * 10) / 10
    : 0

  const sendEmailNotification = async ({ type, courseId, courseTitle, instructorId, link }) => {
    try {
      await supabase.functions.invoke('notify-email', {
        body: { type, courseId, courseTitle, instructorId, link },
      })
    } catch (error) {
      console.warn('Email notification failed:', error)
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadCourse() {
      if (!courseId) {
        navigate('/')
        return
      }

      const { data } = await supabase.from('Courses').select('*').eq('id', courseId).single()
      let currentCourse = data
      if (currentCourse && !getCourseAuthorName(currentCourse)) {
        const [courseWithAuthor] = await attachCourseAuthorNames([currentCourse])
        currentCourse = courseWithAuthor
      }

      if (mounted && currentCourse) {
        setCourse(currentCourse)
      }

      const [{ data: videoData }, { data: previewData }] = await Promise.all([
        supabase.from('videos').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
        supabase.from('lesson_previews').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
      ])

      const sortedVideos = videoData || []
      if (mounted) {
        setVideos(sortedVideos)
        setLessonPreviews(previewData || [])
        setActiveVideoId(sortedVideos[0]?.id || null)
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
  }, [adminPreview, courseId, navigate, user])

  useEffect(() => {
    let mounted = true

    async function loadRatings() {
      if (!course) return
      const { data } = await supabase
        .from('course_ratings')
        .select('*')
        .eq('course_id', course.id)
        .order('created_at', { ascending: false })
      if (mounted) setRatings(data || [])
    }

    loadRatings()
    return () => {
      mounted = false
    }
  }, [course])

  useEffect(() => {
    let mounted = true

    async function loadComments() {
      if (!activeVideo?.id) return
      if (!hasAccess && !adminPreview) return
      if (String(activeVideo.id).startsWith('placeholder-')) {
        if (mounted) setComments([])
        return
      }

      const { data } = await supabase
        .from('video_comments')
        .select('*, profiles(full_name)')
        .eq('video_id', activeVideo.id)
        .order('created_at', { ascending: false })

      if (mounted) setComments(data || [])
    }

    loadComments()
    return () => {
      mounted = false
    }
  }, [activeVideo, adminPreview, hasAccess])

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
    }, { onConflict: 'user_id,video_id' })

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

  const submitComment = async (event) => {
    event.preventDefault()
    if (!user || !activeVideo?.id || !commentBody.trim()) return
    if (String(activeVideo.id).startsWith('placeholder-')) return

    const { error } = await supabase
      .from('video_comments')
      .insert({
        user_id: user.id,
        video_id: activeVideo.id,
        body: commentBody.trim(),
      })

    if (!error) {
      setCommentBody('')
      if (course?.instructor_id) {
        await supabase.rpc('create_notification', {
          p_user_id: course.instructor_id,
          p_title: t('newCommentTitle'),
          p_body: t('newCommentBody').replace('{title}', course.title),
          p_link: `/course/${course.id}`,
        })
      }
      await sendEmailNotification({
        type: 'comment',
        courseId: course.id,
        courseTitle: course.title,
        instructorId: course.instructor_id,
        link: `${window.location.origin}/course/${course.id}`,
      })
      const { data } = await supabase
        .from('video_comments')
        .select('*, profiles(full_name)')
        .eq('video_id', activeVideo.id)
        .order('created_at', { ascending: false })
      setComments(data || [])
    }
  }

  const submitRating = async (event) => {
    event.preventDefault()
    if (!user || !course || ratingValue < 1) return

    const { error } = await supabase
      .from('course_ratings')
      .upsert({
        user_id: user.id,
        course_id: course.id,
        rating: ratingValue,
        review: ratingReview.trim() || null,
      }, { onConflict: 'user_id,course_id' })

    if (!error) {
      setRatingReview('')
      if (course?.instructor_id) {
        await supabase.rpc('create_notification', {
          p_user_id: course.instructor_id,
          p_title: t('newRatingTitle'),
          p_body: t('newRatingBody').replace('{title}', course.title),
          p_link: `/course/${course.id}`,
        })
      }
      await sendEmailNotification({
        type: 'rating',
        courseId: course.id,
        courseTitle: course.title,
        instructorId: course.instructor_id,
        link: `${window.location.origin}/course/${course.id}`,
      })
      const { data } = await supabase
        .from('course_ratings')
        .select('*')
        .eq('course_id', course.id)
        .order('created_at', { ascending: false })
      setRatings(data || [])
    }
  }

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

    const message = `${t('whatsappHello')} ${t('whatsappInterested').replace('{title}', course.title)}\n\n${t('whatsappName')}: ${profile?.full_name || user?.user_metadata?.full_name || ''}\n${t('whatsappEmail')}: ${user?.email || ''}`
    window.open(getWhatsAppUrl(message), '_blank')
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
            {instructorName && <small className="course-instructor hero-author">{t('instructorLabel')}: {instructorName}</small>}
            <p>{course.description}</p>
            <div className="tag-row">
              <span>{lessons.length} {t('courseLessons')}</span>
              <span>{t('lifetimeAccess')}</span>
            </div>
          </div>
          <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
        </section>

        {hasAccess ? (
          <>
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
                  <p className="player-eyebrow">{t('lessonLabel')} {activeLessonIndex + 1} / {lessons.length}</p>
                  <h2>{activeVideo?.title || t('lessonTitle')}</h2>
                </div>
                <div className="player-actions">
                  {activeVideo?.source_url && (
                    <a className="outline-button complete-button" href={activeVideo.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} /> {t('openLink')}
                    </a>
                  )}
                  <button className="primary-button complete-button" onClick={playNext}>
                    {t('markComplete')}
                  </button>
                </div>
              </div>
            </div>

            <aside className="course-lesson-panel">
              <div className="lesson-panel-header">
                <div>
                  <h2>{t('courseContent')}</h2>
                  <p>{completedCount}/{lessons.length} {t('completedLabel')}</p>
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
          <section className="panel-card">
            <div className="section-heading">
              <h2>{t('courseRating')}</h2>
              <p>{ratingAverage > 0 ? `${t('ratingAverage')}: ${ratingAverage} (${ratings.length} ${t('ratingCount')})` : t('noRatingsYet')}</p>
            </div>
            <form className="form-panel" onSubmit={submitRating}>
              <label>{t('ratingSelect')}</label>
              <select value={ratingValue} onChange={(event) => setRatingValue(Number(event.target.value))}>
                <option value="0">{t('ratingSelect')}</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <label>{t('courseRating')}</label>
              <textarea rows={4} value={ratingReview} onChange={(event) => setRatingReview(event.target.value)} placeholder={t('reviewPlaceholder')} />
              <button className="primary-button">{t('addReview')}</button>
            </form>
          </section>

          <section className="panel-card">
            <div className="section-heading">
              <h2>{t('lessonComments')}</h2>
              <p>{activeVideo?.title || t('lessonTitle')}</p>
            </div>
            <form className="form-panel" onSubmit={submitComment}>
              <label>{t('lessonComments')}</label>
              <textarea rows={4} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t('commentPlaceholder')} />
              <button className="primary-button">{t('addComment')}</button>
            </form>
            {comments.length === 0 ? (
              <p className="muted">{t('noComments')}</p>
            ) : (
              <div className="comment-list">
                {comments.map((comment) => (
                  <div key={comment.id} className="comment-item">
                    <strong>{comment.profiles?.full_name || user?.email}</strong>
                    <small>{new Date(comment.created_at).toLocaleString('az-AZ')}</small>
                    <p>{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          </>
        ) : (
          <section className="purchase-grid">
            <div className="panel-card">
              {previewLesson && (
                <div className="preview-player-block">
                  <p className="player-eyebrow">{t('coursePreview')}</p>
                  <div className="youtube-player-shell">
                    {previewLesson.video_url && isYouTubeUrl(previewLesson.video_url) ? (
                      <iframe
                        className="youtube-player"
                        src={getEmbedSrc(previewLesson.video_url)}
                        title={previewLesson.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : previewLesson.video_url ? (
                      <video controls src={previewLesson.video_url} className="youtube-player">
                        {t('videoNotSupported')}
                      </video>
                    ) : null}
                  </div>
                  <h2>{previewLesson.title}</h2>
                  {previewLesson.source_url && isYouTubeUrl(previewLesson.video_url) && (
                    <a className="outline-button" href={previewLesson.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} /> {t('watchOnYoutube')}
                    </a>
                  )}
                </div>
              )}
              <h2>{t('courseWhatLearn')}</h2>
              <p className="muted">
                {t('whatsappPurchaseHint')}
              </p>
              <h3>{t('lessonListTitle')}</h3>
              {lessons.length === 0 ? <p className="muted">{t('lessonsSoon')}</p> : lessons.map((video, index) => (
                <div key={video.id} className="locked-lesson">
                  <span>{index + 1}</span>
                  {video.title}
                  <small>{previewLessons.some((lesson) => String(lesson.id) === String(video.id)) ? t('coursePreview') : t('locked')}</small>
                </div>
              ))}
            </div>
            <aside className="panel-card sticky-panel">
              <p className="muted">{t('coursePrice')}</p>
              <h2 className="price">{course.price} AZN</h2>
              {loading ? (
                <p className="muted">{t('loading')}</p>
              ) : requested ? (
                <div className="success-box">{t('requestSent')}</div>
              ) : (
                <>
                  <button className="whatsapp-button" onClick={handleWhatsApp} title={`WhatsApp: ${WHATSAPP_PHONE_DISPLAY}`}>{t('contactWhatsapp')}</button>
                  {!user && (
                    <>
                      <button className="primary-button full" onClick={() => navigate('/login')}>{t('loginToContinue')}</button>
                      <button className="outline-button full" onClick={() => navigate('/register')}>{t('registerActionAlt')}</button>
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
