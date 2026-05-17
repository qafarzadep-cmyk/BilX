import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Navbar from './Navbar'
import { appUrl } from './appUrl'
import sendWelcomeEmail from './sendWelcomeEmail'
import { supabase } from './supabase'

function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

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
      showMessage('Bu e-poçt artıq qeydiyyatdan keçib.')
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

    try {
      await sendWelcomeEmail({
        name: trimmedName,
        email: email.trim(),
      })
    } catch (emailError) {
      console.error('Welcome email could not be sent:', emailError)
    }

    toast.success('E-poçt ünvanınıza təsdiq məktubu göndərdik. Zəhmət olmasa e-poçtunuzu yoxlayın!')
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

          {message && <div className="error-box">{message}</div>}

          <label>Ad</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Emily" required />

          <label>Soyad</label>
          <input value={surname} onChange={(event) => setSurname(event.target.value)} placeholder="Smith" required />

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
