import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Navbar from './Navbar'
import { appUrl } from './appUrl'
import { isAdmin } from './profileApi'
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

  const getResetErrorMessage = (error) => {
    if (error?.status === 504 || error?.message === '{}') {
      return 'Şifrə sıfırlama e-poçtu hazırda göndərilmir. Zəhmət olmasa adminlə əlaqə saxlayın və ya bir az sonra yenidən yoxlayın.'
    }

    if (error?.message === 'fetch failed' || error?.name === 'AuthRetryableFetchError') {
      return 'Şifrə sıfırlama xidməti ilə əlaqə alınmadı. Zəhmət olmasa bir az sonra yenidən yoxlayın.'
    }

    return error?.message || 'Şifrə sıfırlama linki göndərilmədi.'
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

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: appUrl('/reset-password'),
      })

      showMessage(
        error ? getResetErrorMessage(error) : 'Şifrə sıfırlama linki e-poçtunuza göndərildi.',
        error ? 'error' : 'success'
      )
    } catch (error) {
      showMessage(getResetErrorMessage(error))
    }
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={handleLogin}>
          <p className="auth-kicker">Bil-X hesabı</p>
          <h1>Giriş</h1>
          <p className="auth-subtitle">Kurslarınıza və panelinizə davam etmək üçün daxil olun.</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'} style={{ pointerEvents: 'auto' }}>{message}</div>}

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

          <p className="auth-footer">
            Hesabınız yoxdur? <button type="button" onClick={() => navigate('/register')}>Qeydiyyat</button>
          </p>

          <button type="button" className="text-button" onClick={sendReset}>
            Şifrəni unutmusunuz?
          </button>
        </form>
      </main>
    </div>
  )
}

export default Login
