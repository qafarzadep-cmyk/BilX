import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import Navbar from './Navbar'
import { appUrl } from './appUrl'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingEmail, setPendingEmail] = useState(() => localStorage.getItem('bilx-pending-verification-email') || '')
  const [resending, setResending] = useState(false)
  const { t } = useLanguage()

  const showMessage = (text) => {
    setMessage(text)
  }

  useEffect(() => {
    const finishVerifiedRegistration = async (session) => {
      const verifiedUser = session?.user
      const normalizedPendingEmail = pendingEmail.trim().toLowerCase()
      if (!verifiedUser || !normalizedPendingEmail) return
      if (verifiedUser.email?.toLowerCase() !== normalizedPendingEmail) return
      if (!verifiedUser.email_confirmed_at && !verifiedUser.confirmed_at) return

      localStorage.removeItem('bilx-pending-verification-email')
      const purchaseReturn = localStorage.getItem('bilx-purchase-return')
      if (purchaseReturn) localStorage.removeItem('bilx-purchase-return')
      navigate(purchaseReturn || '/profile', { replace: true })
    }

    const checkVerifiedUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return
      await finishVerifiedRegistration({ user: data.user })
    }

    void checkVerifiedUser()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        void finishVerifiedRegistration(session)
      }
    })
    const checkOnFocus = () => { void checkVerifiedUser() }
    window.addEventListener('focus', checkOnFocus)
    return () => {
      window.removeEventListener('focus', checkOnFocus)
      listener.subscription.unsubscribe()
    }
  }, [navigate, pendingEmail])

  const handleRegister = async (event) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedSurname = surname.trim()
    const fullName = `${trimmedName} ${trimmedSurname}`.trim()

    setLoading(true)
    showMessage('')

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: appUrl('/profile?confirmed=1'),
        data: {
          name: trimmedName,
          surname: trimmedSurname,
          full_name: fullName,
          role: 'student',
        },
      },
    })

    if (error) {
      showMessage(error.message)
      setLoading(false)
      return
    }

    if (!data.user || data.user.identities?.length === 0) {
      showMessage(t('emailAlreadyRegistered'))
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: data.user.id,
      full_name: fullName,
      role: 'student',
    })

    if (profileError && !['23505', '42501'].includes(profileError.code)) {
      showMessage(profileError.message)
      setLoading(false)
      return
    }

    if (data.session) {
      await supabase.auth.signOut()
      const normalizedEmail = email.trim().toLowerCase()
      localStorage.setItem('bilx-pending-verification-email', normalizedEmail)
      setPendingEmail(normalizedEmail)
      showMessage(t('emailConfirmDisabled'))
      setLoading(false)
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    localStorage.setItem('bilx-pending-verification-email', normalizedEmail)
    setPendingEmail(normalizedEmail)
    setLoading(false)
  }

  const resendVerification = async () => {
    if (!pendingEmail || resending) return
    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: appUrl('/profile?confirmed=1') },
    })
    if (error) showMessage(error.message)
    else toast.success(t('verificationEmailResent'))
    setResending(false)
  }

  if (pendingEmail) {
    return (
      <div className="page auth-page-soft">
        <Navbar />
        <main className="auth-shell">
          <section className="auth-card-clean verification-wait-card" aria-live="polite">
            <span className="verification-mail-icon"><MailCheck size={34} /></span>
            <p className="auth-kicker">BilX</p>
            <h1>{t('checkEmailTitle')}</h1>
            <p className="auth-subtitle">{t('checkEmailPersistentText')}</p>
            <strong className="verification-email-address">{pendingEmail}</strong>
            <div className="verification-steps">
              <span>1</span><p>{t('verificationStepOpen')}</p>
              <span>2</span><p>{t('verificationStepClick')}</p>
              <span>3</span><p>{t('verificationStepReturn')}</p>
            </div>
            {message && <div className="error-box">{message}</div>}
            <button className="outline-button full" type="button" onClick={resendVerification} disabled={resending}>
              {resending ? t('loading') : t('resendVerificationEmail')}
            </button>
            <button className="auth-text-button" type="button" onClick={() => {
              localStorage.removeItem('bilx-pending-verification-email')
              setPendingEmail('')
            }}>
              {t('useDifferentEmail')}
            </button>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={handleRegister}>
          <button type="button" className="auth-brand" onClick={() => navigate('/')}>BilX</button>
          <p className="auth-kicker">{t('accountLabel')}</p>
          <h1>{t('registerTitle')}</h1>
          <p className="auth-subtitle">{t('registerSubtitle')}</p>

          {message && <div className="error-box">{message}</div>}

          <label>{t('fullName')}</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('firstNamePlaceholder')} required />

          <label>{t('surname')}</label>
          <input value={surname} onChange={(event) => setSurname(event.target.value)} placeholder={t('surnamePlaceholder')} required />

          <label>{t('email')}</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('emailPlaceholder')} required />

          <label>{t('password')}</label>
          <div className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordMin')}
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
            {loading ? t('loading') : t('registerAction')}
          </button>

          <p className="auth-footer">
            {t('hasAccount')} <button type="button" onClick={() => navigate('/login')}>{t('login')}</button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default Register
