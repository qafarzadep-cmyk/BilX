import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { ADMIN_EMAIL } from './profileApi'
import { supabase } from './supabase'

export function InboxPanel({ user, compact = false, adminMode = false }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [courses, setCourses] = useState([])
  const [recipientType, setRecipientType] = useState('admin')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [recipientEmailInput, setRecipientEmailInput] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { t } = useLanguage()

  const sendEmailNotification = async ({ type, courseId, courseTitle, instructorId, link }) => {
    try {
      await supabase.functions.invoke('notify-email', {
        body: { type, courseId, courseTitle, instructorId, link },
      })
    } catch (error) {
      console.warn('Email notification failed:', error)
    }
  }

  const courseOptions = useMemo(
    () => courses.filter((course) => course.instructor_id),
    [courses]
  )

  const selectReplyTarget = (item) => {
    const sentByMe = item.sender_id === user?.id || item.sender_email === user?.email
    const id = sentByMe ? item.recipient_id : item.sender_id
    const email = sentByMe ? item.recipient_email : item.sender_email
    if (!id && !email) return
    setReplyTo({ id: id || null, email: email || id || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    let mounted = true

    async function loadInbox() {
      if (!user) return

      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select('course_id, Courses(id, title, instructor_id, instructor_name)')
        .in('user_id', [user.id, user.email].filter(Boolean))
        .eq('status', 'active')

      if (mounted) {
        const nextCourses = (enrollmentData || [])
          .map((item) => item.Courses)
          .filter(Boolean)
        setCourses(nextCourses)
      }

      const { data: messageData } = await supabase
        .from('inbox_messages')
        .select('*')
        .order('created_at', { ascending: false })

      if (mounted) setMessages(messageData || [])
    }

    loadInbox()
    return () => {
      mounted = false
    }
  }, [user])

  const handleSend = async (event) => {
    event.preventDefault()
    if (!user || !body.trim()) return

    const trimmedBody = body.trim()
    let recipientId = null
    let recipientEmail = null
    let courseId = null

    if (replyTo) {
      recipientId = replyTo.id || null
      recipientEmail = replyTo.email || null
    } else if (adminMode) {
      recipientEmail = recipientEmailInput.trim()
      if (!recipientEmail) {
        setMessage(t('enterRecipientEmail'))
        return
      }
    } else if (recipientType === 'admin') {
      recipientEmail = ADMIN_EMAIL
    } else {
      const selectedCourse = courseOptions.find((course) => String(course.id) === String(selectedCourseId))
      if (!selectedCourse) {
        setMessage(t('selectCoursePrompt'))
        return
      }
      recipientId = selectedCourse.instructor_id
      courseId = selectedCourse.id
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: user.email,
        recipient_id: recipientId,
        recipient_email: recipientEmail,
        course_id: courseId,
        body: trimmedBody,
      })

    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      setLoading(false)
      return
    }

    if (recipientId) {
      await supabase.rpc('create_notification', {
        p_user_id: recipientId,
        p_title: t('inboxNewMessageTitle'),
        p_body: t('inboxNewMessageBody'),
        p_link: '/inbox',
      })
    }

    await sendEmailNotification({
      type: 'inbox',
      courseId,
      courseTitle: courseOptions.find((course) => String(course.id) === String(courseId))?.title,
      instructorId: recipientId,
      link: `${window.location.origin}/inbox`,
    })

    setBody('')
    setSelectedCourseId('')
    setRecipientEmailInput('')
    setRecipientType('admin')
    setReplyTo(null)
    setMessage(t('messageSent'))
    setLoading(false)

    const { data: messageData } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })

    setMessages(messageData || [])
  }

  if (!user) {
    return (
      <div className="empty-box compact">
        <h2>{t('pleaseLogin')}</h2>
        <button className="primary-button" onClick={() => navigate('/login')}>{t('login')}</button>
      </div>
    )
  }

  return (
    <div className={compact ? 'inbox-grid inbox-grid-compact' : 'inbox-grid'}>
        <section className="panel-card">
          <div className="section-heading">
            <h2>{t('inbox')}</h2>
            <p>{adminMode ? t('adminInboxIntro') : t('inboxIntro')}</p>
          </div>

          {message && <div className="notice-box">{message}</div>}

          <form className="form-panel" onSubmit={handleSend}>
            {replyTo ? (
              <div className="inbox-reply-banner">
                <span>{t('replyingTo')} <strong>{replyTo.email}</strong></span>
                <button type="button" className="inbox-reply-cancel" onClick={() => setReplyTo(null)} aria-label={t('cancel')}>×</button>
              </div>
            ) : (
              <>
                {adminMode ? (
                  <>
                    <label>{t('recipientEmail')}</label>
                    <input
                      type="email"
                      value={recipientEmailInput}
                      onChange={(event) => setRecipientEmailInput(event.target.value)}
                      placeholder="student@example.com"
                      autoComplete="email"
                    />
                  </>
                ) : (
                  <>
                    <label>{t('chooseRecipient')}</label>
                    <div className="inbox-choice">
                      <button
                        type="button"
                        className={recipientType === 'admin' ? 'active' : ''}
                        onClick={() => setRecipientType('admin')}
                      >
                        {t('contactAdmin')}
                      </button>
                      <button
                        type="button"
                        className={recipientType === 'instructor' ? 'active' : ''}
                        onClick={() => setRecipientType('instructor')}
                      >
                        {t('contactTeacher')}
                      </button>
                    </div>
                  </>
                )}

                {!adminMode && recipientType === 'instructor' && (
                  <>
                    <label>{t('chooseCourse')}</label>
                    <select
                      value={selectedCourseId}
                      onChange={(event) => setSelectedCourseId(event.target.value)}
                    >
                      <option value="">{t('chooseCourse')}</option>
                      {courseOptions.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title} · {course.instructor_name || t('instructorLabel')}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}

            <label>{t('messageLabel')}</label>
            <textarea
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('messagePlaceholder')}
            />
            <button className="primary-button" disabled={loading}>
              {loading ? t('loading') : t('sendMessage')}
            </button>
          </form>
        </section>

        <section className="panel-card">
          <h3>{t('latestMessages')}</h3>
          {messages.length === 0 ? (
            <p className="muted">{t('noInboxMessages')}</p>
          ) : (
            <div className="inbox-list">
              {messages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="inbox-item inbox-item-button"
                  onClick={() => selectReplyTarget(item)}
                >
                  <span className="inbox-avatar" aria-hidden="true">
                    {(item.sender_email || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="inbox-item-body">
                    <div className="inbox-item-head">
                      <strong>{item.sender_email}</strong>
                      <small>{new Date(item.created_at).toLocaleString('az-AZ')}</small>
                    </div>
                    <p>{item.body}</p>
                    <span className="inbox-reply-hint">{t('reply')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
    </div>
  )
}

function Inbox({ user, profile, handleLogout }) {
  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="content-shell">
        <InboxPanel user={user} />
      </main>
    </div>
  )
}

export default Inbox
