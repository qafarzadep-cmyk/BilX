import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
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

function AdminDashboard({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [profiles, setProfiles] = useState([])
  const [teacherApplications, setTeacherApplications] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [studentEmail, setStudentEmail] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [message, setMessage] = useState('')
  const canAdmin = isAdmin(user)

  const loadData = useCallback(async () => {
    const [
      { data: courseData, error: courseError },
      { data: profileData },
      { data: teacherApplicationData, error: teacherApplicationError },
      { data: enrollmentData, error: enrollmentError },
      { data: requestData, error: requestError },
    ] = await Promise.all([
      supabase.from('Courses').select('*').order('id', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('teacher_applications').select('*').order('id', { ascending: false }),
      supabase.from('enrollments').select('*').order('enrolled_at', { ascending: false }),
      supabase.from('requests').select('*').order('created_at', { ascending: false }),
    ])

    const loadError = courseError || enrollmentError || requestError
    if (loadError) {
      setMessage(`Admin məlumatları yüklənmədi: ${loadError.message}`)
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
    setTeacherApplications(teacherApplicationError ? [] : teacherApplicationData || [])
    setEnrollments(enrollmentData || [])
    setRequests(requestData || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canAdmin) loadData()
  }, [canAdmin, loadData])

  const approveCourse = async (courseId) => {
    const { error } = await supabase
      .from('Courses')
      .update({ is_published: true })
      .eq('id', courseId)
    setMessage(error ? `Xəta: ${error.message}` : 'Kurs təsdiqləndi və ana səhifəyə çıxdı.')
    if (!error) loadData()
  }

  const rejectCourse = async (courseId) => {
    const { error } = await supabase
      .from('Courses')
      .update({ is_published: false })
      .eq('id', courseId)
    setMessage(error ? `Xəta: ${error.message}` : '')
    if (!error) loadData()
  }

  const giveAccess = async () => {
    if (!studentEmail || !selectedCourse) {
      setMessage('Tələbə e-poçtu və kurs seçin.')
      return
    }

    const { error } = await supabase.from('enrollments').upsert({
      user_id: studentEmail.trim().toLowerCase(),
      course_id: Number(selectedCourse),
      status: 'active',
    })
    setMessage(error ? `Xəta: ${error.message}` : 'Tələbəyə kurs girişi verildi.')
    if (!error) {
      setStudentEmail('')
      setSelectedCourse('')
      loadData()
    }
  }

  const removeAccess = async (id) => {
    const { error } = await supabase.from('enrollments').delete().eq('id', id)
    setMessage(error ? `Xəta: ${error.message}` : 'Giriş ləğv edildi.')
    if (!error) loadData()
  }

  const reviewTeacherApplication = async (applicationId, decision) => {
    const application = teacherApplications.find((item) => item.id === applicationId)
    const rpcAttempts = [
      ['admin_review_teacher_application', { application_id: applicationId, decision }],
      ['review_teacher_application', { app_id: applicationId, app_decision: decision }],
    ]

    for (const [functionName, params] of rpcAttempts) {
      const { error } = await supabase.rpc(functionName, params)
      if (!error) {
        setMessage(decision === 'approved' ? 'Müəllim müraciəti təsdiqləndi.' : 'Müraciət rədd edildi.')
        loadData()
        return
      }

      if (!shouldTryTeacherReviewFallback(error)) {
        setMessage(`Xəta: ${error.message}`)
        return
      }
    }

    const updateWithReviewedAt = await supabase
      .from('teacher_applications')
      .update({ status: decision, reviewed_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    const updateResult = updateWithReviewedAt.error
      ? await supabase
        .from('teacher_applications')
        .update({ status: decision })
        .eq('id', applicationId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      : updateWithReviewedAt

    const { data, error } = updateResult
    if (error) {
      setMessage(`Xəta: ${error.message}`)
      return
    }

    if (!data) {
      setMessage('Xəta: təsdiq gözləyən müraciət tapılmadı.')
      loadData()
      return
    }

    if (!error && decision === 'approved' && application?.user_id) {
      const fullName = `${application.name || ''} ${application.surname || ''}`.trim()
      const { error: profileUpdateError } = await supabase.from('profiles').upsert({
        user_id: application.user_id,
        full_name: fullName || application.email,
        role: 'instructor',
      })

      setMessage(profileUpdateError ? `Müraciət təsdiqləndi, amma profil rolu yenilənmədi: ${profileUpdateError.message}` : 'Müəllim müraciəti təsdiqləndi.')
      loadData()
      return
    }

    setMessage(decision === 'approved' ? 'Müəllim müraciəti təsdiqləndi.' : 'Müraciət rədd edildi.')
    loadData()
  }

  if (!canAdmin) {
    return (
      <div className="page centered-page">
        <div className="empty-box compact">Bu səhifəyə giriş icazəniz yoxdur.</div>
      </div>
    )
  }

  const reviewCourses = courses.filter((course) => !course.is_published)
  const approvedCourses = courses.filter((course) => course.is_published)
  const courseLabel = (course) => {
    if (!course) return ''
    const instructorName = getCourseAuthorName(course)
    return `${course.title}${instructorName ? ` · Müəllim: ${instructorName}` : ''}`
  }
  const usersByKey = new Map()
  profiles.forEach((item) => {
    if (usersByKey.has(item.user_id)) return
    usersByKey.set(item.user_id, {
      id: item.user_id,
      name: item.full_name || '-',
      role: item.role === 'instructor' ? 'Müəllim' : item.role === 'student' ? 'Tələbə' : item.role || '-',
      source: 'Profil',
    })
  })
  courses.forEach((course) => {
    if (!course.instructor_id || usersByKey.has(course.instructor_id)) return
    usersByKey.set(course.instructor_id, {
      id: course.instructor_id,
      name: course.instructor_id,
      role: 'Müəllim',
      source: 'Kurs müəllimi',
    })
  })
  enrollments.forEach((item) => {
    if (!item.user_id || usersByKey.has(item.user_id)) return
    usersByKey.set(item.user_id, {
      id: item.user_id,
      name: item.user_id,
      role: 'Tələbə',
      source: 'Giriş',
    })
  })
  requests.forEach((item) => {
    const key = item.user_email || item.user_id
    if (!key || usersByKey.has(key)) return
    usersByKey.set(key, {
      id: key,
      name: item.user_name || item.user_email || item.user_id,
      role: 'Tələbə',
      source: 'Sorğu',
    })
  })
  teacherApplications.forEach((application) => {
    if (application.status !== 'approved') return
    const key = application.email || application.user_id
    usersByKey.set(key, {
      id: key,
      name: `${application.name || ''} ${application.surname || ''}`.trim() || key,
      role: 'Müəllim',
      source: 'Müraciət',
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

  profiles.forEach((item) => {
    if (userRowsByKey.has(item.user_id)) return
    const application = approvedTeacherByUserId.get(item.user_id)
    const nameParts = application ? { name: application.name || '-', surname: application.surname || '-' } : splitFullName(item.full_name)
    upsertUserRow(item.user_id, {
      key: item.user_id,
      name: nameParts.name,
      surname: nameParts.surname,
      email: application?.email || item.user_id,
      phone: application?.phone || '-',
      role: item.role === 'instructor' || application ? 'Müəllim' : 'Tələbə',
      signedUpAt: null,
      teacherApprovedAt: application?.reviewed_at || application?.created_at || null,
    })
  })

  approvedTeacherApplications.forEach((application) => {
    const key = application.user_id || application.email
    upsertUserRow(key, {
      key,
      name: application.name || '-',
      surname: application.surname || '-',
      email: application.email || '-',
      phone: application.phone || '-',
      role: 'Müəllim',
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
      role: 'Tələbə',
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
      role: 'Tələbə',
      signedUpAt: null,
      teacherApprovedAt: null,
    })
  })

  const visibleUsers = Array.from(userRowsByKey.values()).sort((a, b) => {
    const aTime = a.signedUpAt ? new Date(a.signedUpAt).getTime() : 0
    const bTime = b.signedUpAt ? new Date(b.signedUpAt).getTime() : 0
    return bTime - aTime
  })
  const instructors = visibleUsers.filter((item) => item.role === 'Müəllim')
  const students = visibleUsers.filter((item) => item.role === 'Tələbə')
  const userStats = [
    ['Tələbələr', students.length],
    ['Müəllimlər', instructors.length],
    ['Ümumi istifadəçi', visibleUsers.length],
  ]
  const pendingTeacherApplications = teacherApplications.filter((application) => application.status === 'pending')
  const adminTabs = [
    ['pending', 'Təsdiq gözləyən kurslar', reviewCourses.length],
    ['teacher-applications', 'Təsdiq gözləyən müəllimlər', pendingTeacherApplications.length],
    ['access', 'Giriş ver', enrollments.length],
    ['users', 'İstifadəçi Sayı', visibleUsers.length],
    ['courses', 'Təsdiqlənmiş kurslar', approvedCourses.length],
  ]

  return (
    <div className="page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="admin-layout">
        <aside className="admin-sidebar">
          <h1>Admin Paneli</h1>
          {adminTabs.map(([id, label, count]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => {
              setMessage('')
              setActiveTab(id)
            }}>
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </aside>

        <section className="admin-content">
          {message && <div className="notice-box">{message}</div>}

          {activeTab === 'pending' && (
            <div className="panel-card">
              <h2>Təsdiq gözləyən kurslar</h2>
              {reviewCourses.length === 0 ? <p className="muted">Hazırda təsdiq gözləyən kurs yoxdur.</p> : reviewCourses.map((course, index) => {
                const instructorName = getCourseAuthorName(course)

                return (
                  <div key={course.id} className="admin-row">
                    <button className="admin-row-main" type="button" onClick={() => navigate(`/course/${course.id}`, { state: { course } })}>
                      <strong>{index + 1}. {course.title}</strong>
                      {instructorName && <p>Müəllim: {instructorName}</p>}
                      <p>{course.price} AZN · Gözləyir</p>
                    </button>
                    <div>
                      <button className="approve-button" onClick={() => approveCourse(course.id)}>Təsdiqlə</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'access' && (
            <>
              <div className="panel-card form-panel">
                <h2>Ödənişdən sonra giriş ver</h2>
                <label>Tələbə e-poçtu</label>
                <input type="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} placeholder="telebe@example.com" />
                <label>Kurs</label>
                <select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
                  <option value="">Kurs seçin</option>
                  {approvedCourses.map((course) => {
                    const instructorName = getCourseAuthorName(course)
                    return <option key={course.id} value={course.id}>{course.title}{instructorName ? ` - ${instructorName}` : ''} - {course.price} AZN</option>
                  })}
                </select>
                <button className="primary-button full" onClick={giveAccess}>Giriş ver</button>
              </div>
              <div className="panel-card">
                <h2>Verilmiş girişlər</h2>
                {enrollments.map((item) => (
                  <div key={item.id} className="admin-row">
                    <span>{item.user_id} · {courseLabel(courses.find((course) => course.id === item.course_id)) || item.course_id}</span>
                    <button className="danger-button" onClick={() => removeAccess(item.id)}>Ləğv et</button>
                  </div>
                ))}
              </div>
              <div className="panel-card">
                <h2>WhatsApp sorğuları</h2>
                {requests.length === 0 ? <p className="muted">Sorğu yoxdur.</p> : requests.map((item) => (
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
              <h2>Təsdiq gözləyən müəllimlər</h2>
              {pendingTeacherApplications.length === 0 ? <p className="muted">Hazırda təsdiq gözləyən müəllim müraciəti yoxdur.</p> : pendingTeacherApplications.map((application, index) => (
                <div key={application.id} className="admin-row">
                  <div>
                    <strong>{index + 1}. {application.name} {application.surname}</strong>
                    <p>{application.email} · {application.phone}</p>
                  </div>
                  <div>
                    <button className="approve-button" onClick={() => reviewTeacherApplication(application.id, 'approved')}>Təsdiqlə</button>
                    <button className="danger-button" onClick={() => reviewTeacherApplication(application.id, 'rejected')}>Rədd et</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="panel-card table-wrap">
              <h2>İstifadəçi Sayı</h2>
              <table>
                <thead><tr><th>İstifadəçi tipi</th><th>Sayı</th></tr></thead>
                <tbody>{userStats.map(([label, count]) => <tr key={label}><td>{label}</td><td>{count}</td></tr>)}</tbody>
              </table>
              <table className="user-detail-table">
                <thead>
                  <tr>
                    <th>Sıra</th>
                    <th>Rol</th>
                    <th>Ad</th>
                    <th>Soyad</th>
                    <th>E-poçt</th>
                    <th>Telefon</th>
                    <th>Qeydiyyat tarixi</th>
                    <th>Müəllim olduğu tarix</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((item, index) => (
                    <tr key={item.key || item.email || index}>
                      <td>{index + 1}</td>
                      <td>{item.role}</td>
                      <td>{item.name}</td>
                      <td>{item.surname}</td>
                      <td>{item.email}</td>
                      <td>{item.phone}</td>
                      <td>{formatDateTime(item.signedUpAt)}</td>
                      <td>{formatDateTime(item.teacherApprovedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="panel-card table-wrap">
              <h2>Təsdiqlənmiş kurslar</h2>
              <table>
                <thead><tr><th>Sıra</th><th>Kurs</th><th>Müəllim</th><th>Qiymət</th><th>Vəziyyət</th><th>Girişlər</th><th>Əməl</th></tr></thead>
                <tbody>{approvedCourses.map((course, index) => (
                  <tr key={course.id}>
                    <td>{index + 1}</td>
                    <td>{course.title}</td>
                    <td>{getCourseAuthorName(course) || '-'}</td>
                    <td>{course.price} AZN</td>
                    <td>{course.is_published ? 'Təsdiqlənib' : 'Gözləyir'}</td>
                    <td>{enrollments.filter((item) => item.course_id === course.id).length}</td>
                    <td>
                      {course.is_published ? (
                        <button className="danger-button" onClick={() => rejectCourse(course.id)}>Gözləməyə qaytar</button>
                      ) : (
                        <button className="approve-button" onClick={() => approveCourse(course.id)}>Təsdiqlə</button>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default AdminDashboard
