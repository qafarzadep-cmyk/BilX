import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ExternalLink, Link, Trash2, Upload } from 'lucide-react'
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
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '' })
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDuration, setLessonDuration] = useState('')
  const [lessonIsFree, setLessonIsFree] = useState(false)
  const [lessonSource, setLessonSource] = useState('youtube')
  const [lessonUrl, setLessonUrl] = useState('')
  const [lessonFile, setLessonFile] = useState(null)
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
      setInstructorTab('new')
      return
    }

    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .in('course_id', ids)
      .order('order_index', { ascending: true })

    if (videoError) {
      showMessage(`${t('lessonsLoadFailed')}${videoError.message}`, 'error')
      return
    }

    setVideos(videoData || [])
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

      setForm({ title: '', description: '', price: '' })
      setThumbnailFile(null)
      setSelectedCourseId(String(data.id))
      setInstructorTab('pending')
      showMessage(t('courseCreatedAddLessons'), 'success')
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

    if (lessonSource === 'youtube' && !lessonUrl.trim()) {
      showMessage(t('enterYoutubeLink'), 'error')
      return
    }

    if (lessonSource === 'upload' && !lessonFile) {
      showMessage(t('selectVideoOrYoutube'), 'error')
      return
    }

    setLoading(true)
    showMessage(lessonSource === 'upload' ? t('uploadingVideo') : t('addingLesson'))

    try {
      const videoUrl = lessonSource === 'youtube'
        ? lessonUrl.trim()
        : await uploadPublicFile('videos', lessonFile, `lesson-${selectedCourseId}`)

      const lessonPayload = {
        course_id: Number(selectedCourseId),
        title: lessonTitle.trim(),
        video_url: videoUrl,
        order_index: courseVideos.length + 1,
        // The first lesson of a course is always a free preview (workflow 1.1);
        // for the rest, honour the instructor's checkbox.
        is_free: courseVideos.length === 0 ? true : lessonIsFree,
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
      setLessonUrl('')
      setLessonFile(null)
      setLessonIsFree(false)
      showMessage(t('lessonAdded'), 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`${t('errorOccurred')}${error.message}`, 'error')
    } finally {
      setLoading(false)
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
          <section className="panel-card form-panel">
            <h2>{t('newCourse')}</h2>
            <label>{t('courseTitle')}</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('exampleCourseTitle')} />
            <label>{t('courseDescription')}</label>
            <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t('exampleCourseDescription')} />
            <label>{t('priceAzN')}</label>
            <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            <label>{t('coverImage')}</label>
            <input type="file" accept="image/*" onChange={(event) => setThumbnailFile(event.target.files[0])} />
            <button className="primary-button full" onClick={createCourse} disabled={loading}>{loading ? t('loading') : t('createCourse')}</button>
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
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="lesson-manager">
                        <div className="lesson-source-tabs" role="tablist" aria-label={t('lessonSource')}>
                          <button
                            type="button"
                            className={lessonSource === 'youtube' ? 'active' : ''}
                            onClick={() => setLessonSource('youtube')}
                          >
                            <Link size={16} /> {t('youtubeLink')}
                          </button>
                          <button
                            type="button"
                            className={lessonSource === 'upload' ? 'active' : ''}
                            onClick={() => setLessonSource('upload')}
                          >
                            <Upload size={16} /> {t('uploadFile')}
                          </button>
                        </div>

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

                        {lessonSource === 'youtube' ? (
                          <>
                            <label>{t('youtubeLink')}</label>
                            <input value={lessonUrl} onChange={(event) => setLessonUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                          </>
                        ) : (
                          <>
                            <label>{t('videoFile')}</label>
                            <input type="file" accept="video/*" onChange={(event) => setLessonFile(event.target.files[0] || null)} />
                            <p className="muted">{t('uploadHelp')}</p>
                          </>
                        )}
                      </div>

                      <button className="primary-button full" onClick={addLesson} disabled={loading}>
                        {loading ? t('loading') : t('addLesson')}
                      </button>
                      <button className="dark-button full" onClick={submitCourse} disabled={visibleCourseVideos.length === 0}>{t('submitCourse')}</button>

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
                            <div className="lesson-row-actions">
                              <button
                                className="icon-link-button"
                                type="button"
                                onClick={() => toggleFreeLesson(video.id, !video.is_free)}
                                aria-label={video.is_free ? t('previewClose') : t('previewOpen')}
                                title={video.is_free ? t('previewClose') : t('previewOpen')}
                              >
                                {video.is_free ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                              <a className="icon-link-button" href={video.video_url} target="_blank" rel="noreferrer" aria-label={t('openLessonVideo')}>
                                <ExternalLink size={16} />
                              </a>
                              <button className="icon-danger-button" type="button" onClick={() => deleteLesson(video.id)} aria-label={t('deleteLesson')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
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
