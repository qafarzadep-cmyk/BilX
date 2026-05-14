import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { supabase } from './supabase'

function InstructorDashboard({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const role = profile?.role || 'student'
  const [courses, setCourses] = useState([])
  const [videos, setVideos] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '' })
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonFile, setLessonFile] = useState(null)
  const [activeTab, setActiveTab] = useState('courses')
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

    const selectedStillExists = nextCourses.some((course) => String(course.id) === String(selectedCourseId))
    if (!selectedStillExists) {
      setSelectedCourseId(nextCourses[0] ? String(nextCourses[0].id) : '')
    }

    const ids = nextCourses.map((course) => course.id)
    if (ids.length === 0) {
      setVideos([])
      setActiveTab('new')
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

  const uploadPublicFile = async (bucket, file, prefix) => {
    if (!file) return null

    const ext = file.name.split('.').pop()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const fileName = `${prefix}-${Date.now()}-${safeName}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      throw new Error(
        `${bucket} storage upload alınmadı: ${error.message}. Supabase Storage-da "${bucket}" bucket-i public yaradın və upload icazəsini aktiv edin.`
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
      setActiveTab('courses')
      showMessage('Kurs yaradıldı. İndi bu kursa video dərslər əlavə edə bilərsiniz.', 'success')
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
      setActiveTab('new')
      return
    }

    if (!lessonTitle.trim() || !lessonFile) {
      showMessage('Dərs adı və video faylı seçin.', 'error')
      return
    }

    setLoading(true)
    showMessage('')

    try {
      const videoUrl = await uploadPublicFile('videos', lessonFile, `lesson-${selectedCourseId}`)
      const { error } = await supabase.from('videos').insert({
        course_id: Number(selectedCourseId),
        title: lessonTitle.trim(),
        video_url: videoUrl,
        order_index: courseVideos.length + 1,
      })

      if (error) throw error

      setLessonTitle('')
      setLessonFile(null)
      showMessage('Dərs videosu əlavə edildi.', 'success')
      await loadData(user)
    } catch (error) {
      showMessage(`Xəta: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const submitCourse = async () => {
    if (!selectedCourseId || courseVideos.length === 0) {
      showMessage('Kursu təqdim etmək üçün ən azı bir video dərs əlavə edin.', 'error')
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
          <button className="primary-button" onClick={() => navigate('/login')}>Daxil ol</button>
        </div>
      </div>
    )
  }

  if (role !== 'instructor') return null

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="dashboard-shell">
        <section className="dashboard-header">
          <div>
            <p className="role-pill">Müəllim kimi daxil oldunuz</p>
            <h1>Müəllim Paneli</h1>
            <p>Kurs yaradın, video dərslər əlavə edin və təsdiq üçün adminə göndərin.</p>
          </div>
        </section>

        <div className="tabs">
          <button className={activeTab === 'courses' ? 'active' : ''} onClick={() => setActiveTab('courses')}>Kurslarım</button>
          <button className={activeTab === 'new' ? 'active' : ''} onClick={() => setActiveTab('new')}>Kurs yarat</button>
        </div>

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
            <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Kurs haqqında məlumat..." />
            <label>Qiymət (AZN)</label>
            <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            <label>Örtük şəkli</label>
            <input type="file" accept="image/*" onChange={(event) => setThumbnailFile(event.target.files[0])} />
            <button className="primary-button full" onClick={createCourse} disabled={loading}>{loading ? 'Yaradılır...' : 'Kursu yarat'}</button>
          </section>
        ) : (
          <section className="studio-grid">
            <div className="panel-card">
              <h2>Kurslarım</h2>
              {courses.length === 0 ? (
                <div className="empty-box">
                  Hələ kurs yoxdur. Video yükləmək üçün əvvəlcə kurs yaradın.
                </div>
              ) : courses.map((course) => {
                const instructorName = getCourseAuthorName(course)

                return (
                  <button key={course.id} className={String(course.id) === String(selectedCourseId) ? 'course-row active' : 'course-row'} onClick={() => setSelectedCourseId(String(course.id))}>
                    <img src={course.thumbnail_url || '/ortuksekli.jpg'} alt={course.title} />
                    <span>
                      <strong>{course.title}</strong>
                      {instructorName && <small>Müəllim: {instructorName}</small>}
                      <small>{course.is_published ? 'Təsdiqlənib' : 'Gözləyir'} · {course.price} AZN · {videos.filter((video) => video.course_id === course.id).length} dərs</small>
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedCourse && (
              <div className="panel-card form-panel">
                <>
                  <h2>{selectedCourse.title}</h2>
                  {getCourseAuthorName(selectedCourse) && <p className="muted">Müəllim: {getCourseAuthorName(selectedCourse)}</p>}
                  <button className="outline-button full" onClick={() => navigate('/edit-course', { state: { course: selectedCourse } })}>
                    Kurs məlumatlarını redaktə et
                  </button>
                  <label>Dərs adı</label>
                  <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder={`${courseVideos.length + 1}. dərs adı`} />
                  <label>Video faylı</label>
                  <input type="file" accept="video/*" onChange={(event) => setLessonFile(event.target.files[0] || null)} />
                  <button className="primary-button full" onClick={addLesson} disabled={loading}>
                    {loading ? 'Yüklənir...' : `Dərs ${courseVideos.length + 1}-i əlavə et`}
                  </button>
                  <button className="dark-button full" onClick={submitCourse} disabled={courseVideos.length === 0}>Kursu təqdim et</button>

                  <div className="lesson-list">
                    {courseVideos.length === 0 ? <p className="muted">Bu kursda hələ dərs yoxdur.</p> : courseVideos.map((video, index) => (
                      <div key={video.id} className="lesson-row"><span>{index + 1}</span>{video.title}</div>
                    ))}
                  </div>
                </>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default InstructorDashboard
