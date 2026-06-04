import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Navbar from './Navbar'
import { appUrl } from './appUrl'
import { useLanguage } from './i18n'
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
  const { t } = useLanguage()

  const showMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const getResetErrorMessage = (error) => {
    if (error?.status === 504 || error?.message === '{}') {
      return t('resetEmailUnavailable')
    }

    if (error?.message === 'fetch failed' || error?.name === 'AuthRetryableFetchError') {
      return t('resetServiceUnavailable')
    }

    return error?.message || t('resetLinkFailed')
  }

  const getLoginErrorMessage = (error) => {
    const message = `${error?.message || ''}`.toLowerCase()
    if (message.includes('email not confirmed') || message.includes('email not verified')) {
      return t('emailNotConfirmed')
    }
    return t('invalidCredentials')
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    showMessage('')

    // Open a grace window so the session enforcer doesn't kick THIS device while
    // the new token is still being written (DB/localStorage briefly out of sync).
    localStorage.setItem('bilx-session-at', String(Date.now()))

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        showMessage(getLoginErrorMessage(error))
        return
      }

      // Single active session: write a fresh token (overwriting any previous
      // device's), and remember it locally so this device stays valid.
      try {
        const token = crypto.randomUUID()
        await supabase.from('user_sessions').upsert({
          user_id: data.user.id,
          session_token: token,
          last_active: new Date().toISOString(),
          device_info: (navigator.userAgent || '').slice(0, 250),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        localStorage.setItem('bilx-session-token', token)
        localStorage.setItem('bilx-session-at', String(Date.now()))
      } catch (sessionError) {
        console.warn('Could not register session:', sessionError)
      }

      showMessage(t('loginSuccessRedirect'), 'success')
      setTimeout(() => navigate(isAdmin(data.user) ? '/admin' : '/profile', { replace: true }), 450)
    } catch (error) {
      showMessage(`${t('loginFailed')}: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const sendReset = async () => {
    if (!email.trim()) {
      showMessage(t('resetEmailMissing'))
      return
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: appUrl('/reset-password'),
      })

      showMessage(
        error ? getResetErrorMessage(error) : t('resetEmailSent'),
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
          <button type="button" className="auth-brand" onClick={() => navigate('/')}>Bil-X</button>
          <p className="auth-kicker">{t('accountLabel')}</p>
          <h1>{t('loginTitle')}</h1>
          <p className="auth-subtitle">{t('loginSubtitle')}</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'} style={{ pointerEvents: 'auto' }}>{message}</div>}

          <label>{t('email')}</label>
          <input
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label>{t('password')}</label>
          <div className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="password-eye-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button className="primary-button full" disabled={loading}>
            {loading ? t('loading') : t('loginAction')}
          </button>

          <p className="auth-footer">
            {t('noAccount')} <button type="button" onClick={() => navigate('/register')}>{t('register')}</button>
          </p>

          <button type="button" className="text-button" onClick={sendReset}>
            {t('forgotPassword')}
          </button>
        </form>
      </main>
    </div>
  )
}

export default Login
