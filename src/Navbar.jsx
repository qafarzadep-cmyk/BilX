import { BookOpen, LogOut, Search, Shield, User, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

function Navbar({ user, profile, search = '', onSearchChange, onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [applicationOpen, setApplicationOpen] = useState(false)
  const [applicationForm, setApplicationForm] = useState({ name: '', surname: '', phone: '' })
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applicationMessageType, setApplicationMessageType] = useState('error')
  const [applicationLoading, setApplicationLoading] = useState(false)
  const menuRef = useRef(null)
  const role = profile?.role || 'student'
  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Bil-X'
  const firstLetter = name.charAt(0).toUpperCase()
  const isInstructor = role === 'instructor'
  const isTeacherMode = location.pathname.startsWith('/instructor') || location.pathname.startsWith('/edit-course')

  const roleLabel = isAdmin(user)
    ? 'Admin kimi daxil oldunuz'
    : isTeacherMode
      ? 'Müəllim kimi daxil oldunuz'
      : 'Tələbə kimi daxil oldunuz'

  useEffect(() => {
    function closeOnOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [])

  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  const openApplicationForm = () => {
    const [firstName = '', ...rest] = (profile?.full_name || user?.user_metadata?.full_name || '').trim().split(/\s+/)
    setApplicationForm({ name: firstName, surname: rest.join(' '), phone: '' })
    setApplicationMessage('')
    setApplicationMessageType('error')
    setApplicationOpen(true)
  }

  const submitTeacherApplication = async (event) => {
    event.preventDefault()
    if (!user) return

    if (!applicationForm.name.trim() || !applicationForm.surname.trim() || !applicationForm.phone.trim()) {
      setApplicationMessage('Bütün sahələri doldurun.')
      setApplicationMessageType('error')
      return
    }

    setApplicationLoading(true)
    setApplicationMessage('')

    const { error } = await supabase.from('teacher_applications').insert({
      user_id: user.id,
      email: user.email.toLowerCase(),
      name: applicationForm.name.trim(),
      surname: applicationForm.surname.trim(),
      phone: applicationForm.phone.trim(),
    })

    if (error) {
      const alreadySubmitted = error.message?.toLowerCase().includes('duplicate') || error.code === '23505'
      if (alreadySubmitted) {
        setApplicationMessage('Müraciətiniz artıq göndərilib və təsdiq gözləyir.')
        setApplicationMessageType('success')
      } else {
        setApplicationMessage(`Xəta: ${error.message}`)
        setApplicationMessageType('error')
      }
    } else {
      setApplicationMessage('Müraciətiniz uğurla göndərildi. Admin təsdiqindən sonra müəllim paneli açılacaq.')
      setApplicationMessageType('success')
    }

    setApplicationLoading(false)
  }

  const handleLogoutClick = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    await onLogout?.()
  }

  const handleTeachClick = () => {
    if (!user) {
      navigate('/login')
      return
    }
    if (isAdmin(user)) {
      go('/admin')
      return
    }
    if (isInstructor) {
      go('/instructor')
      return
    }
    openApplicationForm()
  }

  const handleModeSwitch = () => {
    if (isTeacherMode) {
      go('/profile')
    } else {
      go('/instructor')
    }
  }

  return (
    <nav className="top-nav">
      <button className="logo-button" onClick={() => navigate('/')}>Bil-X</button>
      <button className="nav-text-button" type="button" onClick={() => navigate(user ? '/profile' : '/register')}>Üzv ol</button>

      <div className="nav-search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Kurs axtar..."
          value={search}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </div>

      <div className="nav-actions">
        <button className="nav-text-button nav-wide-link" type="button" onClick={() => navigate(user ? '/profile' : '/register')}>Bil-X-də öyrən</button>
        <button className="nav-text-button nav-wide-link" type="button" onClick={handleTeachClick}>Bil-X-də öyrət</button>
        {user ? (
          <>
            <div className="nav-role-stack">
              <span className="nav-role-pill">{roleLabel}</span>
              {!isAdmin(user) && !isInstructor && (
                <button
                  type="button"
                  className="nav-switch-button"
                  onClick={openApplicationForm}
                >
                  Müəllim olmaq üçün müraciət et
                </button>
              )}
              {!isAdmin(user) && isInstructor && (
                <button type="button" className="nav-switch-button" onClick={handleModeSwitch}>
                  {isTeacherMode ? 'Tələbə panelinə keç' : 'Müəllim panelinə keç'}
                </button>
              )}
              {isAdmin(user) && (
                <button type="button" className="nav-switch-button" onClick={handleLogoutClick}>
                  Çıxış
                </button>
              )}
            </div>
            <div ref={menuRef} className="avatar-menu">
              <button className="avatar-button" type="button" onClick={() => setOpen((value) => !value)}>
                {firstLetter}
              </button>
              {open && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{name}</strong>
                    <span>{user.email}</span>
                  </div>
                  {!isAdmin(user) && (
                    <>
                      <button type="button" onClick={() => go('/profile')}><User size={16} /> Profil</button>
                      <button type="button" onClick={() => go('/profile')}><BookOpen size={16} /> Mənim kurslarım</button>
                    </>
                  )}
                  {role === 'instructor' && (
                    <>
                      <button type="button" onClick={() => go('/instructor')}><Video size={16} /> Müəllim paneli</button>
                      <button type="button" onClick={() => go('/profile')}><BookOpen size={16} /> Tələbə panelinə keç</button>
                    </>
                  )}
                  {isAdmin(user) && (
                    <button type="button" onClick={() => go('/admin')}><Shield size={16} /> Admin paneli</button>
                  )}
                  <button type="button" className="danger-menu-item" onClick={handleLogoutClick}><LogOut size={16} /> Çıxış</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="auth-actions">
            <button className="outline-button auth-login-button" onClick={() => navigate('/login')}>Giriş</button>
            <button className="primary-button auth-register-button" onClick={() => navigate('/register')}>Qeydiyyat</button>
          </div>
        )}
      </div>
      {applicationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setApplicationOpen(false)}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="teacher-application-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="teacher-application-title">Müəllim müraciəti</h2>
              <button type="button" className="modal-close-button" onClick={() => setApplicationOpen(false)}>x</button>
            </div>
            <form className="form-panel" onSubmit={submitTeacherApplication}>
              {applicationMessage && (
                <div className={applicationMessageType === 'success' ? 'success-box' : 'error-box'}>{applicationMessage}</div>
              )}
              <label>Ad</label>
              <input value={applicationForm.name} onChange={(event) => setApplicationForm({ ...applicationForm, name: event.target.value })} required />
              <label>Soyad</label>
              <input value={applicationForm.surname} onChange={(event) => setApplicationForm({ ...applicationForm, surname: event.target.value })} required />
              <label>Qeydiyyat e-poçtu</label>
              <input value={user.email || ''} readOnly />
              <label>Telefon nömrəsi</label>
              <input type="tel" value={applicationForm.phone} onChange={(event) => setApplicationForm({ ...applicationForm, phone: event.target.value })} required />
              <button className="approve-button full" disabled={applicationLoading}>{applicationLoading ? 'Göndərilir...' : 'Müraciəti göndər'}</button>
            </form>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
