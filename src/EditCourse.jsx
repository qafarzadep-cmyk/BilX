import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

function EditCourse({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { id } = useParams()
  const initialCourse = state?.course
  const courseId = initialCourse?.id || id
  const [course, setCourse] = useState(initialCourse)
  const [videos, setVideos] = useState([])
  const [form, setForm] = useState({
    title: initialCourse?.title || '',
    description: initialCourse?.description || '',
    price: initialCourse?.price || '',
  })
  const [message, setMessage] = useState('')
  const { t } = useLanguage()

  useEffect(() => {
    if (!courseId) {
      navigate('/instructor')
      return
    }

    async function load() {
      const [{ data: courseData }, { data: videoData }] = await Promise.all([
        supabase.from('Courses').select('*').eq('id', courseId).single(),
        supabase.from('videos').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
      ])
      if (courseData) {
        setCourse(courseData)
        setForm({ title: courseData.title, description: courseData.description, price: courseData.price })
      }
      setVideos(videoData || [])
    }

    load()
  }, [courseId, navigate])

  const save = async () => {
    const { error } = await supabase
      .from('Courses')
      .update({ ...form, price: Number(form.price) })
      .eq('id', course.id)

    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      return
    }
    setCourse({ ...course, ...form })
    setMessage(t('changesSaved'))
  }

  // Per workflow.md 3.3: only the admin may edit a course. Teachers request
  // changes via Inbox instead.
  if (!isAdmin(user)) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">{t('adminNoAccess')}</div>
      </div>
    )
  }

  if (!course) return null
  const instructorName = getCourseAuthorName(course) || profile?.full_name || user?.user_metadata?.full_name || user?.email || ''

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell edit-course-shell">
        {message && <div className="notice-box">{message}</div>}
        <section className="panel-card form-panel">
          <h1>{t('editCourseTitle')}</h1>
          {instructorName && <p className="muted">{t('instructorLabel')}: {instructorName}</p>}
          <label>{t('courseTitle')}</label>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <label>{t('courseDescription')}</label>
          <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <label>{t('priceAzN')}</label>
          <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          <button className="primary-button full" onClick={save}>{t('saveChanges')}</button>
        </section>

        <section className="panel-card">
          <h2>{t('lessonsTitle')}</h2>
          {videos.length === 0 ? <p className="muted">{t('noLessons')}</p> : videos.map((video, index) => (
            <div key={video.id} className="lesson-row"><span>{index + 1}</span>{video.title}</div>
          ))}
        </section>
      </main>
    </div>
  )
}

export default EditCourse
