import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminDashboard from './AdminDashboard'
import CertificatePage from './CertificatePage'
import CoursePage from './CoursePage'
import EditCourse from './EditCourse'
import InstructorDashboard from './InstructorDashboard'
import Inbox from './Inbox'
import Login from './Login'
import Navbar from './Navbar'
import Register from './Register'
import ResetPassword from './ResetPassword'
import StudentProfile from './StudentProfile'
import TeacherProfile from './TeacherProfile'
import { getWhatsAppUrl, WHATSAPP_PHONE_DISPLAY } from './contact'
import { attachCourseAuthorNames, getCourseAuthorName } from './courseAuthors'
import { useLanguage } from './i18n'
import { ensureProfile, fallbackProfile } from './profileApi'
import { supabase } from './supabase'

const HOME_STEPS = [
  ['1', 'step1Title', 'step1Text'],
  ['2', 'step2Title', 'step2Text'],
  ['3', 'step3Title', 'step3Text'],
]

const PROFILE_CACHE_KEY = 'bilx-profile-cache'

const UPCOMING_COURSES = [
  'Azərbaycan dili Abituriyent hazırlığı',
  'Riyaziyyat Abituriyent hazırlığı',
  'Fizika Abituriyent hazırlığı',
  'Kimya Abituriyent hazırlığı',
  'Biologiya Abituriyent hazırlığı',
  'Tarix Abituriyent hazırlığı',
  'Coğrafiya Abituriyent hazırlığı',
  'Ədəbiyyat Abituriyent hazırlığı',
  'İnformatika Abituriyent hazırlığı',
  'IELTS hazırlığı',
  'Magistratura hazırlığı',
  'Dövlət qulluğu hazırlığı',
  'SAT hazırlığı',
  'Rus dili danışıq dərsi',
  'Alman dili danışıq dərsi',
  'Çin dili danışıq dərsi',
  'Koreya dili danışıq dərsi',
  'Fransız dili danışıq dərsi',
].map((title, index) => ({
  id: `upcoming-${index + 1}`,
  title,
}))

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('az-AZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getNormalizedIndexMap(value) {
  const source = String(value || '')
  let normalized = ''
  const indexMap = []

  Array.from(source).forEach((character, sourceIndex) => {
    const normalizedCharacter = character
      .toLocaleLowerCase('az-AZ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    Array.from(normalizedCharacter).forEach((nextCharacter) => {
      normalized += nextCharacter
      indexMap.push(sourceIndex)
    })
  })

  return { normalized, indexMap }
}

function HighlightedText({ text, query }) {
  const source = String(text || '')
  const normalizedQuery = normalizeSearchText(query).trim()
  if (!source || !normalizedQuery) return source

  const { normalized, indexMap } = getNormalizedIndexMap(source)
  const matchIndex = normalized.indexOf(normalizedQuery)
  if (matchIndex < 0) return source

  const matchStart = indexMap[matchIndex]
  const matchEnd = (indexMap[matchIndex + normalizedQuery.length - 1] ?? matchStart) + 1

  return (
    <>
      {source.slice(0, matchStart)}
      <mark className="course-search-highlight">{source.slice(matchStart, matchEnd)}</mark>
      {source.slice(matchEnd)}
    </>
  )
}

function getPageTitle(pathname) {
  if (pathname === '/') return 'BilX | Onlayn video kurslar'
  if (pathname === '/login') return 'BilX | Giriş'
  if (pathname === '/register') return 'BilX | Qeydiyyat'
  if (pathname === '/reset-password') return 'BilX | Şifrə yeniləmə'
  if (pathname === '/admin') return 'BilX | Admin paneli'
  if (pathname === '/profile') return 'BilX | Tələbə paneli'
  if (pathname === '/instructor') return 'BilX | Müəllim paneli'
  if (pathname === '/inbox') return 'BilX | Inbox'
  if (pathname.startsWith('/teacher')) return 'BilX | Müəllim'
  if (pathname.startsWith('/course')) return 'BilX | Kurs'
  if (pathname.startsWith('/certificate')) return 'BilX | Sertifikat'
  if (pathname.startsWith('/edit-course')) return 'BilX | Kursu redaktə et'
  return 'BilX'
}

