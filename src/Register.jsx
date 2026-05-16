import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { supabase } from './supabase'

function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')

  const showMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setLoading(true)
    showMessage('')

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          role: 'student',
        },
      },
    })

    if (error) {
      showMessage(error.message)
      setLoading(false)
      return
    }

    if (data.user && data.session) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        user_id: data.user.id,
        full_name: name.trim(),
        role: 'student',
      })

      if (profileError && !['23505', '42501'].includes(profileError.code)) {
        showMessage(profileError.message)
        setLoading(false)
        return
      }
    }

    showMessage('Qeydiyyat tamamlandı. İndi giriş edə bilərsiniz.', 'success')
    setTimeout(() => navigate('/login'), 900)
    setLoading(false)
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={handleRegister}>
          <p className="auth-kicker">Bil-X hesabı</p>
          <h1>Qeydiyyat</h1>
          <p className="auth-subtitle">Bil-X hesabı yaradın və tələbə kimi kurslara başlayın.</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'}>{message}</div>}

          <label>Ad Soyad</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Noni" required />

          <label>E-poçt</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="numune@bilx.az" required />

          <label>Şifrə</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ən azı 6 simvol" required />

          <button className="primary-button full" disabled={loading}>
            {loading ? 'Yaradılır...' : 'Hesab yarat'}
          </button>

          <p className="auth-footer">
            Hesabınız var? <button type="button" onClick={() => navigate('/login')}>Giriş</button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default Register
