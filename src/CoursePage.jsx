import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Award, CheckCircle2, ChevronDown, Circle, ClipboardList, Clock3, ExternalLink, Lock, Maximize2, MessageCircle, Minimize2, Play, PlayCircle, Share2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getWhatsAppUrl, WHATSAPP_PHONE_DISPLAY } from './contact'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import { getCourseUrl, isNumericCourseParam, slugifyCourseTitle } from './courseUrl'
import Navbar from './Navbar'
import QuizResultSummary from './QuizResultSummary'
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

function getEmbedSrc(url, muted = false) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1${muted ? '&mute=1' : ''}`
}

function getPreviewChoiceId(video) {
  return video?.is_trailer ? 'trailer' : video?.id
}

function getBunnyThumbnailSrc(video) {
  return video?.bunny_video_id ? `/api/bunny-thumbnail?videoId=${encodeURIComponent(video.bunny_video_id)}` : ''
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

function shouldMuteMobileAutoplay() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(max-width: 768px), (pointer: coarse)').matches || navigator.maxTouchPoints > 0
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

function formatLongSectionDuration(seconds, t) {
  if (!seconds) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  const parts = []
  if (hours > 0) parts.push(`${hours} ${t('hourLong')}`)
  if (minutes > 0) parts.push(`${minutes} ${t('minuteLong')}`)
  return parts.join(' ')
}

function getQuizQuestionCount(quizzes) {
  return (quizzes || []).reduce((total, quiz) => {
    const fullQuestionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0
    return total + (fullQuestionCount || Number(quiz.question_count) || 0)
  }, 0)
}

function formatCourseContentSummary(lessonCount, duration, quizCount, questionCount, t) {
  const lessonPart = `${lessonCount} ${t('courseLessons')}${duration ? ` / ${duration}` : ''}`
  const quizPart = `${quizCount} ${t('quizLabel')} / ${questionCount} ${t('questionCountLabel')}`
  return `${lessonPart} | ${quizPart}`
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('az-AZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getCourseResumeStorageKey(userId, courseId) {
  return `bilx-course-resume-${userId || 'student'}-${courseId}`
}

function getStoredResumeVideoId(userId, courseId, videos) {
  if (!userId || !courseId || !videos?.length) return null
  try {
    const storedValue = window.localStorage.getItem(getCourseResumeStorageKey(userId, courseId))
    if (!storedValue) return null
    let storedId = storedValue
    let updatedAt = 0
    try {
      const parsed = JSON.parse(storedValue)
      storedId = parsed.videoId
      updatedAt = Date.parse(parsed.updatedAt) || 0
    } catch {
      // Older releases stored only the lesson id. Treat it as an undated fallback.
    }
    return videos.some((video) => String(video.id) === String(storedId)) ? { videoId: storedId, updatedAt } : null
  } catch {
    return null
  }
}

function getResumeVideoId({ requestedVideoId, userId, courseId, videos, progress }) {
  if (!videos?.length) return null
  if (requestedVideoId && videos.some((video) => String(video.id) === String(requestedVideoId))) {
    return requestedVideoId
  }

  const latestResume = (progress || [])
    .filter((item) => item.last_opened_at && videos.some((video) => String(video.id) === String(item.video_id)))
    .sort((a, b) => Date.parse(b.last_opened_at) - Date.parse(a.last_opened_at))[0]
  if (latestResume) return latestResume.video_id

  const watchedIds = new Set((progress || []).filter((item) => item.watched).map((item) => String(item.video_id)))
  const firstUnwatched = videos.find((video) => !watchedIds.has(String(video.id)))
  if (firstUnwatched) return firstUnwatched.id

  // Every lesson is complete. A same-device value is useful only for revisiting;
  // it must never override the first unfinished lesson above.
  const storedResume = getStoredResumeVideoId(userId, courseId, videos)
  return storedResume?.videoId || videos[videos.length - 1]?.id || null
}

function sortVideosByCurriculum(videos, sections) {
  const orderedSections = [...(sections || [])]
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0) || String(a.id).localeCompare(String(b.id)))
  const sectionRank = new Map(orderedSections.map((section, index) => [String(section.id), index]))

  return [...(videos || [])].sort((a, b) => {
    const aSection = a.section_id == null ? -1 : (sectionRank.get(String(a.section_id)) ?? Number.MAX_SAFE_INTEGER)
    const bSection = b.section_id == null ? -1 : (sectionRank.get(String(b.section_id)) ?? Number.MAX_SAFE_INTEGER)
    return aSection - bSection
      || Number(a.order_index || 0) - Number(b.order_index || 0)
      || String(a.id).localeCompare(String(b.id))
  })
}

function getTrailerDisplayTitle(title, fallback) {
  const value = String(title || '').trim()
  if (!value) return fallback
  const normalized = normalizeSearchText(value).replaceAll('ı', 'i').replaceAll('ə', 'e')
  if (/^kurs(un)?\s+tanitim\s+videosu$/.test(normalized)) return fallback

  return value
    .replace(/tanıtım/gi, 'təqdimat')
    .replace(/tanitim/gi, 'təqdimat')
    .replace(/tanidim/gi, 'təqdimat')
}

function getOrderedSectionItems(sectionId, sectionVideos, sectionQuizzes) {
  const videos = sectionVideos
    .filter((video) => String(video.section_id) === String(sectionId))
    .sort((a, b) => Number(a.order_index) - Number(b.order_index) || Number(a.id) - Number(b.id))
  const quizzes = sectionQuizzes
    .filter((quiz) => String(quiz.section_id) === String(sectionId))
    .sort((a, b) => Number(a.order_index) - Number(b.order_index) || Number(a.id) - Number(b.id))
  const videoOrders = new Set(videos.map((video) => Number(video.order_index) || 0))
  const hasLegacyQuizOverlap = quizzes.some((quiz) => videoOrders.has(Number(quiz.order_index) || 0))

  return [
    ...videos.map((item) => ({
      type: 'video',
      item,
      effectiveOrder: Number(item.order_index) || 0,
    })),
    ...quizzes.map((item, index) => ({
      type: 'quiz',
      item,
      effectiveOrder: hasLegacyQuizOverlap
        ? videos.length + index + 1
        : Number(item.order_index) || videos.length + index + 1,
    })),
  ].sort((a, b) => a.effectiveOrder - b.effectiveOrder || (a.type === 'video' ? -1 : 1))
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
  const savedResumeRef = useRef({ videoId: null, seconds: -1, savedAt: 0 })
  const resumeSecondsRef = useRef(0)
  const resumeAppliedVideoIdRef = useRef(null)
  const youtubeSaveIntervalRef = useRef(null)
  const progressRef = useRef([])
  const curriculumListRef = useRef(null)
  const activeCurriculumItemRef = useRef(null)
  const [course, setCourse] = useState(location.state?.course || null)
  const [videos, setVideos] = useState([])
  const [lessonPreviews, setLessonPreviews] = useState([])
  const [sections, setSections] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [quizPreviews, setQuizPreviews] = useState([])
  const [trailer, setTrailer] = useState(null)
  const [activePreviewId, setActivePreviewId] = useState('trailer')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [progress, setProgress] = useState([])
  const [hasAccess, setHasAccess] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [showAccessWelcome, setShowAccessWelcome] = useState(false)
  const [certificateLoading, setCertificateLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requested, setRequested] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [activeQuizId, setActiveQuizId] = useState(null)
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState({})
  const [checkedQuizId, setCheckedQuizId] = useState(null)
  const [finishedQuizIds, setFinishedQuizIds] = useState({})
  const [quizExpanded, setQuizExpanded] = useState(false)
  const [expandedSectionIds, setExpandedSectionIds] = useState(() => new Set())
  const [curriculumSearch, setCurriculumSearch] = useState('')
  // Signed, short-lived Bunny embed URL for the lesson currently on screen.
  const [signedUrl, setSignedUrl] = useState(null)
  const [signedFor, setSignedFor] = useState(null)
  const [signedError, setSignedError] = useState(false)
  const [previewThumbFrames, setPreviewThumbFrames] = useState({})
  const [muteAutoplay, setMuteAutoplay] = useState(shouldMuteMobileAutoplay)
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const adminPreview = isAdmin(user)
  const userId = user?.id
  const userEmail = user?.email
  // Stable id for data loading: route param, or the course passed via navigation
  // state. Keying the load effect on this (not the `course` object it also sets)
  // avoids redundant reloads.
  const courseParam = id || ''
  const initialCourseId = location.state?.course?.id || (isNumericCourseParam(courseParam) ? courseParam : null)
  const [resolvedCourseId, setResolvedCourseId] = useState(initialCourseId)
  const courseId = resolvedCourseId
  const courseInstructorId = course?.instructor_id
  const teacherViewMode = new URLSearchParams(location.search).get('view') === 'buyer' ? 'buyer' : 'student'
  const isCourseOwner = Boolean(courseInstructorId && userId && courseInstructorId === userId)
  const isTeacherBuyerPreview = isCourseOwner && teacherViewMode === 'buyer'
  const canViewFullCourse = (hasAccess || adminPreview || isCourseOwner) && !isTeacherBuyerPreview

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const setTeacherCourseViewMode = useCallback((mode) => {
    const nextMode = mode === 'buyer' ? 'buyer' : 'student'
    const params = new URLSearchParams(location.search)
    if (nextMode === 'buyer') params.set('view', 'buyer')
    else params.delete('view')
    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true, state: location.state })
  }, [location.pathname, location.search, location.state, navigate])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

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
      const canPlayLesson = canViewFullCourse || item.is_free || playable?.is_free
      const rawUrl = canPlayLesson ? (playable?.video_url || item.video_url || null) : null
      // Bunny lessons carry a GUID instead of a URL; it's only present on rows
      // the viewer is allowed to read (free previews, or the full set once
      // enrolled/owner/admin), so its presence doubles as the "unlocked" signal.
      const bunnyId = canPlayLesson ? (playable?.bunny_video_id || null) : null
      const embedUrl = rawUrl
        ? (isYouTubeUrl(rawUrl) ? toYouTubeEmbedUrl(rawUrl, index) : normalizeExternalUrl(rawUrl))
        : null
      const locked = !rawUrl && !bunnyId
      const title = item.title || t(placeholderLessons[index % placeholderLessons.length].titleKey)
      return {
        id: item.id,
        title,
        displayTitle: title,
        course_id: item.course_id || playable?.course_id || courseId,
        duration: item.duration || playable?.duration || '',
        is_free: item.is_free,
        section_id: item.section_id || playable?.section_id || null,
        order_index: item.order_index,
        thumbnail_url: playable?.thumbnail_url || item.thumbnail_url || null,
        source_url: rawUrl ? normalizeExternalUrl(rawUrl) : null,
        video_url: embedUrl,
        bunny_video_id: bunnyId,
        locked,
      }
    })
  }, [canViewFullCourse, courseId, lessonPreviews, playableById, t, videos])

  const outlineQuizzes = useMemo(
    () => (quizzes.length > 0 ? quizzes : quizPreviews),
    [quizPreviews, quizzes]
  )
  const playableQuizzes = useMemo(
    () => (canViewFullCourse ? quizzes : quizPreviews.filter((quiz) => quiz.is_free)),
    [canViewFullCourse, quizPreviews, quizzes]
  )
  const activeQuiz = playableQuizzes.find((quiz) => String(quiz.id) === String(activeQuizId)) || null
  const selectedActiveVideo = activeQuiz ? null : lessons.find((video) => String(video.id) === String(activeVideoId)) || null
  const activeVideo = selectedActiveVideo || null

  useEffect(() => {
    activeVideoIdRef.current = activeVideo?.id || null
    advancingVideoIdRef.current = null
    playbackSecondsRef.current = 0
  }, [activeVideo?.id])
  // Preview samples are explicitly selected by the instructor. Keep this list
  // available for enrolled users and owners too, so they see the same course
  // preview card when reviewing the published page.
  const previewLessons = useMemo(
    () => lessons.filter((lesson) => lesson.is_free && !lesson.locked),
    [lessons]
  )
  const trailerVideo = useMemo(() => (
    trailer ? {
      id: `trailer-${trailer.course_id}`,
      title: getTrailerDisplayTitle(trailer.title, t('courseTrailer')),
      bunny_video_id: trailer.bunny_video_id,
      is_trailer: true,
    } : null
  ), [t, trailer])
  const publicPreviewVideo = (
    activePreviewId === 'trailer'
      ? trailerVideo
      : previewLessons.find((lesson) => String(lesson.id) === String(activePreviewId))
  ) || trailerVideo || previewLessons[0] || null
  // Keep the header, opened section, and active row tied to the media that is
  // actually playing. Public preview viewers can land on a free lesson even
  // when the first curriculum lesson is locked.
  const playerVideo = previewModalOpen
    ? publicPreviewVideo
    : activeQuiz
      ? null
    : canViewFullCourse
      ? (activeVideo || trailerVideo)
      : null
  const playerVideoId = playerVideo?.id
  const playerBunnyId = playerVideo?.bunny_video_id
  const activePlayerLesson = !activeQuiz && playerVideo && !playerVideo.is_trailer
    ? lessons.find((lesson) => String(lesson.id) === String(playerVideo.id)) || playerVideo
    : null
  const activeLessonRowId = activePlayerLesson?.id || (canViewFullCourse && !playerVideo?.is_trailer ? activeVideo?.id : null)
  const previewChoices = useMemo(() => [
    ...(trailerVideo ? [trailerVideo] : []),
    ...previewLessons,
  ], [previewLessons, trailerVideo])
  const activeLessonIndex = lessons.findIndex((video) => String(video.id) === String(activeVideo?.id))
  const watchedIds = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => String(item.video_id))),
    [progress]
  )
  const completedCount = lessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
  const completionPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0
  const fullCourseDurationSeconds = lessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0)
  const fullCourseDuration = formatSectionDuration(fullCourseDurationSeconds, t)
  const fullCourseDurationLong = formatLongSectionDuration(fullCourseDurationSeconds, t)
  const outlineQuizQuestionCount = getQuizQuestionCount(outlineQuizzes)
  const curriculumSections = useMemo(() => {
    const orderedSections = [...sections].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const effective = orderedSections.length > 0
      ? orderedSections
      : [{ id: 'default', title: 'Section 1', order_index: 1 }]

    return effective.map((section, sectionIndex) => {
      const sectionNumber = Number(section.order_index) || sectionIndex + 1
      const sectionLessons = lessons.filter((lesson) => {
        if (section.id === 'default') return true
        if (!lesson.section_id && sectionIndex === 0) return true
        return String(lesson.section_id) === String(section.id)
      })
      const sectionQuizzes = outlineQuizzes.filter((quiz) => String(quiz.section_id) === String(section.id))
      const sectionItems = getOrderedSectionItems(section.id, sectionLessons, sectionQuizzes)
      const completed = sectionLessons.filter((lesson) => watchedIds.has(String(lesson.id))).length
      const duration = sectionLessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0)
      const questionCount = getQuizQuestionCount(sectionQuizzes)
      const numberedTitle = `${t('sectionLabel')} ${sectionNumber}`
      const defaultTitle = `Section ${sectionNumber}`

      return {
        ...section,
        sectionNumber,
        displayTitle: section.title && section.title !== defaultTitle
          ? `${numberedTitle}: ${section.title}`
          : numberedTitle,
        lessons: sectionLessons,
        quizzes: sectionQuizzes,
        items: sectionItems,
        completed,
        duration: formatSectionDuration(duration, t),
        questionCount,
      }
    }).filter((section) => section.lessons.length > 0 || section.quizzes.length > 0 || sections.length > 0)
  }, [lessons, outlineQuizzes, sections, t, watchedIds])
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
      const sectionQuizzes = sectionMatches
        ? section.quizzes
        : (section.quizzes || []).filter((quiz) => (
          normalizeSearchText(`${quiz.title || ''} ${quiz.questions?.[0]?.prompt || ''}`).includes(query)
        ))
      const sectionItems = getOrderedSectionItems(section.id, sectionLessons, sectionQuizzes)
      const duration = sectionLessons.reduce((total, lesson) => total + durationToSeconds(lesson.duration), 0)
      const questionCount = getQuizQuestionCount(sectionQuizzes)
      return {
        ...section,
        lessons: sectionLessons,
        quizzes: sectionQuizzes,
        items: sectionItems,
        completed: sectionLessons.filter((lesson) => watchedIds.has(String(lesson.id))).length,
        duration: formatSectionDuration(duration, t),
        questionCount,
      }
    }).filter((section) => section.lessons.length > 0 || section.quizzes.length > 0)
  }, [curriculumSearchTerm, curriculumSections, t, watchedIds])
  const activeSectionId = curriculumSections.find((section) => (
    section.lessons.some((lesson) => String(lesson.id) === String(activeLessonRowId))
    || section.quizzes?.some((quiz) => String(quiz.id) === String(activeQuiz?.id))
  ))?.id
  const activeLessonDetails = (() => {
    const displayLesson = activePlayerLesson || activeVideo
    if (!displayLesson?.id) return null

    const allSectionItems = curriculumSections.flatMap((section) => section.items || [])
    const activeContentIndex = allSectionItems.findIndex((entry) => (
      entry.type === 'video' && String(entry.item.id) === String(displayLesson.id)
    ))

    for (const [sectionIndex, section] of curriculumSections.entries()) {
      const lessonIndex = (section.items || []).findIndex((entry) => (
        entry.type === 'video' && String(entry.item.id) === String(displayLesson.id)
      ))
      if (lessonIndex === -1) continue

      const lessonNumber = `${section.sectionNumber || sectionIndex + 1}.${lessonIndex + 1}`
      const lessonTitle = displayLesson.displayTitle || displayLesson.title || t('lessonTitle')
      return {
        lessonNumber,
        lessonTitle,
        sectionTitle: section.displayTitle || `${t('sectionLabel')} ${section.sectionNumber || sectionIndex + 1}`,
        summary: `${t('lessonLabel')} ${activeContentIndex + 1} / ${allSectionItems.length}`,
      }
    }

    return null
  })()
  const orderedCurriculumLessons = useMemo(() => (
    curriculumSections
      .flatMap((section) => section.items || [])
      .filter((entry) => entry.type === 'video' && !entry.item.locked)
      .map((entry) => entry.item)
  ), [curriculumSections])

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

  useEffect(() => {
    if (!activeLessonRowId && !activeQuiz?.id) return undefined

    const frameId = window.requestAnimationFrame(() => {
      const item = activeCurriculumItemRef.current
      if (!item) return

      const list = curriculumListRef.current
      if (list && list.scrollHeight > list.clientHeight) {
        const listRect = list.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        const centeredTop = list.scrollTop + itemRect.top - listRect.top - ((list.clientHeight - itemRect.height) / 2)
        list.scrollTo({ top: Math.max(0, centeredTop), behavior: 'smooth' })
        return
      }

      item.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeLessonRowId, activeQuiz?.id, activeSectionId, expandedSectionIds, visibleCurriculumSections])

  const toggleCurriculumSection = (sectionId) => {
    const sectionKey = String(sectionId)
    setExpandedSectionIds((current) => {
      const next = new Set(current)
      if (next.has(sectionKey)) next.delete(sectionKey)
      else next.add(sectionKey)
      return next
    })
  }

  const saveResumeLesson = useCallback(async (videoId, positionSeconds = 0, force = false) => {
    if (!userId || !courseId || !videoId || String(videoId).startsWith('placeholder-')) return
    const seconds = Math.max(0, Math.floor(Number(positionSeconds) || 0))
    const previous = savedResumeRef.current
    if (!force && String(previous.videoId) === String(videoId) && Date.now() - previous.savedAt < 5000 && Math.abs(seconds - previous.seconds) < 5) return
    savedResumeRef.current = { videoId, seconds, savedAt: Date.now() }

    const existing = progressRef.current.find((item) => String(item.video_id) === String(videoId))
    const updatedAt = new Date().toISOString()
    const resumeRow = {
      user_id: userId,
      video_id: videoId,
      watched: Boolean(existing?.watched),
      updated_at: updatedAt,
      last_opened_at: updatedAt,
      position_seconds: seconds,
    }
    const { error } = await supabase.from('video_progress').upsert(resumeRow, { onConflict: 'user_id,video_id' })
    if (error) {
      savedResumeRef.current = { videoId: null, seconds: -1, savedAt: 0 }
      return
    }
    setProgress((items) => {
      const match = items.some((item) => String(item.video_id) === String(videoId))
      return match
        ? items.map((item) => String(item.video_id) === String(videoId) ? { ...item, ...resumeRow } : item)
        : [...items, resumeRow]
    })
  }, [courseId, userId])

  useEffect(() => {
    const saveCurrentPosition = () => {
      const videoId = activeVideoIdRef.current
      if (!videoId || !canViewFullCourse) return
      const seconds = playerRef.current?.getCurrentTime?.()
        ?? legacyVideoRef.current?.currentTime
        ?? playbackSecondsRef.current
        ?? 0
      void saveResumeLesson(videoId, seconds, true)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveCurrentPosition()
    }
    window.addEventListener('pagehide', saveCurrentPosition)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', saveCurrentPosition)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [canViewFullCourse, saveResumeLesson])

  const selectTrailer = () => {
    if (!trailerVideo) return
    setActiveQuizId(null)
    setActiveQuizQuestionIndex(0)
    setCheckedQuizId(null)
    setActivePreviewId('trailer')
    setPreviewModalOpen(false)
    activeVideoIdRef.current = null
    setActiveVideoId(null)
  }

  const selectLesson = (sectionId, videoId) => {
    const lesson = lessons.find((item) => String(item.id) === String(videoId))
    if (!lesson || lesson.locked) {
      toast(t('unlockFullCourse'))
      return
    }
    setActiveQuizId(null)
    setShowAccessWelcome(false)
    setActiveQuizQuestionIndex(0)
    setCheckedQuizId(null)
    const sectionKey = String(sectionId)
    setExpandedSectionIds((current) => {
      if (current.has(sectionKey)) return current
      const next = new Set(current)
      next.add(sectionKey)
      return next
    })
    setActiveVideoId(videoId)
    resumeSecondsRef.current = 0
    resumeAppliedVideoIdRef.current = null
    if (canViewFullCourse) void saveResumeLesson(videoId, 0, true)
    if (!canViewFullCourse) {
      setActivePreviewId(videoId)
      setMuteAutoplay(true)
      setPreviewModalOpen(true)
    }
  }

  const selectQuiz = (sectionId, quizId) => {
    const quiz = outlineQuizzes.find((item) => String(item.id) === String(quizId))
    const playableQuiz = playableQuizzes.find((item) => String(item.id) === String(quizId))
    if (!quiz || (!canViewFullCourse && !playableQuiz)) {
      toast(t('unlockFullCourse'))
      return
    }
    const sectionKey = String(sectionId)
    setShowAccessWelcome(false)
    setExpandedSectionIds((current) => {
      if (current.has(sectionKey)) return current
      const next = new Set(current)
      next.add(sectionKey)
      return next
    })
    setActiveQuizId(quizId)
    setActiveQuizQuestionIndex(0)
    setCheckedQuizId(null)
    setFinishedQuizIds((current) => ({ ...current, [quizId]: false }))
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
      let lookupCourseId = location.state?.course?.id || (isNumericCourseParam(courseParam) ? courseParam : null)
      let currentCourse = location.state?.course || null

      if (!lookupCourseId && courseParam) {
        const { data: slugCourses } = await supabase.from('Courses').select('*')
        currentCourse = (slugCourses || []).find((item) => slugifyCourseTitle(item.title) === courseParam) || null
        lookupCourseId = currentCourse?.id || null
      }

      if (!lookupCourseId) {
        navigate('/')
        return
      }

      if (mounted) setResolvedCourseId(lookupCourseId)

      if (!currentCourse) {
        const { data } = await supabase.from('Courses').select('*').eq('id', lookupCourseId).single()
        currentCourse = data
      }
      if (currentCourse && !getCourseAuthorName(currentCourse)) {
        const [courseWithAuthor] = await attachCourseAuthorNames([currentCourse])
        currentCourse = courseWithAuthor
      }

      if (!currentCourse) {
        navigate('/')
        return
      }

      if (mounted && currentCourse) {
        setCourse(currentCourse)
        const canonicalCourseUrl = getCourseUrl(currentCourse)
        if (courseParam && location.pathname !== canonicalCourseUrl) {
          navigate(canonicalCourseUrl, {
            replace: true,
            state: { ...(location.state || {}), course: currentCourse },
          })
        }
      }

      const [
        { data: videoData },
        { data: previewData },
        { data: sectionData },
        { data: quizData },
        quizPreviewResponse,
        { data: trailerData },
      ] = await Promise.all([
        supabase.from('videos').select('*').eq('course_id', lookupCourseId).order('order_index', { ascending: true }),
        supabase.from('lesson_previews').select('*').eq('course_id', lookupCourseId).order('order_index', { ascending: true }),
        supabase.from('course_sections').select('*').eq('course_id', lookupCourseId).order('order_index', { ascending: true }),
        supabase.from('course_quizzes').select('*').eq('course_id', lookupCourseId).order('order_index', { ascending: true }),
        fetch(`/api/course-quiz-previews?courseId=${encodeURIComponent(lookupCourseId)}`)
          .then((response) => (response.ok ? response.json() : { quizzes: [] }))
          .catch(() => ({ quizzes: [] })),
        supabase.from('course_trailers').select('*').eq('course_id', lookupCourseId).maybeSingle(),
      ])

      const sortedVideos = sortVideosByCurriculum(videoData, sectionData)
      const shouldInitializeVideo = String(initializedCourseIdRef.current) !== String(lookupCourseId)
      if (mounted) {
        setVideos(sortedVideos)
        setLessonPreviews(previewData || [])
        setSections(sectionData || [])
        setQuizzes(quizData || [])
        setQuizPreviews(quizPreviewResponse?.quizzes || [])
        setTrailer(trailerData || null)
        setActivePreviewId(trailerData ? 'trailer' : '')
        if (!userId && shouldInitializeVideo) {
          const initialVideoId = location.state?.videoId || (trailerData ? null : sortedVideos[0]?.id) || null
          initializedCourseIdRef.current = lookupCourseId
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
          if (shouldInitializeVideo) {
            const initialVideoId = location.state?.videoId || sortedVideos[0]?.id || null
            initializedCourseIdRef.current = lookupCourseId
            activeVideoIdRef.current = initialVideoId
            setActiveVideoId(initialVideoId)
          }
          setHasAccess(true)
          setIsEnrolled(false)
          setProgress([])
          setLoading(false)
        }
        return
      }

      if (currentCourse?.instructor_id === userId) {
        if (mounted) {
          if (shouldInitializeVideo) {
            const initialVideoId = location.state?.videoId || sortedVideos[0]?.id || null
            initializedCourseIdRef.current = lookupCourseId
            activeVideoIdRef.current = initialVideoId
            setActiveVideoId(initialVideoId)
          }
          setHasAccess(true)
          setIsEnrolled(false)
          setProgress([])
          setLoading(false)
        }
        return
      }

      let access = false
      let enrolled = false
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const response = await fetch(`/api/course-access?courseId=${encodeURIComponent(lookupCourseId)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const result = await response.json().catch(() => ({}))
          if (response.ok) {
            access = Boolean(result.access)
            enrolled = Boolean(result.isEnrolled)
          }
        }
      } catch {
        access = false
        enrolled = false
      }

      if (!access) {
        const studentKeys = Array.from(new Set([userId, userEmail, userEmail?.toLowerCase()].filter(Boolean)))
        const { data: enrollmentData } = await supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', lookupCourseId)
          .in('user_id', studentKeys)

        enrolled = enrollmentData?.some((item) => (item.status || 'active') === 'active') || false
        access = enrolled
      }
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
        if (shouldInitializeVideo) {
          const resumeVideoId = access
            ? getResumeVideoId({
              requestedVideoId: location.state?.videoId,
              userId,
              courseId: lookupCourseId,
              videos: sortedVideos,
              progress: progressData,
            })
            : null
          const initialVideoId = access
            ? resumeVideoId || (trailerData ? null : sortedVideos[0]?.id) || null
            : (trailerData ? null : sortedVideos[0]?.id) || null
          const resumeRow = progressData.find((item) => String(item.video_id) === String(initialVideoId))
          resumeSecondsRef.current = Math.max(0, Number(resumeRow?.position_seconds) || 0)
          resumeAppliedVideoIdRef.current = null
          initializedCourseIdRef.current = lookupCourseId
          activeVideoIdRef.current = initialVideoId
          setActiveVideoId(initialVideoId)
        }
        setHasAccess(access)
        setIsEnrolled(enrolled || access)
        setProgress(progressData)
        setLoading(false)
      }
    }

    loadCourse()
    return () => {
      mounted = false
    }
  }, [adminPreview, courseParam, location.pathname, location.state, navigate, userEmail, userId])

  useEffect(() => {
    if (!course?.id || loading || !isEnrolled) {
      setShowAccessWelcome(false)
      return
    }

    const storageKey = `bilx-course-access-welcome-${userId || 'student'}-${course.id}`
    try {
      const hasSavedProgress = progress.some((item) => item.watched)
      const hasResumeLesson = Boolean(window.localStorage.getItem(getCourseResumeStorageKey(userId, course.id)))
      if (window.localStorage.getItem(storageKey) || hasSavedProgress || hasResumeLesson) {
        setShowAccessWelcome(false)
        return
      }
      window.localStorage.setItem(storageKey, 'seen')
      setShowAccessWelcome(true)
    } catch {
      setShowAccessWelcome(true)
    }
  }, [course?.id, isEnrolled, loading, progress, userId])

  useEffect(() => {
    if (!canViewFullCourse || !userId || !courseId || !activeVideo?.id || activeVideo.locked) return
    try {
      window.localStorage.setItem(getCourseResumeStorageKey(userId, courseId), JSON.stringify({
        videoId: activeVideo.id,
        updatedAt: new Date().toISOString(),
      }))
    } catch {
      // Resume is a convenience; playback still works when storage is blocked.
    }
  }, [activeVideo?.id, activeVideo?.locked, canViewFullCourse, courseId, userId])

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

    const orderedLessons = orderedCurriculumLessons.length > 0 ? orderedCurriculumLessons : lessons
    const index = orderedLessons.findIndex((video) => String(video.id) === String(currentId))
    const nextVideo = orderedLessons[index + 1]
    if (!nextVideo) {
      void markWatched(currentId)
      return
    }

    // Advance immediately. Progress persistence must not hold the player on the
    // old lesson, and duplicate Player.js "ended" events must not advance twice.
    advancingVideoIdRef.current = currentId
    activeVideoIdRef.current = nextVideo.id
    resumeSecondsRef.current = 0
    resumeAppliedVideoIdRef.current = null
    setActiveVideoId(nextVideo.id)
    void saveResumeLesson(nextVideo.id)
    void markWatched(currentId)
  }, [lessons, markWatched, orderedCurriculumLessons, saveResumeLesson])

  const playFirstLessonAfterTrailer = useCallback((expectedChoiceId = null) => {
    if (expectedChoiceId !== null && String(expectedChoiceId) !== 'trailer') return
    if (String(advancingVideoIdRef.current) === 'trailer') return

    const orderedLessons = orderedCurriculumLessons.length > 0 ? orderedCurriculumLessons : lessons.filter((lesson) => !lesson.locked)
    const firstLesson = orderedLessons[0]
    if (!firstLesson) return

    advancingVideoIdRef.current = 'trailer'
    setActiveQuizId(null)
    setActivePreviewId(getPreviewChoiceId(firstLesson))
    activeVideoIdRef.current = firstLesson.id
    setActiveVideoId(firstLesson.id)
  }, [lessons, orderedCurriculumLessons, setActivePreviewId, setActiveQuizId, setActiveVideoId])

  const playNextPreview = useCallback((expectedChoiceId = null) => {
    if (!publicPreviewVideo) return

    const currentChoiceId = getPreviewChoiceId(publicPreviewVideo)
    if (!currentChoiceId || String(advancingVideoIdRef.current) === String(currentChoiceId)) return
    if (expectedChoiceId !== null && String(expectedChoiceId) !== String(currentChoiceId)) return

    const currentIndex = previewChoices.findIndex((video) => (
      String(getPreviewChoiceId(video)) === String(currentChoiceId)
    ))
    const nextVideo = previewChoices[currentIndex + 1]
    if (!nextVideo) {
      if (!publicPreviewVideo.is_trailer) void markWatched(publicPreviewVideo.id)
      return
    }

    advancingVideoIdRef.current = currentChoiceId
    setActiveQuizId(null)
    setActivePreviewId(getPreviewChoiceId(nextVideo))

    if (!nextVideo.is_trailer) {
      activeVideoIdRef.current = nextVideo.id
      setActiveVideoId(nextVideo.id)
    }

    if (!publicPreviewVideo.is_trailer) void markWatched(publicPreviewVideo.id)
  }, [markWatched, previewChoices, publicPreviewVideo, setActivePreviewId])

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
    if (!user || !activeVideo?.id || !commentBody.trim() || commentSubmitting) return
    if (String(activeVideo.id).startsWith('placeholder-')) {
      toast.error(t('commentSaveFailed'))
      return
    }

    const timestampSeconds = Math.max(0, Math.floor(getCurrentPlaybackSeconds()))
    const storedBody = `[[bilx-time:${timestampSeconds}]] ${commentBody.trim()}`
    setCommentSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/email?action=save-comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        videoId: activeVideo.id,
        courseId,
        lessonTitle: activeVideo.title || activeVideo.displayTitle,
        orderIndex: activeVideo.order_index,
        sectionId: activeVideo.section_id,
        body: storedBody,
      }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setCommentSubmitting(false)
      toast.error(result.error || t('commentSaveFailed'))
      return
    }

    setCommentBody('')
    setCommentSubmitting(false)
    if (Array.isArray(result.comments)) setComments(result.comments)

    try {
      if (course?.instructor_id) {
        await supabase.rpc('create_notification', {
          p_user_id: course.instructor_id,
          p_title: t('newCommentTitle'),
          p_body: t('newCommentBody').replace('{title}', course.title),
          p_link: getCourseUrl(course),
        })
      }
      await sendEmailNotification({
        type: 'comment',
        courseId: course.id,
        courseTitle: course.title,
        instructorId: course.instructor_id,
        link: `${window.location.origin}${getCourseUrl(course)}`,
      })
    } catch {
      // Comment is already saved; notification/email failures should not block it.
    }
  }

  const activeQuizQuestions = Array.isArray(activeQuiz?.questions) ? activeQuiz.questions : []
  const safeActiveQuizQuestionIndex = Math.min(activeQuizQuestionIndex, Math.max(activeQuizQuestions.length - 1, 0))
  const activeQuizQuestion = activeQuizQuestions[safeActiveQuizQuestionIndex] || null
  const activeQuizAnswerKey = activeQuiz ? `${activeQuiz.id}:${safeActiveQuizQuestionIndex}` : ''
  const activeQuizAnswer = activeQuiz ? quizAnswers[activeQuizAnswerKey] : undefined
  const activeQuizChecked = activeQuiz ? String(checkedQuizId) === activeQuizAnswerKey : false
  const activeQuizFinished = activeQuiz ? Boolean(finishedQuizIds[activeQuiz.id]) : false
  const activeQuizExpanded = Boolean(activeQuiz && quizExpanded)
  const activeQuizExplanation = activeQuizQuestion && activeQuizAnswer !== undefined
    ? activeQuizQuestion.explanations?.[Number(activeQuizAnswer)] || ''
    : ''
  const activeQuizResults = activeQuizQuestions.map((question, index) => {
    const answer = activeQuiz ? quizAnswers[`${activeQuiz.id}:${index}`] : undefined
    const isCorrect = Number(answer) === Number(question.correctIndex)
    return {
      question,
      index,
      answer,
      isCorrect,
      selectedAnswer: answer !== undefined ? question.options?.[Number(answer)] || '' : '',
      correctAnswer: question.options?.[Number(question.correctIndex)] || '',
      explanation: answer !== undefined ? question.explanations?.[Number(answer)] || '' : '',
      options: (question.options || []).map((option, optionIndex) => ({
        option,
        optionIndex,
        explanation: question.explanations?.[optionIndex] || '',
        isSelected: Number(answer) === optionIndex,
        isCorrect: Number(question.correctIndex) === optionIndex,
      })),
    }
  })
  const activeQuizCorrectCount = activeQuizResults.filter((result) => result.isCorrect).length
  const hasNextActiveQuizQuestion = safeActiveQuizQuestionIndex < activeQuizQuestions.length - 1

  useEffect(() => {
    if (!activeQuizExpanded) return undefined

    document.body.classList.add('quiz-fullscreen-open')

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setQuizExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.classList.remove('quiz-fullscreen-open')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeQuizExpanded])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mediaQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)')
    const updateMuteAutoplay = () => setMuteAutoplay(shouldMuteMobileAutoplay())

    updateMuteAutoplay()
    mediaQuery.addEventListener?.('change', updateMuteAutoplay)
    return () => mediaQuery.removeEventListener?.('change', updateMuteAutoplay)
  }, [])

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
              ? { trailerCourseId: courseId, autoplay: true, muted: previewModalOpen || !canViewFullCourse ? true : muteAutoplay }
              : { videoId: playerVideoId, autoplay: true, muted: previewModalOpen || !canViewFullCourse ? true : muteAutoplay }
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
  }, [canViewFullCourse, courseId, muteAutoplay, playerVideo?.is_trailer, playerVideoId, playerBunnyId, previewModalOpen])

  useEffect(() => {
    const lessonChoices = previewChoices.filter((video) => !video.is_trailer && video.bunny_video_id)
    if (!previewModalOpen || lessonChoices.length === 0) {
      return undefined
    }

    let cancelled = false

    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const entries = await Promise.all(lessonChoices.map(async (video) => {
          const response = await fetch('/api/bunny-playback', {
            method: 'POST',
            headers,
            body: JSON.stringify({ videoId: video.id, autoplay: false, muted: true }),
          })
          const text = await response.text()
          const data = text ? JSON.parse(text) : {}
          return response.ok && data.url ? [String(video.id), data.url] : null
        }))

        if (!cancelled) {
          setPreviewThumbFrames(Object.fromEntries(entries.filter(Boolean)))
        }
      } catch {
        if (!cancelled) setPreviewThumbFrames({})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [previewChoices, previewModalOpen])

  // Auto-advance Bunny lessons. Bunny's embed speaks the Player.js protocol over
  // postMessage; we subscribe to its "ended" event and roll to the next lesson —
  // the same behaviour the YouTube iframe API gives us below.
  useEffect(() => {
    if (activeQuiz || !playerVideo?.bunny_video_id) return undefined
    if (!signedUrl || signedFor !== String(playerVideo.id)) return undefined
    const iframe = bunnyFrameRef.current
    if (!iframe) return undefined

    const postPlayerMessage = (method, value = undefined, listener = undefined) => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          context: 'player.js',
          version: '0.0.1',
          method,
          ...(value !== undefined ? { value } : {}),
          ...(listener !== undefined ? { listener } : {}),
        }),
        '*'
      )
    }

    const subscribe = () => {
      for (const eventName of ['ended', 'timeupdate']) {
        postPlayerMessage('addEventListener', eventName, `bilx-${eventName}`)
      }
    }
    const shouldStartPreview = playerVideo?.is_trailer || previewModalOpen || !canViewFullCourse
    const startPreviewPlayback = () => {
      if (!shouldStartPreview) return
      postPlayerMessage('play')
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
      if (data.event === 'ready') {
        subscribe()
        if (!playerVideo?.is_trailer && resumeSecondsRef.current > 0 && String(resumeAppliedVideoIdRef.current) !== String(playerVideo.id)) {
          postPlayerMessage('setCurrentTime', resumeSecondsRef.current)
          resumeAppliedVideoIdRef.current = playerVideo.id
        }
        startPreviewPlayback()
      }
      else if (data.event === 'ended') {
        if (playerVideo?.is_trailer && canViewFullCourse && !previewModalOpen) playFirstLessonAfterTrailer(getPreviewChoiceId(playerVideo))
        else if (playerVideo?.is_trailer || previewModalOpen || !canViewFullCourse) playNextPreview(getPreviewChoiceId(playerVideo))
        else playNext(playerVideo.id)
      }
      else if (data.event === 'timeupdate') {
        const seconds = data.value?.seconds ?? data.value?.currentTime ?? data.value
        if (Number.isFinite(Number(seconds))) {
          playbackSecondsRef.current = Number(seconds)
          if (Number(seconds) > 0 && !playerVideo?.is_trailer && canViewFullCourse) {
            setShowAccessWelcome(false)
            void saveResumeLesson(playerVideo.id, seconds)
          }
        }
      }
    }

    window.addEventListener('message', handleMessage)
    // The player may already be ready (e.g. on lesson switch) — subscribe now too.
    subscribe()
    const retry = window.setInterval(subscribe, 700)
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 4200)
    const playKick = shouldStartPreview ? window.setTimeout(startPreviewPlayback, 350) : null
    const secondPlayKick = shouldStartPreview ? window.setTimeout(startPreviewPlayback, 1300) : null
    const thirdPlayKick = shouldStartPreview ? window.setTimeout(startPreviewPlayback, 2600) : null

    return () => {
      window.removeEventListener('message', handleMessage)
      window.clearInterval(retry)
      window.clearTimeout(stopRetry)
      if (playKick) window.clearTimeout(playKick)
      if (secondPlayKick) window.clearTimeout(secondPlayKick)
      if (thirdPlayKick) window.clearTimeout(thirdPlayKick)
    }
  }, [activeQuiz, canViewFullCourse, playerVideo, previewModalOpen, signedUrl, signedFor, playFirstLessonAfterTrailer, playNext, playNextPreview, saveResumeLesson])

  useEffect(() => {
    if (activeQuiz || !playerVideo?.video_url || !isYouTubeUrl(playerVideo.video_url) || !playerFrameRef.current) return undefined

    let cancelled = false

    function attachPlayer() {
      if (cancelled || !window.YT?.Player || !playerFrameRef.current) return
      playerRef.current?.destroy?.()
      playerRef.current = new window.YT.Player(playerFrameRef.current, {
        events: {
          onReady: (event) => {
            if (!playerVideo?.is_trailer && resumeSecondsRef.current > 0) {
              event.target.seekTo(resumeSecondsRef.current, true)
              resumeAppliedVideoIdRef.current = playerVideo.id
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING && !playerVideo?.is_trailer && canViewFullCourse) {
              setShowAccessWelcome(false)
              void saveResumeLesson(playerVideo.id, event.target.getCurrentTime(), true)
              window.clearInterval(youtubeSaveIntervalRef.current)
              youtubeSaveIntervalRef.current = window.setInterval(() => {
                void saveResumeLesson(playerVideo.id, event.target.getCurrentTime())
              }, 5000)
            }
            if ([window.YT.PlayerState.PAUSED, window.YT.PlayerState.ENDED].includes(event.data)) {
              window.clearInterval(youtubeSaveIntervalRef.current)
              void saveResumeLesson(playerVideo.id, event.target.getCurrentTime(), true)
            }
            if (event.data === window.YT.PlayerState.ENDED) {
              if (playerVideo?.is_trailer && canViewFullCourse && !previewModalOpen) playFirstLessonAfterTrailer(getPreviewChoiceId(playerVideo))
              else if (playerVideo?.is_trailer || previewModalOpen || !canViewFullCourse) playNextPreview(getPreviewChoiceId(playerVideo))
              else playNext(playerVideo.id)
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
      window.clearInterval(youtubeSaveIntervalRef.current)
    }
  }, [activeQuiz, canViewFullCourse, playerVideo, previewModalOpen, playFirstLessonAfterTrailer, playNext, playNextPreview, saveResumeLesson])

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
    const url = `${window.location.origin}${getCourseUrl(course)}`
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
    setMuteAutoplay(true)
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

  const handleCurriculumPanelWheel = (event) => {
    const list = curriculumListRef.current
    if (!canViewFullCourse || !list || list.scrollHeight <= list.clientHeight) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select')) return

    event.preventDefault()
    list.scrollTop += event.deltaY
  }

  if (!course) return null
  const instructorName = getCourseAuthorName(course)
  const canUseLessonPlayer = canViewFullCourse || previewLessons.length > 0 || Boolean(trailerVideo)
  const showInlineLessonPlayer = canViewFullCourse
  const isCourseContentLoading = loading
  const showCourseHero = (!loading && !isEnrolled) || isCourseOwner || adminPreview
  const showBuyerCourseActions = !canViewFullCourse || isTeacherBuyerPreview

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell">
        {showCourseHero && (
        <section className="course-hero course-hero-public">
          <div className="course-hero-copy">
            <p className="role-pill course-brand-pill">BilX</p>
            <h1>{course.title}</h1>
            {instructorName && (
              <button className="teacher-profile-link course-instructor hero-author" type="button" onClick={() => navigate(`/teacher/${course.instructor_id}`)}>
                {t('instructorLabel')}: {instructorName}
              </button>
            )}
            <p>{course.description}</p>
            <div className="tag-row">
              {!isCourseContentLoading && (
                <>
                  <span>{lessons.length} {t('courseLessons')}{fullCourseDuration ? ` / ${fullCourseDuration}` : ''}</span>
                  <span>{outlineQuizzes.length} {t('quizLabel')} / {outlineQuizQuestionCount} {t('questionCountLabel')}</span>
                </>
              )}
              <span>{t('lifetimeAccess')}</span>
              {showBuyerCourseActions && (
              <button className="hero-whatsapp-button" type="button" onClick={handleWhatsApp}>
                <MessageCircle size={16} /> {t('courseAcquire')}
              </button>
              )}
            </div>
            <button type="button" className="outline-button share-button" onClick={handleShare}>
              <Share2 size={16} /> {t('shareCourse')}
            </button>
            {isCourseOwner && (
              <div className="teacher-course-view-switch" aria-label={t('teacherViewModeLabel')}>
                <span>{t('teacherViewModeLabel')}</span>
                <div>
                  <button
                    type="button"
                    className={teacherViewMode === 'student' ? 'active' : ''}
                    aria-pressed={teacherViewMode === 'student'}
                    onClick={() => {
                      setTeacherCourseViewMode('student')
                      setPreviewModalOpen(false)
                    }}
                  >
                    {t('teacherStudentView')}
                  </button>
                  <button
                    type="button"
                    className={teacherViewMode === 'buyer' ? 'active' : ''}
                    aria-pressed={teacherViewMode === 'buyer'}
                    onClick={() => {
                      setTeacherCourseViewMode('buyer')
                      setActiveQuizId(null)
                      setPreviewModalOpen(false)
                    }}
                  >
                    {t('teacherBuyerView')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {showBuyerCourseActions && (
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
          )}
        </section>
        )}

        {showAccessWelcome && !isCourseContentLoading && (
          <section className="course-access-welcome" aria-live="polite">
            <strong>{t('courseAccessWelcomeTitle').replace('{title}', course.title)}</strong>
            <p>{t('courseAccessWelcomeBody')}</p>
          </section>
        )}

        {isCourseContentLoading ? (
          <section className="course-player-layout curriculum-only course-content-loading" aria-live="polite">
            <div className="course-lesson-panel">
              <div className="lesson-panel-header">
                <div>
                  <h2>{t('courseContent')}</h2>
                  <p>{t('loading')}</p>
                </div>
              </div>
            </div>
          </section>
        ) : canUseLessonPlayer ? (
          <>
          {lessons.length === 0 && quizzes.length === 0 && !trailerVideo ? (
            <section className="panel-card empty-box">
              {t('courseHasNoLessonsYet')}
            </section>
          ) : (
          <section className={showInlineLessonPlayer ? 'course-player-layout' : 'course-player-layout curriculum-only'}>
            {showInlineLessonPlayer && (
            <div className="course-player-main">
              <div className="youtube-player-shell">
                {previewModalOpen ? (
                  <div className="empty-player">{t('previewCourse')}</div>
                ) : activeQuiz ? (
                  <div className={activeQuizExpanded ? 'quiz-player quiz-player-expanded' : 'quiz-player'}>
                    <div className="quiz-player-header">
                      <h2>{activeQuiz.title}</h2>
                      <button
                        className="quiz-expand-button"
                        type="button"
                        onClick={() => setQuizExpanded((current) => !current)}
                        title={activeQuizExpanded ? t('collapseQuiz') : t('expandQuiz')}
                        aria-label={activeQuizExpanded ? t('collapseQuiz') : t('expandQuiz')}
                      >
                        {activeQuizExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                      </button>
                    </div>
                    {activeQuizFinished ? (
                      <div className="quiz-question-card quiz-results-card">
                        <span className="lesson-section-context">{t('quizResult')}</span>
                        <strong>{t('quizScore').replace('{correct}', activeQuizCorrectCount).replace('{total}', activeQuizQuestions.length)}</strong>
                        <QuizResultSummary correctCount={activeQuizCorrectCount} totalCount={activeQuizQuestions.length} t={t} />
                        <h3 className="quiz-review-heading">{t('quizCheckAnswers')}</h3>
                        <div className="quiz-result-list">
                          {activeQuizResults.map((result) => (
                            <div className={result.isCorrect ? 'quiz-review-item correct' : 'quiz-review-item wrong'} key={result.index}>
                              <strong>{result.index + 1}. {result.question.prompt}</strong>
                              <p>{t('yourAnswer')}: {result.selectedAnswer || t('notAnswered')}</p>
                              <p>{t('correctAnswerLabel')}: {result.correctAnswer}</p>
                              <div className="quiz-review-answer-list">
                                {result.options.map((option) => (
                                  <div
                                    className={`quiz-review-answer${option.isCorrect ? ' correct' : ''}${option.isSelected ? ' selected' : ''}`}
                                    key={option.optionIndex}
                                  >
                                    <strong>{option.optionIndex + 1}. {option.option}</strong>
                                    {option.explanation && <p>{t('answerExplanation')}: {option.explanation}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : activeQuizQuestion ? (
                      <div className="quiz-question-card">
                        <span className="lesson-section-context">{`${safeActiveQuizQuestionIndex + 1}/${activeQuizQuestions.length || 1}`}</span>
                        <div className="quiz-question-prompt">
                          <span>{t('quizQuestion')} {safeActiveQuizQuestionIndex + 1}</span>
                          <strong>{activeQuizQuestion.prompt}</strong>
                          <small>{t('chooseCorrectOption')}</small>
                        </div>
                        <div className="quiz-answer-list">
                          {(activeQuizQuestion.options || []).map((option, optionIndex) => {
                            const isSelected = Number(activeQuizAnswer) === optionIndex
                            const isCorrect = Number(activeQuizQuestion.correctIndex) === optionIndex
                            const showCorrect = activeQuizChecked && isCorrect
                            const showWrong = activeQuizChecked && isSelected && !isCorrect
                            return (
                              <button
                                type="button"
                                key={optionIndex}
                                disabled={activeQuizChecked}
                                className={`quiz-answer-option${isSelected ? ' selected' : ''}${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}`}
                                onClick={() => {
                                  setQuizAnswers((current) => ({ ...current, [activeQuizAnswerKey]: optionIndex }))
                                  setCheckedQuizId(activeQuizAnswerKey)
                                }}
                              >
                                <span>{optionIndex + 1}</span>
                                {option}
                              </button>
                            )
                          })}
                        </div>
                        <div className="quiz-player-actions">
                          {activeQuizChecked && (
                            <strong className={Number(activeQuizAnswer) === Number(activeQuizQuestion.correctIndex) ? 'quiz-result correct' : 'quiz-result wrong'}>
                              {Number(activeQuizAnswer) === Number(activeQuizQuestion.correctIndex) ? t('quizCorrectCongrats') : t('quizWrongAnswer')}
                            </strong>
                          )}
                          {hasNextActiveQuizQuestion ? (
                            <button className="primary-button" type="button" disabled={activeQuizAnswer === undefined} onClick={() => {
                              setActiveQuizQuestionIndex((current) => current + 1)
                              setCheckedQuizId(null)
                            }}>
                              {t('nextButton')}
                            </button>
                          ) : (
                            <button
                              className="primary-button"
                              type="button"
                              disabled={activeQuizAnswer === undefined}
                              onClick={() => setFinishedQuizIds((current) => ({ ...current, [activeQuiz.id]: true }))}
                            >
                              {t('seeAllResults')}
                            </button>
                          )}
                        </div>
                        {activeQuizChecked && activeQuizExplanation && (
                          <div className="quiz-explanation-box">
                            <strong>{t('answerExplanation')}</strong>
                            <p>{activeQuizExplanation}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="muted">{t('quizNoQuestions')}</p>
                    )}
                  </div>
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
                    src={getEmbedSrc(playerVideo.video_url, muteAutoplay)}
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
                    muted={muteAutoplay}
                    playsInline
                    src={playerVideo.video_url}
                    onLoadedMetadata={(event) => {
                      if (!playerVideo?.is_trailer && resumeSecondsRef.current > 0) {
                        event.currentTarget.currentTime = resumeSecondsRef.current
                        resumeAppliedVideoIdRef.current = playerVideo.id
                      }
                    }}
                    onPlay={() => {
                      if (!playerVideo?.is_trailer && canViewFullCourse) {
                        setShowAccessWelcome(false)
                        void saveResumeLesson(playerVideo.id, legacyVideoRef.current?.currentTime || 0, true)
                      }
                    }}
                    onTimeUpdate={(event) => {
                      playbackSecondsRef.current = event.currentTarget.currentTime
                      if (!playerVideo?.is_trailer && canViewFullCourse) {
                        void saveResumeLesson(playerVideo.id, event.currentTarget.currentTime)
                      }
                    }}
                    onPause={(event) => {
                      if (!playerVideo?.is_trailer && canViewFullCourse) {
                        void saveResumeLesson(playerVideo.id, event.currentTarget.currentTime, true)
                      }
                    }}
                    onEnded={() => {
                      if (playerVideo?.is_trailer && canViewFullCourse && !previewModalOpen) playFirstLessonAfterTrailer(getPreviewChoiceId(playerVideo))
                      else if (playerVideo?.is_trailer || previewModalOpen || !canViewFullCourse) playNextPreview(getPreviewChoiceId(playerVideo))
                      else playNext(playerVideo.id)
                    }}
                    className="youtube-player"
                  >
                    {t('videoNotSupported')}
                  </video>
                ) : (
                  <div className="empty-player">{t('videoNotSupported')}</div>
                )}
              </div>
              <div className={activePlayerLesson ? 'course-player-details active-player-details' : 'course-player-details'}>
                <div>
                  <p className="player-eyebrow">
                    {activeQuiz
                      ? t('quizLabel')
                      : playerVideo?.is_trailer
                      ? t('courseTrailer')
                      : activeLessonDetails?.summary || `${t('lessonLabel')} ${activeLessonIndex + 1} / ${lessons.length}`}
                  </p>
                  {activeQuiz ? (
                    <h2>{activeQuiz.title}</h2>
                  ) : playerVideo?.is_trailer ? (
                    <h2>{playerVideo?.title || t('courseTrailer')}</h2>
                  ) : activeLessonDetails ? (
                    <div className="lesson-heading-block">
                      <span className="lesson-section-context">{activeLessonDetails.sectionTitle}</span>
                      <h2>
                        <span>{t('lessonLabel')} {activeLessonDetails.lessonNumber} :</span>
                        {activeLessonDetails.lessonTitle}
                      </h2>
                    </div>
                  ) : (
                    <h2>{playerVideo?.displayTitle || playerVideo?.title || t('lessonTitle')}</h2>
                  )}
                </div>
                {hasAccess && !activeQuiz && !playerVideo?.is_trailer && (
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
            )}

            <aside className={canViewFullCourse ? 'course-lesson-panel enrolled-lesson-panel' : 'course-lesson-panel'} onWheel={handleCurriculumPanelWheel}>
              <div className="lesson-panel-header">
                <div>
                  <h2>{t('courseContent')}</h2>
                  <p>{t('courseCurriculumSubtitle')}</p>
                  <div className="curriculum-summary-pills" aria-label={t('courseContent')}>
                    <span><strong>{lessons.length}</strong> {t('courseLessons')}{fullCourseDuration ? ` / ${fullCourseDuration}` : ''}</span>
                    <span><strong>{outlineQuizzes.length}</strong> {t('explainedTestCollection')} / <strong>{outlineQuizQuestionCount}</strong> {t('questionCountLabel')}</span>
                  </div>
                  {!canViewFullCourse && (
                  <div className="curriculum-detail-card">
                    <strong>
                      {t('courseCurriculumCardTitle')
                        .replace('{sectionCount}', curriculumSections.length)
                        .replace('{lessonCount}', lessons.length)}
                    </strong>
                    <ul>
                      <li>{t('courseCurriculumBulletSections').replace('{sectionCount}', curriculumSections.length)}</li>
                      <li>{t('courseCurriculumBulletLessons').replace('{lessonCount}', lessons.length)}</li>
                      <li>{t('courseCurriculumBulletDuration').replace('{duration}', fullCourseDurationLong || t('durationMissing'))}</li>
                      <li>{t('courseCurriculumBulletQuizzes').replace('{quizCount}', outlineQuizzes.length)}</li>
                      <li>{t('courseCurriculumBulletQuestions').replace('{questionCount}', outlineQuizQuestionCount)}</li>
                    </ul>
                  </div>
                  )}
                </div>
                {canViewFullCourse ? (
                  <strong>{completionPercent}%</strong>
                ) : (
                  <button className="primary-button unlock-course-button" type="button" onClick={handleWhatsApp}>
                    <MessageCircle size={16} /> {t('unlockFullCourse')}
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
              <div className="course-lesson-list" ref={curriculumListRef}>
                {canViewFullCourse && trailerVideo && (
                  <button
                    type="button"
                    className={`${playerVideo?.is_trailer ? 'course-lesson-item intro-lesson-item active' : 'course-lesson-item intro-lesson-item'}`}
                    onClick={selectTrailer}
                  >
                    <span className="lesson-status">
                      {playerVideo?.is_trailer ? <PlayCircle size={20} /> : <Play size={20} />}
                    </span>
                    <span className="lesson-copy">
                      <strong>0. {t('courseTrailer')}</strong>
                      <small>{trailerVideo.title}</small>
                    </span>
                  </button>
                )}
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
                            {section.completed}/{section.items?.length || section.lessons.length}
                            {` | ${formatCourseContentSummary(section.lessons.length, section.duration, section.quizzes?.length || 0, section.questionCount || 0, t)}`}
                          </small>
                        </span>
                        <ChevronDown size={20} />
                      </button>
                      {isExpanded && (
                        <div className="curriculum-section-lessons">
                          {(section.items || []).map((contentItem, contentIndex) => {
                            const item = contentItem.item
                            const isVideo = contentItem.type === 'video'
                            const isActive = isVideo
                              ? String(item.id) === String(activeLessonRowId)
                              : String(item.id) === String(activeQuiz?.id)
                            const isWatched = isVideo && watchedIds.has(String(item.id))
                            const isLocked = isVideo ? item.locked : !(canViewFullCourse || item.is_free)

                            return (
                              <button
                                key={`${contentItem.type}-${item.id}`}
                                ref={isActive ? activeCurriculumItemRef : null}
                                className={`${isActive ? 'course-lesson-item active' : 'course-lesson-item'}${isWatched ? ' watched' : ''}${isLocked ? ' locked' : ''}${isVideo ? '' : ' quiz-content-item'}`}
                                onClick={() => {
                                  if (isLocked) handleWhatsApp()
                                  else if (isVideo) selectLesson(section.id, item.id)
                                  else selectQuiz(section.id, item.id)
                                }}
                              >
                                <span className="lesson-status">
                                  {isLocked ? <Lock size={19} /> : !isVideo ? <ClipboardList size={20} /> : isWatched ? <CheckCircle2 size={20} /> : isActive ? <PlayCircle size={20} /> : <Circle size={20} />}
                                </span>
                                <span className="lesson-copy">
                                  <strong>{section.sectionNumber || sectionIndex + 1}.{contentIndex + 1} {item.displayTitle || item.title}</strong>
                                  {isVideo ? (item.duration || isLocked) && (
                                    <small>
                                      {item.duration && <><Clock3 size={14} /> {item.duration}</>}
                                      {isLocked && <span>{item.duration ? ' | ' : ''}{t('unlockFullCourse')}</span>}
                                    </small>
                                  ) : (
                                    <small>
                                      {item.questions?.length || item.question_count || 0} {t('questionCountLabel')}
                                      {isLocked && <span> | {t('unlockFullCourse')}</span>}
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
              {isEnrolled && completionPercent === 100 && (
                <div className="course-certificate-card">
                  <Award size={24} />
                  <div>
                    <strong>{t('courseCertificate')}</strong>
                    <small>{t('certificateReady')}</small>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={certificateLoading}
                    onClick={openCertificate}
                  >
                    {certificateLoading ? t('loading') : t('getCertificate')}
                  </button>
                </div>
              )}
            </aside>
          </section>
          )}
          {hasAccess && activeVideo && (
          <section className="course-below-layout">
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
                  <button className="primary-button" type="submit" disabled={!commentBody.trim() || commentSubmitting}>
                    {commentSubmitting ? t('loading') : t('addComment')}
                  </button>
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
          <div className="course-below-spacer" aria-hidden="true" />
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
                        <small>{formatCourseContentSummary(section.lessons.length, section.duration, section.quizzes?.length || 0, section.questionCount || 0, t)}</small>
                      </div>
                      {(section.items || []).map((contentItem, itemIndex) => {
                        const item = contentItem.item
                        const isVideo = contentItem.type === 'video'
                        return (
                          <button key={`${contentItem.type}-${item.id}`} className="locked-lesson locked-lesson-button" type="button" onClick={handleWhatsApp}>
                            <span>{section.sectionNumber || sectionIndex + 1}.{itemIndex + 1}</span>
                            {item.displayTitle || item.title}
                            <small>{isVideo && previewLessons.some((lesson) => String(lesson.id) === String(item.id)) ? t('coursePreview') : t('locked')}</small>
                          </button>
                        )
                      })}
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
                      key={publicPreviewVideo.id}
                      ref={bunnyFrameRef}
                      className="youtube-player"
                      src={signedUrl}
                      title={publicPreviewVideo.title}
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      onLoad={() => {
                        window.setTimeout(() => {
                          bunnyFrameRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ context: 'player.js', version: '0.0.1', method: 'play' }),
                            '*'
                          )
                        }, 250)
                      }}
                    />
                  ) : (
                    <div className="empty-player">{signedError ? t('videoNotSupported') : t('loadingVideo')}</div>
                  )
                ) : publicPreviewVideo.video_url && isYouTubeUrl(publicPreviewVideo.video_url) ? (
                  <iframe
                    ref={playerFrameRef}
                    className="youtube-player"
                    src={getEmbedSrc(publicPreviewVideo.video_url, muteAutoplay)}
                    title={publicPreviewVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : publicPreviewVideo.video_url ? (
                  <video
                    ref={legacyVideoRef}
                    controls
                    autoPlay
                    muted={muteAutoplay}
                    playsInline
                    src={publicPreviewVideo.video_url}
                    className="youtube-player"
                    onEnded={() => playNextPreview(getPreviewChoiceId(publicPreviewVideo))}
                  >
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
                const lessonFrameUrl = !video.is_trailer ? previewThumbFrames[String(video.id)] : ''
                const thumbnailUrl = video.is_trailer ? (course.thumbnail_url || getBunnyThumbnailSrc(video)) : ''
                return (
                  <button
                    type="button"
                    key={video.id}
                    className={isActive ? 'course-preview-choice active' : 'course-preview-choice'}
                    onClick={() => setActivePreviewId(choiceId)}
                  >
                    <span className="course-preview-choice-thumb">
                      {lessonFrameUrl ? (
                        <iframe
                          src={lessonFrameUrl}
                          title=""
                          tabIndex="-1"
                          aria-hidden="true"
                          loading="lazy"
                          allow="encrypted-media; picture-in-picture"
                        />
                      ) : thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          onError={(event) => { event.currentTarget.hidden = true }}
                        />
                      ) : (
                        <span className="course-preview-choice-placeholder" aria-hidden="true" />
                      )}
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