function readCachedProfile(user) {
  if (!user) return null

  try {
    const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null')
    return cached?.user_id === user.id ? cached : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile) {
  if (!profile?.user_id) return
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
}

function Home({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const courseRowRef = useRef(null)
  const coursesRef = useRef(null)
  const dragState = useRef({ down: false, startX: 0, scrollLeft: 0, moved: false })
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadCourses() {
      const { data } = await supabase
        .from('Courses')
        .select('*')
        .eq('is_published', true)
        .order('id', { ascending: false })

      const list = data || []
      // Show courses immediately — they already carry instructor_name. Only do
      // the extra profiles lookup (and re-render) if some names are missing.
      if (mounted) {
        setCourses(list)
        setLoadingCourses(false)
      }
      if (list.some((course) => !getCourseAuthorName(course))) {
        const enriched = await attachCourseAuthorNames(list)
        if (mounted) setCourses(enriched)
      }
    }

    loadCourses()
    return () => {
      mounted = false
    }
  }, [])

  // Reveal-on-scroll motion (disabled gracefully where unsupported / reduced-motion).
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.reveal:not(.in)'))
    if (elements.length === 0) return undefined
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('in'))
      return undefined
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [loadingCourses, courses.length])

  useEffect(() => {
    if (loadingCourses || !search.trim()) return undefined
    const timeoutId = window.setTimeout(() => {
      coursesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => window.clearTimeout(timeoutId)
  }, [loadingCourses, search])

  const normalizedSearch = normalizeSearchText(search)
  const searchIsActive = Boolean(search.trim())
  const filteredCourses = courses.filter((course) =>
    normalizeSearchText(`${course.title || ''} ${course.description || ''}`).includes(normalizedSearch)
  )
  const filteredUpcomingCourses = UPCOMING_COURSES.filter((course) =>
    normalizeSearchText(course.title).includes(normalizedSearch)
  )
  const visibleUpcomingCourses = searchIsActive ? filteredUpcomingCourses : UPCOMING_COURSES
  const hasVisibleCourses = filteredCourses.length > 0 || visibleUpcomingCourses.length > 0
  // Only highlight a "Featured" shelf when there are enough courses for it to be
  // meaningful — otherwise it just repeats the grid. Hidden while searching.
  const showFeatured = !searchIsActive && filteredCourses.length > 6
  const featuredCourses = filteredCourses.slice(0, 8)

  const scrollCourses = (direction) => {
    courseRowRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' })
  }
  const scrollToCourses = () => coursesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const goTeach = () => navigate(user ? '/instructor' : '/register')
  const openCourse = (course) => navigate(`/course/${course.id}`, { state: { course } })
  const openTeacher = (event, teacherId) => {
    event.stopPropagation()
    if (teacherId) navigate(`/teacher/${teacherId}`)
  }
  const openCourseWhatsApp = async (event, course) => {
    event.stopPropagation()
    if (user) {
      await supabase.from('requests').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: profile?.full_name || user.user_metadata?.full_name || user.email,
        course_id: course.id,
        course_name: course.title,
        status: 'pending',
      })
    }
    const message = `${t('whatsappHello')} ${t('whatsappInterested').replace('{title}', course.title)}\n\n${t('whatsappName')}: ${profile?.full_name || user?.user_metadata?.full_name || ''}\n${t('whatsappEmail')}: ${user?.email || ''}`
    window.open(getWhatsAppUrl(message), '_blank')
  }
  const onCourseKeyDown = (event, course) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openCourse(course)
    }
  }

  // Drag-to-scroll the featured row with a mouse (touch uses native scrolling).
  const onRowPointerDown = (event) => {
    if (event.pointerType !== 'mouse') return
    const el = courseRowRef.current
    if (!el) return
    dragState.current = { down: true, startX: event.pageX, scrollLeft: el.scrollLeft, moved: false }
  }
  const onRowPointerMove = (event) => {
    if (event.pointerType !== 'mouse' || !dragState.current.down) return
    const el = courseRowRef.current
    if (!el) return
    const dx = event.pageX - dragState.current.startX
    if (Math.abs(dx) > 4) dragState.current.moved = true
    el.scrollLeft = dragState.current.scrollLeft - dx
  }
  const endRowDrag = () => {
    dragState.current.down = false
  }
  const openFeatured = (course) => {
    // Ignore the click that ends a drag so dragging doesn't navigate.
    if (dragState.current.moved) return
    openCourse(course)
  }

  return (
    <div className="page">
      <Navbar
        user={user}
        profile={profile}
        search={search}
        onSearchChange={setSearch}
        onLogout={handleLogout}
      />

      <section className="home-hero">
        <span className="home-hero-grid" aria-hidden="true" />
        <span className="home-hero-blob blob-1" aria-hidden="true" />
        <span className="home-hero-blob blob-2" aria-hidden="true" />
        <div className="home-hero-content reveal">
          <span className="home-hero-badge">{t('heroBadge')}</span>
          <h1>{t('homeHeroTitle')}</h1>
          <p>{t('homeHeroSubtitle')}</p>
          <div className="home-hero-cta">
            <button className="primary-button large" onClick={scrollToCourses}>{t('heroBrowse')} →</button>
            <button className="outline-button large" onClick={goTeach}>{t('heroBecomeInstructor')}</button>
          </div>
          <div className="home-hero-stats">
            <div><strong>{courses.length + UPCOMING_COURSES.length}+</strong><span>{t('coursesTitle')}</span></div>
            <div><strong>∞</strong><span>{t('valueAccessTitle')}</span></div>
            <div><strong>★</strong><span>{t('valueVideoTitle')}</span></div>
            <div><strong>✓</strong><span>{t('valueDeviceTitle')}</span></div>
          </div>
          <div className="home-hero-next-step" aria-label={t('homeHeroNextStep')}>
            <span className="home-hero-next-step-track" aria-hidden="true">
              <span>{t('homeHeroNextStep')}</span>
              <span>{t('homeHeroNextStep')}</span>
            </span>
          </div>
        </div>
      </section>

      <main className="content-shell" ref={coursesRef}>
        {loadingCourses ? (
          <section className="home-course-section" aria-label={t('coursesTitle')} aria-busy="true">
            <div className="home-course-header">
              <h2>{t('featuredTitle')}</h2>
            </div>
            <div className="home-course-row">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="home-course-card skeleton-card">
                  <div className="skeleton skeleton-thumb" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          </section>
        ) : !hasVisibleCourses ? (
          <section className="home-course-section" aria-label={t('coursesTitle')}>
            <div className="home-course-header">
              <h2>{t('coursesTitle')}</h2>
            </div>
            <p className="search-empty">{search.trim() ? t('noSearchResults') : t('noPublicCourses')}</p>
          </section>
        ) : (
          <>
            {showFeatured && (
            <section className="home-course-section reveal" aria-label={t('featuredTitle')}>
              <div className="home-course-header">
                <h2>{t('featuredTitle')}</h2>
                <div className="home-course-arrows">
                  <button type="button" aria-label={t('scrollLeft')} onClick={() => scrollCourses(-1)}>←</button>
                  <button type="button" aria-label={t('scrollRight')} onClick={() => scrollCourses(1)}>→</button>
                </div>
              </div>

              <div className="home-course-carousel">
                <button className="home-course-side-arrow left" type="button" aria-label={t('scrollLeft')} onClick={() => scrollCourses(-1)}>←</button>
                <div
                  className="home-course-row is-draggable"
                  ref={courseRowRef}
                  onPointerDown={onRowPointerDown}
                  onPointerMove={onRowPointerMove}
                  onPointerUp={endRowDrag}
                  onPointerLeave={endRowDrag}
                >
                  {featuredCourses.map((course) => {
                    const instructorName = getCourseAuthorName(course)
                    const hasThumbnail = Boolean(course.thumbnail_url)

                    return (
                      <article
                        key={course.id}
                        className="home-course-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => openFeatured(course)}
                        onKeyDown={(event) => onCourseKeyDown(event, course)}
                      >
                        {hasThumbnail ? (
                          <img className="home-course-thumb" src={course.thumbnail_url} alt={course.title} draggable={false} />
                        ) : (
                          <div className="home-course-thumb home-course-thumb-empty" aria-hidden="true">📚</div>
                        )}
                        <div className="home-course-card-body">
                          <h3>{course.title}</h3>
                          {instructorName && (
                            <button className="teacher-profile-link home-course-instructor" type="button" onClick={(event) => openTeacher(event, course.instructor_id)}>
                              {instructorName}
                            </button>
                          )}
                          <div className="course-card-footer">
                            <strong className="home-course-price course-card-price">{Number(course.price) > 0 ? `${course.price} AZN` : t('freeLabel')}</strong>
                            <button className="course-card-whatsapp-button" type="button" onClick={(event) => openCourseWhatsApp(event, course)}>
                              <MessageCircle size={16} /> {t('courseAcquire')}
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <button className="home-course-side-arrow right" type="button" aria-label={t('scrollRight')} onClick={() => scrollCourses(1)}>→</button>
              </div>
            </section>
            )}

            <section className={searchIsActive ? 'home-grid-section in' : 'home-grid-section reveal'} aria-label={t('allCoursesTitle')}>
              <div className="section-heading">
                <h2>{showFeatured ? t('allCoursesTitle') : t('coursesTitle')}</h2>
                <p>{t('allCoursesSubtitle')}</p>
              </div>
              <div className="course-grid">
                {filteredCourses.map((course) => {
                  const instructorName = getCourseAuthorName(course)

                  return (
                    <article
                      key={course.id}
                      className="course-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => openCourse(course)}
                      onKeyDown={(event) => onCourseKeyDown(event, course)}
                    >
                      <img src={course.thumbnail_url || '/course-placeholder.svg'} alt={course.title} />
                      <div className="course-card-body">
                        <h3><HighlightedText text={course.title} query={search} /></h3>
                        {course.description && <p><HighlightedText text={course.description} query={search} /></p>}
                        {instructorName && (
                          <button className="teacher-profile-link course-instructor" type="button" onClick={(event) => openTeacher(event, course.instructor_id)}>
                            {instructorName}
                          </button>
                        )}
                        <div className="course-card-footer">
                          <strong className="course-card-price">{Number(course.price) > 0 ? `${course.price} AZN` : t('freeLabel')}</strong>
                          <button className="course-card-whatsapp-button" type="button" onClick={(event) => openCourseWhatsApp(event, course)}>
                            <MessageCircle size={16} /> {t('courseAcquire')}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
                {visibleUpcomingCourses.map((course) => (
                  <article
                    key={course.id}
                    className="course-card upcoming-course-card"
                    aria-label={`${course.title} - ${t('upcomingCourseLabel')}`}
                  >
                    <div className="course-card-upcoming-thumb" aria-hidden="true">
                      <span>{course.title.charAt(0)}</span>
                    </div>
                    <div className="course-card-body">
                      <h3><HighlightedText text={course.title} query={search} /></h3>
                      <p><HighlightedText text={t('upcomingCourseText')} query={search} /></p>
                      <span className="upcoming-course-badge">{t('upcomingCourseLabel')}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="home-how reveal">
          <h2>{t('howItWorksTitle')}</h2>
          <div className="home-how-steps">
            {HOME_STEPS.map(([num, titleKey, textKey]) => (
              <div className="home-how-step" key={num}>
                <span className="home-how-num">{num}</span>
                <strong>{t(titleKey)}</strong>
                <p>{t(textKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-teach-band reveal">
          <div>
            <h2>{t('instructorBandTitle')}</h2>
            <p>{t('instructorBandText')}</p>
          </div>
          <button className="primary-button large" onClick={goTeach}>{t('heroBecomeInstructor')}</button>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <strong>BilX</strong>
            <p>{t('footerTagline')}</p>
          </div>
          <div className="home-footer-col">
            <h4>{t('footerLinksTitle')}</h4>
            <button type="button" onClick={scrollToCourses}>{t('coursesTitle')}</button>
            <button type="button" onClick={() => navigate('/login')}>{t('login')}</button>
            <button type="button" onClick={() => navigate('/register')}>{t('register')}</button>
          </div>
          <div className="home-footer-col">
            <h4>{t('footerContactTitle')}</h4>
            <a href={getWhatsAppUrl()} target="_blank" rel="noreferrer">WhatsApp: {WHATSAPP_PHONE_DISPLAY}</a>
          </div>
        </div>
        <div className="home-footer-bottom">{t('footerRights')}</div>
      </footer>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()

  useEffect(() => {
    document.title = getPageTitle(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user || null
      if (!mounted) return
      const cachedProfile = readCachedProfile(currentUser)
      if (cachedProfile) setProfile(cachedProfile)
      setUser(currentUser)
    }

    loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (loggingOut) return
      const currentUser = session?.user || null
      const cachedProfile = readCachedProfile(currentUser)
      if (cachedProfile) setProfile(cachedProfile)
      setUser(currentUser)
      if (!currentUser) {
        localStorage.removeItem(PROFILE_CACHE_KEY)
        setProfile(null)
      }
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })

    const refreshProfile = () => {
      const currentUser = supabase.auth.getUser().then(({ data }) => {
        if (!mounted || loggingOut || !data.user) return
        setUser(data.user)
        ensureProfile(data.user).then((nextProfile) => {
          if (!mounted) return
          const resolvedProfile = nextProfile || fallbackProfile(data.user)
          writeCachedProfile(resolvedProfile)
          setProfile(resolvedProfile)
        })
      })
      return currentUser
    }

    window.addEventListener('focus', refreshProfile)
    const handleProfileUpdated = (event) => {
      if (!mounted || !event.detail) return
      setProfile((current) => {
        const nextProfile = { ...current, ...event.detail }
        writeCachedProfile(nextProfile)
        return nextProfile
      })
    }
    window.addEventListener('bilx-profile-updated', handleProfileUpdated)

    return () => {
      mounted = false
      window.removeEventListener('focus', refreshProfile)
      window.removeEventListener('bilx-profile-updated', handleProfileUpdated)
      listener.subscription.unsubscribe()
    }
  }, [loggingOut, navigate])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (!user || loggingOut) {
        setProfile(null)
        return
      }

      try {
        const nextProfile = await ensureProfile(user)
        if (mounted) {
          const resolvedProfile = nextProfile || fallbackProfile(user)
          writeCachedProfile(resolvedProfile)
          setProfile(resolvedProfile)
        }
      } catch (error) {
        console.error('Could not load profile:', error)
        if (mounted) {
          const resolvedProfile = fallbackProfile(user)
          writeCachedProfile(resolvedProfile)
          setProfile(resolvedProfile)
        }
      }
    }

    loadProfile()

    return () => {
      mounted = false
    }
  }, [user, loggingOut])

  // Single active session: if this device's stored token no longer matches the
  // one in the database (because the account logged in elsewhere), log out.
  useEffect(() => {
    if (!user) return undefined
    let active = true

    const kick = () => {
      if (!active) return
      active = false
      localStorage.removeItem('bilx-session-token')
      localStorage.removeItem('bilx-session-at')
      localStorage.removeItem(PROFILE_CACHE_KEY)
      // Local scope: this device only — must NOT revoke the new device's session.
      supabase.auth.signOut({ scope: 'local' }).finally(() => {
        setUser(null)
        setProfile(null)
        navigate('/login', { replace: true })
        toast.error(t('sessionKicked'))
      })
    }

    const enforce = (dbToken) => {
      // Don't kick during the post-login grace window — the token is still
      // settling, and the device that just logged in must not kick itself.
      const setAt = Number(localStorage.getItem('bilx-session-at') || 0)
      if (Date.now() - setAt < 8000) return
      const myToken = localStorage.getItem('bilx-session-token')
      if (dbToken && myToken && dbToken !== myToken) kick()
    }

    const check = async () => {
      const { data } = await supabase
        .from('user_sessions')
        .select('session_token')
        .eq('user_id', user.id)
        .maybeSingle()
      if (active) enforce(data?.session_token)
    }

    // Heartbeat: keep last_active fresh, scoped to this device's token so a
    // kicked device (token no longer matches) writes nothing.
    const heartbeat = async () => {
      const myToken = localStorage.getItem('bilx-session-token')
      if (!myToken || !active) return
      await supabase
        .from('user_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('session_token', myToken)
    }

    check()
    heartbeat()
    const heartbeatTimer = setInterval(heartbeat, 120000)
    const onFocus = () => {
      check()
      heartbeat()
    }
    window.addEventListener('focus', onFocus)

    const channel = supabase
      .channel(`session-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => enforce(payload.new?.session_token)
      )
      .subscribe()

    return () => {
      active = false
      clearInterval(heartbeatTimer)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [user, navigate, t])

  const handleLogout = async () => {
    setLoggingOut(true)
    localStorage.removeItem('bilx-session-token')
    localStorage.removeItem('bilx-session-at')
    localStorage.removeItem(PROFILE_CACHE_KEY)
    // Local scope: log out only this device, not the account's other sessions.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      console.error('Could not sign out from Supabase:', error)
    }
    setUser(null)
    setProfile(null)
    navigate('/', { replace: true })
    if (!error) toast.success(t('loggedOut'))
    setTimeout(() => setLoggingOut(false), 300)
  }

  return (
    <Routes>
      <Route path="/" element={<Home user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin" element={<AdminDashboard user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/profile" element={<StudentProfile user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/course" element={<CoursePage user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/course/:id" element={<CoursePage user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/certificate/:code" element={<CertificatePage user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/teacher/:id" element={<TeacherProfile user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/instructor" element={<InstructorDashboard user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/inbox" element={<Inbox user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/edit-course" element={<EditCourse user={user} profile={profile} handleLogout={handleLogout} />} />
      <Route path="/edit-course/:id" element={<EditCourse user={user} profile={profile} handleLogout={handleLogout} />} />
    </Routes>
  )
}

export default App
