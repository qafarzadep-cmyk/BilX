import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import CoursePage from './CoursePage'
import EditCourse from './EditCourse'
import InstructorDashboard from './InstructorDashboard'
import Login from './Login'
import Navbar from './Navbar'
import Register from './Register'
import ResetPassword from './ResetPassword'
import StudentProfile from './StudentProfile'
import heroCover from './assets/bilx-hero-cover.png'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import { ensureProfile, fallbackProfile, isAdmin } from './profileApi'
import { supabase } from './supabase'

function Home({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const courseRowRef = useRef(null)
  const [search, setSearch] = useState('')
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const role = profile?.role || 'student'
  const roleLabel = isAdmin(user)
    ? 'Admin kimi daxil oldunuz'
    : role === 'instructor'
      ? 'Müəllim kimi daxil oldunuz'
      : 'Tələbə kimi daxil oldunuz'

  useEffect(() => {
    let mounted = true

    async function loadCourses() {
      const { data } = await supabase
        .from('Courses')
        .select('*')
        .eq('is_published', true)
        .order('id', { ascending: false })

      const coursesWithAuthors = await attachCourseAuthorNames(data || [])
      if (mounted) {
        setCourses(coursesWithAuthors)
        setLoadingCourses(false)
      }
    }

    loadCourses()
    return () => {
      mounted = false
    }
  }, [])

  const filteredCourses = courses.filter((course) =>
    `${course.title || ''} ${course.description || ''}`.toLowerCase().includes(search.toLowerCase())
  )
  const scrollCourses = (direction) => {
    courseRowRef.current?.scrollBy({
      left: direction * 300,
      behavior: 'smooth',
    })
  }

  return (
    <div className="page">
      <Navbar
        user={user}
        profile={profile}
        search={search}
        onSearchChange={setSearch}
        onLogout={handleLogout}
      />

      <section className="home-hero">
        <img className="home-hero-image" src={heroCover} alt="" aria-hidden="true" />
        <div className="home-hero-content">
          {user && (
            <p className="role-pill">
              {roleLabel}
            </p>
          )}
          <h1>Bil-X ilə öyrənməyə başla</h1>
          <p>
            Azərbaycan dilində video kurslar.
          </p>
          {user && role === 'instructor' && (
            <div className="hero-actions">
              <button className="outline-button large" onClick={() => navigate('/instructor')}>Müəllim paneli</button>
            </div>
          )}
        </div>
      </section>

      <main className="content-shell">
        {loadingCourses ? null : filteredCourses.length === 0 ? null : (
          <section className="home-course-section" aria-label="Kurslar">
            <div className="home-course-header">
              <h2>Kurslar</h2>
              <div className="home-course-arrows">
                <button type="button" aria-label="Sola sürüşdür" onClick={() => scrollCourses(-1)}>←</button>
                <button type="button" aria-label="Sağa sürüşdür" onClick={() => scrollCourses(1)}>→</button>
              </div>
            </div>

            <div className="home-course-carousel">
              <button className="home-course-side-arrow left" type="button" aria-label="Sola sürüşdür" onClick={() => scrollCourses(-1)}>←</button>
              <div className="home-course-row" ref={courseRowRef}>
                {filteredCourses.map((course) => {
                  const instructorName = getCourseAuthorName(course)
                  const hasThumbnail = Boolean(course.thumbnail_url)
                  const duration = course.total_hours || course.duration
                  const level = course.level

                  return (
                    <article
                      key={course.id}
                      className="home-course-card"
                      onClick={() => navigate(`/course/${course.id}`, { state: { course } })}
                    >
                      {hasThumbnail ? (
                        <img className="home-course-thumb" src={course.thumbnail_url} alt={course.title} />
                      ) : (
                        <div className="home-course-thumb home-course-thumb-empty" aria-hidden="true">📚</div>
                      )}
                      <div className="home-course-card-body">
                        <h3>{course.title}</h3>
                        {instructorName && <small className="home-course-instructor">{instructorName}</small>}
                        {/* {duration && level && <small className="home-course-meta">{duration} · {level}</small>} */}
                        <strong className="home-course-price">{Number(course.price) > 0 ? `${course.price} AZN` : 'Free'}</strong>
                      </div>
                    </article>
                  )
                })}
              </div>
              <button className="home-course-side-arrow right" type="button" aria-label="Sağa sürüşdür" onClick={() => scrollCourses(1)}>→</button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user || null
      if (!mounted) return
      setUser(currentUser)
    }

    loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (loggingOut) return
      const currentUser = session?.user || null
      setUser(currentUser)
      if (!currentUser) setProfile(null)
    })

    const refreshProfile = () => {
      const currentUser = supabase.auth.getUser().then(({ data }) => {
        if (!mounted || loggingOut || !data.user) return
        setUser(data.user)
        ensureProfile(data.user).then((nextProfile) => {
          if (mounted) setProfile(nextProfile || fallbackProfile(data.user))
        })
      })
      return currentUser
    }

    window.addEventListener('focus', refreshProfile)

    return () => {
      mounted = false
      window.removeEventListener('focus', refreshProfile)
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (!user || loggingOut) {
        setProfile(null)
        return
      }

      try {
        const nextProfile = await ensureProfile(user)
        if (mounted) setProfile(nextProfile || fallbackProfile(user))
      } catch (error) {
        console.error('Could not load profile:', error)
        if (mounted) setProfile(fallbackProfile(user))
      }
    }

    loadProfile()
    const profileRefreshTimer = setInterval(loadProfile, 10000)

    return () => {
      mounted = false
      clearInterval(profileRefreshTimer)
    }
  }, [user, loggingOut])

  const handleLogout = async () => {
    setLoggingOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Could not sign out from Supabase:', error)
    }
    setUser(null)
    setProfile(null)
    navigate('/', { replace: true })
    setTimeout(() => setLoggingOut(false), 300)
  }

  return (
    <Routes>
      <Route path="/" element={<Home user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin" element={<AdminDashboard user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/profile" element={<StudentProfile user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/course" element={<CoursePage user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/course/:id" element={<CoursePage user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/instructor" element={<InstructorDashboard user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/edit-course" element={<EditCourse user={user} profile={profile} handleLogout={handleLogout} />} />
    </Routes>
  )
}

export default App
