import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { ADMIN_EMAIL } from './profileApi'
import { supabase } from './supabase'

export function InboxPanel({ user, compact = false, adminMode = false }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [courses, setCourses] = useState([])
  const [recipientType, setRecipientType] = useState('admin')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [recipientEmailInput, setRecipientEmailInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedConversationKey, setSelectedConversationKey] = useState('')
  const [profilePreview, setProfilePreview] = useState(null)
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

  const profilesById = useMemo(
    () => new Map((profiles || []).map((item) => [item.user_id, item])),
    [profiles]
  )

  const getPersonName = (person) => {
    if (!person) return ''
    return profilesById.get(person.id)?.full_name || person.email || ''
  }

  const getPersonProfile = useCallback((person) => {
    if (!person) return null
    const profile = person.id ? profilesById.get(person.id) : null
    return {
      id: person.id || profile?.user_id || null,
      email: person.email || '',
      name: profile?.full_name || person.email || '',
      role: profile?.role || '',
    }
  }, [profilesById])

  const getCounterpart = useCallback((item) => {
    const sentByMe = item.sender_id === user?.id || item.sender_email === user?.email
    const sentToMe = item.recipient_id === user?.id || item.recipient_email === user?.email

    if (sentByMe) {
      return { id: item.recipient_id || null, email: item.recipient_email || '' }
    }

    if (sentToMe || adminMode) {
      return { id: item.sender_id || null, email: item.sender_email || '' }
    }

    return { id: item.sender_id || null, email: item.sender_email || '' }
  }, [adminMode, user])

  const getConversationKey = (person) => person?.id || person?.email?.toLowerCase() || ''

  const getMessagePerson = (item, type) => {
    const id = type === 'sender' ? item.sender_id : item.recipient_id
    const email = type === 'sender' ? item.sender_email : item.recipient_email
    return { id: id || null, email: email || '' }
  }

  const conversations = useMemo(() => {
    const byKey = new Map()

    messages.forEach((item) => {
      const person = getCounterpart(item)
      const key = getConversationKey(person)
      if (!key) return

      const current = byKey.get(key) || {
        key,
        person,
        messages: [],
        latest: item,
      }

      current.messages.push(item)
      if (new Date(item.created_at) > new Date(current.latest.created_at)) {
        current.latest = item
      }
      byKey.set(key, current)
    })

    return Array.from(byKey.values())
      .map((conversation) => ({
        ...conversation,
        profile: getPersonProfile(conversation.person),
        messages: conversation.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
      }))
      .sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at))
  }, [messages, getCounterpart, getPersonProfile])

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return conversations

    return conversations.filter((conversation) => {
      const profile = conversation.profile || {}
      const searchable = [
        profile.name,
        profile.email,
        profile.role,
        ...conversation.messages.map((item) => item.body),
      ].join(' ').toLowerCase()
      return searchable.includes(query)
    })
  }, [conversations, searchTerm])

  const selectedConversation = useMemo(() => {
    if (!filteredConversations.length) return null
    return filteredConversations.find((conversation) => conversation.key === selectedConversationKey) || filteredConversations[0]
  }, [filteredConversations, selectedConversationKey])

  const selectConversation = (conversation) => {
    const profile = conversation.profile || getPersonProfile(conversation.person)
    setSelectedConversationKey(conversation.key)
    setReplyTo({ id: profile.id || null, email: profile.email || '' })
  }

  const selectReplyTarget = (person) => {
    const id = person?.id || null
    const email = person?.email || ''
    if (!id && !email) return
    setReplyTo({ id: id || null, email: email || id || '' })
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

      const ids = Array.from(new Set(
        (messageData || [])
          .flatMap((item) => [item.sender_id, item.recipient_id])
          .filter(Boolean)
      ))

      let profileData = []
      if (ids.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, full_name, role')
          .in('user_id', ids)
        profileData = data || []
      }

      if (mounted) {
        setMessages(messageData || [])
        setProfiles(profileData)
      }
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
    if (recipientId || recipientEmail) {
      const nextPerson = { id: recipientId || null, email: recipientEmail || '' }
      setReplyTo(nextPerson)
      setSelectedConversationKey(getConversationKey(nextPerson))
    } else {
      setReplyTo(null)
    }
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

        <section className="panel-card inbox-conversations-panel">
          <div className="inbox-panel-head">
            <h3>{t('latestMessages')}</h3>
            <label className="sr-only" htmlFor="inbox-search">{t('inboxSearchLabel')}</label>
            <input
              id="inbox-search"
              className="inbox-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('inboxSearchPlaceholder')}
            />
          </div>

          {messages.length === 0 ? (
            <p className="muted">{t('noInboxMessages')}</p>
          ) : filteredConversations.length === 0 ? (
            <p className="muted">{t('inboxSearchEmpty')}</p>
          ) : (
            <div className="inbox-conversation-layout">
              <div className="inbox-list inbox-thread-list">
                {filteredConversations.map((conversation) => {
                  const profile = conversation.profile || {}
                  const name = profile.name || profile.email || t('profileLabel')
                  const latest = conversation.latest
                  const isActive = selectedConversation?.key === conversation.key

                  return (
                    <article
                      key={conversation.key}
                      className={`inbox-item inbox-thread-item ${isActive ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="inbox-thread-main"
                        onClick={() => selectConversation(conversation)}
                      >
                        <span className="inbox-avatar" aria-hidden="true">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="inbox-item-body">
                          <span className="inbox-item-head">
                            <strong>{name}</strong>
                            <small>{new Date(latest.created_at).toLocaleString('az-AZ')}</small>
                          </span>
                          {profile.email && <small className="inbox-person-email">{profile.email}</small>}
                          <span className="inbox-preview">{latest.body}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="inbox-profile-link"
                        onClick={() => setProfilePreview(profile)}
                      >
                        {t('profileLabel')}
                      </button>
                    </article>
                  )
                })}
              </div>

              <div className="inbox-chat-panel">
                {selectedConversation ? (
                  <>
                    <div className="inbox-chat-head">
                      <button
                        type="button"
                        className="inbox-chat-person"
                        onClick={() => setProfilePreview(selectedConversation.profile)}
                      >
                        <span className="inbox-avatar" aria-hidden="true">
                          {(selectedConversation.profile?.name || selectedConversation.profile?.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>{selectedConversation.profile?.name || selectedConversation.profile?.email}</strong>
                          {selectedConversation.profile?.email && <small>{selectedConversation.profile.email}</small>}
                        </span>
                      </button>
                      <button type="button" className="outline-button compact" onClick={() => selectReplyTarget(selectedConversation.profile)}>
                        {t('reply')}
                      </button>
                    </div>
                    <div className="inbox-chat-scroll">
                      {selectedConversation.messages.map((item) => {
                        const isMine = item.sender_id === user?.id || item.sender_email === user?.email
                        const person = getMessagePerson(item, 'sender')
                        const displayName = isMine ? t('youLabel') : getPersonName(person)

                        return (
                          <div key={item.id} className={`inbox-chat-row ${isMine ? 'mine' : ''}`}>
                            <div className="inbox-chat-bubble">
                              <div className="inbox-chat-meta">
                                <strong>{displayName}</strong>
                                <small>{new Date(item.created_at).toLocaleString('az-AZ')}</small>
                              </div>
                              <p>{item.body}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="muted">{t('noInboxMessages')}</p>
                )}
              </div>
            </div>
          )}
        </section>

        {profilePreview && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setProfilePreview(null)}>
            <div className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2>{profilePreview.name || profilePreview.email}</h2>
                <button type="button" className="modal-close-button" onClick={() => setProfilePreview(null)}>x</button>
              </div>
              <div className="form-panel">
                {profilePreview.role && <p className="muted">{profilePreview.role}</p>}
                {profilePreview.email && <p className="muted">{profilePreview.email}</p>}
                {profilePreview.id && profilePreview.role === 'instructor' && (
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => navigate(`/teacher/${profilePreview.id}`)}
                  >
                    {t('viewPublicTeacherProfile')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
