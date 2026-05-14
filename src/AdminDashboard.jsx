import { useCallback, useEffect, useState } from 'react'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import Navbar from './Navbar'
import { isAdmin } from './profileApi'
import { supabase } from './supabase'

function AdminDashboard({ user, profile, handleLogout }) {
  const [courses, setCourses] = useState([])
  const [profiles, setProfiles] = useState([])
  const [authUsers, setAuthUsers] = useState([])
  const [teacherApplications, setTeacherApplications] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [studentEmail, setStudentEmail] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [message, setMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const canAdmin = isAdmin(user)

  const loadData = useCallback(async () => {
    const [
      { data: courseData, error: courseError },
      { data: profileData, error: profileError },
      { data: authUserData, error: authUserError },
      { data: teacherApplicationData, error: teacherApplicationError },
      { data: enrollmentData, error: enrollmentError },
      { data: requestData, error: requestError },
    ] = await Promise.all([
      supabase.from('Courses').select('*').order('id', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.rpc('admin_list_users'),
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
    setProfileError(profileError?.message || '')
    setAuthUsers(authUserError ? [] : authUserData || [])
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
    const { error } = await supabase.rpc('review_teacher_application', {
      app_id: applicationId,
      app_decision: decision,
    })

    setMessage(error ? `Xəta: ${error.message}` : '')
    if (!error) loadData()
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
  authUsers.forEach((item) => {
    usersByKey.set(item.user_id, {
      id: item.email || item.user_id,
      name: item.full_name || item.email || item.user_id,
      role: item.role === 'instructor' ? 'Müəllim' : 'Tələbə',
      source: 'Hesab',
    })
  })
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
  const visibleUsers = Array.from(usersByKey.values())
  const students = visibleUsers
  const instructors = visibleUsers.filter((item) => item.role === 'Müəllim' || item.role === 'instructor')
  const pendingTeacherApplications = teacherApplications.filter((application) => application.status === 'pending')
  const adminTabs = [
    ['pending', 'Təsdiq gözləyən kurslar', reviewCourses.length],
    ['teacher-applications', 'Təsdiq gözləyən müəllimlər', pendingTeacherApplications.length],
    ['access', 'Giriş ver', enrollments.length],
    ['students', 'Tələbələr', students.length],
    ['instructors', 'Müəllimlər', instructors.length],
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
                    <div>
                      <strong>{index + 1}. {course.title}</strong>
                      {instructorName && <p>Müəllim: {instructorName}</p>}
                      <p>{course.price} AZN · Gözləyir</p>
                    </div>
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

          {activeTab === 'students' && (
            <div className="panel-card table-wrap">
              <h2>Tələbələr</h2>
              <table>
                <thead><tr><th>Sıra</th><th>Ad</th><th>Rol</th><th>Mənbə</th><th>İstifadəçi / e-poçt</th></tr></thead>
                <tbody>{students.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.name}</td><td>{item.role}</td><td>{item.source}</td><td>{item.id}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {activeTab === 'instructors' && (
            <div className="panel-card table-wrap">
              <h2>Müəllimlər</h2>
              <table>
                <thead><tr><th>Sıra</th><th>Ad</th><th>Rol</th><th>Mənbə</th><th>İstifadəçi / e-poçt</th></tr></thead>
                <tbody>{instructors.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.name}</td><td>{item.role}</td><td>{item.source}</td><td>{item.id}</td></tr>)}</tbody>
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
