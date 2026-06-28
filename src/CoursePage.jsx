import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Award, CheckCircle2, ChevronDown, Circle, Clock3, ExternalLink, Lock, Play, PlayCircle, Share2, X } from 'lucide-react'
import toast from 'react-hot-toast'
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

function durationToSeconds(value) {
  const parts = String(value || '').split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

const COMMENT_TIME_PATTERN = /^\[\[bilx-time:(\d+)\]\]\s*/

function parseTimestampedComment(body) {
  const text = String(body || '')
  const match = text.match(COMMENT_TIME_PATTERN)
  return {
    timestampSeconds: match ? Number(match[1]) : null,
    body: text.replace(COMMENT_TIME_PATTERN, ''),
  }
}

function formatPlaybackTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  const parts = hours > 0 ? [hours, minutes, remainder] : [minutes, remainder]
  return parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join(':')
}

function formatSectionDuration(seconds, t) {
  if (!seconds) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return hours > 0
    ? `${hours}${t('hourShort')} ${minutes}${t('minuteShort')}`
    : `${minutes}${t('minuteShort')}`
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('az-AZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function CoursePage({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const playerFrameRef = useRef(null)
  const playerRef = useRef(null)
  const bunnyFrameRef = useRef(null)
  const legacyVideoRef = useRef(null)
  const playbackSecondsRef = useRef(0)
  const activeVideoIdRef = useRef(null)
  const advancingVideoIdRef = useRef(null)
  const initializedCourseIdRef = useRef(null)
  const [course, setCourse] = useState(location.state?.course || null)
  const [videos, setVideos] = useState([])
  const [lessonPreviews, setLessonPreviews] = useState([])
  const [sections, setSections] = useState([])
  const [trailer, setTrailer] = useState(null)
  const [activePreviewId, setActivePreviewId] = useState('trailer')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [progress, setProgress] = useState([])
  const [hasAccess, setHasAccess] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [certificateLoading, setCertificateLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requested, setRequested] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [expandedSectionIds, setExpandedSectionIds] = useState(() => new Set())
  const [curriculumSearch, setCurriculumSearch] = useState('')
  // Signed, short-lived Bunny embed URL for the lesson currently on screen.
  const [signedUrl, setSignedUrl] = useState(null)
  const [signedFor, setSignedFor] = useState(null)
  const [signedError, setSignedError] = useState(false)
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const adminPreview = isAdmin(user)
  const userId = user?.id
  const userEmail = user?.email
  // Stable id for data loading: route param, or the course passed via navigation
  // state. Keying the load effect on this (not the `course` object it also sets)
  // avoids redundant reloads.
  const courseId = id || location.state?.course?.id
  const courseInstructorId = course?.instructor_id

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
      // Bunny lessons carry a GUID instead of a URL; it's only present on rows
      // the viewer is allowed to read (free previews, or the full set once
      // enrolled/owner/admin), so its presence doubles as the "unlocked" signal.
      const bunnyId = playable?.bunny_video_id || null
      const embedUrl = rawUrl
        ? (isYouTubeUrl(rawUrl) ? toYouTubeEmbedUrl(rawUrl, index) : normalizeExternalUrl(rawUrl))
        : null
      const locked = !rawUrl && !bunnyId
      const title = item.title || t(placeholderLessons[index % placeholderLessons.length].titleKey)
      const showTitle = hasAccess || adminPreview || courseInstructorId === userId || !locked
      return {
        id: item.id,
        title,
        displayTitle: showTitle ? title : t('lockedLessonTitle'),
        duration: item.duration || playable?.duration || '',
        is_free: item.is_free,
        section_id: item.section_id || playable?.section_id || null,
        order_index: item.order_index,
        source_url: rawUrl ? normalizeExternalUrl(rawUrl) : null,
        video_url: embedUrl,
        bunny_video_id: bunnyId,
        locked,
      }
    })
  }, [adminPreview, courseInstructorId, hasAccess, lessonPreviews, playableById, t, userId, videos])

  const activeVideo = lessons.find((video) => String(video.id) === String(activeVideoId)) || lessons[0]

  useEffect(() => {
    activeVideoIdRef.current = activeVideo?.id || null
    advancingVideoIdRef.current = null
    playbackSecondsRef.current = 0
  }, [activeVideo?.id])
  // Preview samples are explicitly selected by the instructor. Keep this list
  // available for enrolled users and owners too, so they see the same course
  // preview card when reviewing the published page.
  const previewLessons = lessons.filter((lesson) => lesson.is_free && !lesson.locked)
  const trailerVideo = trailer ? {
    id: `trailer-${trailer.course_id}`,
    title: trailer.title || t('courseTrailer'),
    bunny_video_id: trailer.bunny_video_id,
    is_trailer: true,
  } : null
  const publicPreviewVideo = (
    activePreviewId === 'trailer'
      ? trailerVideo
      : previewLessons.find((lesson) => String(lesson.id) === String(activePreviewId))
  ) || trailerVideo || previewLessons[0] || null
  const previewChoices = [
    ...(trailerVideo ? [trailerVideo] : []),
    ...previewLessons,
  ]
  const activeLessonIndex = lessons.findIndex((video) => String(video.id) === String(activeVideo?.id))
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )
  const completedCount = lessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
  const completionPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0
  const fullCourseDuration = formatSectionDuration(
    lessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0),
    t
  )
  const curriculumSections = useMemo(() => {
    const orderedSections = [...sections].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const effective = orderedSections.length > 0
      ? orderedSections
      : [{ id: 'default', title: 'Section 1', order_index: 1 }]

    return effective.map((section, sectionIndex) => {
      const sectionLessons = lessons.filter((lesson) => {
        if (section.id === 'default') return true
        if (!lesson.section_id && sectionIndex === 0) return true
        return String(lesson.section_id) === String(section.id)
      })
      const completed = sectionLessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
      const duration = sectionLessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0)
      const numberedTitle = `${t('sectionLabel')} ${sectionIndex + 1}`
      const defaultTitle = `Section ${sectionIndex + 1}`

      return {
        ...section,
        displayTitle: section.title && section.title !== defaultTitle
          ? `${numberedTitle}: ${section.title}`
          : numberedTitle,
        lessons: sectionLessons,
        completed,
        duration: formatSectionDuration(duration, t),
      }
    }).filter((section) => section.lessons.length > 0 || sections.length > 0)
  }, [lessons, sections, t, watchedIds])
  const curriculumSearchTerm = curriculumSearch.trim()
  const visibleCurriculumSections = useMemo(() => {
    const query = normalizeSearchText(curriculumSearchTerm)
    if (!query) return curriculumSections

    return curriculumSections.map((section) => {
      const sectionMatches = normalizeSearchText(section.displayTitle || section.title).includes(query)
      const sectionLessons = sectionMatches
        ? section.lessons
        : section.lessons.filter((lesson) => (
          normalizeSearchText(`${lesson.displayTitle || lesson.title || ''} ${lesson.duration || ''}`).includes(query)
        ))
      const duration = sectionLessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0)
      return {
        ...section,
        lessons: sectionLessons,
        completed: sectionLessons.filter((lesson) => watchedIds.has(String(lesson.id))).length,
        duration: formatSectionDuration(duration, t),
      }
    }).filter((section) => section.lessons.length > 0)
  }, [curriculumSearchTerm, curriculumSections, t, watchedIds])
  const activeSectionId = curriculumSections.find((section) => (
    section.lessons.some((lesson) => String(lesson.id) === String(activeVideo?.id))
  ))?.id

  useEffect(() => {
    if (activeSectionId === undefined || activeSectionId === null) return
    const sectionKey = String(activeSectionId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSectionIds((current) => {
      if (current.has(sectionKey)) return current
      const next = new Set(current)
      next.add(sectionKey)
      return next
    })
  }, [activeSectionId])

  const toggleCurriculumSection = (sectionId) => {
    const sectionKey = String(sectionId)
    setExpandedSectionIds((current) => {
      const next = new Set(current)
      if (next.has(sectionKey)) next.delete(sectionKey)
      else next.add(sectionKey)
      return next
    })
  }

  const selectLesson = (sectionId, videoId) => {
    const lesson = lessons.find((item) => String(item.id) === String(videoId))
    if (!lesson || lesson.locked) {
      toast(t('unlockFullCourse'))
      return
    }
    const sectionKey = String(sectionId)
    setExpandedSectionIds((current) => {
      if (current.has(sectionKey)) return current
      const next = new Set(current)
      next.add(sectionKey)
      return next
    })
    setActiveVideoId(videoId)
    if (!hasAccess) setActivePreviewId(videoId)
  }
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

      const [
        { data: videoData },
        { data: previewData },
        { data: sectionData },
        { data: trailerData },
      ] = await Promise.all([
        supabase.from('videos').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
        supabase.from('lesson_previews').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
        supabase.from('course_sections').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
        supabase.from('course_trailers').select('*').eq('course_id', courseId).maybeSingle(),
      ])

      const sortedVideos = videoData || []
      if (mounted) {
        setVideos(sortedVideos)
        setLessonPreviews(previewData || [])
        setSections(sectionData || [])
        setTrailer(trailerData || null)
        setActivePreviewId(trailerData ? 'trailer' : '')
        if (String(initializedCourseIdRef.current) !== String(courseId)) {
          const initialVideoId = location.state?.videoId || sortedVideos[0]?.id || null
          initializedCourseIdRef.current = courseId
          activeVideoIdRef.current = initialVideoId
          setActiveVideoId(initialVideoId)
        }
      }

      if (!userId) {
        if (mounted) setLoading(false)
        return
      }

      if (adminPreview) {
        if (mounted) {
          setHasAccess(true)
          setIsEnrolled(false)
          setProgress([])
          setLoading(false)
        }
        return
      }

      if (currentCourse?.instructor_id === userId) {
        if (mounted) {
          setHasAccess(true)
          setIsEnrolled(false)
          setProgress([])
          setLoading(false)
        }
        return
      }

      const studentKeys = [userId, userEmail].filter(Boolean)
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
          .eq('user_id', userId)
          .in('video_id', sortedVideos.map((video) => video.id))
        progressData = data || []
      }

      if (mounted) {
        setHasAccess(access)
        setIsEnrolled(access)
        setProgress(progressData)
        setLoading(false)
      }
    }

    loadCourse()
    return () => {
      mounted = false
    }
  }, [adminPreview, courseId, location.state?.videoId, navigate, userEmail, userId])

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

  useEffect(() => {
    if (!user || !course || course.instructor_id !== user.id) return undefined
    const missing = videos.filter((video) => video.bunny_video_id && !video.duration)
    if (missing.length === 0) return undefined

    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      for (const video of missing) {
        try {
          const response = await fetch('/api/bunny-video-duration', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ videoId: video.id }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result.duration || cancelled) continue
          setVideos((current) => current.map((item) => (
            String(item.id) === String(video.id) ? { ...item, duration: result.duration } : item
          )))
          setLessonPreviews((current) => current.map((item) => (
            String(item.id) === String(video.id) ? { ...item, duration: result.duration } : item
          )))
        } catch {
          // Duration remains hidden until Bunny or the network is available.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [course, user, videos])

  useEffect(() => {
    if (!previewModalOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewModalOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewModalOpen])

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

  const playNext = useCallback((expectedVideoId = null) => {
    const currentId = activeVideoIdRef.current
    if (!currentId || String(advancingVideoIdRef.current) === String(currentId)) return
    if (expectedVideoId !== null && String(expectedVideoId) !== String(currentId)) return

    const index = lessons.findIndex((video) => String(video.id) === String(currentId))
    const nextVideo = lessons[index + 1]
    if (!nextVideo) {
      void markWatched(currentId)
      return
    }

    // Advance immediately. Progress persistence must not hold the player on the
    // old lesson, and duplicate Player.js "ended" events must not advance twice.
    advancingVideoIdRef.current = currentId
    activeVideoIdRef.current = nextVideo.id
    setActiveVideoId(nextVideo.id)
    void markWatched(currentId)
  }, [lessons, markWatched])

  const getCurrentPlaybackSeconds = () => {
    if (legacyVideoRef.current) return legacyVideoRef.current.currentTime || 0
    if (playerRef.current?.getCurrentTime) return playerRef.current.getCurrentTime() || 0
    return playbackSecondsRef.current || 0
  }

  const seekToComment = (seconds) => {
    const target = Math.max(0, Number(seconds) || 0)
    playbackSecondsRef.current = target

    if (activeVideo?.bunny_video_id && bunnyFrameRef.current?.contentWindow) {
      bunnyFrameRef.current.contentWindow.postMessage(
        JSON.stringify({ context: 'player.js', version: '0.0.1', method: 'setCurrentTime', value: target }),
        '*'
      )
      return
    }
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(target, true)
      return
    }
    if (legacyVideoRef.current) {
      legacyVideoRef.current.currentTime = target
      void legacyVideoRef.current.play()
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!user || !activeVideo?.id || !commentBody.trim()) return
    if (String(activeVideo.id).startsWith('placeholder-')) return

    const timestampSeconds = Math.max(0, Math.floor(getCurrentPlaybackSeconds()))
    const storedBody = `[[bilx-time:${timestampSeconds}]] ${commentBody.trim()}`
    const { error } = await supabase
      .from('video_comments')
      .insert({
        user_id: user.id,
        video_id: activeVideo.id,
        body: storedBody,
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

  // Bunny lessons play through a token-authenticated embed URL that must be
  // minted server-side (after an access check). Resolve it for whichever lesson
  // is on screen: the active lesson when enrolled, the preview otherwise.
  // Owners/admins enter the full-course view. When a new course has a trailer
  // but no lessons yet, keep the trailer available instead of rendering an
  // empty lesson player.
  const playerVideo = previewModalOpen
    ? publicPreviewVideo
    : hasAccess
      ? (activeVideo || trailerVideo)
      : (!activeVideo?.locked ? activeVideo : publicPreviewVideo)
  const playerVideoId = playerVideo?.id
  const playerBunnyId = playerVideo?.bunny_video_id
  useEffect(() => {
    if (!playerBunnyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignedUrl(null)
      setSignedFor(null)
      setSignedError(false)
      return undefined
    }

    let cancelled = false
    setSignedUrl(null)
    setSignedError(false)

    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const res = await fetch('/api/bunny-playback', {
          method: 'POST',
          headers,
          body: JSON.stringify(
            playerVideo?.is_trailer
              ? { trailerCourseId: courseId }
              : { videoId: playerVideoId }
          ),
        })
        // Parse defensively — an empty/HTML body (e.g. functions not running)
        // would otherwise throw and leave the player stuck on "loading".
        const text = await res.text()
        const data = text ? JSON.parse(text) : {}
        if (cancelled) return
        if (res.ok && data.url) {
          setSignedUrl(data.url)
          setSignedFor(String(playerVideoId))
        } else {
          setSignedError(true)
        }
      } catch {
        if (!cancelled) setSignedError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [courseId, playerVideo?.is_trailer, playerVideoId, playerBunnyId])

  // Auto-advance Bunny lessons. Bunny's embed speaks the Player.js protocol over
  // postMessage; we subscribe to its "ended" event and roll to the next lesson —
  // the same behaviour the YouTube iframe API gives us below.
  useEffect(() => {
    if (!hasAccess || !activeVideo?.bunny_video_id) return undefined
    if (!signedUrl || signedFor !== String(activeVideo.id)) return undefined
    const iframe = bunnyFrameRef.current
    if (!iframe) return undefined

    const subscribe = () => {
      for (const eventName of ['ended', 'timeupdate']) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ context: 'player.js', version: '0.0.1', method: 'addEventListener', value: eventName, listener: `bilx-${eventName}` }),
          '*'
        )
      }
    }

    function handleMessage(event) {
      if (event.source !== iframe.contentWindow) return
      let data
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (!data || data.context !== 'player.js') return
      // The player announces "ready" once it can take commands; subscribe then.
      if (data.event === 'ready') subscribe()
      else if (data.event === 'ended') playNext(activeVideo.id)
      else if (data.event === 'timeupdate') {
        const seconds = data.value?.seconds ?? data.value?.currentTime ?? data.value
        if (Number.isFinite(Number(seconds))) playbackSecondsRef.current = Number(seconds)
      }
    }

    window.addEventListener('message', handleMessage)
    // The player may already be ready (e.g. on lesson switch) — subscribe now too.
    subscribe()

    return () => window.removeEventListener('message', handleMessage)
  }, [hasAccess, activeVideo?.id, activeVideo?.bunny_video_id, signedUrl, signedFor, playNext])

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
              playNext(activeVideo.id)
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

  const handleShare = async () => {
    if (!course) return
    const url = `${window.location.origin}/course/${course.id}`
    // On mobile, the native share sheet (WhatsApp, Telegram, …) is the best UX.
    if (navigator.share) {
      try {
        await navigator.share({
          title: course.title,
          text: (course.description || course.title || '').slice(0, 160),
          url,
        })
      } catch {
        // User dismissed the share sheet — nothing to do.
      }
      return
    }
    // Desktop / unsupported: copy the link and confirm with a toast.
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('linkCopied'))
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  const openCoursePreview = () => {
    if (!publicPreviewVideo) return
    if (trailerVideo) setActivePreviewId('trailer')
    else if (previewLessons[0]) setActivePreviewId(previewLessons[0].id)
    setPreviewModalOpen(true)
  }

  const openCertificate = async () => {
    if (!course || completionPercent < 100 || !isEnrolled) return
    setCertificateLoading(true)
    const { data, error } = await supabase.rpc('issue_course_certificate', { p_course_id: course.id })
    setCertificateLoading(false)

    if (error || !data?.verification_code) {
      toast.error(error?.message || t('certificateError'))
      return
    }
    navigate(`/certificate/${data.verification_code}`)
  }

  if (!course) return null
  const instructorName = getCourseAuthorName(course)
  const canUseLessonPlayer = hasAccess || (Boolean(user) && previewLessons.length > 0)

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell">
        <section className="course-hero course-hero-public">
          <div className="course-hero-copy">
            <p className="role-pill course-brand-pill">BilX</p>
            <h1>{course.title}</h1>
            {instructorName && <small className="course-instructor hero-author">{t('instructorLabel')}: {instructorName}</small>}
            <p>{course.description}</p>
            <div className="tag-row">
              <span>{lessons.length} {t('courseLessons')}</span>
              {fullCourseDuration && <span>{fullCourseDuration}</span>}
              <span>{t('lifetimeAccess')}</span>
            </div>
            <button type="button" className="outline-button share-button" onClick={handleShare}>
              <Share2 size={16} /> {t('shareCourse')}
            </button>
          </div>
          <button
            type="button"
            className="course-preview-card"
            onClick={openCoursePreview}
            aria-label={publicPreviewVideo ? `${t('previewCourse')}: ${course.title}` : course.title}
            disabled={!publicPreviewVideo}
          >
            <img src={course.thumbnail_url || '/course-placeholder.svg'} alt="" />
            {publicPreviewVideo && (
              <>
              <span className="course-preview-shade" />
              <span className="course-preview-play"><Play size={30} fill="currentColor" /></span>
              <strong>{t('previewCourse')}</strong>
              </>
            )}
          </button>
        </section>

        {canUseLessonPlayer ? (
          <>
          {lessons.length === 0 && !trailerVideo ? (
            <section className="panel-card empty-box">
              {t('courseHasNoLessonsYet')}
            </section>
          ) : (
          <section className="course-player-layout">
            <div className="course-player-main">
              <div className="youtube-player-shell">
                {previewModalOpen ? (
                  <div className="empty-player">{t('previewCourse')}</div>
                ) : playerVideo?.bunny_video_id ? (
                  signedUrl && signedFor === String(playerVideo.id) ? (
                    <iframe
                      key={playerVideo.id}
                      ref={bunnyFrameRef}
                      className="youtube-player"
                      src={signedUrl}
                      title={playerVideo.title}
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <div className="empty-player">{signedError ? t('videoNotSupported') : t('loadingVideo')}</div>
                  )
                ) : playerVideo?.video_url && isYouTubeUrl(playerVideo.video_url) ? (
                  <iframe
                    key={playerVideo.id}
                    ref={playerFrameRef}
                    className="youtube-player"
                    src={getEmbedSrc(playerVideo.video_url)}
                    title={playerVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : playerVideo?.video_url ? (
                  <video
                    key={playerVideo.id}
                    ref={legacyVideoRef}
                    controls
                    autoPlay
                    src={playerVideo.video_url}
                    onTimeUpdate={(event) => { playbackSecondsRef.current = event.currentTarget.currentTime }}
                    onEnded={() => playNext(playerVideo.id)}
                    className="youtube-player"
                  >
                    {t('videoNotSupported')}
                  </video>
                ) : (
                  <div className="empty-player">{t('videoNotSupported')}</div>
                )}
              </div>
              <div className="course-player-details">
                <div>
                  <p className="player-eyebrow">
                    {playerVideo?.is_trailer
                      ? t('courseTrailer')
                      : `${t('lessonLabel')} ${activeLessonIndex + 1} / ${lessons.length}`}
                  </p>
                  <h2>{playerVideo?.displayTitle || playerVideo?.title || t('lessonTitle')}</h2>
                </div>
                {hasAccess && !playerVideo?.is_trailer && (
                <div className="player-actions">
                  {activeVideo?.source_url && (
                    <a className="outline-button complete-button" href={activeVideo.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} /> {t('openLink')}
                    </a>
                  )}
                  <button className="primary-button complete-button" onClick={() => playNext(activeVideo?.id)}>
                    {t('markComplete')}
                  </button>
                </div>
                )}
              </div>
            </div>

            <aside className="course-lesson-panel">
              {isEnrolled && (
                <div className="course-certificate-card">
                  <Award size={24} />
                  <div>
                    <strong>{t('courseCertificate')}</strong>
                    <small>
                      {completionPercent === 100
                        ? t('certificateReady')
                        : t('certificateProgress').replace('{completed}', completedCount).replace('{total}', lessons.length)}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={completionPercent < 100 || certificateLoading}
                    onClick={openCertificate}
                  >
                    {certificateLoading ? t('loading') : t('getCertificate')}
                  </button>
                </div>
              )}
              <div className="lesson-panel-header">
                <div>
                  <h2>{t('courseContent')}</h2>
                  <p>
                    {hasAccess
                      ? `${completedCount}/${lessons.length} ${t('completedLabel')}`
                      : `${lessons.length} ${t('courseLessons')}${fullCourseDuration ? ` | ${fullCourseDuration}` : ''}`}
                  </p>
                </div>
                {hasAccess ? (
                  <strong>{completionPercent}%</strong>
                ) : (
                  <button className="outline-button unlock-course-button" type="button" onClick={handleWhatsApp}>
                    {t('unlockFullCourse')}
                  </button>
                )}
              </div>
              {hasAccess && (
                <div className="lesson-progress-track">
                  <span style={{ width: `${completionPercent}%` }} />
                </div>
              )}
              {curriculumSections.length > 0 && (
                <div className="curriculum-search">
                  <input
                    type="search"
                    value={curriculumSearch}
                    onChange={(event) => setCurriculumSearch(event.target.value)}
                    placeholder={t('curriculumSearchPlaceholder')}
                    aria-label={t('curriculumSearchLabel')}
                  />
                </div>
              )}
              <div className="course-lesson-list">
                {visibleCurriculumSections.length === 0 ? (
                  <p className="curriculum-search-empty">{t('curriculumSearchEmpty')}</p>
                ) : visibleCurriculumSections.map((section, sectionIndex) => {
                  const isExpanded = curriculumSearchTerm ? true : expandedSectionIds.has(String(section.id))

                  return (
                    <section className={isExpanded ? 'curriculum-section expanded' : 'curriculum-section'} key={section.id}>
                      <button
                        type="button"
                        className="curriculum-section-heading"
                        onClick={() => toggleCurriculumSection(section.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>
                          <strong>{section.displayTitle}</strong>
                          <small>
                            {section.completed}/{section.lessons.length}
                            {section.duration ? ` | ${section.duration}` : ''}
                          </small>
                        </span>
                        <ChevronDown size={20} />
                      </button>
                      {isExpanded && (
                        <div className="curriculum-section-lessons">
                          {section.lessons.map((video, lessonIndex) => {
                            const isActive = String(video.id) === String(activeVideo?.id)
                            const isWatched = watchedIds.has(String(video.id))
                            const isLocked = video.locked

                            return (
                              <button
                                key={video.id}
                                className={`${isActive ? 'course-lesson-item active' : 'course-lesson-item'}${isLocked ? ' locked' : ''}`}
                                onClick={() => selectLesson(section.id, video.id)}
                              >
                                <span className="lesson-status">
                                  {isLocked ? <Lock size={19} /> : isWatched ? <CheckCircle2 size={20} /> : isActive ? <PlayCircle size={20} /> : <Circle size={20} />}
                                </span>
                                <span className="lesson-copy">
                                  <strong>{sectionIndex + 1}.{lessonIndex + 1} {video.displayTitle || video.title}</strong>
                                  {(video.duration || isLocked) && (
                                    <small>
                                      {video.duration && <><Clock3 size={14} /> {video.duration}</>}
                                      {isLocked && <span>{video.duration ? ' | ' : ''}{t('unlockFullCourse')}</span>}
                                    </small>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </aside>
          </section>
          )}
          {hasAccess && (
          <section className="panel-card lesson-comments-panel">
            <div className="section-heading youtube-comment-heading">
              <div>
                <h2>{comments.length} {t('lessonComments')}</h2>
                <p>{activeVideo?.title || t('lessonTitle')}</p>
              </div>
            </div>
            <form className="youtube-comment-form" onSubmit={submitComment}>
              <span className="comment-avatar">
                {(profile?.full_name || user?.email || 'S').charAt(0).toUpperCase()}
              </span>
              <div>
                <textarea rows={2} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t('commentPlaceholder')} />
                <div className="youtube-comment-form-actions">
                  <small>{t('commentTimestampHelp')}</small>
                  <button className="primary-button" disabled={!commentBody.trim()}>{t('addComment')}</button>
                </div>
              </div>
            </form>
            {comments.length === 0 ? (
              <p className="muted">{t('noComments')}</p>
            ) : (
              <div className="comment-list">
                {comments.map((comment) => {
                  const parsedComment = parseTimestampedComment(comment.body)
                  const authorName = comment.profiles?.full_name || (comment.user_id === user?.id ? user?.email : t('student'))

                  return (
                    <article key={comment.id} className="comment-item youtube-comment-item">
                      <span className="comment-avatar">{(authorName || 'S').charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="youtube-comment-meta">
                          <strong>{authorName}</strong>
                          <small>{new Date(comment.created_at).toLocaleString('az-AZ')}</small>
                        </div>
                        {parsedComment.timestampSeconds !== null && (
                          <button
                            className="comment-timestamp"
                            type="button"
                            onClick={() => seekToComment(parsedComment.timestampSeconds)}
                          >
                            {formatPlaybackTime(parsedComment.timestampSeconds)}
                          </button>
                        )}
                        <p>{parsedComment.body}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
          )}
          </>
        ) : (
          <section className="purchase-grid">
            <div className="panel-card">
              <h2>{t('courseWhatLearn')}</h2>
              <p className="muted">
                {t('whatsappPurchaseHint')}
              </p>
              <h3>{t('lessonListTitle')}</h3>
              {lessons.length === 0 ? <p className="muted">{t('lessonsSoon')}</p> : (
                <>
                  <div className="curriculum-search locked-curriculum-search">
                    <input
                      type="search"
                      value={curriculumSearch}
                      onChange={(event) => setCurriculumSearch(event.target.value)}
                      placeholder={t('curriculumSearchPlaceholder')}
                      aria-label={t('curriculumSearchLabel')}
                    />
                  </div>
                  {visibleCurriculumSections.length === 0 ? (
                    <p className="muted">{t('curriculumSearchEmpty')}</p>
                  ) : visibleCurriculumSections.map((section, sectionIndex) => (
                    <section className="locked-curriculum-section" key={section.id}>
                      <div className="curriculum-section-heading">
                        <strong>{section.displayTitle}</strong>
                        <small>{section.lessons.length} {t('courseLessons')}{section.duration ? ` | ${section.duration}` : ''}</small>
                      </div>
                      {section.lessons.map((video, lessonIndex) => (
                        <div key={video.id} className="locked-lesson">
                          <span>{sectionIndex + 1}.{lessonIndex + 1}</span>
                          {video.displayTitle || video.title}
                          <small>{previewLessons.some((lesson) => String(lesson.id) === String(video.id)) ? t('coursePreview') : t('locked')}</small>
                        </div>
                      ))}
                    </section>
                  ))}
                </>
              )}
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

      {previewModalOpen && publicPreviewVideo && (
        <div className="course-preview-backdrop" role="presentation" onMouseDown={() => setPreviewModalOpen(false)}>
          <section
            className="course-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="course-preview-modal-header">
              <div>
                <span>{t('previewCourse')}</span>
                <h2 id="course-preview-title">{course.title}</h2>
              </div>
              <button type="button" onClick={() => setPreviewModalOpen(false)} aria-label={t('cancel')}>
                <X size={25} />
              </button>
            </header>

            <div className="course-preview-modal-player">
              <div className="youtube-player-shell">
                {publicPreviewVideo.bunny_video_id ? (
                  signedUrl && signedFor === String(publicPreviewVideo.id) ? (
                    <iframe
                      className="youtube-player"
                      src={signedUrl}
                      title={publicPreviewVideo.title}
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <div className="empty-player">{signedError ? t('videoNotSupported') : t('loadingVideo')}</div>
                  )
                ) : publicPreviewVideo.video_url && isYouTubeUrl(publicPreviewVideo.video_url) ? (
                  <iframe
                    className="youtube-player"
                    src={getEmbedSrc(publicPreviewVideo.video_url)}
                    title={publicPreviewVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : publicPreviewVideo.video_url ? (
                  <video controls autoPlay src={publicPreviewVideo.video_url} className="youtube-player">
                    {t('videoNotSupported')}
                  </video>
                ) : (
                  <div className="empty-player">{t('videoNotSupported')}</div>
                )}
              </div>
            </div>

            <div className="course-preview-modal-list">
              <h3>{t('coursePreview')}</h3>
              {previewChoices.map((video) => {
                const choiceId = video.is_trailer ? 'trailer' : video.id
                const isActive = String(activePreviewId) === String(choiceId)
                return (
                  <button
                    type="button"
                    key={video.id}
                    className={isActive ? 'course-preview-choice active' : 'course-preview-choice'}
                    onClick={() => setActivePreviewId(choiceId)}
                  >
                    <span className="course-preview-choice-thumb">
                      <img src={course.thumbnail_url || '/course-placeholder.svg'} alt="" />
                      <PlayCircle size={22} />
                    </span>
                    <span>
                      <small>{video.is_trailer ? t('courseTrailer') : t('freeLessonPreview')}</small>
                      <strong>{video.title}</strong>
                    </span>
                    {!video.is_trailer && video.duration && <time>{video.duration}</time>}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default CoursePage
