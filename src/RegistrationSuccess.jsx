import { CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { useLanguage } from './i18n'

function RegistrationSuccess({ user, profile, handleLogout }) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const chooseCourse = () => {
    const purchaseReturn = localStorage.getItem('bilx-purchase-return')
    if (purchaseReturn) localStorage.removeItem('bilx-purchase-return')
    navigate(purchaseReturn || '/', { replace: true })
  }

  return (
    <div className="page auth-page-soft">
      <Navbar user={user} profile={profile} handleLogout={handleLogout} />
      <main className="auth-shell">
        <section className="auth-card-clean registration-success-card" aria-live="polite">
          <span className="registration-success-icon"><CheckCircle2 size={42} /></span>
          <p className="auth-kicker">BilX</p>
          <h1>{t('registrationSuccessTitle')}</h1>
          <p className="auth-subtitle">{t('registrationSuccessText')}</p>
          <button className="primary-button full" type="button" onClick={chooseCourse}>
            {t('registrationSuccessAction')}
          </button>
        </section>
      </main>
    </div>
  )
}

export default RegistrationSuccess
