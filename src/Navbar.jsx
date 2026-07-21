import { Bell, BookOpen, LogOut, Mail, Pencil, Search, Shield, User, Video } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LanguageSelector from './LanguageSelector'
import bilxLogo from './assets/bilx-logo.png'
import { useLanguage } from './i18n'
import { ADMIN_EMAIL, ADMIN_PUBLIC_NAME, isAdmin } from './profileApi'
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
  const [nameEditorOpen, setNameEditorOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [nameMessage, setNameMessage] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const menuRef = useRef(null)
  const notificationRef = useRef(null)
  const { t } = useLanguage()
  const role = profile?.role || 'student'
  const name = isAdmin(user)
    ? ADMIN_PUBLIC_NAME
    : profile?.full_name || user?.user_metadata?.full_name || user?.email || 'BilX'
  const firstLetter = name.charAt(0).toUpperCase()
  const profileReady = !user || Boolean(profile) || isAdmin(user)
  const isInstructor = role === 'instructor'
  const inboxTeacherMode = location.pathname.startsWith('/inbox')
    && new URLSearchParams(location.search).get('mode') === 'teacher'
  const isTeacherMode = location.pathname.startsWith('/instructor')
    || location.pathname.startsWith('/edit-course')
    || (isInstructor && inboxTeacherMode)
  const adminView = location.pathname.startsWith('/admin')
    ? 'admin'
    : isTeacherMode
      ? 'teacher'
      : 'student'

  const roleLabel = isAdmin(user)
    ? adminView === 'teacher'
      ? t('adminTeacherView')
      : adminView === 'student'
        ? t('adminStudentView')
        : t('roleAdmin')
    : isTeacherMode
      ? t('roleInstructor')
      : t('roleStudent')

  useEffect(() => {
    function closeOnOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
      if (notificationRef.current && !notificationRef.current.contains(event.target)) setNotificationsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!user) return []
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8)

    return data || []
  }, [user])

  const isIncomingMessage = useCallback((message) => {
    if (!user || !message || message.read_at) return false
    const userEmail = user.email?.toLowerCase() || ''
    const senderEmail = message.sender_email?.toLowerCase() || ''
    const recipientEmail = message.recipient_email?.toLowerCase() || ''

    if (message.sender_id === user.id || senderEmail === userEmail) return false
    if (message.recipient_id === user.id || recipientEmail === userEmail) return true
    return isAdmin(user) && recipientEmail === ADMIN_EMAIL.toLowerCase()
  }, [user])

  const fetchUnreadMessageCount = useCallback(async () => {
    if (!user) return 0
    const { data } = await supabase
      .from('inbox_messages')
      .select('id, sender_id, sender_email, recipient_id, recipient_email, read_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })

    return (data || []).filter(isIncomingMessage).length
  }, [isIncomingMessage, user])

  useEffect(() => {
    let mounted = true
    fetchNotifications().then((items) => {
      if (mounted) setNotifications(items)
    })

    if (!user) {
      return () => {
        mounted = false
      }
    }
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          fetchNotifications().then((items) => {
            if (mounted) setNotifications(items)
          })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, user])

  useEffect(() => {
    let mounted = true
    fetchUnreadMessageCount().then((count) => {
      if (mounted) setUnreadMessageCount(count)
    })

    if (!user) {
      return () => {
        mounted = false
      }
    }

    const channel = supabase
      .channel(`inbox-unread:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_messages' },
        () => {
          fetchUnreadMessageCount().then((count) => {
            if (mounted) setUnreadMessageCount(count)
          })
        }
      )
      .subscribe()

    const refreshOnFocus = () => {
      fetchUnreadMessageCount().then((count) => {
        if (mounted) setUnreadMessageCount(count)
      })
    }
    window.addEventListener('focus', refreshOnFocus)
    window.addEventListener('bilx-inbox-updated', refreshOnFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', refreshOnFocus)
      window.removeEventListener('bilx-inbox-updated', refreshOnFocus)
      supabase.removeChannel(channel)
    }
  }, [fetchUnreadMessageCount, user])

  const unreadCount = notifications.filter((item) => !item.is_read).length

  const markNotificationIdsRead = async (ids) => {
    const notificationIds = ids.filter(Boolean)
    if (!user || notificationIds.length === 0) return

    const readAt = new Date().toISOString()
    setNotifications((items) => items.map((item) => (
      notificationIds.includes(item.id) ? { ...item, is_read: true, read_at: readAt } : item
    )))

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .in('id', notificationIds)

    if (error) console.warn('Could not mark notifications as read:', error)
    else setNotifications(await fetchNotifications())
  }

  const markAllNotificationsRead = async () => {
    if (!user || unreadCount === 0) return
    await markNotificationIdsRead(notifications.filter((item) => !item.is_read).map((item) => item.id))
  }

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen
    setNotificationsOpen(nextOpen)
    if (nextOpen && unreadCount > 0) {
      void markNotificationIdsRead(notifications.filter((item) => !item.is_read).map((item) => item.id))
    }
  }

  const openNotification = async (notification) => {
    if (!notification) return
    setNotificationsOpen(false)

    if (!notification.is_read) {
      await markNotificationIdsRead([notification.id])
    }

    if (notification.link) navigate(notification.link)
  }

  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  const goHome = () => {
    setOpen(false)
    if (location.pathname === '/') {
      handleSearchInput('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    navigate('/')
  }

  const openApplicationForm = () => {
    const [firstName = '', ...rest] = (profile?.full_name || user?.user_metadata?.full_name || '').trim().split(/\s+/)
    setApplicationForm({ name: firstName, surname: rest.join(' '), phone: '' })
    setApplicationMessage('')
    setApplicationMessageType('error')
    setApplicationOpen(true)
  }

  const openNameEditor = () => {
    setOpen(false)
    setDisplayName(profile?.full_name || user?.user_metadata?.full_name || '')
    setNameMessage('')
    setNameEditorOpen(true)
  }

  const submitDisplayName = async (event) => {
    event.preventDefault()
    if (!user) return

    const cleanName = displayName.trim().replace(/\s+/g, ' ')
    if (cleanName.length < 2 || cleanName.length > 100) {
      setNameMessage(t('nameLengthError'))
      return
    }

    setNameLoading(true)
    setNameMessage('')

    const { data, error } = await supabase.rpc('update_my_display_name', {
      p_full_name: cleanName,
    })

    if (error) {
      setNameMessage(`${t('errorOccurred')}${error.message}`)
      setNameLoading(false)
      return
    }

    const updatedProfile = Array.isArray(data) ? data[0] : data
    await supabase.auth.updateUser({ data: { full_name: cleanName } })
    window.dispatchEvent(new CustomEvent('bilx-profile-updated', {
      detail: updatedProfile || { ...profile, user_id: user.id, full_name: cleanName },
    }))
    setNameLoading(false)
    setNameEditorOpen(false)
  }

  const submitTeacherApplication = async (event) => {
    event.preventDefault()
    if (!user) return

    if (!applicationForm.name.trim() || !applicationForm.surname.trim() || !applicationForm.phone.trim()) {
      setApplicationMessage(t('fillAllFields'))
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
        setApplicationMessage(t('applicationAlreadySent'))
        setApplicationMessageType('success')
      } else {
        setApplicationMessage(`${t('errorOccurred')}${error.message}`)
        setApplicationMessageType('error')
      }
    } else {
      setApplicationMessage(t('applicationSent'))
      setApplicationMessageType('success')
      const applicantName = `${applicationForm.name.trim()} ${applicationForm.surname.trim()}`.trim()
      await supabase.rpc('notify_admin', {
        p_title: t('adminNewTeacherTitle'),
        p_body: t('adminNewTeacherBody').replace('{name}', applicantName),
        p_link: '/admin',
      })
    }

    setApplicationLoading(false)
  }

  const handleLogoutClick = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    await onLogout?.()
  }

  const handleModeSwitch = () => {
    if (isTeacherMode) {
      go('/profile')
    } else {
      go('/instructor')
    }
  }

  const searchValue = onSearchChange ? search : searchTerm
  const handleSearchInput = (value) => {
    if (onSearchChange) onSearchChange(value)
    else setSearchTerm(value)
  }
  const runSearch = () => {
    // On pages that don't own the course list, jump to the home page with the
    // query so the search always produces results.
    if (!onSearchChange) {
      navigate(`/?q=${encodeURIComponent((searchTerm || '').trim())}`)
    }
  }

  return (
    <nav className="top-nav">
      <button className="logo-button" onClick={goHome} aria-label="BilX">
        <img src={bilxLogo} alt="BilX" />
      </button>

      <div className="nav-search">
        <Search size={18} />
        <input
          type="search"
          placeholder={t('search')}
          value={searchValue}
          onChange={(event) => handleSearchInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') runSearch() }}
        />
      </div>

      <div className="nav-actions">
        <LanguageSelector />
        {user ? (
          <>
            <div ref={notificationRef} className="notification-menu">
              <button className="icon-button" type="button" onClick={toggleNotifications} aria-label={t('notifications')}>
                <Bell size={18} />
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>
              {notificationsOpen && (
                <div className="dropdown-menu notification-dropdown">
                  <div className="dropdown-header">
                    <strong>{t('notifications')}</strong>
                    {unreadCount > 0 && (
                      <button type="button" className="text-button" onClick={markAllNotificationsRead}>{t('markAllRead')}</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="empty-box">{t('noNotifications')}</div>
                  ) : notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.is_read ? 'notification-item' : 'notification-item unread'}
                      onClick={() => openNotification(item)}
                    >
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="icon-button nav-inbox-button" type="button" onClick={() => navigate(isTeacherMode ? '/inbox?mode=teacher' : '/inbox')} aria-label={t('inbox')} title={t('inbox')}>
              <Mail size={18} />
              {unreadMessageCount > 0 && <span className="badge">{unreadMessageCount}</span>}
            </button>
            <div className={`nav-role-stack ${profileReady ? '' : 'loading'}`}>
              <span className="nav-role-pill">{roleLabel}</span>
              {!profileReady ? (
                <button
                  type="button"
                  className="nav-switch-button"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  {t('switchToTeacherPanel')}
                </button>
              ) : !isAdmin(user) && !isInstructor ? (
                <button
                  type="button"
                  className="nav-switch-button"
                  onClick={openApplicationForm}
                >
                  {t('applyToTeach')}
                </button>
              ) : !isAdmin(user) && isInstructor ? (
                <button type="button" className="nav-switch-button" onClick={handleModeSwitch}>
                  {isTeacherMode ? t('switchToStudentPanel') : t('switchToTeacherPanel')}
                </button>
              ) : isAdmin(user) ? (
                <select
                  className="nav-switch-button admin-view-select"
                  value={adminView}
                  aria-label={t('adminViewSelector')}
                  onChange={(event) => {
                    const nextView = event.target.value
                    if (nextView === 'admin') navigate('/admin')
                    else if (nextView === 'teacher') navigate('/instructor')
                    else navigate('/profile')
                  }}
                >
                  <option value="admin">{t('adminViewOption')}</option>
                  <option value="teacher">{t('teacherViewOption')}</option>
                  <option value="student">{t('studentViewOption')}</option>
                </select>
              ) : null}
            </div>
            <div ref={menuRef} className="avatar-menu">
              <button className="avatar-button" type="button" onClick={() => setOpen((value) => !value)}>
                {firstLetter}
              </button>
              {open && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{name}</strong>
                    {!isAdmin(user) && <span>{user.email}</span>}
                  </div>
                  {!isAdmin(user) && (
                    <>
                      <button type="button" onClick={() => go('/profile')}><User size={16} /> {t('profileLabel')}</button>
                      <button type="button" onClick={() => go('/profile')}><BookOpen size={16} /> {t('myCoursesTitle')}</button>
                    </>
                  )}
                  {role === 'instructor' && (
                    <>
                      <button type="button" onClick={() => go('/instructor')}><Video size={16} /> {t('teacherPanel')}</button>
                      <button type="button" onClick={() => go('/profile')}><BookOpen size={16} /> {t('switchToStudentPanel')}</button>
                    </>
                  )}
                  {isAdmin(user) && (
                    <>
                      <button type="button" onClick={() => go('/admin')}><Shield size={16} /> {t('adminPanel')}</button>
                    </>
                  )}
                  {!isAdmin(user) && <button type="button" onClick={openNameEditor}><Pencil size={16} /> {t('changeName')}</button>}
                  <button type="button" className="danger-menu-item" onClick={handleLogoutClick}><LogOut size={16} /> {t('logout')}</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="auth-actions">
            <button className="outline-button auth-login-button" onClick={() => navigate('/login')}>{t('login')}</button>
            <button className="primary-button auth-register-button" onClick={() => navigate('/register')}>{t('register')}</button>
          </div>
        )}
      </div>
      {applicationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setApplicationOpen(false)}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="teacher-application-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="teacher-application-title">{t('applicationTitle')}</h2>
              <button type="button" className="modal-close-button" onClick={() => setApplicationOpen(false)}>x</button>
            </div>
            <form className="form-panel" onSubmit={submitTeacherApplication}>
              {applicationMessage && (
                <div className={applicationMessageType === 'success' ? 'success-box' : 'error-box'}>{applicationMessage}</div>
              )}
              <label>{t('fullName')}</label>
              <input value={applicationForm.name} onChange={(event) => setApplicationForm({ ...applicationForm, name: event.target.value })} required />
              <label>{t('surname')}</label>
              <input value={applicationForm.surname} onChange={(event) => setApplicationForm({ ...applicationForm, surname: event.target.value })} required />
              <label>{t('applicationEmail')}</label>
              <input value={user.email || ''} readOnly />
              <label>{t('applicationPhone')}</label>
              <input type="tel" value={applicationForm.phone} onChange={(event) => setApplicationForm({ ...applicationForm, phone: event.target.value })} required />
              <button className="approve-button full" disabled={applicationLoading}>{applicationLoading ? t('applicationSubmitting') : t('applicationSubmit')}</button>
            </form>
          </div>
        </div>
      )}
      {nameEditorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNameEditorOpen(false)}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="display-name-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="display-name-title">{t('changeName')}</h2>
              <button type="button" className="modal-close-button" onClick={() => setNameEditorOpen(false)}>x</button>
            </div>
            <form className="form-panel" onSubmit={submitDisplayName}>
              {nameMessage && <div className="error-box">{nameMessage}</div>}
              <label htmlFor="display-name-input">{t('displayName')}</label>
              <input
                id="display-name-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={100}
                autoComplete="name"
                required
              />
              <button className="primary-button full" disabled={nameLoading}>
                {nameLoading ? t('saving') : t('saveName')}
              </button>
            </form>
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
