import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Login from './Login'
import Register from './Register'
import AdminDashboard from './AdminDashboard'
import StudentProfile from './StudentProfile'
import CoursePage from './CoursePage'
import InstructorDashboard from './InstructorDashboard'
import { supabase } from './supabase'

function Home({ user, handleLogout }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [courses, setCourses] = useState([])

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('Courses')
      .select('*')
      .eq('is_published', true)
    if (!error && data) setCourses(data)
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", margin: 0, padding: 0, background: '#fff', color: '#1c1d1f' }}>

      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', height: '56px', borderBottom: '1px solid #d1d7dc', position: 'sticky', top: 0, zIndex: 100, gap: '16px' }}>
        <h1 style={{ color: '#1435c3', margin: 0, fontSize: '22px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => navigate('/')}>Bil-X</h1>
        <div style={{ flex: 1, maxWidth: '600px', display: 'flex', alignItems: 'center', background: '#f7f9fa', border: '1px solid #d1d7dc', borderRadius: '100px', padding: '8px 16px', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔍</span>
          <input type="text" placeholder="Kurs axtar..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', width: '100%', color: '#1c1d1f' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {user ? (
            <>
              <span onClick={() => navigate('/profile')} style={{ color: '#1c1d1f', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>Salam, {user.user_metadata?.full_name?.split(' ')[0]}!</span>
              <button onClick={handleLogout} style={{ background: 'transparent', color: '#1c1d1f', border: '1px solid #1c1d1f', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Çıxış</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')} style={{ background: 'transparent', color: '#1c1d1f', border: '1px solid #1c1d1f', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Giriş</button>
              <button onClick={() => navigate('/register')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Qeydiyyat</button>
            </>
          )}
          {user?.email === 'qafarzadep@gmail.com' && (
            <button onClick={() => navigate('/admin')} style={{ background: '#ff6b00', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Admin</button>
          )}
        </div>
      </nav>

      {/* HERO */}
      <div style={{ background: '#f0f4ff', padding: '48px 60px', borderBottom: '1px solid #d1d7dc' }}>
        <div style={{ maxWidth: '500px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '700', margin: '0 0 16px', lineHeight: '1.2', color: '#1c1d1f' }}>Öyrənməyə bu gün başla</h2>
          <p style={{ fontSize: '16px', margin: '0 0 24px', color: '#4a4a4a', lineHeight: '1.6' }}>Azərbaycan dilində peşəkar müəllimlərdən keyfiyyətli video dərslər.</p>
          <button onClick={() => navigate('/course')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '4px', fontSize: '15px', cursor: 'pointer', fontWeight: '700' }}>Kurslara bax</button>
        </div>
      </div>

      {/* CATEGORIES */}
      <div style={{ padding: '16px 60px', borderBottom: '1px solid #d1d7dc', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {['Hamısı', 'İngilis dili', 'Riyaziyyat', 'IELTS', 'Proqramlaşdırma', 'Biznes'].map((cat, i) => (
          <button key={i} style={{ background: i === 0 ? '#1435c3' : 'white', color: i === 0 ? 'white' : '#1c1d1f', border: '1px solid #d1d7dc', padding: '6px 16px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>{cat}</button>
        ))}
      </div>

      {/* COURSES */}
      <div style={{ padding: '32px 60px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1c1d1f', margin: '0 0 20px' }}>
          {courses.length > 0 ? 'Kurslar' : 'Tezliklə...'}
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {courses.length > 0 ? courses.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).map((course, i) => (
            <div key={i} onClick={() => navigate('/course', { state: { course } })}
              style={{ width: '240px', cursor: 'pointer', border: '1px solid #d1d7dc', borderRadius: '4px', overflow: 'hidden' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div style={{ background: '#e0e8ff', height: '135px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>📚</div>
              <div style={{ padding: '12px' }}>
                <h4 style={{ margin: '0 0 4px', color: '#1c1d1f', fontSize: '14px', fontWeight: '700' }}>{course.title}</h4>
                <p style={{ margin: '0 0 8px', color: '#6a6f73', fontSize: '12px' }}>{course.description?.substring(0, 60)}...</p>
                <p style={{ margin: 0, color: '#1c1d1f', fontWeight: '700', fontSize: '16px' }}>{course.price} AZN</p>
              </div>
            </div>
          )) : (
            <p style={{ color: '#6a6f73', fontSize: '14px' }}>Hələ kurs yoxdur. Tezliklə əlavə olunacaq!</p>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid #d1d7dc', padding: '24px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px' }}>
        <span style={{ color: '#1435c3', fontWeight: '700', fontSize: '18px' }}>Bil-X</span>
        <span style={{ fontSize: '12px', color: '#6a6f73' }}>© 2025 Bil-X — Azərbaycan dilində onlayn təhsil</span>
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/')
  }

  return (
    <Routes>
      <Route path="/" element={<Home user={user} handleLogout={handleLogout} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/profile" element={<StudentProfile user={user} />} />
      <Route path="/course" element={<CoursePage user={user} />} />
      <Route path="/instructor" element={<InstructorDashboard user={user} />} />
    </Routes>
  )
}

export default App