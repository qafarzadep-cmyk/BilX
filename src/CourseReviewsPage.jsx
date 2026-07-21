import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from './Navbar'
import { supabase } from './supabase'

export default function CourseReviewsPage({ user, profile, handleLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [summary, setSummary] = useState({ average: null, count: 0 })
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
      setSummary(nextSummary || { average: null, count: 0 })
      setReviews(reviewResult?.reviews || [])
    }).catch(() => {})
    return () => { active = false }
  }, [id])

  const allReviews = useMemo(() => [
    ...reviews.filter((review) => review.review).map((review) => ({ name: review.author, rating: review.rating, dateLabel: new Date(review.createdAt).toLocaleDateString('az-AZ'), text: review.review })),
  ].filter((review) => `${review.name} ${review.text}`.toLocaleLowerCase('az-AZ').includes(search.trim().toLocaleLowerCase('az-AZ'))), [reviews, search])

  const distribution = useMemo(() => [5, 4, 3, 2, 1].map((stars) => {
    const matching = reviews.filter((review) => Number(review.rating) === stars).length
    return { stars, percent: reviews.length ? Math.round((matching / reviews.length) * 100) : 0 }
  }), [reviews])

  return (
    <div className="page course-reviews-page">
      <Navbar user={user} profile={profile} onLogout={handleLogout} />
      <main className="reviews-page-shell">
        <button className="reviews-page-back" type="button" onClick={() => navigate(`/course/${id}`)}><ArrowLeft size={19} /> Kursa qayıt</button>
        <p className="reviews-page-course-name">{course?.title || 'Kurs'}</p>
        <h1>{summary.count > 0 ? <><span aria-hidden="true">★</span> {summary.average} kurs reytinqi <b>•</b> {summary.count} tələbə rəyi</> : 'Hələ tələbə rəyi yoxdur'}</h1>
        <div className="reviews-page-layout">
          <aside className="reviews-page-filters">
            {distribution.map((row) => <div className="rating-distribution-row" key={row.stars}><span className="rating-distribution-track"><i style={{ width: `${row.percent}%` }} /></span><span className="rating-distribution-stars">{'★'.repeat(row.stars)}{'☆'.repeat(5 - row.stars)}</span><strong>{row.percent}%</strong></div>)}
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
