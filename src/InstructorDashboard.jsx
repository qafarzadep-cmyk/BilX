import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, PlayCircle, Trash2 } from 'lucide-react'
import * as tus from 'tus-js-client'
import { getCourseAuthorName } from './courseAuthors'
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

function InstructorDashboard({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = profile?.role || 'student'
  const urlTab = searchParams.get('tab')
  const initialTab = ['new', 'approved', 'pending'].includes(urlTab) ? urlTab : 'new'
  const [courses, setCourses] = useState([])
  const [videos, setVideos] = useState([])
  const [sections, setSections] = useState([])
  const [trailers, setTrailers] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '' })
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [newCourseTrailerTitle, setNewCourseTrailerTitle] = useState('')
  const [newCourseTrailerFile, setNewCourseTrailerFile] = useState(null)
  const [courseDetailsForm, setCourseDetailsForm] = useState({ title: '', description: '', price: '' })
  const [courseThumbnailFile, setCourseThumbnailFile] = useState(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDuration, setLessonDuration] = useState('')
  const [lessonIsFree, setLessonIsFree] = useState(false)
  const [lessonFile, setLessonFile] = useState(null)
  const [trailerFile, setTrailerFile] = useState(null)
  const [trailerTitle, setTrailerTitle] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [sectionTitle, setSectionTitle] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [activeTab, setActiveTab] = useState(initialTab)
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
    if (!selectedCourse) return
    // Keep the edit form aligned when the instructor selects another course.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourseDetailsForm({
      title: selectedCourse.title || '',
      description: selectedCourse.description || '',
      price: selectedCourse.price ?? '',
    })
    setCourseThumbnailFile(null)
  }, [selectedCourse])

  const showMessage = (text, type = 'notice') => {
    setMessage(text)
    setMessageType(type)
  }

  const setInstructorTab = (tabId, options = {}) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId }, { replace: options.replace ?? true })
  }

  const loadData = async (currentUser = user) => {
    if (!currentUser) return

    const { data: courseData, error: courseError } = await supabase
      .from('Courses')
      .select('*')
      .eq('instructor_id', currentUser.id)
      .order('id', { ascending: false })

    if (courseError) {
      showMessage(`${t('coursesLoadFailed')}${courseError.message}`, 'error')
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
      setTrailers([])
      setInstructorTab('new')
      return
    }

    const [
      { data: videoData, error: videoError },
      { data: sectionData, error: sectionError },
      { data: trailerData, error: trailerError },
    ] = await Promise.all([
      supabase.from('videos').select('*').in('course_id', ids).order('order_index', { ascending: true }),
      supabase.from('course_sections').select('*').in('course_id', ids).order('order_index', { ascending: true }),
      supabase.from('course_trailers').select('*').in('course_id', ids),
    ])

    if (videoError) {
      showMessage(`${t('lessonsLoadFailed')}${videoError.message}`, 'error')
      return
    }

    setVideos(videoData || [])
    setSections(sectionError ? [] : sectionData || [])
    setTrailers(trailerError ? [] : trailerData || [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    const nextTab = ['new', 'approved', 'pending'].includes(urlTab) ? urlTab : 'new'
    if (nextTab !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(nextTab)
    }
  }, [urlTab, activeTab])

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
    if (!user || !form.title.trim() || !form.description.trim() || !form.price) {
      showMessage(t('fillCourseFields'), 'error')
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
          price: Number(form.price),
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
            price: Number(form.price),
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
      setInstructorTab('pending')
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

  const selectTrailerFile = async (file, setter, input) => {
    if (!file) {
      setter(null)
      return
    }

    try {
      const duration = await getVideoDuration(file)
      if (duration > 60.5) {
        setter(null)
        if (input) input.value = ''
        showMessage(t('trailerTooLong'), 'error')
        return
      }
      setter(file)
      showMessage(t('trailerDurationAccepted'), 'success')
    } catch (error) {
      setter(null)
      if (input) input.value = ''
      showMessage(error.message, 'error')
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
    if (!visibleSelectedCourse || selectedCourseApproved) return
    if (!courseDetailsForm.title.trim() || !courseDetailsForm.description.trim() || !courseDetailsForm.price) {
      showMessage(t('fillCourseFields'), 'error')
      return
    }

    setLoading(true)
    try {
      const thumbnailUrl = courseThumbnailFile
        ? await uploadPublicFile('thumbnails', courseThumbnailFile, 'thumb')
        : visibleSelectedCourse.thumbnail_url

      const { error } = await supabase
        .from('Courses')
        .update({
          title: courseDetailsForm.title.trim(),
          description: courseDetailsForm.description.trim(),
          price: Number(courseDetailsForm.price),
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', visibleSelectedCourse.id)

      if (error) throw error
      setCourseThumbnailFile(null)
      showMessage(t('courseDetailsSaved'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const addLesson = async () => {
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
    const selectedSection = currentSections.find((section) => String(section.id) === String(selectedSectionId))
    const targetSectionId = selectedSection?.id || currentSections[0]?.id
    if (!targetSectionId) {
      showMessage(t('createSectionFirst'), 'error')
      return
    }

    setLoading(true)
    setUploadPercent(0)
    showMessage(t('uploadingVideo'))

    try {
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
        order_index: courseVideos.length + 1,
        is_free: lessonIsFree,
      }

      if (lessonDuration.trim()) {
        lessonPayload.duration = lessonDuration.trim()
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
    if (!selectedCourseId) {
      showMessage(t('selectOrCreateCourse'), 'error')
      return
    }

    const courseSections = sections.filter((section) => String(section.course_id) === String(selectedCourseId))
    const nextIndex = courseSections.length + 1
    const { data, error } = await supabase
      .from('course_sections')
      .insert({
        course_id: Number(selectedCourseId),
        title: sectionTitle.trim() || `Section ${nextIndex}`,
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
    showMessage(t('sectionCreated'), 'success')
    await loadData(user)
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
  const getSectionLabel = (section, index) => {
    const numbered = `${t('sectionLabel')} ${index + 1}`
    return section.title && section.title !== `Section ${index + 1}` ? `${numbered}: ${section.title}` : numbered
  }
  // Per workflow.md 3.3: teachers cannot edit/delete an approved course. They can
  // only build (add lessons / submit) a course while it is still draft/pending;
  // once approved it is read-only and changes go through the admin via Inbox.
  const selectedCourseApproved = visibleSelectedCourse
    ? (getCourseStatus(visibleSelectedCourse) === 'approved' || visibleSelectedCourse.is_published)
    : false
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
              onChange={(event) => selectTrailerFile(event.target.files[0] || null, setNewCourseTrailerFile, event.target)}
            />
            <p className="muted">{t('trailerMaxDuration')}</p>
            {loading && newCourseTrailerFile && (
              <div className="upload-progress">
                <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                <small>{uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} {uploadPercent}%</small>
              </div>
            )}
            <button className="primary-button full" onClick={createCourse} disabled={loading}>
              {loading && newCourseTrailerFile
                ? `${uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} ${uploadPercent}%`
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
                          onChange={(event) => selectTrailerFile(event.target.files[0] || null, setTrailerFile, event.target)}
                        />
                        <p className="muted">{t('trailerMaxDuration')}</p>
                        {loading && trailerFile && (
                          <div className="upload-progress">
                            <div className="upload-progress-bar"><span style={{ width: `${uploadPercent}%` }} /></div>
                            <small>{uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} {uploadPercent}%</small>
                          </div>
                        )}
                        <button className="outline-button full" type="button" disabled={loading} onClick={uploadTrailer}>
                          <PlayCircle size={16} />
                          {loading && trailerFile
                            ? `${uploadPercent > 0 ? t('uploadingVideo') : t('preparingVideoUpload')} ${uploadPercent}%`
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
                        <input value={lessonDuration} onChange={(event) => setLessonDuration(event.target.value)} placeholder={t('exampleLessonDuration')} />

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
                        <input type="file" accept="video/*" disabled={loading} onChange={(event) => setLessonFile(event.target.files[0] || null)} />
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
