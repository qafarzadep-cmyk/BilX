import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
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
      setMessage(`Xəta: ${error.message}`)
      return
    }
    setCourse({ ...course, ...form })
    setMessage('Dəyişikliklər yadda saxlandı.')
  }

  if (!course) return null
  const instructorName = getCourseAuthorName(course) || profile?.full_name || user?.user_metadata?.full_name || user?.email || ''

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell edit-course-shell">
        {message && <div className="notice-box">{message}</div>}
        <section className="panel-card form-panel">
          <h1>Kursu redaktə et</h1>
          {instructorName && <p className="muted">Müəllim: {instructorName}</p>}
          <label>Kurs adı</label>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <label>Təsvir</label>
          <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <label>Qiymət (AZN)</label>
          <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          <button className="primary-button full" onClick={save}>Dəyişiklikləri yadda saxla</button>
        </section>

        <section className="panel-card">
          <h2>Dərslər</h2>
          {videos.length === 0 ? <p className="muted">Bu kursda hələ dərs yoxdur.</p> : videos.map((video, index) => (
            <div key={video.id} className="lesson-row"><span>{index + 1}</span>{video.title}</div>
          ))}
        </section>
      </main>
    </div>
  )
}

export default EditCourse
