import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardList, Eye, EyeOff, FolderPlus, GripVertical, Pencil, PlayCircle, Plus, Trash2, Upload } from 'lucide-react'
import * as tus from 'tus-js-client'
import { getCourseAuthorName } from './courseAuthors'
import { InboxPanel } from './Inbox'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function getCourseStatus(course) {
  if (!course) return 'pending'
  if (course.status) return course.status
  return course.is_published ? 'approved' : 'pending'
}

function getCourseStatusLabel(status) {
  if (status === 'approved') return 'courseStatusApproved'
  if (status === 'rejected') return 'courseStatusRejected'
  if (status === 'draft') return 'courseStatusDraft'
  return 'courseStatusPending'
}

function formatVideoDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  const parts = hours > 0 ? [hours, minutes, remainder] : [minutes, remainder]
  return parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join(':')
}

function isYouTubeUrl(url) {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return host === 'youtu.be' || host.includes('youtube.com')
  } catch {
    return false
  }
}

function toYouTubeEmbedUrl(url, autoplay = true) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace('www.', '')
    const videoId = host === 'youtu.be'
      ? parsed.pathname.replace('/', '')
      : parsed.searchParams.get('v') || parsed.pathname.split('/embed/')[1]
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? '1' : '0'}` : url
  } catch {
    return url
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('az-AZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function createEmptyQuizQuestion() {
  return {
    prompt: '',
    options: ['', '', '', ''],
    explanations: ['', '', '', ''],
    correctIndex: 0,
  }
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

function LocalizedFileInput({ accept, disabled, file, onChange, t, onFocus }) {
  const inputId = useId()

  return (
    <div className="localized-file-picker">
      <input
        id={inputId}
        className="localized-file-picker-input"
        type="file"
        accept={accept}
        disabled={disabled}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.files[0] || null, event.target)}
      />
      <label className={disabled ? 'localized-file-picker-button disabled' : 'localized-file-picker-button'} htmlFor={inputId}>
        {t('chooseFile')}
      </label>
      <span title={file?.name || ''}>{file?.name || t('noFileChosen')}</span>
    </div>
  )
}

function InstructorDashboard({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = profile?.role || 'student'
  const urlTab = searchParams.get('tab')
  const requestedCourseId = searchParams.get('course')
  const requestedLessonId = searchParams.get('lesson')
  const requestedQuizId = searchParams.get('quiz')
  const instructorView = searchParams.get('view') || 'courses'
  const creatingCourse = searchParams.get('create') === '1'
  const initialTab = ['new', 'approved', 'pending'].includes(urlTab) ? urlTab : 'new'
  const [courses, setCourses] = useState([])
  const [videos, setVideos] = useState([])
  const [sections, setSections] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [trailers, setTrailers] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '' })
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [newCourseTrailerTitle, setNewCourseTrailerTitle] = useState('')
  const [newCourseTrailerFile, setNewCourseTrailerFile] = useState(null)
  const [newCourseTrailerValidating, setNewCourseTrailerValidating] = useState(false)
  const [courseDetailsForm, setCourseDetailsForm] = useState({ title: '', description: '', price: '' })
  const [courseThumbnailFile, setCourseThumbnailFile] = useState(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDuration, setLessonDuration] = useState('')
  const [lessonIsFree, setLessonIsFree] = useState(false)
  const [lessonFile, setLessonFile] = useState(null)
  const [trailerFile, setTrailerFile] = useState(null)
  const [trailerValidating, setTrailerValidating] = useState(false)
  const [trailerTitle, setTrailerTitle] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [sectionTitle, setSectionTitle] = useState('')
  const [quizFormSectionId, setQuizFormSectionId] = useState('')
  const [editingQuizId, setEditingQuizId] = useState('')
  const [quizForm, setQuizForm] = useState({
    title: '',
    questions: [createEmptyQuizQuestion()],
  })
  const [activeQuizFormQuestionIndex, setActiveQuizFormQuestionIndex] = useState(0)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [curriculumVideoId, setCurriculumVideoId] = useState('')
  const [curriculumQuizId, setCurriculumQuizId] = useState('')
  const [curriculumQuizStarted, setCurriculumQuizStarted] = useState(false)
  const [curriculumQuizQuestionIndex, setCurriculumQuizQuestionIndex] = useState(0)
  const [curriculumQuizAnswers, setCurriculumQuizAnswers] = useState({})
  const [curriculumQuizCheckedId, setCurriculumQuizCheckedId] = useState('')
  const [curriculumFinishedQuizIds, setCurriculumFinishedQuizIds] = useState({})
  const [curriculumSignedUrl, setCurriculumSignedUrl] = useState('')
  const [curriculumPlaybackError, setCurriculumPlaybackError] = useState(false)
  const [curriculumOpenSections, setCurriculumOpenSections] = useState(() => new Set())
  const [curriculumSearch, setCurriculumSearch] = useState('')
  const [sectionDropTargetId, setSectionDropTargetId] = useState('')
  const draggedSectionIdRef = useRef('')
  const sectionDragOrderRef = useRef([])
  const sectionDragOriginalSectionsRef = useRef([])
  const sectionDropCompletedRef = useRef(false)
  const [detailsEditing, setDetailsEditing] = useState(false)
  const [mediaEditing, setMediaEditing] = useState(false)
  const [coverEditing, setCoverEditing] = useState(false)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('')
  const coverPreviewUrlRef = useRef('')
  const [detailTrailerUrl, setDetailTrailerUrl] = useState('')
  const [detailTrailerError, setDetailTrailerError] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('notice')
  const { t } = useLanguage()

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === String(selectedCourseId)),
    [courses, selectedCourseId]
  )
  const courseVideos = videos.filter((video) => String(video.course_id) === String(selectedCourseId))
  const selectedTrailer = trailers.find((trailer) => String(trailer.course_id) === String(selectedCourseId))

  useEffect(() => {
    if (!selectedCourseId) return
    // Keep the edit form aligned when the instructor selects another course.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourseDetailsForm({
      title: selectedCourse?.title || '',
      description: selectedCourse?.description || '',
      price: selectedCourse?.price ?? '',
    })
    setCourseThumbnailFile(null)
    if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current)
    coverPreviewUrlRef.current = ''
    setCoverPreviewUrl('')
    setDetailsEditing(false)
    setMediaEditing(false)
    setCoverEditing(false)
    // Thumbnail-only updates must not reset an open cover editor.
  }, [selectedCourseId, selectedCourse?.title, selectedCourse?.description, selectedCourse?.price])

  useEffect(() => () => {
    if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current)
  }, [])

  const showMessage = (text, type = 'notice') => {
    setMessage(text)
    setMessageType(type)
  }

  const setInstructorTab = (tabId, options = {}) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId }, { replace: options.replace ?? true })
  }

  const loadData = async (currentUser = user) => {
    if (!currentUser) {
      setDataLoading(false)
      return
    }
    setDataLoading(true)

    const { data: courseData, error: courseError } = await supabase
      .from('Courses')
      .select('*')
      .eq('instructor_id', currentUser.id)
      .order('id', { ascending: false })

    if (courseError) {
      showMessage(`${t('coursesLoadFailed')}${courseError.message}`, 'error')
      setDataLoading(false)
      return
    }

    const instructorName = profile?.full_name || currentUser.user_metadata?.full_name || currentUser.email || ''
    const nextCourses = (courseData || []).map((course) => ({
      ...course,
      instructor_name: course.instructor_name || instructorName,
    }))
    setCourses(nextCourses)

    const tabCourses = activeTab === 'approved'
      ? nextCourses.filter((course) => getCourseStatus(course) === 'approved' || course.is_published)
      : activeTab === 'pending'
        ? nextCourses.filter((course) => getCourseStatus(course) !== 'approved')
        : nextCourses
    const selectedStillExists = tabCourses.some((course) => String(course.id) === String(selectedCourseId))
    if (!selectedStillExists) {
      setSelectedCourseId(tabCourses[0] ? String(tabCourses[0].id) : '')
    }

    const ids = nextCourses.map((course) => course.id)
    if (ids.length === 0) {
      setVideos([])
      setSections([])
      setQuizzes([])
      setTrailers([])
      setInstructorTab('new')
      setDataLoading(false)
      return
    }

    const [
      { data: videoData, error: videoError },
      { data: sectionData, error: sectionError },
      { data: quizData, error: quizError },
      { data: trailerData, error: trailerError },
    ] = await Promise.all([
      supabase.from('videos').select('*').in('course_id', ids).order('order_index', { ascending: true }),
      supabase.from('course_sections').select('*').in('course_id', ids).order('order_index', { ascending: true }),
      supabase.from('course_quizzes').select('*').in('course_id', ids).order('order_index', { ascending: true }),
      supabase.from('course_trailers').select('*').in('course_id', ids),
    ])

    if (videoError) {
      showMessage(`${t('lessonsLoadFailed')}${videoError.message}`, 'error')
      setDataLoading(false)
      return
    }

    setVideos(videoData || [])
    setSections(sectionError ? [] : sectionData || [])
    setQuizzes(quizError ? [] : quizData || [])
    setTrailers(trailerError ? [] : trailerData || [])
    setDataLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    const nextTab = ['new', 'approved', 'pending'].includes(urlTab) ? urlTab : 'new'
    if (nextTab !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(nextTab)
    }
  }, [urlTab, activeTab])

  useEffect(() => {
    if (!requestedCourseId || String(selectedCourseId) === String(requestedCourseId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCourseId(requestedCourseId)
  }, [requestedCourseId, selectedCourseId])

  const curriculumCourseVideos = useMemo(
    () => videos.filter((video) => String(video.course_id) === String(requestedCourseId)),
    [requestedCourseId, videos]
  )
  const curriculumCourseQuizzes = useMemo(
    () => quizzes.filter((quiz) => String(quiz.course_id) === String(requestedCourseId)),
    [requestedCourseId, quizzes]
  )
  const curriculumActiveQuiz = curriculumCourseQuizzes.find((quiz) => String(quiz.id) === String(requestedQuizId || curriculumQuizId)) || null
  const curriculumActiveVideo = curriculumCourseVideos.find((video) => String(video.id) === String(requestedLessonId || curriculumVideoId))
    || (curriculumActiveQuiz ? null : curriculumCourseVideos[0])

  useEffect(() => {
    if (requestedQuizId || curriculumQuizId) return
    if (instructorView !== 'curriculum' || curriculumCourseVideos.length === 0) return
    const requestedVideo = curriculumCourseVideos.find((video) => String(video.id) === String(requestedLessonId))
    if (requestedVideo) return
    const selectedVideo = curriculumCourseVideos.find((video) => String(video.id) === String(curriculumVideoId))
    const nextVideoId = String(selectedVideo?.id || curriculumCourseVideos[0].id)
    setSearchParams({ course: String(requestedCourseId), view: 'curriculum', lesson: nextVideoId }, { replace: true })
  }, [curriculumCourseVideos, curriculumQuizId, curriculumVideoId, instructorView, requestedCourseId, requestedLessonId, requestedQuizId, setSearchParams])

  useEffect(() => {
    const sectionId = curriculumActiveQuiz?.section_id || curriculumActiveVideo?.section_id
    if (!sectionId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurriculumOpenSections(new Set([String(sectionId)]))
  }, [curriculumActiveQuiz?.section_id, curriculumActiveVideo?.section_id])

  const selectCurriculumVideo = (video) => {
    const videoId = String(video.id)
    setCurriculumVideoId(videoId)
    setCurriculumQuizId('')
    setCurriculumQuizStarted(false)
    setCurriculumQuizQuestionIndex(0)
    setCurriculumQuizCheckedId('')
    if (video.section_id) setSelectedSectionId(String(video.section_id))
    setSearchParams({ course: String(requestedCourseId), view: 'curriculum', lesson: videoId }, { replace: true })
  }

  const selectCurriculumQuiz = (quiz) => {
    const quizId = String(quiz.id)
    setCurriculumQuizId(quizId)
    setCurriculumVideoId('')
    setCurriculumQuizStarted(false)
    setCurriculumQuizQuestionIndex(0)
    setCurriculumQuizCheckedId('')
    setCurriculumFinishedQuizIds((current) => ({ ...current, [quizId]: false }))
    if (quiz.section_id) {
      setSelectedSectionId(String(quiz.section_id))
      setCurriculumOpenSections(new Set([String(quiz.section_id)]))
    }
    setSearchParams({ course: String(requestedCourseId), view: 'curriculum', quiz: quizId }, { replace: true })
  }

  const selectCurriculumSection = (section, sectionItems) => {
    const sectionId = String(section.id)
    if (curriculumOpenSections.has(sectionId)) {
      setCurriculumOpenSections(new Set())
      return
    }
    setCurriculumOpenSections(new Set([sectionId]))
    setSelectedSectionId(sectionId)
    const firstItem = sectionItems[0]
    if (firstItem?.type === 'quiz') selectCurriculumQuiz(firstItem.item)
    if (firstItem?.type === 'video') selectCurriculumVideo(firstItem.item)
  }

  useEffect(() => {
    if (!curriculumActiveVideo?.bunny_video_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurriculumSignedUrl('')
      setCurriculumPlaybackError(false)
      return undefined
    }

    let cancelled = false
    setCurriculumSignedUrl('')
    setCurriculumPlaybackError(false)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/bunny-playback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ videoId: curriculumActiveVideo.id, autoplay: false }),
        })
        const result = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok || !result.url) throw new Error(result.error || t('videoServiceUnavailable'))
        setCurriculumSignedUrl(result.url)
      } catch {
        if (!cancelled) setCurriculumPlaybackError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [curriculumActiveVideo?.bunny_video_id, curriculumActiveVideo?.id, t])

  useEffect(() => {
    if (activeTab === 'new' || courses.length === 0) return

    const tabCourses = activeTab === 'approved'
      ? courses.filter((course) => getCourseStatus(course) === 'approved' || course.is_published)
      : courses.filter((course) => getCourseStatus(course) !== 'approved')
    const selectedStillVisible = tabCourses.some((course) => String(course.id) === String(selectedCourseId))

    if (!selectedStillVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCourseId(tabCourses[0] ? String(tabCourses[0].id) : '')
    }
  }, [activeTab, courses, selectedCourseId])

  const uploadPublicFile = async (bucket, file, prefix) => {
    if (!file) return null

    const ext = file.name.split('.').pop()
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-')
    // eslint-disable-next-line react-hooks/purity
    const fileName = `${prefix}-${Date.now()}-${baseName}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      const message = t('uploadFailed')
        .replace('{bucket}', bucket)
        .replace('{error}', error.message)
      throw new Error(message)
    }

    return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl
  }

  const createCourse = async () => {
    if (newCourseTrailerValidating) {
      showMessage(t('trailerValidationWait'), 'error')
      return
    }
    if (!user || !form.title.trim() || !form.description.trim()) {
      showMessage(t('fillCourseFields'), 'error')
      return
    }
    if (!thumbnailFile || !newCourseTrailerFile) {
      showMessage(t('fillCourseMedia'), 'error')
      return
    }

    setLoading(true)
    setUploadPercent(0)
    showMessage('')

    try {
      const thumbnailUrl = await uploadPublicFile('thumbnails', thumbnailFile, 'thumb')
      const instructorName = profile?.full_name || user.user_metadata?.full_name || user.email
      let { data, error } = await supabase
        .from('Courses')
        .insert({
          title: form.title.trim(),
          description: form.description.trim(),
          price: Number(form.price || 0),
          instructor_id: user.id,
          instructor_name: instructorName,
          thumbnail_url: thumbnailUrl,
          is_published: false,
          status: 'draft',
        })
        .select()
        .single()

      if (error && error.message?.toLowerCase().includes('instructor_name')) {
        const retry = await supabase
          .from('Courses')
          .insert({
            title: form.title.trim(),
            description: form.description.trim(),
            price: Number(form.price || 0),
            instructor_id: user.id,
            thumbnail_url: thumbnailUrl,
            is_published: false,
            status: 'draft',
          })
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

      if (error) throw error

      const { data: firstSection } = await supabase
        .from('course_sections')
        .insert({ course_id: data.id, title: 'Section 1', order_index: 1 })
        .select()
        .single()

      let trailerUploadError = ''
      if (newCourseTrailerFile) {
        try {
          const title = newCourseTrailerTitle.trim() || t('courseTrailer')
          const presign = await createBunnyVideo(title)
          await uploadToBunny(newCourseTrailerFile, presign)
          await saveTrailerRecord({
            courseId: data.id,
            videoId: presign.videoId,
            title,
          })
        } catch (trailerError) {
          console.error('Course saved but trailer upload failed:', trailerError)
          trailerUploadError = trailerError.message || t('videoServiceUnavailable')
        }
      }

      setForm({ title: '', description: '', price: '' })
      setThumbnailFile(null)
      setNewCourseTrailerTitle('')
      setNewCourseTrailerFile(null)
      setSelectedCourseId(String(data.id))
      setSelectedSectionId(firstSection ? String(firstSection.id) : '')
      setSearchParams({ course: String(data.id), view: 'details' })
      showMessage(
        trailerUploadError
          ? t('courseSavedTrailerFailedDetail').replace('{error}', trailerUploadError)
          : t('courseCreatedAddLessons'),
        trailerUploadError ? 'error' : 'success'
      )
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Pushes the file bytes straight to Bunny over a resumable (TUS) upload using
  // the presigned credentials from /api/bunny-create-video. The Bunny API key is
  // never exposed here; we only ever hold a short-lived signature.
  const uploadToBunny = (file, presign) => new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 3000, 5000, 10000, 20000],
      // A course author may reuse the same local file for another trailer or
      // lesson. The default browser fingerprint would then try to resume an old
      // Bunny upload URL with credentials for the new video and fail at 0%.
      // Retries still work inside this upload instance.
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      uploadSize: file.size,
      headers: {
        AuthorizationSignature: presign.signature,
        AuthorizationExpire: String(presign.expire),
        VideoId: presign.videoId,
        LibraryId: String(presign.libraryId),
      },
      metadata: {
        filetype: file.type || 'video/mp4',
        title: file.name || 'lesson',
      },
      onError: reject,
      onProgress: (sent, total) => setUploadPercent(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: resolve,
    })
    upload.start()
  })

  const getVideoDuration = (file) => new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = video.duration
      cleanup()
      if (!Number.isFinite(duration)) {
        reject(new Error(t('videoDurationUnavailable')))
        return
      }
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error(t('videoDurationUnavailable')))
    }
    video.src = objectUrl
  })

  const selectLessonFile = async (file) => {
    setLessonFile(file)
    if (!file) {
      setLessonDuration('')
      return
    }

    try {
      const duration = await getVideoDuration(file)
      setLessonDuration(formatVideoDuration(duration))
    } catch {
      setLessonDuration('')
    }
  }

  const selectTrailerFile = async (file, setter, setValidating, input) => {
    if (!file) {
      setter(null)
      setValidating(false)
      return
    }

    // Retain the selection immediately, then prevent submission while mobile
    // Safari reads the metadata. Otherwise a fast tap can create the course
    // before the asynchronous duration check finishes.
    setter(file)
    setValidating(true)
    try {
      const duration = await getVideoDuration(file)
      if (duration > 60.5) {
        setter(null)
        if (input) input.value = ''
        showMessage(t('trailerTooLong'), 'error')
        return
      }
      showMessage(t('trailerDurationAccepted'), 'success')
    } catch (error) {
      setter(null)
      if (input) input.value = ''
      showMessage(error.message, 'error')
    } finally {
      setValidating(false)
    }
  }

  const createBunnyVideo = async (title) => {
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    if (!accessToken) throw new Error(t('sessionExpired'))

    const createRes = await fetch('/api/bunny-create-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ title }),
    })
    const raw = await createRes.text()
    let presign
    try {
      presign = raw ? JSON.parse(raw) : {}
    } catch {
      presign = {}
    }
    if (!createRes.ok || !presign.videoId) {
      throw new Error(presign.error || t('videoServiceUnavailable'))
    }
    return presign
  }

  const saveTrailerRecord = async ({ courseId, videoId, title }) => {
    const { error } = await supabase.rpc('save_my_course_trailer', {
      p_course_id: Number(courseId),
      p_bunny_video_id: videoId,
      p_title: title,
    })
    if (error) throw error
  }

  const uploadTrailer = async () => {
    if (!selectedCourseId) {
      showMessage(t('selectOrCreateCourse'), 'error')
      return
    }
    if (!trailerFile) {
      showMessage(t('selectVideoFile'), 'error')
      return
    }
    if (trailerValidating) {
      showMessage(t('trailerValidationWait'), 'error')
      return
    }

    setLoading(true)
    setUploadPercent(0)
    showMessage(t('preparingVideoUpload'))

    try {
      const title = trailerTitle.trim() || t('courseTrailer')
      const presign = await createBunnyVideo(title)
      await uploadToBunny(trailerFile, presign)

      await saveTrailerRecord({
        courseId: selectedCourseId,
        videoId: presign.videoId,
        title,
      })

      setTrailerFile(null)
      setTrailerTitle('')
      setMediaEditing(false)
      showMessage(t('trailerUploaded'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
      setUploadPercent(0)
    }
  }

  const saveCourseDetails = async () => {
    const targetCourse = requestedCourseId
      ? courses.find((course) => String(course.id) === String(requestedCourseId))
      : visibleSelectedCourse
    const targetApproved = targetCourse
      ? (getCourseStatus(targetCourse) === 'approved' || targetCourse.is_published)
      : false
    if (!targetCourse || targetApproved) return
    if (!courseDetailsForm.title.trim() || !courseDetailsForm.description.trim() || !courseDetailsForm.price) {
      showMessage(t('fillCourseFields'), 'error')
      return
    }

    setLoading(true)
    try {
      const thumbnailUrl = courseThumbnailFile
        ? await uploadPublicFile('thumbnails', courseThumbnailFile, 'thumb')
        : targetCourse.thumbnail_url

      const { error } = await supabase
        .from('Courses')
        .update({
          title: courseDetailsForm.title.trim(),
          description: courseDetailsForm.description.trim(),
          price: Number(courseDetailsForm.price),
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', targetCourse.id)

      if (error) throw error
      setCourseThumbnailFile(null)
      setDetailsEditing(false)
      setMediaEditing(false)
      showMessage(t('courseDetailsSaved'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const selectCourseCover = (file) => {
    if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current)
    const previewUrl = file ? URL.createObjectURL(file) : ''
    coverPreviewUrlRef.current = previewUrl
    setCoverPreviewUrl(previewUrl)
    setCourseThumbnailFile(file)
  }

  const clearCourseCoverSelection = () => {
    if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current)
    coverPreviewUrlRef.current = ''
    setCoverPreviewUrl('')
    setCourseThumbnailFile(null)
  }

  const saveCourseCover = async (selectedFile = courseThumbnailFile) => {
    const targetCourse = requestedCourseId
      ? courses.find((course) => String(course.id) === String(requestedCourseId))
      : visibleSelectedCourse
    const targetApproved = targetCourse
      ? (getCourseStatus(targetCourse) === 'approved' || targetCourse.is_published)
      : false
    if (!targetCourse || targetApproved || !selectedFile) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(t('sessionExpired'))
      const prepareResponse = await fetch('/api/course-cover-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          courseId: targetCourse.id,
          fileName: selectedFile.name,
        }),
      })
      const prepared = await prepareResponse.json().catch(() => ({}))
      if (!prepareResponse.ok || !prepared.path || !prepared.token || !prepared.publicUrl) {
        throw new Error(prepared.error || t('uploadFailed').replace('{bucket}', 'thumbnails').replace('{error}', ''))
      }
      const { error: uploadError } = await supabase.storage
        .from('thumbnails')
        .uploadToSignedUrl(prepared.path, prepared.token, selectedFile, {
          contentType: selectedFile.type || 'image/jpeg',
          cacheControl: '3600',
        })
      if (uploadError) throw uploadError
      const saveResponse = await fetch('/api/course-cover-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          courseId: targetCourse.id,
          publicUrl: prepared.publicUrl,
        }),
      })
      const saved = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok || !saved.course?.thumbnail_url) {
        throw new Error(saved.error || t('uploadFailed').replace('{bucket}', 'thumbnails').replace('{error}', ''))
      }
      const updatedCourse = saved.course
      setCourses((current) => current.map((course) => (
        String(course.id) === String(targetCourse.id)
          ? { ...course, thumbnail_url: updatedCourse.thumbnail_url }
          : course
      )))
      clearCourseCoverSelection()
      setCoverEditing(false)
      showMessage(t('coverSaved'), 'success')
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (instructorView !== 'details' || !requestedCourseId) return undefined
    const trailer = trailers.find((item) => String(item.course_id) === String(requestedCourseId))
    if (!trailer?.bunny_video_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailTrailerUrl('')
      setDetailTrailerError(false)
      return undefined
    }

    let cancelled = false
    setDetailTrailerUrl('')
    setDetailTrailerError(false)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/bunny-playback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ trailerCourseId: requestedCourseId, autoplay: false }),
        })
        const result = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok || !result.url) throw new Error(result.error)
        setDetailTrailerUrl(result.url)
      } catch {
        if (!cancelled) setDetailTrailerError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [instructorView, requestedCourseId, trailers])

  const removeCourseCover = async () => {
    const targetCourse = requestedCourseId
      ? courses.find((course) => String(course.id) === String(requestedCourseId))
      : visibleSelectedCourse
    const targetApproved = targetCourse
      ? (getCourseStatus(targetCourse) === 'approved' || targetCourse.is_published)
      : false
    if (!targetCourse || targetApproved || !window.confirm(t('confirmRemoveCover'))) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('Courses')
        .update({ thumbnail_url: null })
        .eq('id', targetCourse.id)
        .select('id')
        .single()

      if (error) throw error
      setCourses((current) => current.map((course) => (
        String(course.id) === String(targetCourse.id)
          ? { ...course, thumbnail_url: null }
          : course
      )))
      clearCourseCoverSelection()
      setCoverEditing(false)
      showMessage(t('coverRemoved'), 'success')
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const removeTrailer = async () => {
    if (!selectedTrailer || selectedCourseApproved || !window.confirm(t('confirmRemoveTrailer'))) return
    const { error } = await supabase
      .from('course_trailers')
      .delete()
      .eq('course_id', selectedTrailer.course_id)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }
    showMessage(t('trailerRemoved'), 'success')
    await loadData(user)
  }

  const addLesson = async (sectionIdOverride = '') => {
    if (!selectedCourseId) {
      showMessage(t('selectOrCreateCourse'), 'error')
      setInstructorTab('new')
      return
    }

    if (!lessonTitle.trim()) {
      showMessage(t('enterLessonTitle'), 'error')
      return
    }

    if (!lessonFile) {
      showMessage(t('selectVideoFile'), 'error')
      return
    }

    const currentSections = sections.filter((section) => String(section.course_id) === String(selectedCourseId))
    const selectedSection = currentSections.find((section) => String(section.id) === String(sectionIdOverride || selectedSectionId))
    const targetSectionId = selectedSection?.id || currentSections[0]?.id
    if (!targetSectionId) {
      showMessage(t('createSectionFirst'), 'error')
      return
    }

    setLoading(true)
    setUploadPercent(0)
    showMessage(t('uploadingVideo'))

    try {
      const detectedDuration = formatVideoDuration(await getVideoDuration(lessonFile))
      const sectionItems = getOrderedSectionItems(targetSectionId, videos, quizzes)

      // 1. Create the Bunny video and get a presigned upload.
      const presign = await createBunnyVideo(lessonTitle.trim())

      // 2. Upload the file directly to Bunny (with a live progress bar).
      await uploadToBunny(lessonFile, presign)

      // 3. Save the lesson, referencing the Bunny video.
      const lessonPayload = {
        course_id: Number(selectedCourseId),
        title: lessonTitle.trim(),
        bunny_video_id: presign.videoId,
        video_source: 'bunny',
        section_id: Number(targetSectionId),
        order_index: sectionItems.length + 1,
        is_free: lessonIsFree,
        duration: detectedDuration,
      }

      let { error } = await supabase.from('videos').insert(lessonPayload)

      if (error && error.message?.toLowerCase().includes('duration')) {
        const retryPayload = { ...lessonPayload }
        delete retryPayload.duration
        const retry = await supabase.from('videos').insert(retryPayload)
        error = retry.error
      }

      if (error) throw error

      setLessonTitle('')
      setLessonDuration('')
      setLessonFile(null)
      setLessonIsFree(false)
      showMessage(t('lessonAdded'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
      setUploadPercent(0)
    }
  }

  const createSection = async () => {
    const targetCourseId = requestedCourseId || selectedCourseId
    if (!targetCourseId) {
      showMessage(t('selectOrCreateCourse'), 'error')
      return
    }

    const courseSections = sections.filter((section) => String(section.course_id) === String(targetCourseId))
    const nextIndex = courseSections.length + 1
    const { data, error } = await supabase
      .from('course_sections')
      .insert({
        course_id: Number(targetCourseId),
        title: sectionTitle.trim() || 'Section',
        order_index: nextIndex,
      })
      .select()
      .single()

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    setSectionTitle('')
    setSelectedSectionId(String(data.id))
    setSections((current) => [...current, data])
    setCurriculumOpenSections(new Set([String(data.id)]))
    showMessage(t('sectionCreated'), 'success')
  }

  const editSection = async (section) => {
    const nextTitle = window.prompt(t('sectionTitlePlaceholder'), section.title)
    if (nextTitle === null || !nextTitle.trim() || nextTitle.trim() === section.title) return

    const { error } = await supabase
      .from('course_sections')
      .update({ title: nextTitle.trim() })
      .eq('id', section.id)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }
    showMessage(t('sectionUpdated'), 'success')
    await loadData(user)
  }

  const deleteSection = async (section) => {
    const sectionLessons = courseVideos.filter((video) => String(video.section_id) === String(section.id))
    if (sectionLessons.length > 0) {
      showMessage(t('sectionDeleteNeedsEmpty'), 'error')
      return
    }
    if (!window.confirm(t('confirmDeleteSection'))) return

    const { error } = await supabase.from('course_sections').delete().eq('id', section.id)
    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }
    showMessage(t('sectionDeleted'), 'success')
    await loadData(user)
  }

  const editLesson = async (video) => {
    const nextTitle = window.prompt(t('lessonTitle'), video.title)
    if (nextTitle === null || !nextTitle.trim() || nextTitle.trim() === video.title) return

    const { error } = await supabase.from('videos').update({ title: nextTitle.trim() }).eq('id', video.id)
    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }
    showMessage(t('lessonUpdated'), 'success')
    await loadData(user)
  }

  const replaceLessonVideo = async (video, file) => {
    if (!file) return

    setLoading(true)
    setUploadPercent(0)
    showMessage(t('uploadingVideo'))
    try {
      const detectedDuration = formatVideoDuration(await getVideoDuration(file))
      const presign = await createBunnyVideo(video.title)
      await uploadToBunny(file, presign)

      const { error } = await supabase
        .from('videos')
        .update({
          bunny_video_id: presign.videoId,
          video_source: 'bunny',
          duration: detectedDuration,
        })
        .eq('id', video.id)

      if (error) throw error
      showMessage(t('lessonVideoReplaced'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
      setUploadPercent(0)
    }
  }

  const deleteLesson = async (videoId) => {
    const { error } = await supabase.from('videos').delete().eq('id', videoId)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(t('lessonDeleted'), 'success')
    await loadData(user)
  }

  const resetQuizForm = () => {
    setEditingQuizId('')
    setActiveQuizFormQuestionIndex(0)
    setQuizForm({
      title: '',
      questions: [createEmptyQuizQuestion()],
    })
  }

  const startQuizForSection = (sectionId) => {
    setQuizFormSectionId((current) => (String(current) === String(sectionId) ? '' : String(sectionId)))
    resetQuizForm()
  }

  const editQuiz = (quiz) => {
    const questions = Array.isArray(quiz.questions) && quiz.questions.length > 0
      ? quiz.questions
      : [createEmptyQuizQuestion()]
    setEditingQuizId(String(quiz.id))
    setQuizFormSectionId(String(quiz.section_id))
    setActiveQuizFormQuestionIndex(0)
    setQuizForm({
      title: quiz.title || '',
      questions: questions.map((question) => {
        const options = [...(question.options || [])]
        const explanations = [...(question.explanations || [])]
        while (options.length < 4) options.push('')
        while (explanations.length < 4) explanations.push('')
        return {
          prompt: question.prompt || '',
          options: options.slice(0, 4),
          explanations: explanations.slice(0, 4),
          correctIndex: Number(question.correctIndex) || 0,
        }
      }),
    })
  }

  const updateQuizQuestionPrompt = (questionIndex, value) => {
    setQuizForm((current) => ({
      ...current,
      questions: current.questions.map((question, index) => (
        index === questionIndex ? { ...question, prompt: value } : question
      )),
    }))
  }

  const updateQuizOption = (questionIndex, optionIndex, value) => {
    setQuizForm((current) => ({
      ...current,
      questions: current.questions.map((question, index) => (
        index === questionIndex
          ? {
              ...question,
              options: question.options.map((option, currentOptionIndex) => (
                currentOptionIndex === optionIndex ? value : option
              )),
            }
          : question
      )),
    }))
  }

  const updateQuizExplanation = (questionIndex, optionIndex, value) => {
    setQuizForm((current) => ({
      ...current,
      questions: current.questions.map((question, index) => (
        index === questionIndex
          ? {
              ...question,
              explanations: question.explanations.map((explanation, currentExplanationIndex) => (
                currentExplanationIndex === optionIndex ? value : explanation
              )),
            }
          : question
      )),
    }))
  }

  const updateQuizCorrectAnswer = (questionIndex, optionIndex) => {
    setQuizForm((current) => ({
      ...current,
      questions: current.questions.map((question, index) => (
        index === questionIndex ? { ...question, correctIndex: optionIndex } : question
      )),
    }))
  }

  const addQuizQuestion = () => {
    setQuizForm((current) => ({
      ...current,
      questions: [...current.questions, createEmptyQuizQuestion()],
    }))
    setActiveQuizFormQuestionIndex(quizForm.questions.length)
  }

  const removeQuizQuestion = (questionIndex) => {
    setQuizForm((current) => ({
      ...current,
      questions: current.questions.length === 1
        ? current.questions
        : current.questions.filter((_, index) => index !== questionIndex),
    }))
    setActiveQuizFormQuestionIndex((current) => Math.max(0, Math.min(current, quizForm.questions.length - 2)))
  }

  const quizQuestionIsComplete = (question) => (
    question?.prompt?.trim()
    && question.options.every((option) => option.trim())
  )

  const saveCurrentQuizQuestion = () => {
    const currentQuestionIndex = Math.min(activeQuizFormQuestionIndex, Math.max(quizForm.questions.length - 1, 0))
    if (!quizQuestionIsComplete(quizForm.questions[currentQuestionIndex])) {
      showMessage(t('quizFillAllFields'), 'error')
      return
    }

    showMessage(t('quizQuestionSaved'), 'success')
    if (currentQuestionIndex < quizForm.questions.length - 1) {
      setActiveQuizFormQuestionIndex(currentQuestionIndex + 1)
      return
    }

    setQuizForm((current) => ({
      ...current,
      questions: [...current.questions, createEmptyQuizQuestion()],
    }))
    setActiveQuizFormQuestionIndex(currentQuestionIndex + 1)
  }

  const getQuizSaveErrorMessage = (error) => {
    const message = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
    if (message.includes('course_quizzes') || message.includes('schema cache') || error?.code === 'PGRST205') {
      return t('quizSetupMissing')
    }
    return `${t('errorOccurred')}${error.message}`
  }

  const saveQuiz = async (section, courseIdOverride = '') => {
    const targetCourseId = courseIdOverride || visibleSelectedCourse?.id || requestedCourseId || selectedCourseId
    if (!section || !targetCourseId) return
    const cleanQuestions = quizForm.questions.map((question) => ({
      prompt: question.prompt.trim(),
      options: question.options.map((option) => option.trim()),
      explanations: question.explanations.map((explanation) => explanation.trim()),
      correctIndex: Number(question.correctIndex),
    }))
    if (
      !quizForm.title.trim()
      || cleanQuestions.some((question) => !question.prompt || question.options.some((option) => !option))
    ) {
      showMessage(t('quizFillAllFields'), 'error')
      return
    }

    const sectionQuizzes = quizzes.filter((quiz) => String(quiz.section_id) === String(section.id))
    const sectionItems = getOrderedSectionItems(
      section.id,
      videos.filter((video) => String(video.course_id) === String(targetCourseId)),
      quizzes.filter((quiz) => String(quiz.course_id) === String(targetCourseId)),
    )
    const quizPayload = {
      course_id: Number(targetCourseId),
      section_id: Number(section.id),
      title: quizForm.title.trim(),
      order_index: editingQuizId
        ? sectionQuizzes.find((quiz) => String(quiz.id) === String(editingQuizId))?.order_index || sectionQuizzes.length + 1
        : sectionItems.length + 1,
      questions: cleanQuestions,
    }
    const query = editingQuizId
      ? supabase.from('course_quizzes').update(quizPayload).eq('id', editingQuizId)
      : supabase.from('course_quizzes').insert(quizPayload)
    const { data: savedQuiz, error } = await query
      .select()
      .single()

    if (error) {
      showMessage(getQuizSaveErrorMessage(error), 'error')
      return
    }

    setQuizzes((current) => (
      current.some((quiz) => String(quiz.id) === String(savedQuiz.id))
        ? current.map((quiz) => (String(quiz.id) === String(savedQuiz.id) ? savedQuiz : quiz))
        : [...current, savedQuiz]
    ))
    setCurriculumOpenSections(new Set([String(section.id)]))
    setQuizFormSectionId('')
    resetQuizForm()
    showMessage(editingQuizId ? t('quizUpdated') : t('quizCreated'), 'success')
    await loadData(user)
    setQuizzes((current) => (
      current.some((quiz) => String(quiz.id) === String(savedQuiz.id))
        ? current.map((quiz) => (String(quiz.id) === String(savedQuiz.id) ? savedQuiz : quiz))
        : [...current, savedQuiz]
    ))
  }

  const deleteQuiz = async (quizId) => {
    if (!window.confirm(t('confirmDeleteQuiz'))) return
    const { error } = await supabase.from('course_quizzes').delete().eq('id', quizId)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(t('quizDeleted'), 'success')
    await loadData(user)
  }

  const moveLesson = async (videoId, direction) => {
    const { error } = await supabase.rpc('reorder_my_lesson', {
      p_video_id: videoId,
      p_direction: direction,
    })

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(t('lessonOrderUpdated'), 'success')
    await loadData(user)
  }

  const moveCurriculumItem = async (contentItem, direction) => {
    const sectionId = contentItem?.item?.section_id
    const courseId = contentItem?.item?.course_id
    if (!sectionId || !courseId || ![-1, 1].includes(direction)) return

    const sectionVideos = videos.filter((video) => String(video.course_id) === String(courseId))
    const sectionQuizzes = quizzes.filter((quiz) => String(quiz.course_id) === String(courseId))
    const currentItems = getOrderedSectionItems(sectionId, sectionVideos, sectionQuizzes)
    const fromIndex = currentItems.findIndex((entry) => (
      entry.type === contentItem.type && String(entry.item.id) === String(contentItem.item.id)
    ))
    const toIndex = fromIndex + direction
    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentItems.length) return

    const reorderedItems = [...currentItems]
    const [movedItem] = reorderedItems.splice(fromIndex, 1)
    reorderedItems.splice(toIndex, 0, movedItem)

    const results = await Promise.all(reorderedItems.map((entry, index) => (
      supabase
        .from(entry.type === 'video' ? 'videos' : 'course_quizzes')
        .update({ order_index: index + 1 })
        .eq('id', entry.item.id)
    )))
    const error = results.find((result) => result.error)?.error

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(t('lessonOrderUpdated'), 'success')
    await loadData(user)
  }

  const previewSectionReorder = (targetSectionId) => {
    const sourceSectionId = draggedSectionIdRef.current
    const currentOrder = sectionDragOrderRef.current
    if (!sourceSectionId || String(sourceSectionId) === String(targetSectionId) || !currentOrder.length) return

    const fromIndex = currentOrder.findIndex((id) => String(id) === String(sourceSectionId))
    const toIndex = currentOrder.findIndex((id) => String(id) === String(targetSectionId))
    if (fromIndex < 0 || toIndex < 0) return

    const reorderedIds = [...currentOrder]
    const [movedSectionId] = reorderedIds.splice(fromIndex, 1)
    reorderedIds.splice(toIndex, 0, movedSectionId)
    sectionDragOrderRef.current = reorderedIds
    setSections((current) => current.map((section) => {
      const nextIndex = reorderedIds.findIndex((id) => String(id) === String(section.id))
      return nextIndex >= 0 ? { ...section, order_index: nextIndex + 1 } : section
    }))
  }

  const saveSectionOrder = async (reorderedIds, previousSections) => {
    if (!reorderedIds.length) return
    const courseId = requestedCourseId || selectedCourseId
    const originalSections = previousSections
      .filter((section) => String(section.course_id) === String(courseId))
      .sort((a, b) => Number(a.order_index) - Number(b.order_index))
    setSectionDropTargetId('')

    const updateOrderIndex = async (sectionId, orderIndex) => {
      const { data, error } = await supabase
        .from('course_sections')
        .update({ order_index: orderIndex })
        .eq('id', sectionId)
        .eq('course_id', Number(courseId))
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error(t('sectionOrderFailed'))
    }

    try {
      for (let index = 0; index < reorderedIds.length; index += 1) {
        await updateOrderIndex(reorderedIds[index], -100000 - index)
      }
      for (let index = 0; index < reorderedIds.length; index += 1) {
        await updateOrderIndex(reorderedIds[index], index + 1)
      }
      showMessage(t('sectionOrderUpdated'), 'success')
    } catch (error) {
      try {
        for (let index = 0; index < originalSections.length; index += 1) {
          await updateOrderIndex(originalSections[index].id, -200000 - index)
        }
        for (const section of originalSections) {
          await updateOrderIndex(section.id, Number(section.order_index))
        }
      } catch {
        // Keep the original failure visible; reloading restores the database order.
      }
      setSections(previousSections)
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    }
  }

  const deleteCourse = async () => {
    if (!visibleSelectedCourse || selectedCourseApproved) return
    if (!window.confirm(t('instructorConfirmDeleteCourse'))) return

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/delete-course', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ courseId: visibleSelectedCourse.id }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      showMessage(`${t('errorOccurred')}${result.error || t('courseDeleteFailed')}`, 'error')
      return
    }

    setSelectedCourseId('')
    showMessage(result.cleanupWarning ? t('courseDeletedCleanupWarning') : t('instructorCourseDeleted'), 'success')
    await loadData(user)
  }

  const toggleFreeLesson = async (videoId, nextValue) => {
    const { error } = await supabase
      .from('videos')
      .update({ is_free: nextValue })
      .eq('id', videoId)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(nextValue ? t('previewEnabled') : t('previewDisabled'), 'success')
    await loadData(user)
  }

  const submitCourse = async () => {
    if (!selectedCourseId || courseVideos.length === 0) {
      showMessage(t('submitNeedsLesson'), 'error')
      return
    }
    if (!selectedTrailer) {
      showMessage(t('submitNeedsTrailer'), 'error')
      return
    }

    const { error } = await supabase
      .from('Courses')
      .update({ is_published: false, status: 'pending' })
      .eq('id', selectedCourseId)

    if (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
      return
    }

    showMessage(t('courseSubmitted'), 'success')
    await loadData(user)
  }

  if (!user) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">
          <h2>{t('teacherPanel')}</h2>
          <button className="primary-button" onClick={() => navigate('/login')}>{t('login')}</button>
        </div>
      </div>
    )
  }

  // Wait for the profile to load before deciding — avoids a flash redirect for
  // instructors whose role hasn't arrived yet.
  if (!profile) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">{t('loading')}</div>
      </div>
    )
  }

  // A logged-in non-instructor sees a clear prompt instead of being bounced.
  if (role !== 'instructor') {
    return (
      <div className="page">
        <Navbar user={user} profile={profile} onLogout={handleLogout} />
        <div className="centered-page">
          <div className="empty-box compact">
            <h2>{t('teacherPanel')}</h2>
            <p className="muted">{t('notInstructorYet')}</p>
            <button className="primary-button" onClick={() => navigate('/profile')}>{t('myCoursesTitle')}</button>
          </div>
        </div>
      </div>
    )
  }

  const approvedCourses = courses.filter((course) => getCourseStatus(course) === 'approved' || course.is_published)
  const pendingCourses = courses.filter((course) => getCourseStatus(course) !== 'approved')
  const visibleCourses = activeTab === 'approved' ? approvedCourses : pendingCourses
  const selectedCourseIsVisible = visibleCourses.some((course) => String(course.id) === String(selectedCourseId))
  const visibleSelectedCourse = selectedCourseIsVisible ? selectedCourse : null
  const visibleCourseVideos = visibleSelectedCourse
    ? videos.filter((video) => String(video.course_id) === String(visibleSelectedCourse.id))
    : []
  const visibleCourseSections = visibleSelectedCourse
    ? sections.filter((section) => String(section.course_id) === String(visibleSelectedCourse.id))
    : []
  const effectiveSections = visibleCourseSections.length > 0
    ? visibleCourseSections
    : [{ id: 'legacy', course_id: visibleSelectedCourse?.id, title: 'Section 1', order_index: 1 }]
  const validSelectedSectionId = visibleCourseSections.some((section) => String(section.id) === String(selectedSectionId))
    ? selectedSectionId
    : visibleCourseSections[0]?.id || ''
  const isDefaultSectionTitle = (title = '') => /^(section|bölmə|раздел)(\s+\d+)?$/iu.test(title.trim())
  const getSectionLabel = (section, index) => {
    const numbered = `${t('sectionLabel')} ${index + 1}`
    return section.title && !isDefaultSectionTitle(section.title) ? `${numbered}: ${section.title}` : numbered
  }
  const getLocalizedSectionTitle = (section) => (
    isDefaultSectionTitle(section.title) ? t('sectionLabel') : section.title
  )
  // Per workflow.md 3.3: teachers cannot edit/delete an approved course. They can
  // only build (add lessons / submit) a course while it is still draft/pending;
  // once approved it is read-only and changes go through the admin via Inbox.
  const selectedCourseApproved = visibleSelectedCourse
    ? (getCourseStatus(visibleSelectedCourse) === 'approved' || visibleSelectedCourse.is_published)
    : false

  const openCourse = (course, view = 'details') => {
    setSelectedCourseId(String(course.id))
    setSearchParams({ course: String(course.id), view })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToCourseList = () => {
    setMessage('')
    setSearchParams({})
  }

  if (instructorView || creatingCourse) {
    const cardCourses = [...courses].sort((a, b) => Number(b.id) - Number(a.id))
    const detailCourse = courses.find((course) => String(course.id) === String(requestedCourseId))
    const detailApproved = detailCourse
      ? (getCourseStatus(detailCourse) === 'approved' || detailCourse.is_published)
      : false
    const detailVideos = detailCourse
      ? videos.filter((video) => String(video.course_id) === String(detailCourse.id))
      : []
    const detailQuizzes = detailCourse
      ? quizzes.filter((quiz) => String(quiz.course_id) === String(detailCourse.id))
      : []
    const detailSections = detailCourse
      ? sections
        .filter((section) => String(section.course_id) === String(detailCourse.id))
        .sort((a, b) => Number(a.order_index) - Number(b.order_index))
      : []
    const detailTrailer = detailCourse
      ? trailers.find((trailer) => String(trailer.course_id) === String(detailCourse.id))
      : null
    const activeCurriculumSection = detailSections.find(
      (section) => String(section.id) === String(selectedSectionId)
    ) || detailSections.find(
      (section) => String(section.id) === String(curriculumActiveQuiz?.section_id)
    ) || detailSections.find(
      (section) => String(section.id) === String(curriculumActiveVideo?.section_id)
    ) || detailSections[0]
    const activeQuizSectionIndex = curriculumActiveQuiz
      ? detailSections.findIndex((section) => String(section.id) === String(curriculumActiveQuiz.section_id))
      : -1
    const activeQuizSection = activeQuizSectionIndex >= 0 ? detailSections[activeQuizSectionIndex] : null
    const curriculumQuizQuestions = Array.isArray(curriculumActiveQuiz?.questions) ? curriculumActiveQuiz.questions : []
    const safeCurriculumQuizQuestionIndex = Math.min(curriculumQuizQuestionIndex, Math.max(curriculumQuizQuestions.length - 1, 0))
    const curriculumQuizQuestion = curriculumQuizQuestions[safeCurriculumQuizQuestionIndex] || null
    const curriculumQuizAnswerKey = curriculumActiveQuiz ? `${curriculumActiveQuiz.id}:${safeCurriculumQuizQuestionIndex}` : ''
    const curriculumQuizAnswer = curriculumActiveQuiz ? curriculumQuizAnswers[curriculumQuizAnswerKey] : undefined
    const curriculumQuizChecked = curriculumActiveQuiz ? String(curriculumQuizCheckedId) === curriculumQuizAnswerKey : false
    const curriculumQuizFinished = curriculumActiveQuiz ? Boolean(curriculumFinishedQuizIds[curriculumActiveQuiz.id]) : false
    const curriculumQuizIsCorrect = curriculumQuizQuestion
      ? Number(curriculumQuizAnswer) === Number(curriculumQuizQuestion.correctIndex)
      : false
    const curriculumQuizExplanation = curriculumQuizQuestion && curriculumQuizAnswer !== undefined
      ? curriculumQuizQuestion.explanations?.[Number(curriculumQuizAnswer)] || ''
      : ''
    const hasNextCurriculumQuizQuestion = safeCurriculumQuizQuestionIndex < curriculumQuizQuestions.length - 1
    const curriculumQuizResults = curriculumQuizQuestions.map((question, index) => {
      const answer = curriculumActiveQuiz ? curriculumQuizAnswers[`${curriculumActiveQuiz.id}:${index}`] : undefined
      const isCorrect = Number(answer) === Number(question.correctIndex)
      return {
        question,
        index,
        answer,
        isCorrect,
        selectedAnswer: answer === undefined ? '' : question.options?.[Number(answer)] || '',
        correctAnswer: question.options?.[Number(question.correctIndex)] || '',
        options: (question.options || []).map((option, optionIndex) => ({
          option,
          optionIndex,
          explanation: question.explanations?.[optionIndex] || '',
          isSelected: Number(answer) === optionIndex,
          isCorrect: Number(question.correctIndex) === optionIndex,
        })),
      }
    })
    const curriculumQuizCorrectCount = curriculumQuizResults.filter((result) => result.isCorrect).length
    const curriculumSearchTerm = curriculumSearch.trim()
    const visibleDetailSections = curriculumSearchTerm
      ? detailSections.map((section) => {
        const sectionTitle = getLocalizedSectionTitle(section)
        const sectionMatches = normalizeSearchText(sectionTitle).includes(normalizeSearchText(curriculumSearchTerm))
        const sectionVideos = detailVideos.filter((video) => String(video.section_id) === String(section.id))
        const sectionQuizzes = detailQuizzes.filter((quiz) => String(quiz.section_id) === String(section.id))
        return {
          ...section,
          filteredVideos: sectionMatches
            ? sectionVideos
            : sectionVideos.filter((video) => (
              normalizeSearchText(`${video.title || ''} ${video.duration || ''}`).includes(normalizeSearchText(curriculumSearchTerm))
            )),
          filteredQuizzes: sectionMatches
            ? sectionQuizzes
            : sectionQuizzes.filter((quiz) => (
              normalizeSearchText(`${quiz.title || ''} ${quiz.questions?.[0]?.prompt || ''}`).includes(normalizeSearchText(curriculumSearchTerm))
            )),
        }
      }).filter((section) => section.filteredVideos.length > 0 || section.filteredQuizzes.length > 0)
      : detailSections.map((section) => ({
        ...section,
        filteredVideos: detailVideos.filter((video) => String(video.section_id) === String(section.id)),
        filteredQuizzes: detailQuizzes.filter((quiz) => String(quiz.section_id) === String(section.id)),
      }))
    const safeQuizFormQuestionIndex = Math.min(activeQuizFormQuestionIndex, Math.max(quizForm.questions.length - 1, 0))
    const activeQuizFormQuestion = quizForm.questions[safeQuizFormQuestionIndex] || createEmptyQuizQuestion()

    return (
      <div className="page">
        <Navbar user={user} profile={profile} onLogout={handleLogout} />
        <main className="instructor-simple-page">
          {message && (
            <div className={messageType === 'error' ? 'error-box' : messageType === 'success' ? 'success-box' : 'notice-box'}>
              {message}
            </div>
          )}

          {creatingCourse ? (
            <>
              <button className="instructor-back-button" type="button" onClick={goToCourseList}>
                <ArrowLeft size={18} /> {t('backToMyCourses')}
              </button>
              <section className="panel-card form-panel course-setup-form instructor-focused-form">
                <h1>{t('newCourse')}</h1>
                <p className="muted">{t('simpleCourseSetupHelp')}</p>
                <label>{t('courseTitle')}</label>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('exampleCourseTitle')} />
                <label>{t('courseDescription')}</label>
                <textarea rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t('exampleCourseDescription')} />
                <label>{t('coverImage')}</label>
                <LocalizedFileInput accept="image/*" file={thumbnailFile} onChange={setThumbnailFile} t={t} />
                <label>{t('trailerTitle')}</label>
                <input
                  value={newCourseTrailerTitle}
                  onChange={(event) => setNewCourseTrailerTitle(event.target.value)}
                  placeholder={t('trailerTitlePlaceholder')}
                />
                <label>{t('trailerVideo')}</label>
                <LocalizedFileInput
                  accept="video/*"
                  disabled={loading}
                  file={newCourseTrailerFile}
                  t={t}
                  onChange={(file, input) => selectTrailerFile(
                    file,
                    setNewCourseTrailerFile,
                    setNewCourseTrailerValidating,
                    input
                  )}
                />
                <p className="muted">{t('trailerMaxDuration')}</p>
                {newCourseTrailerValidating && <p className="muted">{t('checkingVideoDuration')}</p>}
                {loading && newCourseTrailerFile && (
                  <div className="upload-progress">
                    <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                    <small>{t('uploadingVideo')} {uploadPercent}%</small>
                  </div>
                )}
                <button className="primary-button full" onClick={createCourse} disabled={loading || newCourseTrailerValidating}>
                  {loading ? `${t('creatingCourse')} ${uploadPercent ? `${uploadPercent}%` : ''}` : t('createCourse')}
                </button>
              </section>
            </>
          ) : instructorView === 'courses' ? (
            <>
              <header className="instructor-simple-header">
                <div>
                  <h1>{t('myCoursesTitle')}</h1>
                  <p>{t('simpleInstructorHelp')}</p>
                </div>
                <button className="primary-button instructor-create-button" type="button" onClick={() => setSearchParams({ create: '1' })}>
                  <Plus size={18} /> {t('newCourse')}
                </button>
              </header>

              {dataLoading ? (
                <div className="instructor-course-card-grid" aria-label={t('loading')}>
                  {[1, 2, 3].map((item) => <div className="home-course-card skeleton-card instructor-course-skeleton" key={item} />)}
                </div>
              ) : cardCourses.length === 0 ? (
                <div className="panel-card instructor-empty-courses">
                  <h2>{t('noCoursesYet')}</h2>
                  <p className="muted">{t('simpleCourseSetupHelp')}</p>
                  <button className="primary-button" type="button" onClick={() => setSearchParams({ create: '1' })}>
                    <Plus size={18} /> {t('newCourse')}
                  </button>
                </div>
              ) : (
                <section className="instructor-course-card-grid">
                  {cardCourses.map((course) => (
                    <button className="home-course-card instructor-course-card" type="button" key={course.id} onClick={() => openCourse(course)}>
                      <img className="home-course-thumb" src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                      <span className="home-course-card-body">
                        <span className={`instructor-status-pill status-${getCourseStatus(course)}`}>
                          {t(getCourseStatusLabel(getCourseStatus(course)))}
                        </span>
                        <h3>{course.title}</h3>
                        <span className="home-course-instructor">{getCourseAuthorName(course)}</span>
                        <span className="home-course-meta">{videos.filter((video) => video.course_id === course.id).length} {t('courseLessons')}</span>
                        <strong className="home-course-price">{course.price || 0} AZN</strong>
                      </span>
                    </button>
                  ))}
                </section>
              )}
              <section className="instructor-inbox-section">
                <InboxPanel user={user} compact />
              </section>
            </>
          ) : dataLoading ? (
            <div className="panel-card instructor-detail-loading" aria-label={t('loading')}>
              <div className="skeleton-card instructor-detail-skeleton" />
              <div className="skeleton-card instructor-detail-skeleton instructor-detail-skeleton-media" />
            </div>
          ) : !detailCourse ? (
            <div className="panel-card instructor-empty-courses">
              <h2>{t('courseNotFound')}</h2>
              <button className="outline-button" type="button" onClick={goToCourseList}>{t('backToMyCourses')}</button>
            </div>
          ) : instructorView === 'curriculum' ? (
            <>
              <button className="instructor-back-button" type="button" onClick={() => openCourse(detailCourse)}>
                <ArrowLeft size={18} /> {detailCourse.title}
              </button>
              <header className="instructor-simple-header">
                <div>
                  <h1>{t('courseCurriculum')}</h1>
                  <p>{t('courseCurriculumHelp')}</p>
                </div>
              </header>

              {detailApproved ? (
                <div className="notice-box">{t('approvedCourseLockNote')}</div>
              ) : (
                <>
                <section className="instructor-curriculum-studio">
                  <div className="course-player-layout instructor-course-player-layout">
                    <div className="course-player-main">
                      <div className="youtube-player-shell">
                        {curriculumActiveQuiz ? (
                          <div className="quiz-player instructor-quiz-preview">
                            {curriculumQuizFinished ? (
                              <div className="quiz-question-card quiz-results-card">
                                <span className="lesson-section-context">{t('quizResult')}</span>
                                <h2>{curriculumActiveQuiz.title}</h2>
                                <strong>{t('quizScore').replace('{correct}', curriculumQuizCorrectCount).replace('{total}', curriculumQuizQuestions.length)}</strong>
                                <div className="quiz-result-list">
                                  {curriculumQuizResults.map((result) => (
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
                            ) : !curriculumQuizStarted ? (
                              <div className="quiz-start-card">
                                <span className="lesson-section-context">
                                  {activeQuizSection ? getSectionLabel(activeQuizSection, activeQuizSectionIndex) : t('sectionLabel')}
                                </span>
                                <h2>{curriculumActiveQuiz.title}</h2>
                                <p>{t('quizSectionIntro')}</p>
                                <strong>{curriculumActiveQuiz.questions?.length || 0} {t('questionCountLabel')}</strong>
                                <button className="primary-button" type="button" onClick={() => setCurriculumQuizStarted(true)}>
                                  {t('startQuiz')}
                                </button>
                              </div>
                            ) : curriculumQuizQuestion ? (
                              <div className="quiz-question-card">
                                <span className="lesson-section-context">
                                  {`${safeCurriculumQuizQuestionIndex + 1}/${curriculumQuizQuestions.length || 1}`}
                                </span>
                                <h2>{curriculumActiveQuiz.title}</h2>
                                <div className="quiz-question-prompt">
                                  <span>{t('quizQuestion')} {safeCurriculumQuizQuestionIndex + 1}</span>
                                  <strong>{curriculumQuizQuestion.prompt}</strong>
                                  <small>{t('chooseCorrectOption')}</small>
                                </div>
                                <div className="quiz-answer-list">
                                  {(curriculumQuizQuestion.options || []).map((option, optionIndex) => {
                                    const isSelected = Number(curriculumQuizAnswer) === optionIndex
                                    const isCorrect = Number(curriculumQuizQuestion.correctIndex) === optionIndex
                                    const showCorrect = curriculumQuizChecked && isCorrect
                                    const showWrong = curriculumQuizChecked && isSelected && !isCorrect
                                    return (
                                    <button
                                      type="button"
                                      key={optionIndex}
                                      disabled={curriculumQuizChecked}
                                      className={`quiz-answer-option${isSelected ? ' selected' : ''}${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}`}
                                      onClick={() => {
                                        setCurriculumQuizAnswers((current) => ({ ...current, [curriculumQuizAnswerKey]: optionIndex }))
                                        setCurriculumQuizCheckedId(curriculumQuizAnswerKey)
                                      }}
                                    >
                                      <span>{optionIndex + 1}</span>
                                      {option}
                                    </button>
                                    )
                                  })}
                                </div>
                                <div className="quiz-player-actions">
                                  {curriculumQuizChecked && (
                                    <strong className={curriculumQuizIsCorrect ? 'quiz-result correct' : 'quiz-result wrong'}>
                                      {curriculumQuizIsCorrect ? t('quizCorrectCongrats') : t('quizWrongAnswer')}
                                    </strong>
                                  )}
                                  {hasNextCurriculumQuizQuestion ? (
                                    <button className="primary-button" type="button" disabled={curriculumQuizAnswer === undefined} onClick={() => {
                                      setCurriculumQuizQuestionIndex((current) => current + 1)
                                      setCurriculumQuizCheckedId('')
                                    }}>
                                      {t('nextButton')}
                                    </button>
                                  ) : (
                                    <button
                                      className="primary-button"
                                      type="button"
                                      disabled={curriculumQuizAnswer === undefined}
                                      onClick={() => setCurriculumFinishedQuizIds((current) => ({ ...current, [curriculumActiveQuiz.id]: true }))}
                                    >
                                      {t('seeAllResults')}
                                    </button>
                                  )}
                                </div>
                                {curriculumQuizChecked && curriculumQuizExplanation && (
                                  <div className="quiz-explanation-box">
                                    <strong>{t('answerExplanation')}</strong>
                                    <p>{curriculumQuizExplanation}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="muted">{t('quizNoQuestions')}</p>
                            )}
                          </div>
                        ) : !curriculumActiveVideo ? (
                          <div className="empty-player">{t('courseHasNoLessonsYet')}</div>
                        ) : curriculumActiveVideo.bunny_video_id ? (
                          curriculumSignedUrl ? (
                            <iframe
                              key={curriculumActiveVideo.id}
                              className="youtube-player"
                              src={curriculumSignedUrl}
                              title={curriculumActiveVideo.title}
                              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                              allowFullScreen
                            />
                          ) : (
                            <div className="empty-player">{curriculumPlaybackError ? t('videoNotSupported') : t('loadingVideo')}</div>
                          )
                        ) : curriculumActiveVideo.video_url && isYouTubeUrl(curriculumActiveVideo.video_url) ? (
                          <iframe
                            key={curriculumActiveVideo.id}
                            className="youtube-player"
                            src={toYouTubeEmbedUrl(curriculumActiveVideo.video_url, false)}
                            title={curriculumActiveVideo.title}
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : curriculumActiveVideo.video_url ? (
                          <video key={curriculumActiveVideo.id} className="youtube-player" controls src={curriculumActiveVideo.video_url}>
                            {t('videoNotSupported')}
                          </video>
                        ) : (
                          <div className="empty-player">{t('videoNotSupported')}</div>
                        )}
                      </div>
                    </div>

                    <aside className="course-lesson-panel instructor-lesson-panel">
                      <div className="lesson-panel-header">
                        <div>
                          <h2>{t('courseContent')}</h2>
                          <p>{detailVideos.length + detailQuizzes.length} {t('courseLessons')}</p>
                        </div>
                      </div>
                      {detailSections.length > 0 && (
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
                        {visibleDetailSections.length === 0 ? (
                          <p className="curriculum-search-empty">{t('curriculumSearchEmpty')}</p>
                        ) : visibleDetailSections.map((section, sectionIndex) => {
                          const sectionVideos = section.filteredVideos || []
                          const sectionQuizzes = section.filteredQuizzes || []
                          const sectionItems = getOrderedSectionItems(section.id, sectionVideos, sectionQuizzes)
                          const isOpen = curriculumSearchTerm ? true : curriculumOpenSections.has(String(section.id))
                          return (
                            <section
                              className={`${isOpen ? 'curriculum-section expanded' : 'curriculum-section'}${String(sectionDropTargetId) === String(section.id) ? ' section-drop-target' : ''}`}
                              key={section.id}
                              onDragOver={(event) => {
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'move'
                                setSectionDropTargetId(String(section.id))
                              }}
                              onDragEnter={(event) => {
                                event.preventDefault()
                                previewSectionReorder(section.id)
                              }}
                              onDragLeave={() => setSectionDropTargetId('')}
                              onDrop={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                sectionDropCompletedRef.current = true
                                saveSectionOrder(
                                  [...sectionDragOrderRef.current],
                                  sectionDragOriginalSectionsRef.current,
                                )
                              }}
                            >
                              <div className="instructor-section-heading">
                                <button type="button" onClick={() => selectCurriculumSection(section, sectionItems)}>
                                  <span>
                                    <strong>{sectionIndex + 1}. {getLocalizedSectionTitle(section, sectionIndex)}</strong>
                                    <small>{sectionItems.length} {t('courseLessons')}</small>
                                  </span>
                                  <ArrowDown size={18} />
                                </button>
                                <div>
                                  <span
                                    className="instructor-section-drag-handle"
                                    draggable
                                    title={t('dragSection')}
                                    aria-label={t('dragSection')}
                                    onDragStart={(event) => {
                                      draggedSectionIdRef.current = String(section.id)
                                      sectionDragOrderRef.current = detailSections.map((item) => Number(item.id))
                                      sectionDragOriginalSectionsRef.current = sections
                                      sectionDropCompletedRef.current = false
                                      event.dataTransfer.effectAllowed = 'move'
                                      event.dataTransfer.setData('text/plain', String(section.id))
                                    }}
                                    onDragEnd={() => {
                                      const reorderedIds = [...sectionDragOrderRef.current]
                                      const previousSections = sectionDragOriginalSectionsRef.current
                                      if (!sectionDropCompletedRef.current && reorderedIds.length && previousSections.length) {
                                        const courseId = requestedCourseId || selectedCourseId
                                        const originalIds = previousSections
                                          .filter((item) => String(item.course_id) === String(courseId))
                                          .sort((a, b) => Number(a.order_index) - Number(b.order_index))
                                          .map((item) => Number(item.id))
                                        const orderChanged = reorderedIds.some((id, index) => id !== originalIds[index])
                                        if (orderChanged) {
                                          sectionDropCompletedRef.current = true
                                          saveSectionOrder(reorderedIds, previousSections)
                                        }
                                      }
                                      draggedSectionIdRef.current = ''
                                      sectionDragOrderRef.current = []
                                      sectionDragOriginalSectionsRef.current = []
                                      sectionDropCompletedRef.current = false
                                      setSectionDropTargetId('')
                                    }}
                                  >
                                    <GripVertical size={16} />
                                  </span>
                                  <button type="button" onClick={() => editSection(section)} title={t('edit')}><Pencil size={15} /></button>
                                  <button type="button" onClick={() => deleteSection(section)} title={t('delete')}><Trash2 size={15} /></button>
                                </div>
                              </div>
                              {isOpen && sectionItems.map((contentItem, contentIndex) => {
                                const item = contentItem.item
                                const isVideo = contentItem.type === 'video'
                                const isActive = isVideo
                                  ? String(item.id) === String(curriculumActiveVideo?.id)
                                  : String(item.id) === String(curriculumActiveQuiz?.id)
                                return (
                                  <div
                                    className={isActive
                                      ? `course-lesson-item active instructor-course-lesson-item${isVideo ? '' : ' quiz-content-item'}`
                                      : `course-lesson-item instructor-course-lesson-item${isVideo ? '' : ' quiz-content-item'}`}
                                    key={`${contentItem.type}-${item.id}`}
                                  >
                                    <button className="instructor-lesson-select" type="button" onClick={() => (isVideo ? selectCurriculumVideo(item) : selectCurriculumQuiz(item))}>
                                      {isVideo ? <PlayCircle size={19} /> : <ClipboardList size={19} />}
                                      <span className="lesson-copy">
                                        <strong>{sectionIndex + 1}.{contentIndex + 1} {item.title}</strong>
                                        <small>
                                          {isVideo
                                            ? `${item.duration || t('durationMissing')}${item.is_free ? ` · ${t('previewShort')}` : ''}`
                                            : `${item.questions?.length || 0} ${t('questionCountLabel')}`}
                                        </small>
                                      </span>
                                    </button>
                                    <div className="instructor-lesson-mini-actions">
                                      <button type="button" onClick={() => moveCurriculumItem(contentItem, -1)} disabled={contentIndex === 0} title={t('moveLessonUp')}><ArrowUp size={14} /></button>
                                      <button type="button" onClick={() => moveCurriculumItem(contentItem, 1)} disabled={contentIndex === sectionItems.length - 1} title={t('moveLessonDown')}><ArrowDown size={14} /></button>
                                      <button type="button" onClick={() => (isVideo ? editLesson(item) : editQuiz(item))} title={t('edit')}><Pencil size={14} /></button>
                                      {isVideo && (
                                        <button type="button" onClick={() => toggleFreeLesson(item.id, !item.is_free)} title={item.is_free ? t('previewClose') : t('previewOpen')}>
                                          {item.is_free ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                      )}
                                      <button type="button" onClick={() => (isVideo ? deleteLesson(item.id) : deleteQuiz(item.id))} title={t('delete')}><Trash2 size={14} /></button>
                                    </div>
                                  </div>
                                )
                              })}
                            </section>
                          )
                        })}
                      </div>
                    </aside>
                  </div>
                </section>
                <section className="panel-card instructor-curriculum-builder">
                  <div className="section-create-row">
                    <input
                      value={sectionTitle}
                      onChange={(event) => setSectionTitle(event.target.value)}
                      placeholder={t('sectionTitlePlaceholder')}
                    />
                    <button className="outline-button" type="button" onClick={createSection}>
                      <FolderPlus size={16} /> {t('addSection')}
                    </button>
                  </div>

                  <div className="section-editor-list">
                    {activeCurriculumSection && [activeCurriculumSection].map((section) => {
                      const sectionIndex = detailSections.findIndex((item) => String(item.id) === String(section.id))
                      const sectionVideos = detailVideos.filter((video) => String(video.section_id) === String(section.id))
                      const sectionQuizzes = detailQuizzes.filter((quiz) => String(quiz.section_id) === String(section.id))
                      const sectionItems = getOrderedSectionItems(section.id, sectionVideos, sectionQuizzes)
                      return (
                        <section className="section-editor-card" key={section.id}>
                          <div className="section-editor-heading">
                            <div>
                              <strong>{sectionIndex + 1}. {getLocalizedSectionTitle(section, sectionIndex)}</strong>
                              <small>{sectionItems.length} {t('courseLessons')}</small>
                            </div>
                            <div className="instructor-inline-actions">
                              <button className="icon-link-button" type="button" onClick={() => editSection(section)} title={t('edit')}>
                                <Pencil size={16} />
                              </button>
                              <button className="icon-danger-button" type="button" onClick={() => deleteSection(section)} title={t('delete')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="lesson-list">
                            {sectionItems.length === 0 ? <p className="muted">{t('noLessonsInSection')}</p> : sectionItems.map((contentItem, contentIndex) => {
                              const item = contentItem.item
                              const isVideo = contentItem.type === 'video'
                              return (
                                <div key={`${contentItem.type}-${item.id}`} className={`lesson-row managed-lesson-row${isVideo ? '' : ' quiz-managed-row'}`}>
                                  <span>{sectionIndex + 1}.{contentIndex + 1}</span>
                                  <div>
                                    <strong>{item.title}</strong>
                                    <small>
                                      {isVideo
                                        ? `${item.duration || t('durationMissing')}${item.is_free ? ` · ${t('previewShort')}` : ''}`
                                        : `${item.questions?.length || 0} ${t('questionCountLabel')}`}
                                    </small>
                                  </div>
                                  <div className="lesson-row-actions">
                                    <button className="icon-link-button" type="button" onClick={() => moveCurriculumItem(contentItem, -1)} disabled={contentIndex === 0}><ArrowUp size={16} /></button>
                                    <button className="icon-link-button" type="button" onClick={() => moveCurriculumItem(contentItem, 1)} disabled={contentIndex === sectionItems.length - 1}><ArrowDown size={16} /></button>
                                    <button className="icon-link-button" type="button" onClick={() => (isVideo ? editLesson(item) : editQuiz(item))} title={t('edit')}><Pencil size={16} /></button>
                                    {isVideo && (
                                      <>
                                      <label className="icon-link-button instructor-file-action" title={t('replaceLessonVideo')}>
                                        <Upload size={16} />
                                        <input
                                          type="file"
                                          accept="video/*"
                                          disabled={loading}
                                          onChange={(event) => {
                                            replaceLessonVideo(item, event.target.files[0] || null)
                                            event.target.value = ''
                                          }}
                                        />
                                      </label>
                                      <button className="icon-link-button" type="button" onClick={() => toggleFreeLesson(item.id, !item.is_free)} title={item.is_free ? t('previewClose') : t('previewOpen')}>
                                        {item.is_free ? <EyeOff size={16} /> : <Eye size={16} />}
                                      </button>
                                      </>
                                    )}
                                    <button className="icon-danger-button" type="button" onClick={() => (isVideo ? deleteLesson(item.id) : deleteQuiz(item.id))} title={t('delete')}><Trash2 size={16} /></button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <button className="outline-button quiz-create-toggle" type="button" onClick={() => startQuizForSection(section.id)}>
                            <Plus size={16} /> {t('createQuiz')}
                          </button>
                          {String(quizFormSectionId) === String(section.id) && (
                            <div className="quiz-builder-box">
                              <h3>{editingQuizId ? t('editQuiz') : t('createQuiz')}</h3>
                              <label>{t('quizTitle')}</label>
                              <input value={quizForm.title} onChange={(event) => setQuizForm({ ...quizForm, title: event.target.value })} placeholder={t('quizTitlePlaceholder')} />
                              <div className="quiz-question-editor">
                                <div className="quiz-question-editor-heading">
                                  <strong>{t('quizQuestion')} {safeQuizFormQuestionIndex + 1} / {quizForm.questions.length}</strong>
                                  {quizForm.questions.length > 1 && (
                                    <button className="icon-danger-button" type="button" onClick={() => removeQuizQuestion(safeQuizFormQuestionIndex)} title={t('delete')}>
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                                <div className="quiz-question-step-actions">
                                  <button
                                    className="outline-button"
                                    type="button"
                                    disabled={safeQuizFormQuestionIndex === 0}
                                    onClick={() => setActiveQuizFormQuestionIndex((current) => Math.max(0, current - 1))}
                                  >
                                    <ArrowLeft size={16} /> {t('previousQuestion')}
                                  </button>
                                  <button
                                    className="outline-button"
                                    type="button"
                                    disabled={safeQuizFormQuestionIndex >= quizForm.questions.length - 1}
                                    onClick={() => setActiveQuizFormQuestionIndex((current) => Math.min(quizForm.questions.length - 1, current + 1))}
                                  >
                                    {t('nextButton')} <ArrowRight size={16} />
                                  </button>
                                  <button className="outline-button" type="button" onClick={addQuizQuestion}>
                                    <Plus size={16} /> {t('addQuestion')}
                                  </button>
                                  <button className="primary-button" type="button" onClick={saveCurrentQuizQuestion}>
                                    {t('saveQuestion')}
                                  </button>
                                </div>
                                <label>{t('quizQuestion')}</label>
                                <textarea
                                  rows={3}
                                  value={activeQuizFormQuestion.prompt}
                                  onChange={(event) => updateQuizQuestionPrompt(safeQuizFormQuestionIndex, event.target.value)}
                                  placeholder={t('quizQuestionPlaceholder')}
                                />
                                {activeQuizFormQuestion.options.map((option, optionIndex) => (
                                  <div className="quiz-option-editor" key={optionIndex}>
                                    <label>
                                      <input
                                        type="radio"
                                        name={`quiz-correct-${section.id}-${safeQuizFormQuestionIndex}`}
                                        checked={Number(activeQuizFormQuestion.correctIndex) === optionIndex}
                                        onChange={() => updateQuizCorrectAnswer(safeQuizFormQuestionIndex, optionIndex)}
                                      />
                                      <span>{t('answerLabel')} {optionIndex + 1}</span>
                                    </label>
                                    <input value={option} onChange={(event) => updateQuizOption(safeQuizFormQuestionIndex, optionIndex, event.target.value)} />
                                    <textarea
                                      rows={2}
                                      value={activeQuizFormQuestion.explanations[optionIndex]}
                                      onChange={(event) => updateQuizExplanation(safeQuizFormQuestionIndex, optionIndex, event.target.value)}
                                      placeholder={t('answerExplanationPlaceholder')}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="instructor-edit-actions">
                                <button className="outline-button" type="button" onClick={() => {
                                  setQuizFormSectionId('')
                                  resetQuizForm()
                                }}>{t('cancel')}</button>
                                {safeQuizFormQuestionIndex === quizForm.questions.length - 1 && (
                                  <button className="primary-button" type="button" onClick={() => saveQuiz(section, detailCourse.id)}>{t('saveQuiz')}</button>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="instructor-add-lesson-box">
                            <h3>{t('addLesson')}</h3>
                            <label>{t('lessonTitle')}</label>
                            <input value={validSelectedSectionId === String(section.id) ? lessonTitle : ''} onFocus={() => setSelectedSectionId(String(section.id))} onChange={(event) => {
                              setSelectedSectionId(String(section.id))
                              setLessonTitle(event.target.value)
                            }} />
                            <label>{t('videoFile')}</label>
                            <LocalizedFileInput
                              accept="video/*"
                              disabled={loading}
                              file={validSelectedSectionId === String(section.id) ? lessonFile : null}
                              t={t}
                              onFocus={() => setSelectedSectionId(String(section.id))}
                              onChange={(file) => {
                                setSelectedSectionId(String(section.id))
                                selectLessonFile(file)
                              }}
                            />
                            <label className="instructor-checkbox">
                              <input type="checkbox" checked={validSelectedSectionId === String(section.id) && lessonIsFree} onChange={(event) => {
                                setSelectedSectionId(String(section.id))
                                setLessonIsFree(event.target.checked)
                              }} />
                              {t('previewLesson')}
                            </label>
                            {loading && validSelectedSectionId === String(section.id) && (
                              <div className="upload-progress">
                                <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                                <small>{t('uploadingVideo')} {uploadPercent}%</small>
                              </div>
                            )}
                            <button className="primary-button" type="button" disabled={loading} onClick={() => {
                              setSelectedSectionId(String(section.id))
                              addLesson(section.id)
                            }}>
                              <Plus size={16} /> {t('addLesson')}
                            </button>
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </section>
                </>
              )}
            </>
          ) : (
            <>
              <button className="instructor-back-button" type="button" onClick={goToCourseList}>
                <ArrowLeft size={18} /> {t('backToMyCourses')}
              </button>
              <header className="instructor-simple-header instructor-detail-header">
                <div>
                  <span className={`instructor-status-pill status-${getCourseStatus(detailCourse)}`}>
                    {t(getCourseStatusLabel(getCourseStatus(detailCourse)))}
                  </span>
                  <h1 className="instructor-detail-title">{detailCourse.title}</h1>
                </div>
                <button className="outline-button" type="button" onClick={() => navigate(`/course/${detailCourse.id}`, { state: { course: detailCourse } })}>
                  <PlayCircle size={16} /> {t('previewCourse')}
                </button>
              </header>

              <section className="instructor-detail-stack">
                <div className="panel-card instructor-compact-card">
                  <div className="instructor-card-heading">
                    <h2>{t('courseSetup')}</h2>
                    {!detailApproved && !detailsEditing && (
                      <button className="outline-button instructor-edit-button" type="button" onClick={() => setDetailsEditing(true)}>
                        <Pencil size={16} /> {t('edit')}
                      </button>
                    )}
                  </div>
                  {detailsEditing ? (
                    <div className="form-panel instructor-inline-form">
                      <label>{t('courseTitle')}</label>
                      <input value={courseDetailsForm.title} onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, title: event.target.value })} />
                      <label>{t('courseDescription')}</label>
                      <textarea rows={4} value={courseDetailsForm.description} onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, description: event.target.value })} />
                      <label>{t('priceAzN')}</label>
                      <input type="number" value={courseDetailsForm.price} onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, price: event.target.value })} />
                      <div className="instructor-edit-actions">
                        <button
                          className="outline-button"
                          type="button"
                          onClick={() => {
                            setCourseDetailsForm({
                              title: detailCourse.title || '',
                              description: detailCourse.description || '',
                              price: detailCourse.price ?? '',
                            })
                            setDetailsEditing(false)
                          }}
                        >
                          {t('cancel')}
                        </button>
                        <button className="primary-button" type="button" disabled={loading} onClick={saveCourseDetails}>{t('saveCourseDetails')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="instructor-course-summary">
                      <strong>{detailCourse.title}</strong>
                      <p>{detailCourse.description}</p>
                      <span>{detailCourse.price || 0} AZN</span>
                    </div>
                  )}
                </div>

                <div className="panel-card instructor-compact-card instructor-combined-media-card">
                  <div className="instructor-card-heading">
                    <h2>{t('courseTrailer')}</h2>
                    {!detailApproved && !mediaEditing && (
                      <button className="outline-button instructor-edit-button" type="button" onClick={() => setMediaEditing(true)}>
                        <Pencil size={16} /> {t('edit')}
                      </button>
                    )}
                  </div>
                  <p className="muted">{detailTrailer ? `${detailTrailer.title} · ${t('trailerReady')}` : t('trailerHelp')}</p>
                  <div className="instructor-media-combined">
                    <div className="instructor-trailer-preview">
                      {detailTrailerUrl ? (
                        <iframe
                          src={detailTrailerUrl}
                          title={detailTrailer?.title || t('courseTrailer')}
                          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                          allowFullScreen
                        />
                      ) : (
                        <div className="empty-player">{detailTrailerError ? t('videoNotSupported') : detailTrailer ? t('loadingVideo') : t('trailerHelp')}</div>
                      )}
                    </div>
                    <div className="instructor-cover-preview">
                      <div className="instructor-cover-heading">
                        <span>{t('coverImage')}</span>
                        {!detailApproved && (
                          <span className="instructor-cover-actions">
                            <button
                              className="icon-button"
                              type="button"
                              title={t('edit')}
                              aria-label={t('edit')}
                              onClick={() => setCoverEditing((current) => !current)}
                            >
                              <Pencil size={15} />
                            </button>
                            {detailCourse.thumbnail_url && (
                              <button
                                className="icon-button danger-icon-button"
                                type="button"
                                disabled={loading}
                                title={t('removeCover')}
                                aria-label={t('removeCover')}
                                onClick={removeCourseCover}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      <img src={coverPreviewUrl || detailCourse.thumbnail_url || '/course-placeholder.svg'} alt={detailCourse.title} />
                      {coverEditing && (
                        <div className="instructor-cover-editor">
                          <LocalizedFileInput accept="image/*" disabled={loading} file={courseThumbnailFile} onChange={selectCourseCover} t={t} />
                          <div className="instructor-cover-editor-actions">
                            <button
                              className="outline-button"
                              type="button"
                              disabled={loading}
                              onClick={() => {
                                clearCourseCoverSelection()
                                setCoverEditing(false)
                              }}
                            >
                              {t('cancel')}
                            </button>
                            <button
                              className="primary-button"
                              type="button"
                              disabled={loading || !courseThumbnailFile}
                              onClick={() => saveCourseCover()}
                            >
                              {loading ? t('loading') : t('saveCover')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {mediaEditing && (
                    <div className="form-panel instructor-inline-form instructor-media-editor">
                      <label>{t('trailerTitle')}</label>
                      <input value={trailerTitle} onChange={(event) => setTrailerTitle(event.target.value)} placeholder={t('trailerTitlePlaceholder')} />
                      <LocalizedFileInput
                        accept="video/*"
                        disabled={loading}
                        file={trailerFile}
                        t={t}
                        onChange={(file, input) => selectTrailerFile(file, setTrailerFile, setTrailerValidating, input)}
                      />
                      <div className="instructor-edit-actions">
                        <button className="outline-button" type="button" onClick={() => setMediaEditing(false)}>{t('cancel')}</button>
                        {trailerFile && <button className="primary-button" type="button" disabled={loading || trailerValidating} onClick={uploadTrailer}>{detailTrailer ? t('replaceTrailer') : t('uploadTrailer')}</button>}
                        {detailTrailer && <button className="danger-button" type="button" onClick={removeTrailer}><Trash2 size={16} /> {t('removeTrailer')}</button>}
                      </div>
                    </div>
                  )}
                </div>

                <button className="panel-card instructor-videos-card" type="button" onClick={() => openCourse(detailCourse, 'curriculum')}>
                  <span className="instructor-videos-icon"><PlayCircle size={22} /></span>
                  <span className="instructor-videos-copy">
                    <strong>{t('addYourLessons')}</strong>
                    <small>{detailVideos.length} {t('courseLessons')}</small>
                  </span>
                  <Plus size={20} />
                </button>
              </section>

              {!detailApproved && (
                <div className="instructor-detail-footer">
                  <button className="danger-button" type="button" onClick={deleteCourse}><Trash2 size={16} /> {t('deleteUnapprovedCourse')}</button>
                  <button className="dark-button" type="button" disabled={detailVideos.length === 0 || !detailTrailer} onClick={submitCourse}>{t('submitCourse')}</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    )
  }

  const instructorTabs = [
    ['new', t('newCourse'), null],
    ['approved', t('approvedCourses'), approvedCourses.length],
    ['pending', t('pendingCourses'), pendingCourses.length],
  ]

  const switchInstructorTab = (tabId) => {
    setMessage('')
    setInstructorTab(tabId)

    if (tabId === 'approved') {
      setSelectedCourseId(approvedCourses[0] ? String(approvedCourses[0].id) : '')
    }

    if (tabId === 'pending') {
      setSelectedCourseId(pendingCourses[0] ? String(pendingCourses[0].id) : '')
    }
  }

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="admin-layout instructor-layout">
        <aside className="admin-sidebar instructor-sidebar">
          <h1>{t('teacherPanel')}</h1>
          {instructorTabs.map(([id, label, count]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => switchInstructorTab(id)}>
              <span>{label}</span>
              {count !== null && <strong>{count}</strong>}
            </button>
          ))}
        </aside>

        <section className="admin-content">
        {activeTab === 'new' && (
          <section className="dashboard-header">
            <div>
              <p>{t('instructorHelp')}</p>
            </div>
          </section>
        )}

        {message && (
          <div className={messageType === 'error' ? 'error-box' : messageType === 'success' ? 'success-box' : 'notice-box'}>
            {message}
          </div>
        )}

        {activeTab === 'new' ? (
          <section className="panel-card form-panel course-setup-form">
            <h2>{t('newCourse')}</h2>
            <p className="muted">{t('courseSetupHelp')}</p>
            <label>{t('courseTitle')}</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('exampleCourseTitle')} />
            <label>{t('courseDescription')}</label>
            <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t('exampleCourseDescription')} />
            <label>{t('priceAzN')}</label>
            <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            <label>{t('coverImage')}</label>
            <input type="file" accept="image/*" onChange={(event) => setThumbnailFile(event.target.files[0])} />
            <div className="course-setup-divider">
              <h3>{t('courseTrailer')}</h3>
              <p className="muted">{t('trailerOptionalAtCreation')}</p>
            </div>
            <label>{t('trailerTitle')}</label>
            <input
              value={newCourseTrailerTitle}
              onChange={(event) => setNewCourseTrailerTitle(event.target.value)}
              placeholder={t('trailerTitlePlaceholder')}
            />
            <label>{t('trailerVideo')}</label>
            <input
              type="file"
              accept="video/*"
              disabled={loading}
              onChange={(event) => selectTrailerFile(
                event.target.files[0] || null,
                setNewCourseTrailerFile,
                setNewCourseTrailerValidating,
                event.target
              )}
            />
            <p className="muted">{t('trailerMaxDuration')}</p>
            {newCourseTrailerValidating && <p className="muted">{t('checkingVideoDuration')}</p>}
            {loading && newCourseTrailerFile && (
              <div className="upload-progress">
                <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                <small>{uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} {uploadPercent}%</small>
              </div>
            )}
            <button className="primary-button full" onClick={createCourse} disabled={loading || newCourseTrailerValidating}>
              {loading && newCourseTrailerFile
                ? `${uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} ${uploadPercent}%`
                : newCourseTrailerValidating
                  ? t('checkingVideoDuration')
                : loading
                  ? t('loading')
                  : t('createCourse')}
            </button>
          </section>
        ) : (
          <section className="studio-grid">
            <div className="panel-card">
              <h2>{activeTab === 'approved' ? t('approvedCourses') : t('pendingCourses')}</h2>
              {visibleCourses.length === 0 ? (
                <div className="empty-box">
                  {activeTab === 'approved' ? t('noApprovedCourses') : t('noPendingCourses')}
                </div>
              ) : visibleCourses.map((course) => {
                const instructorName = getCourseAuthorName(course)

                return (
                  <div key={course.id} className={String(course.id) === String(selectedCourseId) ? 'course-row active' : 'course-row'}>
                    <button type="button" className="course-row-main" onClick={() => setSelectedCourseId(String(course.id))}>
                      <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                      <span>
                        <strong>{course.title}</strong>
                        {instructorName && <small>{t('instructorLabel')}: {instructorName}</small>}
                        <small>{t(getCourseStatusLabel(getCourseStatus(course)))} · {course.price} AZN · {videos.filter((video) => video.course_id === course.id).length} {t('courseLessons')}</small>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>

            {visibleSelectedCourse && (
              <div className="panel-card form-panel">
                <>
                  <h2>{visibleSelectedCourse.title}</h2>
                  {getCourseAuthorName(visibleSelectedCourse) && <p className="muted">{t('instructorLabel')}: {getCourseAuthorName(visibleSelectedCourse)}</p>}
                  <button
                    className="outline-button full"
                    type="button"
                    onClick={() => navigate(`/course/${visibleSelectedCourse.id}`, { state: { course: visibleSelectedCourse } })}
                  >
                    <PlayCircle size={16} /> {t('previewCourse')}
                  </button>

                  {selectedCourseApproved ? (
                    <>
                      <div className="notice-box">{t('approvedCourseLockNote')}</div>
                      <button className="outline-button full" onClick={() => navigate('/inbox')}>{t('messageAdmin')}</button>

                      <div className="lesson-list">
                        {visibleCourseVideos.length === 0 ? <p className="muted">{t('noLessons')}</p> : visibleCourseVideos.map((video, index) => (
                          <div key={video.id} className="lesson-row managed-lesson-row">
                            <span>{index + 1}</span>
                            <div>
                              <strong>{video.title}</strong>
                              <small>
                                {video.duration || t('durationMissing')}
                                {video.is_free ? ` · ${t('previewShort')}` : ''}
                              </small>
                             </div>
                             <button
                               className="icon-link-button"
                               type="button"
                               onClick={() => navigate(`/course/${visibleSelectedCourse.id}`, {
                                 state: { course: visibleSelectedCourse, videoId: video.id },
                               })}
                               aria-label={t('playLesson')}
                               title={t('playLesson')}
                             >
                               <PlayCircle size={16} />
                             </button>
                           </div>
                         ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <section className="course-details-editor">
                        <div className="course-editor-heading">
                          <div>
                            <h3>{t('courseSetup')}</h3>
                            <p className="muted">{t('courseDetailsHelp')}</p>
                          </div>
                          <img src={visibleSelectedCourse.thumbnail_url || '/course-placeholder.svg'} alt={visibleSelectedCourse.title} />
                        </div>
                        <label>{t('courseTitle')}</label>
                        <input
                          value={courseDetailsForm.title}
                          onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, title: event.target.value })}
                        />
                        <label>{t('courseDescription')}</label>
                        <textarea
                          rows={5}
                          value={courseDetailsForm.description}
                          onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, description: event.target.value })}
                        />
                        <label>{t('priceAzN')}</label>
                        <input
                          type="number"
                          value={courseDetailsForm.price}
                          onChange={(event) => setCourseDetailsForm({ ...courseDetailsForm, price: event.target.value })}
                        />
                        <label>{t('replaceCoverImage')}</label>
                        <input type="file" accept="image/*" onChange={(event) => setCourseThumbnailFile(event.target.files[0] || null)} />
                        <button className="primary-button full" type="button" disabled={loading} onClick={saveCourseDetails}>
                          {loading ? t('loading') : t('saveCourseDetails')}
                        </button>
                      </section>
                      <button className="danger-button full" type="button" onClick={deleteCourse}>
                        <Trash2 size={16} /> {t('deleteUnapprovedCourse')}
                      </button>
                      <div className="section-manager trailer-manager">
                        <h3>{t('courseTrailer')}</h3>
                        <p className="muted">
                          {selectedTrailer ? t('trailerReady') : t('trailerHelp')}
                        </p>
                        <label>{t('trailerTitle')}</label>
                        <input
                          value={trailerTitle}
                          onChange={(event) => setTrailerTitle(event.target.value)}
                          placeholder={t('trailerTitlePlaceholder')}
                        />
                        <label>{t('trailerVideo')}</label>
                        <input
                          type="file"
                          accept="video/*"
                          disabled={loading}
                          onChange={(event) => selectTrailerFile(
                            event.target.files[0] || null,
                            setTrailerFile,
                            setTrailerValidating,
                            event.target
                          )}
                        />
                        <p className="muted">{t('trailerMaxDuration')}</p>
                        {trailerValidating && <p className="muted">{t('checkingVideoDuration')}</p>}
                        {loading && trailerFile && (
                          <div className="upload-progress">
                            <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                            <small>{uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} {uploadPercent}%</small>
                          </div>
                        )}
                        <button className="outline-button full" type="button" disabled={loading || trailerValidating} onClick={uploadTrailer}>
                          <PlayCircle size={16} />
                          {loading && trailerFile
                            ? `${uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} ${uploadPercent}%`
                            : trailerValidating
                              ? t('checkingVideoDuration')
                            : selectedTrailer
                              ? t('replaceTrailer')
                              : t('uploadTrailer')}
                        </button>
                      </div>
                      <div className="course-builder-heading">
                        <h3>{t('courseCurriculum')}</h3>
                        <p className="muted">{t('courseCurriculumHelp')}</p>
                      </div>
                      <div className="section-manager">
                        <h3>{t('courseSections')}</h3>
                        <div className="section-create-row">
                          <input
                            value={sectionTitle}
                            onChange={(event) => setSectionTitle(event.target.value)}
                            placeholder={t('sectionTitlePlaceholder')}
                          />
                          <button className="outline-button" type="button" onClick={createSection}>
                            <FolderPlus size={16} /> {t('addSection')}
                          </button>
                        </div>
                      </div>

                      <div className="lesson-manager">
                        <label>{t('sectionLabel')}</label>
                        <select
                          value={validSelectedSectionId}
                          onChange={(event) => setSelectedSectionId(event.target.value)}
                        >
                          {visibleCourseSections.map((section, index) => (
                            <option key={section.id} value={section.id}>
                              {getSectionLabel(section, index)}
                            </option>
                          ))}
                        </select>
                        <label>{t('lessonTitle')}</label>
                        <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder={`${visibleCourseVideos.length + 1}. ${t('lessonTitle').toLowerCase()}`} />
                        <label>{t('lessonDuration')}</label>
                        <input value={lessonDuration} readOnly placeholder={t('exampleLessonDuration')} />

                        <label>
                          <input
                            type="checkbox"
                            checked={lessonIsFree}
                            onChange={(event) => setLessonIsFree(event.target.checked)}
                            style={{ marginRight: '8px' }}
                          />
                          {t('previewLesson')}
                        </label>

                        <label>{t('videoFile')}</label>
                        <input type="file" accept="video/*" disabled={loading} onChange={(event) => selectLessonFile(event.target.files[0] || null)} />
                        <p className="muted">{t('bunnyUploadHelp')}</p>

                        {loading && uploadPercent > 0 && (
                          <div className="upload-progress">
                            <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                            <small>{t('uploadingVideo')} {uploadPercent}%</small>
                          </div>
                        )}
                      </div>

                      <button className="primary-button full" onClick={addLesson} disabled={loading}>
                        {loading ? (uploadPercent > 0 ? `${uploadPercent}%` : t('loading')) : t('addLesson')}
                      </button>
                      <button className="dark-button full" onClick={submitCourse} disabled={visibleCourseVideos.length === 0 || !selectedTrailer}>{t('submitCourse')}</button>

                      <div className="section-editor-list">
                        {effectiveSections.map((section, sectionIndex) => {
                          const sectionVideos = visibleCourseVideos.filter((video) => (
                            section.id === 'legacy' ? true : String(video.section_id) === String(section.id)
                          ))
                          return (
                            <section className="section-editor-card" key={section.id}>
                              <div className="section-editor-heading">
                                <strong>{getSectionLabel(section, sectionIndex)}</strong>
                                <small>{sectionVideos.length} {t('courseLessons')}</small>
                              </div>
                              <div className="lesson-list">
                                {sectionVideos.length === 0 ? <p className="muted">{t('noLessonsInSection')}</p> : sectionVideos.map((video, lessonIndex) => (
                                  <div key={video.id} className="lesson-row managed-lesson-row">
                                    <span>{sectionIndex + 1}.{lessonIndex + 1}</span>
                                    <div>
                                      <strong>{video.title}</strong>
                                      <small>
                                        {video.duration || t('durationMissing')}
                                        {video.is_free ? ` · ${t('previewShort')}` : ''}
                                      </small>
                                    </div>
                                    <div className="lesson-row-actions">
                                      <button
                                        className="icon-link-button"
                                        type="button"
                                        onClick={() => moveLesson(video.id, -1)}
                                        disabled={lessonIndex === 0}
                                        aria-label={t('moveLessonUp')}
                                        title={t('moveLessonUp')}
                                      >
                                        <ArrowUp size={16} />
                                      </button>
                                      <button
                                        className="icon-link-button"
                                        type="button"
                                        onClick={() => moveLesson(video.id, 1)}
                                        disabled={lessonIndex === sectionVideos.length - 1}
                                        aria-label={t('moveLessonDown')}
                                        title={t('moveLessonDown')}
                                      >
                                        <ArrowDown size={16} />
                                      </button>
                                      <button
                                        className="icon-link-button"
                                        type="button"
                                        onClick={() => navigate(`/course/${visibleSelectedCourse.id}`, {
                                          state: { course: visibleSelectedCourse, videoId: video.id },
                                        })}
                                        aria-label={t('playLesson')}
                                        title={t('playLesson')}
                                      >
                                        <PlayCircle size={16} />
                                      </button>
                                      <button
                                        className="icon-link-button"
                                        type="button"
                                        onClick={() => toggleFreeLesson(video.id, !video.is_free)}
                                        aria-label={video.is_free ? t('previewClose') : t('previewOpen')}
                                        title={video.is_free ? t('previewClose') : t('previewOpen')}
                                      >
                                        {video.is_free ? <EyeOff size={16} /> : <Eye size={16} />}
                                      </button>
                                      <button className="icon-danger-button" type="button" onClick={() => deleteLesson(video.id)} aria-label={t('deleteLesson')}>
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              </div>
            )}
          </section>
        )}
        </section>
      </main>
    </div>
  )
}

export default InstructorDashboard
