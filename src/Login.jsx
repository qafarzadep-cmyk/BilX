import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Navbar from './Navbar'
import { appUrl } from './appUrl'
import { isAdmin } from './profileApi'
import { sendPasswordResetEmail } from './sendPasswordResetEmail'
import { supabase } from './supabase'

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')

  const showMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    showMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        showMessage('E-poçt və ya şifrə yanlışdır.')
        return
      }

      showMessage('Giriş uğurludur. Yönləndirilirsiniz...', 'success')
      setTimeout(() => navigate(isAdmin(data.user) ? '/admin' : '/profile', { replace: true }), 450)
    } catch (error) {
      showMessage(`Giriş alınmadı: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const sendReset = async () => {
    if (!email.trim()) {
      showMessage('Şifrə sıfırlamaq üçün e-poçt yazın.')
      return
    }

    const resetEmail = email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: appUrl('/reset-password'),
    })

    if (!error) {
      await sendPasswordResetEmail(resetEmail)
    }

    showMessage(
      error ? error.message : 'Şifrə sıfırlama linki e-poçtunuza göndərildi.',
      error ? 'error' : 'success'
    )
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={handleLogin}>
          <p className="auth-kicker">Bil-X hesabı</p>
          <h1>Giriş</h1>
          <p className="auth-subtitle">Kurslarınıza və panelinizə davam etmək üçün daxil olun.</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'}>{message}</div>}

          <label>E-poçt</label>
          <input
            type="email"
            placeholder="learnbyspeaking1@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label>Şifrə</label>
          <div className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Şifrənizi yazın"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="password-eye-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Şifrəni gizlət' : 'Şifrəni göstər'}
              title={showPassword ? 'Şifrəni gizlət' : 'Şifrəni göstər'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button className="primary-button full" disabled={loading}>
            {loading ? 'Yüklənir...' : 'Giriş et'}
          </button>

          <button type="button" className="text-button" style={{ position: 'relative', zIndex: 1, pointerEvents: 'auto', cursor: 'pointer' }} onClick={sendReset}>
            Şifrəni unutmusunuz?
          </button>

          <p className="auth-footer">
            Hesabınız yoxdur? <button type="button" onClick={() => navigate('/register')}>Qeydiyyat</button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default Login
