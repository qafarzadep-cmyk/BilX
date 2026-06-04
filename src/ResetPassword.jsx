import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const { t } = useLanguage()

  const showMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  useEffect(() => {
    let mounted = true

    async function checkRecoverySession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (session) {
        setReady(true)
      } else {
        showMessage(t('resetLinkInvalid'))
      }
    }

    checkRecoverySession()
    return () => {
      mounted = false
    }
  }, [t])

  const updatePassword = async (event) => {
    event.preventDefault()

    if (password.length < 6) {
      showMessage(t('passwordMinError'))
      return
    }

    if (password !== confirmPassword) {
      showMessage(t('passwordsMismatch'))
      return
    }

    setLoading(true)
    showMessage('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      showMessage(error.message)
      setLoading(false)
      return
    }

    showMessage(t('passwordUpdated'), 'success')
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 1000)
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={updatePassword}>
          <button type="button" className="auth-brand" onClick={() => navigate('/')}>Bil-X</button>
          <p className="auth-kicker">{t('accountLabel')}</p>
          <h1>{t('resetTitle')}</h1>
          <p className="auth-subtitle">{t('resetSubtitle')}</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'}>{message}</div>}

          <label>{t('newPassword')}</label>
          <div className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('passwordMin')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!ready || loading}
              required
            />
            <button
              type="button"
              className="password-eye-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
              disabled={!ready || loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label>{t('confirmPassword')}</label>
          <div className="password-input-wrap">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder={t('confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={!ready || loading}
              required
            />
            <button
              type="button"
              className="password-eye-button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
              title={showConfirmPassword ? t('hidePassword') : t('showPassword')}
              disabled={!ready || loading}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button className="primary-button full" disabled={!ready || loading}>
            {loading ? t('loading') : t('resetPassword')}
          </button>

          <p className="auth-footer">
            {t('resetLinkHelp')} <button type="button" onClick={() => navigate('/login')}>{t('login')}</button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default ResetPassword
