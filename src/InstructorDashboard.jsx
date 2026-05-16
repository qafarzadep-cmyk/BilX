import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, Link, Trash2, Upload } from 'lucide-react'
import { getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { supabase } from './supabase'

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
  const [lessonSource, setLessonSource] = useState('youtube')
  const [lessonUrl, setLessonUrl] = useState('')
  const [lessonFile, setLessonFile] = useState(null)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('notice')

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
      showMessage(`Kurslar yüklənmədi: ${courseError.message}`, 'error')
      return
    }

    const instructorName = profile?.full_name || currentUser.user_metadata?.full_name || currentUser.email || ''
    const nextCourses = (courseData || []).map((course) => ({
      ...course,
      instructor_name: course.instructor_name || instructorName,
    }))
    setCourses(nextCourses)

    const tabCourses = activeTab === 'approved'
      ? nextCourses.filter((course) => course.is_published)
      : activeTab === 'pending'
        ? nextCourses.filter((course) => !course.is_published)
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
      showMessage(`Dərslər yüklənmədi: ${videoError.message}`, 'error')
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
    if (user && role !== 'instructor') {
      navigate('/profile', { replace: true })
    }
  }, [user, role, navigate])

  useEffect(() => {
    const nextTab = ['new', 'approved', 'pending'].includes(urlTab) ? urlTab : 'new'
    if (nextTab !== activeTab) {
      setActiveTab(nextTab)
    }
  }, [urlTab, activeTab])

  useEffect(() => {
    if (activeTab === 'new' || courses.length === 0) return

    const tabCourses = activeTab === 'approved'
      ? courses.filter((course) => course.is_published)
      : courses.filter((course) => !course.is_published)
    const selectedStillVisible = tabCourses.some((course) => String(course.id) === String(selectedCourseId))

    if (!selectedStillVisible) {
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
      throw new Error(
        `${bucket} yüklənmədi: ${error.message}. Supabase Storage-da "${bucket}" bucket-inin mövcud olduğunu və giriş etmiş istifadəçilərə yükləmə icazəsi verdiyini yoxlayın.`
      )
    }

    return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl
  }

  const createCourse = async () => {
    if (!user || !form.title.trim() || !form.description.trim() || !form.price) {
      showMessage('Bütün kurs sahələrini doldurun.', 'error')
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
      showMessage('Kurs yaradıldı. İndi dərslər əlavə edə bilərsiniz.', 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`Xəta: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const addLesson = async () => {
    if (!selectedCourseId) {
      showMessage('Əvvəlcə kurs yaradın və ya mövcud kurs seçin.', 'error')
      setInstructorTab('new')
      return
    }

    if (!lessonTitle.trim()) {
      showMessage('Dərs adı yazın.', 'error')
      return
    }

    if (lessonSource === 'youtube' && !lessonUrl.trim()) {
      showMessage('YouTube linki daxil edin.', 'error')
      return
    }

    if (lessonSource === 'upload' && !lessonFile) {
      showMessage('Video faylı seçin və ya YouTube link rejiminə keçin.', 'error')
      return
    }

    setLoading(true)
    showMessage(lessonSource === 'upload' ? 'Video yüklənir...' : 'Dərs əlavə olunur...')

    try {
      const videoUrl = lessonSource === 'youtube'
        ? lessonUrl.trim()
        : await uploadPublicFile('videos', lessonFile, `lesson-${selectedCourseId}`)

      const lessonPayload = {
        course_id: Number(selectedCourseId),
        title: lessonTitle.trim(),
        video_url: videoUrl,
        order_index: courseVideos.length + 1,
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
      showMessage('Dərs əlavə edildi.', 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`Xəta: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const deleteLesson = async (videoId) => {
    const { error } = await supabase.from('videos').delete().eq('id', videoId)

    if (error) {
      showMessage(`Xəta: ${error.message}`, 'error')
      return
    }

    showMessage('Dərs silindi.', 'success')
    await loadData(user)
  }

  const submitCourse = async () => {
    if (!selectedCourseId || courseVideos.length === 0) {
      showMessage('Kursu təqdim etmək üçün ən azı bir dərs əlavə edin.', 'error')
      return
    }

    const { error } = await supabase
      .from('Courses')
      .update({ is_published: false })
      .eq('id', selectedCourseId)

    if (error) {
      showMessage(`Xəta: ${error.message}`, 'error')
      return
    }

    showMessage('Kurs admin təsdiqi üçün göndərildi.', 'success')
    await loadData(user)
  }

  if (!user) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">
          <h2>Müəllim paneli üçün daxil olun</h2>
          <button className="primary-button" onClick={() => navigate('/login')}>Giriş</button>
        </div>
      </div>
    )
  }

  if (role !== 'instructor') return null

  const approvedCourses = courses.filter((course) => course.is_published)
  const pendingCourses = courses.filter((course) => !course.is_published)
  const visibleCourses = activeTab === 'approved' ? approvedCourses : pendingCourses
  const selectedCourseIsVisible = visibleCourses.some((course) => String(course.id) === String(selectedCourseId))
  const visibleSelectedCourse = selectedCourseIsVisible ? selectedCourse : null
  const visibleCourseVideos = visibleSelectedCourse
    ? videos.filter((video) => String(video.course_id) === String(visibleSelectedCourse.id))
    : []
  const instructorTabs = [
    ['new', 'Yeni Kurs Yarat', null],
    ['approved', 'Təsdiqlənmiş Kurslarım', approvedCourses.length],
    ['pending', 'Təsdiq Gözləyən Kurslarım', pendingCourses.length],
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
          <h1>Müəllim Paneli</h1>
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
              <p>Kurs yaradın, dərs videoları əlavə edin və admin təsdiqinə göndərin.</p>
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
            <h2>Yeni kurs yarat</h2>
            <label>Kurs adı</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Məsələn: Python-a giriş" />
            <label>Təsvir</label>
            <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Tələbələrin nə öyrənəcəyini yazın..." />
            <label>Qiymət (AZN)</label>
            <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            <label>Örtük şəkli</label>
            <input type="file" accept="image/*" onChange={(event) => setThumbnailFile(event.target.files[0])} />
            <button className="primary-button full" onClick={createCourse} disabled={loading}>{loading ? 'Yaradılır...' : 'Kursu yarat'}</button>
          </section>
        ) : (
          <section className="studio-grid">
            <div className="panel-card">
              <h2>{activeTab === 'approved' ? 'Təsdiqlənmiş Kurslarım' : 'Təsdiq Gözləyən Kurslarım'}</h2>
              {visibleCourses.length === 0 ? (
                <div className="empty-box">
                  {activeTab === 'approved' ? 'Hələ təsdiqlənmiş kursunuz yoxdur.' : 'Hazırda təsdiq gözləyən kursunuz yoxdur.'}
                </div>
              ) : visibleCourses.map((course) => {
                const instructorName = getCourseAuthorName(course)

                return (
                  <div key={course.id} className={String(course.id) === String(selectedCourseId) ? 'course-row active' : 'course-row'}>
                    <button type="button" className="course-row-main" onClick={() => setSelectedCourseId(String(course.id))}>
                      <img src={course.thumbnail_url || '/ortuksekli.jpg'} alt={course.title} />
                      <span>
                        <strong>{course.title}</strong>
                        {instructorName && <small>Müəllim: {instructorName}</small>}
                        <small>{course.is_published ? 'Təsdiqlənib' : 'Gözləyir'} · {course.price} AZN · {videos.filter((video) => video.course_id === course.id).length} dərs</small>
                      </span>
                    </button>
                    <button type="button" className="course-edit-button" onClick={() => navigate(`/edit-course/${course.id}`, { state: { course } })}>
                      Dəyişiklik et
                    </button>
                  </div>
                )
              })}
            </div>

            {visibleSelectedCourse && (
              <div className="panel-card form-panel">
                <>
                  <h2>{visibleSelectedCourse.title}</h2>
                  {getCourseAuthorName(visibleSelectedCourse) && <p className="muted">Müəllim: {getCourseAuthorName(visibleSelectedCourse)}</p>}
                  <button className="outline-button full" onClick={() => navigate(`/edit-course/${visibleSelectedCourse.id}`, { state: { course: visibleSelectedCourse } })}>
                    Dəyişiklik et
                  </button>

                  <div className="lesson-manager">
                    <div className="lesson-source-tabs" role="tablist" aria-label="Dərs videosu mənbəyi">
                      <button
                        type="button"
                        className={lessonSource === 'youtube' ? 'active' : ''}
                        onClick={() => setLessonSource('youtube')}
                      >
                        <Link size={16} /> YouTube linki
                      </button>
                      <button
                        type="button"
                        className={lessonSource === 'upload' ? 'active' : ''}
                        onClick={() => setLessonSource('upload')}
                      >
                        <Upload size={16} /> Fayl yüklə
                      </button>
                    </div>

                    <label>Dərs adı</label>
                    <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder={`${visibleCourseVideos.length + 1}. dərs adı`} />
                    <label>Müddət</label>
                    <input value={lessonDuration} onChange={(event) => setLessonDuration(event.target.value)} placeholder="Məsələn: 12:34" />

                    {lessonSource === 'youtube' ? (
                      <>
                        <label>YouTube linki</label>
                        <input value={lessonUrl} onChange={(event) => setLessonUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                      </>
                    ) : (
                      <>
                        <label>Video faylı</label>
                        <input type="file" accept="video/*" onChange={(event) => setLessonFile(event.target.files[0] || null)} />
                        <p className="muted">Fayl yükləməsi üçün Supabase Storage-da `videos` adlı public bucket və giriş etmiş istifadəçilər üçün upload icazəsi lazımdır. YouTube linkləri Storage olmadan işləyir.</p>
                      </>
                    )}
                  </div>

                  <button className="primary-button full" onClick={addLesson} disabled={loading}>
                    {loading ? 'İşlənir...' : 'Dərs Əlavə et'}
                  </button>
                  <button className="dark-button full" onClick={submitCourse} disabled={visibleCourseVideos.length === 0}>Kursu təqdim et</button>

                  <div className="lesson-list">
                    {visibleCourseVideos.length === 0 ? <p className="muted">Bu kursda hələ dərs yoxdur.</p> : visibleCourseVideos.map((video, index) => (
                      <div key={video.id} className="lesson-row managed-lesson-row">
                        <span>{index + 1}</span>
                        <div>
                          <strong>{video.title}</strong>
                          <small>{video.duration || 'Müddət yazılmayıb'}</small>
                        </div>
                        <div className="lesson-row-actions">
                          <a className="icon-link-button" href={video.video_url} target="_blank" rel="noreferrer" aria-label="Dərs videosunu aç">
                            <ExternalLink size={16} />
                          </a>
                          <button className="icon-danger-button" type="button" onClick={() => deleteLesson(video.id)} aria-label="Dərsi sil">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
