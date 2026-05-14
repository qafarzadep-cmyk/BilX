import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { supabase } from './supabase'

function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')

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
        showMessage('Şifrə yeniləmə linki etibarsızdır və ya vaxtı bitib. Yenidən link göndərin.')
      }
    }

    checkRecoverySession()
    return () => {
      mounted = false
    }
  }, [])

  const updatePassword = async (event) => {
    event.preventDefault()

    if (password.length < 6) {
      showMessage('Yeni şifrə ən azı 6 simvol olmalıdır.')
      return
    }

    if (password !== confirmPassword) {
      showMessage('Şifrələr eyni deyil.')
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

    showMessage('Şifrəniz yeniləndi. İndi yeni şifrə ilə daxil ola bilərsiniz.', 'success')
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 1000)
  }

  return (
    <div className="page auth-page-soft">
      <Navbar />
      <main className="auth-shell">
        <form className="auth-card-clean" onSubmit={updatePassword}>
          <p className="auth-kicker">Bil-X hesabı</p>
          <h1>Yeni şifrə yarat</h1>
          <p className="auth-subtitle">E-poçtdakı linklə gəldikdən sonra hesabınız üçün yeni şifrə yazın.</p>

          {message && <div className={messageType === 'success' ? 'success-box' : 'error-box'}>{message}</div>}

          <label>Yeni şifrə</label>
          <input
            type="password"
            placeholder="Ən azı 6 simvol"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!ready || loading}
            required
          />

          <label>Yeni şifrəni təkrar yazın</label>
          <input
            type="password"
            placeholder="Şifrəni təkrar yazın"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={!ready || loading}
            required
          />

          <button className="primary-button full" disabled={!ready || loading}>
            {loading ? 'Yenilənir...' : 'Şifrəni yenilə'}
          </button>

          <p className="auth-footer">
            Link işləmirsə <button type="button" onClick={() => navigate('/login')}>yenisini göndərin</button>
          </p>
        </form>
      </main>
    </div>
  )
}

export default ResetPassword
