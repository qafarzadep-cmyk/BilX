import { useState } from 'react'
import { supabase } from './supabase'

function Register({ setPage }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })
    if (error) {
      setError(error.message)
    } else {
      alert('Qeydiyyat uğurlu oldu! Emailinizi yoxlayın.')
      setPage('login')
    }
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Arial', minHeight: '100vh', background: '#f0f4ff' }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 onClick={() => setPage('home')} style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }}>BilX</h1>
        <div>
          <button onClick={() => setPage('login')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Giriş</button>
          <button onClick={() => setPage('register')} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer' }}>Qeydiyyat</button>
        </div>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '350px' }}>
          <h2 style={{ color: '#1435c3', textAlign: 'center', marginBottom: '30px' }}>Qeydiyyat</h2>
          {error && <p style={{ color: 'red', textAlign: 'center', marginBottom: '15px' }}>{error}</p>}
          <input type="text" placeholder="Ad Soyad" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Şifrə" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <button onClick={handleRegister} disabled={loading} style={{ width: '100%', padding: '12px', background: '#1435c3', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Yüklənir...' : 'Qeydiyyatdan keç'}
          </button>
          <p style={{ textAlign: 'center', marginTop: '20px', color: '#555' }}>Hesabın var? <span onClick={() => setPage('login')} style={{ color: '#1435c3', cursor: 'pointer' }}>Giriş et</span></p>
        </div>
      </div>
    </div>
  )
}

export default Register