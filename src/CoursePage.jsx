import { useNavigate, useLocation } from 'react-router-dom'

function CoursePage({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const course = location.state?.course

  if (!course) {
    navigate('/')
    return null
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", minHeight: '100vh', background: '#fff' }}>
      
      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', borderBottom: '1px solid #d1d7dc', position: 'sticky', top: 0, zIndex: 100 }}>
        <h1 onClick={() => navigate('/')} style={{ color: '#1435c3', margin: 0, fontSize: '22px', fontWeight: '700', cursor: 'pointer' }}>Bil-X</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {user ? (
            <span onClick={() => navigate('/profile')} style={{ color: '#1c1d1f', cursor: 'pointer', fontSize: '14px' }}>Salam, {user.user_metadata?.full_name?.split(' ')[0]}!</span>
          ) : (
            <>
              <button onClick={() => navigate('/login')} style={{ background: 'transparent', color: '#1c1d1f', border: '1px solid #1c1d1f', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Giriş</button>
              <button onClick={() => navigate('/register')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Qeydiyyat</button>
            </>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>

        {/* COURSE HEADER */}
        <div style={{ border: '1px solid #d1d7dc', borderRadius: '4px', padding: '32px', marginBottom: '24px' }}>
          <div style={{ background: '#e0e8ff', height: '200px', borderRadius: '4px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>📚</div>
          <h2 style={{ margin: '0 0 12px', fontSize: '28px', fontWeight: '700', color: '#1c1d1f' }}>{course.title}</h2>
          <p style={{ margin: '0 0 16px', color: '#4a4a4a', fontSize: '15px', lineHeight: '1.6' }}>{course.description}</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ background: '#f0f4ff', padding: '6px 14px', borderRadius: '100px', color: '#1435c3', fontSize: '13px', fontWeight: '600' }}>Ömürlük giriş</span>
            <span style={{ background: '#f0f4ff', padding: '6px 14px', borderRadius: '100px', color: '#1435c3', fontSize: '13px', fontWeight: '600' }}>Video dərs</span>
          </div>
        </div>

        {/* VIDEO PREVIEW */}
        {course.video_url && (
          <div style={{ border: '1px solid #d1d7dc', borderRadius: '4px', padding: '32px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: '#1c1d1f' }}>Kurs nümunəsi</h3>
            <video controls style={{ width: '100%', borderRadius: '4px' }} src={course.video_url}>
              Brauzeriniz video dəstəkləmir.
            </video>
          </div>
        )}

        {/* PAYMENT */}
        <div style={{ border: '2px solid #1435c3', borderRadius: '4px', padding: '32px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: '#1c1d1f' }}>Kursu al</h3>
          <p style={{ margin: '0 0 24px', fontSize: '36px', fontWeight: '700', color: '#1435c3' }}>{course.price} AZN</p>
          <p style={{ margin: '0 0 16px', color: '#4a4a4a', fontSize: '14px' }}>Aşağıdakı karta ödəniş edin və ekran görüntüsünü WhatsApp-a göndərin:</p>
          <div style={{ background: '#f7f9fa', padding: '20px', borderRadius: '4px', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 8px', color: '#1c1d1f', fontSize: '14px' }}><strong>Kart nömrəsi:</strong> 4098584465826715</p>
            <p style={{ margin: '0 0 8px', color: '#1c1d1f', fontSize: '14px' }}><strong>Ad:</strong> Bil-X</p>
            <p style={{ margin: 0, color: '#1c1d1f', fontSize: '14px' }}><strong>WhatsApp:</strong> +994 55 383 91 18</p>
          </div>
          <p style={{ color: '#6a6f73', fontSize: '13px', margin: '0 0 16px' }}>Ödənişdən sonra 24 saat ərzində kursa giriş aktivləşdiriləcək.</p>
          {!user && (
            <button onClick={() => navigate('/register')} style={{ width: '100%', padding: '14px', background: '#1435c3', color: 'white', border: 'none', borderRadius: '4px', fontSize: '15px', cursor: 'pointer', fontWeight: '700' }}>
              Qeydiyyatdan keç və al
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CoursePage