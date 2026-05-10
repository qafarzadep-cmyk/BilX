import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Login from './Login'
import Register from './Register'
import AdminDashboard from './AdminDashboard'
import StudentProfile from './StudentProfile'
import { supabase } from './supabase'

function Home({ user, handleLogout }) {
  const navigate = useNavigate()
  return (
    <div style={{ fontFamily: 'Arial', margin: 0, padding: 0 }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }} onClick={() => navigate('/')}>BilX</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {user ? (
            <>
              <span onClick={() => navigate('/profile')} style={{ color: 'white', marginRight: '15px', cursor: 'pointer', textDecoration: 'underline' }}>Salam, {user.user_metadata?.full_name || user.email}!</span>
              <button onClick={handleLogout} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Çıxış</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Giriş</button>
              <button onClick={() => navigate('/register')} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer' }}>Qeydiyyat</button>
            </>
          )}
          {user?.email === 'qafarzadep@gmail.com' && (
            <button onClick={() => navigate('/admin')} style={{ background: 'orange', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Admin</button>
          )}
        </div>
      </nav>

      <div style={{ background: '#f0f4ff', padding: '60px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '40px', color: '#1435c3' }}>Azərbaycan dilində keyfiyyətli təhsil</h2>
        <p style={{ fontSize: '18px', color: '#555', marginTop: '10px' }}>İstənilən vaxt, istənilən yerdən öyrən</p>
        <button style={{ background: '#1435c3', color: 'white', border: 'none', padding: '15px 40px', borderRadius: '8px', fontSize: '18px', marginTop: '20px', cursor: 'pointer' }}>Kurslara bax</button>
      </div>

      <div style={{ padding: '40px', background: 'white' }}>
        <h3 style={{ fontSize: '28px', color: '#333' }}>Kurslar</h3>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '20px' }}>
          {[
            { title: 'IELTS Hazırlıq', price: '60 AZN', instructor: 'Müəllim Aytən' },
            { title: 'Riyaziyyat 9-cu sinif', price: '40 AZN', instructor: 'Müəllim Əli' },
            { title: 'İngilis dili A1-B2', price: '50 AZN', instructor: 'Müəllim Leyla' },
          ].map((course, i) => (
            <div key={i} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '20px', width: '250px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <div style={{ background: '#1435c3', height: '120px', borderRadius: '8px', marginBottom: '15px' }}></div>
              <h4 style={{ margin: '0 0 8px', color: '#333' }}>{course.title}</h4>
              <p style={{ margin: '0 0 8px', color: '#777', fontSize: '14px' }}>{course.instructor}</p>
              <p style={{ margin: '0 0 15px', color: '#1435c3', fontWeight: 'bold', fontSize: '18px' }}>{course.price}</p>
              <button onClick={() => navigate('/course')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', width: '100%' }}>Kursa bax</button>
            </div>
          ))}
        </div>
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
      <Route path="/login" element={<Login user={user} />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/profile" element={<StudentProfile user={user} />} />
    </Routes>
  )
}

export default App