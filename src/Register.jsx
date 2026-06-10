import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
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
  const { t } = useLanguage()

  const showMessage = (text) => {
    setMessage(text)
  }

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
        emailRedirectTo: appUrl('/login'),
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
      toast.error(t('emailConfirmDisabled'))
      setLoading(false)
      return
    }

    toast.success(t('verifyEmailSent'))
    setLoading(false)
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
