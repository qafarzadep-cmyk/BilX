import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Login from './Login'
import Register from './Register'
import AdminDashboard from './AdminDashboard'
import StudentProfile from './StudentProfile'
import CoursePage from './CoursePage'
import { supabase } from './supabase'

function Home({ user, handleLogout }) {
  const navigate = useNavigate()
  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", margin: 0, padding: 0, background: '#fff', color: '#1c1d1f' }}>
      
      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px', borderBottom: '1px solid #d1d7dc', position: 'sticky', top: 0, zIndex: 100 }}>
        <h1 style={{ color: '#1435c3', margin: 0, fontSize: '24px', fontWeight: '700', cursor: 'pointer' }} onClick={() => navigate('/')}>Bil-X</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {user ? (
            <>
              <span onClick={() => navigate('/profile')} style={{ color: '#1c1d1f', cursor: 'pointer', fontSize: '14px' }}>Salam, {user.user_metadata?.full_name || user.email}!</span>
              <button onClick={handleLogout} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Çıxış</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')} style={{ background: 'white', color: '#1c1d1f', border: '1px solid #1c1d1f', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Giriş</button>
              <button onClick={() => navigate('/register')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Qeydiyyat</button>
            </>
          )}
          {user?.email === 'qafarzadep@gmail.com' && (
            <button onClick={() => navigate('/admin')} style={{ background: '#ff6b00', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Admin</button>
          )}
        </div>
      </nav>

      {/* HERO */}
      <div style={{ padding: '60px 24px', borderBottom: '1px solid #d1d7dc', maxWidth: '750px' }}>
        <h2 style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 16px', lineHeight: '1.2', color: '#1c1d1f' }}>Azərbaycan dilində keyfiyyətli təhsil</h2>
        <p style={{ fontSize: '18px', margin: '0 0 24px', color: '#4a4a4a', lineHeight: '1.6' }}>Peşəkar müəllimlərdən video dərslər. İstənilən vaxt, istənilən yerdən öyrən.</p>
        <button onClick={() => navigate('/course')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '14px 24px', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>Kurslara bax</button>
      </div>

      {/* COURSES */}
      <div style={{ padding: '40px 24px' }}>
        <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1d1f', margin: '0 0 24px' }}>Ən populyar kurslar</h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { title: 'IELTS Hazırlıq', price: '60 AZN', instructor: 'Müəllim Aytən', lessons: '40 dərs', level: 'Bütün səviyyələr' },
            { title: 'Riyaziyyat 9-cu sinif', price: '40 AZN', instructor: 'Müəllim Əli', lessons: '35 dərs', level: 'Orta' },
            { title: 'İngilis dili A1-B2', price: '50 AZN', instructor: 'Müəllim Leyla', lessons: '50 dərs', level: 'Başlanğıc' },
          ].map((course, i) => (
            <div key={i} onClick={() => navigate('/course')} style={{ width: '260px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <div style={{ background: '#f7f9fa', height: '140px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>📚</div>
              <h4 style={{ margin: '0 0 4px', color: '#1c1d1f', fontSize: '15px', fontWeight: '700', lineHeight: '1.3' }}>{course.title}</h4>
              <p style={{ margin: '0 0 2px', color: '#6a6f73', fontSize: '12px' }}>{course.instructor}</p>
              <p style={{ margin: '0 0 6px', color: '#6a6f73', fontSize: '12px' }}>{course.lessons} • {course.level}</p>
              <p style={{ margin: 0, color: '#1c1d1f', fontWeight: '700', fontSize: '16px' }}>{course.price}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid #d1d7dc', padding: '24px', textAlign: 'center', color: '#6a6f73', fontSize: '13px', marginTop: '40px' }}>
        © 2025 <strong style={{ color: '#1435c3' }}>Bil-X</strong> — Azərbaycan dilində onlayn təhsil platforması
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
    </Routes>
  )
}

export default App