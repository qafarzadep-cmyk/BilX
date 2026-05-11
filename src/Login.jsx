import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Xoş gəldiniz!')
      setTimeout(() => navigate('/'), 1000)
    }
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", minHeight: '100vh', background: '#fff' }}>
      
      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', height: '56px', borderBottom: '1px solid #d1d7dc' }}>
        <h1 onClick={() => navigate('/')} style={{ color: '#1435c3', margin: 0, fontSize: '22px', fontWeight: '700', cursor: 'pointer' }}>Bil-X</h1>
      </nav>

      {/* FORM */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #d1d7dc', borderRadius: '4px', padding: '40px' }}>
          <h2 style={{ color: '#1c1d1f', textAlign: 'center', marginBottom: '24px', fontSize: '24px', fontWeight: '700' }}>Giriş</h2>
          {error && <p style={{ color: '#dc3545', textAlign: 'center', marginBottom: '15px', background: '#ffe6e6', padding: '10px', borderRadius: '4px', fontSize: '14px' }}>{error}</p>}
          {success && <p style={{ color: '#28a745', textAlign: 'center', marginBottom: '15px', background: '#e6ffe6', padding: '10px', borderRadius: '4px', fontSize: '14px' }}>{success}</p>}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ width: '100%', padding: '12px', marginBottom: '12px', border: '1px solid #d1d7dc', borderRadius: '4px', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
          <input type="password" placeholder="Şifrə" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ width: '100%', padding: '12px', marginBottom: '16px', border: '1px solid #d1d7dc', borderRadius: '4px', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
          <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '12px', background: '#1435c3', color: 'white', border: 'none', borderRadius: '4px', fontSize: '15px', cursor: 'pointer', fontWeight: '700' }}>
            {loading ? 'Yüklənir...' : 'Giriş et'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#6a6f73' }}>
            Hesabın yoxdur? <span onClick={() => navigate('/register')} style={{ color: '#1435c3', cursor: 'pointer', fontWeight: '700' }}>Qeydiyyat</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login