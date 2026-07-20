import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Shield } from 'lucide-react'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import { getCourseUrl } from './courseUrl'
import { InboxPanel } from './Inbox'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('az-AZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function splitFullName(fullName = '') {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    name: parts[0] || '-',
    surname: parts.slice(1).join(' ') || '-',
  }
}

function shouldTryTeacherReviewFallback(error) {
  const message = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return (
    message.includes('function') ||
    message.includes('schema cache') ||
    message.includes('permission denied') ||
    message.includes('not found') ||
    error?.code === 'PGRST202' ||
    error?.code === '42501'
  )
}

function getCourseStatus(course) {
  if (!course) return 'pending'
  if (course.status) return course.status
  return course.is_published ? 'approved' : 'pending'
}

function getCourseStatusLabel(status) {
  if (status === 'approved') return 'courseStatusApproved'
  if (status === 'rejected') return 'courseStatusRejected'
  if (status === 'draft') return 'courseStatusDraft'
  return 'courseStatusPending'
}

function AdminDashboard({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [profiles, setProfiles] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [teacherApplications, setTeacherApplications] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [requests, setRequests] = useState([])
  const [inboxMessages, setInboxMessages] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [studentEmail, setStudentEmail] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [message, setMessage] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [userFilter, setUserFilter] = useState('all')
  const [userComments, setUserComments] = useState([])
  const [userModalLoading, setUserModalLoading] = useState(false)
  const [adminMessageBody, setAdminMessageBody] = useState('')
  const canAdmin = isAdmin(user)
  const { t } = useLanguage()

  const sendEmailNotification = async ({ type, courseId, courseTitle, instructorId, link, email }) => {
    try {
      await supabase.functions.invoke('notify-email', {
        body: { type, courseId, courseTitle, instructorId, link, email },
      })
    } catch (error) {
      console.warn('Email notification failed:', error)
    }
  }

  const loadData = useCallback(async () => {
    const [
      { data: courseData, error: courseError },
      { data: profileData },
      { data: teacherApplicationData, error: teacherApplicationError },
      { data: enrollmentData, error: enrollmentError },
      { data: requestData, error: requestError },
      { data: inboxMessageData },
      { data: adminUserData },
    ] = await Promise.all([
      supabase.from('Courses').select('*').order('id', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('teacher_applications').select('*').order('id', { ascending: false }),
      supabase.from('enrollments').select('*').order('enrolled_at', { ascending: false }),
      supabase.from('requests').select('*').order('created_at', { ascending: false }),
      supabase.from('inbox_messages').select('id').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_users'),
    ])

    const loadError = courseError || enrollmentError || requestError
    if (loadError) {
      setMessage(`${t('adminLoadFailed')}${loadError.message}`)
    }

    const coursesWithProfileAuthors = await attachCourseAuthorNames(courseData || [])
    const applicationNamesByUserId = new Map((teacherApplicationData || []).map((application) => [
      application.user_id,
      `${application.name || ''} ${application.surname || ''}`.trim(),
    ]))
    const coursesWithAuthors = coursesWithProfileAuthors.map((course) => ({
      ...course,
      instructor_name: course.instructor_name || applicationNamesByUserId.get(course.instructor_id) || '',
    }))

    setCourses(coursesWithAuthors)
    setProfiles(profileData || [])
    setAdminUsers(adminUserData || [])
    setTeacherApplications(teacherApplicationError ? [] : teacherApplicationData || [])
    setEnrollments(enrollmentData || [])
    setRequests(requestData || [])
    setInboxMessages(inboxMessageData || [])
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canAdmin) loadData()
  }, [canAdmin, loadData])

  const approveCourse = async (courseId) => {
    const { error } = await supabase
      .from('Courses')
      .update({ is_published: true, status: 'approved' })
      .eq('id', courseId)
    setMessage(error ? `${t('errorOccurred')}${error.message}` : t('adminCourseApproved'))
    if (!error) loadData()
  }

  const rejectCourse = async (courseId) => {
    const { error } = await supabase
      .from('Courses')
      .update({ is_published: false, status: 'rejected' })
      .eq('id', courseId)
    setMessage(error ? `${t('errorOccurred')}${error.message}` : '')
    if (!error) loadData()
  }

  const deleteCourse = async (courseId) => {
    if (!window.confirm(t('adminConfirmDeleteCourse'))) return
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/delete-course', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ courseId }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(`${t('errorOccurred')}${result.error || t('courseDeleteFailed')}`)
      return
    }
    setMessage(result.cleanupWarning ? t('courseDeletedCleanupWarning') : t('adminCourseDeleted'))
    loadData()
  }

  const giveAccess = async () => {
    if (!studentEmail || !selectedCourse) {
      setMessage(t('adminStudentCourseRequired'))
      return
    }

    const studentKey = studentEmail.trim().toLowerCase()
    const courseIdNum = Number(selectedCourse)

    const { error } = await supabase.from('enrollments').upsert({
      user_id: studentKey,
      course_id: courseIdNum,
      status: 'active',
    }, { onConflict: 'user_id,course_id' })
    setMessage(error ? `${t('errorOccurred')}${error.message}` : t('adminAccessGranted'))
    if (!error) {
      setStudentEmail('')
      setSelectedCourse('')
      loadData()
      const course = courses.find((item) => String(item.id) === String(courseIdNum))
      if (course) {
        // Notify the admin/instructor (existing behaviour).
        await sendEmailNotification({
          type: 'enroll',
          courseId: course.id,
          courseTitle: course.title,
          instructorId: course.instructor_id,
          link: `${window.location.origin}${getCourseUrl(course)}`,
        })

        // Notify the student: in-app (if they have an account) + email.
        const studentUser = adminUsers.find((item) => item.email?.toLowerCase() === studentKey)
        if (studentUser?.user_id) {
          await supabase.rpc('create_notification', {
            p_user_id: studentUser.user_id,
            p_title: t('enrollGrantedTitle'),
            p_body: t('enrollGrantedBody').replace('{title}', course.title),
            p_link: '/profile',
          })
        }
        await sendEmailNotification({
          type: 'enroll_student',
          courseTitle: course.title,
          email: studentKey,
          link: `${window.location.origin}/profile`,
        })
      }
    }
  }

  const removeAccess = async (id) => {
    const { error } = await supabase.from('enrollments').delete().eq('id', id)
    setMessage(error ? `${t('errorOccurred')}${error.message}` : t('adminAccessRevoked'))
    if (!error) loadData()
  }

  const sendAdminMessage = async () => {
    if (!selectedUser?.userId || !adminMessageBody.trim()) return
    const body = adminMessageBody.trim()
    const { error } = await supabase.from('inbox_messages').insert({
      sender_id: user.id,
      sender_email: user.email,
      recipient_id: selectedUser.userId,
      recipient_email: selectedUser.email && selectedUser.email !== '-' ? selectedUser.email : null,
      body,
    })
    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      return
    }
    const inboxLink = selectedUser.role === 'instructor' ? '/inbox?mode=teacher' : '/inbox'
    await supabase.rpc('create_notification', {
      p_user_id: selectedUser.userId,
      p_title: t('inboxNewMessageTitle'),
      p_body: t('inboxNewMessageBody'),
      p_link: inboxLink,
    })
    if (selectedUser.role === 'instructor') {
      await sendEmailNotification({
        type: 'inbox',
        instructorId: selectedUser.userId,
        link: `${window.location.origin}${inboxLink}`,
      })
    }
    setAdminMessageBody('')
    setMessage(t('messageSent'))
  }

  const openUserProfile = async (userRow) => {
    setSelectedUser(userRow)
    setUserComments([])
    setAdminMessageBody('')
    if (!userRow?.userId) return
    setUserModalLoading(true)
    const { data } = await supabase
      .from('video_comments')
      .select('*, videos(title, course_id)')
      .eq('user_id', userRow.userId)
      .order('created_at', { ascending: false })
    setUserComments(data || [])
    setUserModalLoading(false)
  }

  const banSelectedUser = async (nextBanned) => {
    if (!selectedUser?.userId) return
    const { error } = await supabase.rpc('admin_set_user_banned', {
      p_user_id: selectedUser.userId,
      p_banned: nextBanned,
    })
    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      return
    }
    setSelectedUser((current) => current ? { ...current, banned: nextBanned } : current)
    setMessage(nextBanned ? t('adminUserBanned') : t('adminUserUnbanned'))
    loadData()
  }

  const deleteSelectedUser = async () => {
    if (!selectedUser?.userId) return
    if (!window.confirm(t('adminConfirmDeleteUser'))) return
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: selectedUser.userId })
    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      return
    }
    setSelectedUser(null)
    setMessage(t('adminUserDeleted'))
    loadData()
  }

  const reviewTeacherApplication = async (applicationId, decision) => {
    const application = teacherApplications.find((item) => item.id === applicationId)
    const finishTeacherReview = async () => {
      if (decision === 'approved' && application?.user_id) {
        // The role → instructor update is done server-side by the SECURITY
        // DEFINER RPC above (admin_review_teacher_application); we must NOT write
        // the profile row from the client — RLS only lets a user edit their own
        // profile, so an admin upsert here fails. (In the legacy no-RPC fallback,
        // profileApi derives the instructor role from the approved application.)

        // Congratulate the new instructor: in-app + email.
        await supabase.rpc('create_notification', {
          p_user_id: application.user_id,
          p_title: t('teacherApprovedTitle'),
          p_body: t('teacherApprovedBody'),
          p_link: '/instructor',
        })
        if (application.email) {
          await sendEmailNotification({
            type: 'teacher_approved',
            email: application.email,
            link: `${window.location.origin}/instructor`,
          })
        }

        setMessage(t('adminTeacherApproved'))
        loadData()
        return
      }

      setMessage(decision === 'approved' ? t('adminTeacherApproved') : t('adminTeacherRejected'))
      loadData()
    }
    const rpcAttempts = [
      ['admin_review_teacher_application', { application_id: applicationId, decision }],
      ['review_teacher_application', { app_id: applicationId, app_decision: decision }],
    ]

    for (const [functionName, params] of rpcAttempts) {
      const { error } = await supabase.rpc(functionName, params)
      if (!error) {
        finishTeacherReview()
        return
      }

      if (!shouldTryTeacherReviewFallback(error)) {
        setMessage(`${t('errorOccurred')}${error.message}`)
        return
      }
    }

    const updateWithReviewedAt = await supabase
      .from('teacher_applications')
      .update({ status: decision, reviewed_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', applicationId)

    const updateResult = updateWithReviewedAt.error
      ? await supabase
        .from('teacher_applications')
        .update({ status: decision }, { count: 'exact' })
        .eq('id', applicationId)
      : updateWithReviewedAt

    const { count, error } = updateResult
    if (error) {
      setMessage(`${t('errorOccurred')}${error.message}`)
      return
    }

    if (count === 0) {
      const { data: currentApplication, error: currentApplicationError } = await supabase
        .from('teacher_applications')
        .select('status')
        .eq('id', applicationId)
        .maybeSingle()

      if (!currentApplicationError && currentApplication?.status === decision) {
        finishTeacherReview()
        return
      }

      setMessage(t('adminTeacherReviewUpdateFailed'))
      loadData()
      return
    }

    finishTeacherReview()
  }

  if (!canAdmin) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">{t('adminNoAccess')}</div>
      </div>
    )
  }

  const reviewCourses = courses.filter((course) => getCourseStatus(course) === 'pending')
  const approvedCourses = courses.filter((course) => getCourseStatus(course) === 'approved' || course.is_published)
  const courseLabel = (course) => {
    if (!course) return ''
    const instructorName = getCourseAuthorName(course)
    return `${course.title}${instructorName ? ` · ${t('instructorLabel')}: ${instructorName}` : ''}`
  }
  const usersByKey = new Map()
  profiles.forEach((item) => {
    if (usersByKey.has(item.user_id)) return
    usersByKey.set(item.user_id, {
      id: item.user_id,
      name: item.full_name || '-',
      role: item.role === 'instructor' ? 'instructor' : item.role === 'student' ? 'student' : item.role || 'unknown',
      source: 'profile',
    })
  })
  courses.forEach((course) => {
    if (!course.instructor_id || usersByKey.has(course.instructor_id)) return
    usersByKey.set(course.instructor_id, {
      id: course.instructor_id,
      name: course.instructor_id,
      role: 'instructor',
      source: 'course',
    })
  })
  enrollments.forEach((item) => {
    if (!item.user_id || usersByKey.has(item.user_id)) return
    usersByKey.set(item.user_id, {
      id: item.user_id,
      name: item.user_id,
      role: 'student',
      source: 'access',
    })
  })
  requests.forEach((item) => {
    const key = item.user_email || item.user_id
    if (!key || usersByKey.has(key)) return
    usersByKey.set(key, {
      id: key,
      name: item.user_name || item.user_email || item.user_id,
      role: 'student',
      source: 'request',
    })
  })
  teacherApplications.forEach((application) => {
    if (application.status !== 'approved') return
    const key = application.email || application.user_id
    usersByKey.set(key, {
      id: key,
      name: `${application.name || ''} ${application.surname || ''}`.trim() || key,
      role: 'instructor',
      source: 'application',
    })
  })
  const approvedTeacherApplications = teacherApplications.filter((application) => application.status === 'approved')
  const approvedTeacherByUserId = new Map(approvedTeacherApplications.map((application) => [application.user_id, application]))
  const userRowsByKey = new Map()

  const upsertUserRow = (key, next) => {
    if (!key) return
    const existing = userRowsByKey.get(key) || {}
    userRowsByKey.set(key, { ...existing, ...next })
  }

  // Authoritative directory from auth.users (real email + signup date), admin-only.
  adminUsers.forEach((item) => {
    if (userRowsByKey.has(item.user_id)) return
    const application = approvedTeacherByUserId.get(item.user_id)
    const nameParts = application
      ? { name: application.name || '-', surname: application.surname || '-' }
      : splitFullName(item.full_name)
    upsertUserRow(item.user_id, {
      key: item.user_id,
      userId: item.user_id,
      name: nameParts.name,
      surname: nameParts.surname,
      email: item.email || application?.email || '-',
      phone: application?.phone || '-',
      role: item.role === 'instructor' || application ? 'instructor' : (item.role || 'student'),
      signedUpAt: item.created_at || null,
      teacherApprovedAt: application?.reviewed_at || application?.created_at || null,
      banned: Boolean(item.banned),
      lastActive: item.last_active || null,
      deviceInfo: item.device_info || null,
    })
  })

  // Fallback for any profile not returned by the RPC (e.g. RPC unavailable).
  profiles.forEach((item) => {
    if (userRowsByKey.has(item.user_id)) return
    const application = approvedTeacherByUserId.get(item.user_id)
    const nameParts = application ? { name: application.name || '-', surname: application.surname || '-' } : splitFullName(item.full_name)
    upsertUserRow(item.user_id, {
      key: item.user_id,
      userId: item.user_id,
      name: nameParts.name,
      surname: nameParts.surname,
      email: application?.email || item.user_id,
      phone: application?.phone || '-',
      role: item.role === 'instructor' || application ? 'instructor' : 'student',
      signedUpAt: null,
      teacherApprovedAt: application?.reviewed_at || application?.created_at || null,
    })
  })

  approvedTeacherApplications.forEach((application) => {
    const key = application.user_id || application.email
    upsertUserRow(key, {
      key,
      userId: application.user_id || null,
      name: application.name || '-',
      surname: application.surname || '-',
      email: application.email || '-',
      phone: application.phone || '-',
      role: 'instructor',
      teacherApprovedAt: application.reviewed_at || application.created_at || null,
    })
  })

  enrollments.forEach((item) => {
    const key = item.user_id
    if (!key || userRowsByKey.has(key)) return
    upsertUserRow(key, {
      key,
      name: item.user_id,
      surname: '-',
      email: item.user_id,
      phone: '-',
      role: 'student',
      signedUpAt: null,
      teacherApprovedAt: null,
    })
  })

  requests.forEach((item) => {
    const key = item.user_id || item.user_email
    if (!key || userRowsByKey.has(key)) return
    const nameParts = splitFullName(item.user_name || '')
    upsertUserRow(key, {
      key,
      name: nameParts.name === '-' ? item.user_email || item.user_id : nameParts.name,
      surname: nameParts.surname,
      email: item.user_email || item.user_id || '-',
      phone: '-',
      role: 'student',
      signedUpAt: null,
      teacherApprovedAt: null,
    })
  })

  const visibleUsers = Array.from(userRowsByKey.values()).sort((a, b) => {
    const aTime = a.signedUpAt ? new Date(a.signedUpAt).getTime() : 0
    const bTime = b.signedUpAt ? new Date(b.signedUpAt).getTime() : 0
    return bTime - aTime
  })
  const instructors = visibleUsers.filter((item) => item.role === 'instructor')
  const students = visibleUsers.filter((item) => item.role === 'student')
  const userStats = [
    { key: 'student', label: t('studentsLabel'), count: students.length },
    { key: 'instructor', label: t('instructorsLabel'), count: instructors.length },
    { key: 'all', label: t('totalUsersLabel'), count: visibleUsers.length },
  ]
  const filteredVisibleUsers = userFilter === 'all'
    ? visibleUsers
    : visibleUsers.filter((item) => item.role === userFilter)
  const activeUserFilterLabel = userStats.find((item) => item.key === userFilter)?.label || t('totalUsersLabel')
  const roleLabels = {
    instructor: t('instructor'),
    student: t('student'),
  }
  const getRoleLabel = (role) => roleLabels[role] || role || '-'
  const canOpenPublicTeacherProfile = (item) => item?.role === 'instructor' && item?.userId
  const openPublicTeacherProfile = (event, item) => {
    event.stopPropagation()
    if (canOpenPublicTeacherProfile(item)) navigate(`/teacher/${item.userId}`)
  }
  const pendingTeacherApplications = teacherApplications.filter((application) => application.status === 'pending')

  // Monthly report (4.6): bucket events by year-month from already-loaded data.
  const monthKeyOf = (value) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  const monthlyMap = new Map()
  const bumpMonth = (key, field) => {
    if (!key) return
    const row = monthlyMap.get(key) || { month: key, newUsers: 0, newTeachers: 0, coursesShared: 0, coursesBought: 0 }
    row[field] += 1
    monthlyMap.set(key, row)
  }
  adminUsers.forEach((item) => bumpMonth(monthKeyOf(item.created_at), 'newUsers'))
  approvedTeacherApplications.forEach((item) => bumpMonth(monthKeyOf(item.reviewed_at || item.created_at), 'newTeachers'))
  courses.forEach((item) => bumpMonth(monthKeyOf(item.created_at), 'coursesShared'))
  enrollments.forEach((item) => bumpMonth(monthKeyOf(item.enrolled_at), 'coursesBought'))
  const monthlyStats = Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month))
  const maxStat = Math.max(
    1,
    ...monthlyStats.flatMap((row) => [row.newUsers, row.newTeachers, row.coursesShared, row.coursesBought])
  )
  const monthLabel = (key) => {
    const date = new Date(`${key}-01T00:00:00`)
    if (Number.isNaN(date.getTime())) return key
    return date.toLocaleDateString('az-AZ', { year: 'numeric', month: 'long' })
  }

  // Drill-down data for the selected user (4.5).
  const selectedSharedCourses = selectedUser
    ? courses.filter((course) => selectedUser.userId && course.instructor_id === selectedUser.userId)
    : []
  const selectedEnrolledCourses = selectedUser
    ? enrollments
        .filter((item) => {
          const uid = String(item.user_id || '').toLowerCase()
          return (selectedUser.userId && uid === String(selectedUser.userId).toLowerCase())
            || (selectedUser.email && uid === String(selectedUser.email).toLowerCase())
        })
        .map((item) => {
          const course = courses.find((entry) => entry.id === item.course_id)
          return course ? { course, enrolledAt: item.enrolled_at } : null
        })
        .filter(Boolean)
    : []

  const adminTabs = [
    ['pending', t('pendingReviewCourses'), reviewCourses.length],
    ['teacher-applications', t('pendingTeachers'), pendingTeacherApplications.length],
    ['access', t('grantAccess'), enrollments.length],
    ['users', t('userCount'), visibleUsers.length],
    ['inbox', t('inbox'), inboxMessages.length],
    ['courses', t('approvedCoursesTitle'), approvedCourses.length],
    ['stats', t('statsTab'), monthlyStats.length],
  ]

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-mark"><Shield size={18} /></span>
            <span className="admin-brand-text">
              <strong>BilX</strong>
              <small>{t('adminPanel')}</small>
            </span>
          </div>

          <nav className="admin-nav">
            {adminTabs.map(([id, label, count]) => (
              <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => {
                setMessage('')
                setActiveTab(id)
              }}>
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-account">
              <span className="admin-account-avatar">{(user?.email || 'A').charAt(0).toUpperCase()}</span>
              <span className="admin-account-email" title={user?.email}>{user?.email}</span>
            </div>
            <button type="button" className="admin-logout" onClick={handleLogout}>
              <LogOut size={16} /> {t('logout')}
            </button>
          </div>
        </aside>

        <section className="admin-content">
          {message && <div className="notice-box">{message}</div>}

          {activeTab === 'pending' && (
            <div className="panel-card">
              <h2>{t('pendingReviewCourses')}</h2>
              {reviewCourses.length === 0 ? <p className="muted">{t('pendingReviewEmpty')}</p> : reviewCourses.map((course, index) => {
                const instructorName = getCourseAuthorName(course)

                return (
                  <div key={course.id} className="admin-row">
                    <button className="admin-row-main" type="button" onClick={() => navigate(getCourseUrl(course), { state: { course } })}>
                      <strong>{index + 1}. {course.title}</strong>
                      {instructorName && <p>{t('instructorLabel')}: {instructorName}</p>}
                      <p>{course.price} AZN · {t(getCourseStatusLabel(getCourseStatus(course)))}</p>
                    </button>
                    <div>
                      <button className="approve-button" onClick={() => approveCourse(course.id)}>{t('approve')}</button>
                      <button className="danger-button" onClick={() => rejectCourse(course.id)}>{t('reject')}</button>
                      <button className="outline-button" onClick={() => navigate(`/edit-course/${course.id}`, { state: { course } })}>{t('edit')}</button>
                      <button className="danger-button" onClick={() => deleteCourse(course.id)}>{t('delete')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'access' && (
            <>
              <div className="panel-card form-panel">
                <h2>{t('accessAfterPayment')}</h2>
                <label>{t('studentEmailLabel')}</label>
                <input type="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} placeholder="telebe@example.com" />
                <label>{t('courseLabel')}</label>
                <select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
                  <option value="">{t('chooseCourse')}</option>
                  {approvedCourses.map((course) => {
                    const instructorName = getCourseAuthorName(course)
                    return <option key={course.id} value={course.id}>{course.title}{instructorName ? ` - ${instructorName}` : ''} - {course.price} AZN</option>
                  })}
                </select>
                <button className="primary-button full" onClick={giveAccess}>{t('grantAccess')}</button>
              </div>
              <div className="panel-card">
                <h2>{t('grantedAccessTitle')}</h2>
                {enrollments.map((item) => (
                  <div key={item.id} className="admin-row">
                    <span>{item.user_id} · {courseLabel(courses.find((course) => course.id === item.course_id)) || item.course_id}</span>
                    <button className="danger-button" onClick={() => removeAccess(item.id)}>{t('revokeAccess')}</button>
                  </div>
                ))}
              </div>
              <div className="panel-card">
                <h2>{t('whatsappRequestsTitle')}</h2>
                {requests.length === 0 ? <p className="muted">{t('noRequests')}</p> : requests.map((item) => (
                  <div key={item.id} className="admin-row">
                    <span>{item.user_email} · {courseLabel(courses.find((course) => course.id === item.course_id)) || item.course_name}</span>
                    <small>{item.status}</small>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'teacher-applications' && (
            <div className="panel-card">
              <h2>{t('pendingTeachers')}</h2>
              {pendingTeacherApplications.length === 0 ? <p className="muted">{t('noPendingTeacherApplications')}</p> : pendingTeacherApplications.map((application, index) => (
                <div key={application.id} className="admin-row">
                  <div>
                    <strong>{index + 1}. {application.name} {application.surname}</strong>
                    <p>{application.email} · {application.phone}</p>
                  </div>
                  <div>
                    <button className="approve-button" onClick={() => reviewTeacherApplication(application.id, 'approved')}>{t('approve')}</button>
                    <button className="danger-button" onClick={() => reviewTeacherApplication(application.id, 'rejected')}>{t('reject')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="panel-card table-wrap">
              <h2>{t('userCount')}</h2>
              <table>
                <thead><tr><th>{t('userTypeLabel')}</th><th>{t('countLabel')}</th></tr></thead>
                <tbody>{userStats.map((item) => (
                  <tr key={item.key} className={userFilter === item.key ? 'admin-user-filter-row active' : 'admin-user-filter-row'}>
                    <td>
                      <button type="button" onClick={() => setUserFilter(item.key)}>
                        {item.label}
                      </button>
                    </td>
                    <td>
                      <button type="button" onClick={() => setUserFilter(item.key)}>
                        {item.count}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="admin-user-filter-title">{activeUserFilterLabel}</div>
              <table className="user-detail-table">
                <thead>
                  <tr>
                    <th>{t('rowLabel')}</th>
                    <th>{t('roleLabel')}</th>
                    <th>{t('nameLabel')}</th>
                    <th>{t('surnameLabel')}</th>
                    <th>{t('emailLabel')}</th>
                    <th>{t('phoneLabel')}</th>
                    <th>{t('signupDateLabel')}</th>
                    <th>{t('teacherSinceLabel')}</th>
                    <th>{t('statusLabel')}</th>
                    <th>{t('actionLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisibleUsers.map((item, index) => (
                    <tr key={item.key || item.email || index}>
                      <td>{index + 1}</td>
                      <td>{getRoleLabel(item.role)}</td>
                      <td>
                        {canOpenPublicTeacherProfile(item) ? (
                          <button className="teacher-profile-link admin-user-link" type="button" onClick={(event) => openPublicTeacherProfile(event, item)}>
                            {item.name}
                          </button>
                        ) : item.name}
                      </td>
                      <td>
                        {canOpenPublicTeacherProfile(item) && item.surname && item.surname !== '-' ? (
                          <button className="teacher-profile-link admin-user-link" type="button" onClick={(event) => openPublicTeacherProfile(event, item)}>
                            {item.surname}
                          </button>
                        ) : item.surname}
                      </td>
                      <td>{item.email}</td>
                      <td>{item.phone}</td>
                      <td>{formatDateTime(item.signedUpAt)}</td>
                      <td>{formatDateTime(item.teacherApprovedAt)}</td>
                      <td>{item.banned ? t('userBanned') : t('userActive')}</td>
                      <td>
                        <button className="outline-button" onClick={() => openUserProfile(item)}>{t('viewProfile')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'inbox' && (
            <InboxPanel user={user} compact adminMode />
          )}

          {activeTab === 'courses' && (
            <div className="panel-card table-wrap">
              <h2>{t('approvedCoursesTitle')}</h2>
              <table>
                <thead><tr><th>{t('rowLabel')}</th><th>{t('courseLabel')}</th><th>{t('instructorLabel')}</th><th>{t('priceAzN')}</th><th>{t('statusLabel')}</th><th>{t('accessCountLabel')}</th><th>{t('actionLabel')}</th></tr></thead>
                <tbody>{approvedCourses.map((course, index) => (
                  <tr key={course.id}>
                    <td>{index + 1}</td>
                    <td>{course.title}</td>
                    <td>{getCourseAuthorName(course) || '-'}</td>
                    <td>{course.price} AZN</td>
                    <td>{t(getCourseStatusLabel(getCourseStatus(course)))}</td>
                    <td>{enrollments.filter((item) => item.course_id === course.id).length}</td>
                    <td>
                      {getCourseStatus(course) === 'approved' || course.is_published ? (
                        <button className="danger-button" onClick={() => rejectCourse(course.id)}>{t('reject')}</button>
                      ) : (
                        <button className="approve-button" onClick={() => approveCourse(course.id)}>{t('approve')}</button>
                      )}
                      <button className="outline-button" onClick={() => navigate(`/edit-course/${course.id}`, { state: { course } })}>{t('edit')}</button>
                      <button className="danger-button" onClick={() => deleteCourse(course.id)}>{t('delete')}</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="stats-page">
              <div className="stats-kpis">
                {[
                  [t('totalUsersLabel'), visibleUsers.length],
                  [t('studentsLabel'), students.length],
                  [t('instructorsLabel'), instructors.length],
                  [t('coursesTitle'), courses.length],
                  [t('enrollmentsKpiLabel'), enrollments.length],
                ].map(([label, value]) => (
                  <div className="stat-kpi" key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              <div className="panel-card">
                <div className="section-heading">
                  <h2>{t('monthlyReportTitle')}</h2>
                </div>
                {monthlyStats.length === 0 ? <p className="muted">{t('noStats')}</p> : (
                  <div className="stats-months">
                    {monthlyStats.map((row) => (
                      <div className="stats-month" key={row.month}>
                        <div className="stats-month-name">{monthLabel(row.month)}</div>
                        <div className="stats-bars">
                          {[
                            ['u', t('statNewUsers'), row.newUsers, 'bar-users'],
                            ['t', t('statNewTeachers'), row.newTeachers, 'bar-teachers'],
                            ['s', t('statCoursesShared'), row.coursesShared, 'bar-shared'],
                            ['b', t('statCoursesBought'), row.coursesBought, 'bar-bought'],
                          ].map(([key, label, value, cls]) => (
                            <div className="stats-bar-row" key={key}>
                              <span className="stats-bar-label">{label}</span>
                              <span className="stats-bar-track">
                                <span className={`stats-bar-fill ${cls}`} style={{ width: `${Math.round((value / maxStat) * 100)}%` }} />
                              </span>
                              <span className="stats-bar-value">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {selectedUser && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedUser(null)}>
          <div className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedUser.name}{selectedUser.surname && selectedUser.surname !== '-' ? ` ${selectedUser.surname}` : ''}</h2>
              <button type="button" className="modal-close-button" onClick={() => setSelectedUser(null)}>x</button>
            </div>
            <div className="form-panel">
              <p className="muted">{getRoleLabel(selectedUser.role)} · {selectedUser.email}</p>
              {canOpenPublicTeacherProfile(selectedUser) && (
                <button className="outline-button" type="button" onClick={(event) => openPublicTeacherProfile(event, selectedUser)}>
                  {t('viewPublicTeacherProfile')}
                </button>
              )}
              {selectedUser.phone && selectedUser.phone !== '-' && <p className="muted">{t('phoneLabel')}: {selectedUser.phone}</p>}
              <p className="muted">{t('signupDateLabel')}: {formatDateTime(selectedUser.signedUpAt)}</p>
              {selectedUser.role === 'instructor' && <p className="muted">{t('teacherSinceLabel')}: {formatDateTime(selectedUser.teacherApprovedAt)}</p>}
              <p className="muted">{t('lastActiveLabel')}: {formatDateTime(selectedUser.lastActive)}</p>
              {selectedUser.deviceInfo && <p className="muted">{t('deviceLabel')}: {selectedUser.deviceInfo}</p>}
              {selectedUser.banned && <div className="error-box">{t('userBanned')}</div>}

              {selectedUser.role === 'instructor' && (
                <>
                  <h3>{t('sharedCoursesLabel')}</h3>
                  {selectedSharedCourses.length === 0 ? <p className="muted">{t('noCoursesLabel')}</p> : selectedSharedCourses.map((course) => (
                    <div key={course.id} className="admin-row">
                      <span>
                        <strong>{course.title}</strong> · {t(getCourseStatusLabel(getCourseStatus(course)))}
                        <br />
                        <small>{t('sharedDateLabel')}: {formatDateTime(course.created_at)} · {t('updatedDateLabel')}: {formatDateTime(course.updated_at)}</small>
                      </span>
                    </div>
                  ))}
                </>
              )}

              <h3>{t('enrolledCoursesLabel')}</h3>
              {selectedEnrolledCourses.length === 0 ? <p className="muted">{t('noCoursesLabel')}</p> : selectedEnrolledCourses.map((item, index) => (
                <div key={item.course.id || index} className="admin-row">
                  <span>
                    <strong>{item.course.title}</strong>
                    <br />
                    <small>{t('purchaseDateLabel')}: {formatDateTime(item.enrolledAt)}</small>
                  </span>
                </div>
              ))}

              <h3>{t('userCommentsLabel')}</h3>
              {userModalLoading ? <p className="muted">{t('loading')}</p> : userComments.length === 0 ? <p className="muted">{t('noComments')}</p> : userComments.map((comment) => (
                <div key={comment.id} className="comment-item">
                  <small>{comment.videos?.title || ''} · {new Date(comment.created_at).toLocaleString('az-AZ')}</small>
                  <p>{comment.body}</p>
                </div>
              ))}

              {selectedUser.userId && (
                <>
                  <h3>{t('sendMessageHeading')}</h3>
                  <textarea
                    rows={3}
                    value={adminMessageBody}
                    onChange={(event) => setAdminMessageBody(event.target.value)}
                    placeholder={t('messagePlaceholder')}
                  />
                  <button className="primary-button full" onClick={sendAdminMessage} disabled={!adminMessageBody.trim()}>
                    {t('sendMessage')}
                  </button>

                  <div className="player-actions">
                    <button className="outline-button" onClick={() => banSelectedUser(!selectedUser.banned)}>
                      {selectedUser.banned ? t('unbanUser') : t('banUser')}
                    </button>
                    <button className="danger-button" onClick={deleteSelectedUser}>{t('deleteUser')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
