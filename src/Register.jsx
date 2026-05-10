import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Qeydiyyat uğurlu oldu! Emailinizi yoxlayın.')
      setTimeout(() => navigate('/login'), 2000)
    }
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Arial', minHeight: '100vh', background: '#f0f4ff' }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 onClick={() => navigate('/')} style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }}>BilX</h1>
        <div>
          <button onClick={() => navigate('/login')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Giriş</button>
          <button onClick={() => navigate('/register')} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer' }}>Qeydiyyat</button>
        </div>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '350px' }}>
          <h2 style={{ color: '#1435c3', textAlign: 'center', marginBottom: '30px' }}>Qeydiyyat</h2>
          {error && <p style={{ color: 'red', textAlign: 'center', marginBottom: '15px', background: '#ffe6e6', padding: '10px', borderRadius: '5px' }}>{error}</p>}
          {success && <p style={{ color: 'green', textAlign: 'center', marginBottom: '15px', background: '#e6ffe6', padding: '10px', borderRadius: '5px' }}>{success}</p>}
          <input type="text" placeholder="Ad Soyad" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Şifrə" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} style={{ width: '100%', padding: '12px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '16px', boxSizing: 'border-box' }} />
          <button onClick={handleRegister} disabled={loading} style={{ width: '100%', padding: '12px', background: '#1435c3', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Yüklənir...' : 'Qeydiyyatdan keç'}
          </button>
          <p style={{ textAlign: 'center', marginTop: '20px', color: '#555' }}>Hesabın var? <span onClick={() => navigate('/login')} style={{ color: '#1435c3', cursor: 'pointer' }}>Giriş et</span></p>
        </div>
      </div>
    </div>
  )
}

export default Register