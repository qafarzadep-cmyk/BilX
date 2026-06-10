import { useEffect, useState } from 'react'
import { Award, Printer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from './Navbar'
import { useLanguage } from './i18n'
import { supabase } from './supabase'

function CertificatePage({ user, profile, handleLogout }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [certificate, setCertificate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadCertificate() {
      const { data } = await supabase.rpc('verify_certificate', { p_code: code })
      if (mounted) {
        setCertificate(data?.[0] || null)
        setLoading(false)
      }
    }

    loadCertificate()
    return () => {
      mounted = false
    }
  }, [code])

  return (
    <div className="page certificate-page">
      <div className="certificate-navigation">
        <Navbar user={user} profile={profile} onLogout={handleLogout} />
      </div>
      <main className="certificate-shell">
        {loading ? (
          <div className="panel-card">{t('loading')}</div>
        ) : !certificate ? (
          <div className="panel-card certificate-missing">
            <h1>{t('certificateNotFound')}</h1>
            <button className="primary-button" onClick={() => navigate('/')}>{t('backHome')}</button>
          </div>
        ) : (
          <>
            <article className="certificate-document">
              <div className="certificate-border">
                <div className="certificate-logo">BilX</div>
                <Award className="certificate-award" size={58} />
                <p className="certificate-kicker">{t('certificateOfCompletion')}</p>
                <h1>{certificate.student_name}</h1>
                <p>{t('certificateCompleted')}</p>
                <h2>{certificate.course_title}</h2>
                {certificate.instructor_name && (
                  <p>{t('instructorLabel')}: <strong>{certificate.instructor_name}</strong></p>
                )}
                <div className="certificate-meta">
                  <span>{t('issuedOn')}: {new Date(certificate.issued_at).toLocaleDateString()}</span>
                  <span>{t('verificationCode')}: {certificate.verification_code}</span>
                </div>
              </div>
            </article>
            <div className="certificate-actions">
              <button className="outline-button" onClick={() => navigate(-1)}>{t('goBack')}</button>
              <button className="primary-button" onClick={() => window.print()}>
                <Printer size={17} /> {t('printCertificate')}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default CertificatePage
