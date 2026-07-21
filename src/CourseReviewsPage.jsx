import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from './Navbar'
import { supabase } from './supabase'

const LEGACY_REVIEWS = [
  { name: 'Sevinc Qasımova', rating: 5, dateLabel: '2 ay əvvəl', text: 'Pərvin müəllimədən 4 il əvvəl canlı dərs götürmüşdüm. Sıfır deyildim, amma bu kurs biliklərimi dərindən möhkəmlətməyə çox kömək etdi.' },
  { name: 'Məryəm İsmayıl', rating: 5, dateLabel: '1 ay əvvəl', text: 'Kurs çox yaxşı dizayn olunub. Mənim kimi qrammatikadan bezənlər üçün əla kursdur.' },
  { name: 'Rauf Həbibzadə', rating: 4, dateLabel: '3 həftə əvvəl', text: 'Mənim canlı dərs götürməyə vaxtım olmur. Kursu elə audio dərs kimi maşın sürə-sürə dinləyirəm. Təkrarlar cümlələri yadda saxlamağa çox kömək olur. Thank you, Parvin teacher. :)' },
  { name: 'Gözəl Salahova', rating: 5, dateLabel: '2 həftə əvvəl', text: 'Kursu bir həftəyə bitirdim :D A2 səviyyəsi nə vaxt çıxar? Səbirsizliklə gözləyirəm.' },
]

const RATING_DISTRIBUTION = [
  { stars: 5, percent: 67 }, { stars: 4, percent: 27 }, { stars: 3, percent: 4 }, { stars: 2, percent: 1 }, { stars: 1, percent: 1 },
]

export default function CourseReviewsPage({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [summary, setSummary] = useState({ average: 4.7, count: 38 })
  const [reviews, setReviews] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('courses').select('id,title').eq('id', id).maybeSingle(),
      fetch(`/api/course-access?reviews=1&courseId=${encodeURIComponent(id)}`).then((response) => response.ok ? response.json() : null),
    ]).then(([courseResult, reviewResult]) => {
      if (!active) return
      setCourse(courseResult.data || null)
      const nextSummary = reviewResult?.summaries?.[String(id)]
      if (nextSummary?.count) setSummary(nextSummary)
      setReviews((reviewResult?.reviews || []).filter((review) => review.review))
    }).catch(() => {})
    return () => { active = false }
  }, [id])

  const allReviews = useMemo(() => [
    ...(String(id) === '17' ? LEGACY_REVIEWS : []),
    ...reviews.map((review) => ({ name: review.author, rating: review.rating, dateLabel: new Date(review.createdAt).toLocaleDateString('az-AZ'), text: review.review })),
  ].filter((review) => `${review.name} ${review.text}`.toLocaleLowerCase('az-AZ').includes(search.trim().toLocaleLowerCase('az-AZ'))), [id, reviews, search])

  return (
    <div className="page course-reviews-page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="reviews-page-shell">
        <button className="reviews-page-back" type="button" onClick={() => navigate(`/course/${id}`)}><ArrowLeft size={19} /> Kursa qayıt</button>
        <p className="reviews-page-course-name">{course?.title || 'Kurs'}</p>
        <h1><span aria-hidden="true">★</span> {summary.average} kurs reytinqi <b>•</b> {summary.count} tələbə rəyi</h1>
        <div className="reviews-page-layout">
          <aside className="reviews-page-filters">
            {RATING_DISTRIBUTION.map((row) => <div className="rating-distribution-row" key={row.stars}><span className="rating-distribution-track"><i style={{ width: `${row.percent}%` }} /></span><span className="rating-distribution-stars">{'★'.repeat(row.stars)}{'☆'.repeat(5 - row.stars)}</span><strong>{row.percent}%</strong></div>)}
            <label className="reviews-page-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rəylərdə axtar" /><Search size={20} /></label>
          </aside>
          <section className="reviews-page-list" aria-label="Tələbə rəyləri">
            {allReviews.map((review, index) => <article className="reviews-page-item" key={`${review.name}-${index}`}><span className="reviews-modal-avatar">{review.name.charAt(0)}</span><div><strong>{review.name}</strong><div className="reviews-modal-meta"><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><small>{review.dateLabel}</small></div><p>{review.text}</p></div></article>)}
            {allReviews.length === 0 && <p className="muted">Axtarışa uyğun rəy tapılmadı.</p>}
          </section>
        </div>
      </main>
    </div>
  )
}
