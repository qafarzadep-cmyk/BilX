import { useNavigate } from 'react-router-dom'

function CoursePage({ user }) {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: 'Arial', minHeight: '100vh', background: '#f0f4ff' }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 onClick={() => navigate('/')} style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }}>BilX</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {user ? (
            <span onClick={() => navigate('/profile')} style={{ color: 'white', cursor: 'pointer', textDecoration: 'underline' }}>Salam, {user.user_metadata?.full_name}!</span>
          ) : (
            <>
              <button onClick={() => navigate('/login')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Giriş</button>
              <button onClick={() => navigate('/register')} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '8px 20px', borderRadius: '5px', marginLeft: '10px', cursor: 'pointer' }}>Qeydiyyat</button>
            </>
          )}
        </div>
      </nav>

      <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
        
        {/* COURSE HEADER */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          <div style={{ background: '#1435c3', height: '200px', borderRadius: '8px', marginBottom: '20px' }}></div>
          <h2 style={{ color: '#333', marginTop: 0 }}>IELTS Hazırlıq</h2>
          <p style={{ color: '#555' }}>Müəllim: <strong>Aytən Məmmədova</strong></p>
          <p style={{ color: '#555' }}>Bu kurs sizi IELTS imtahanına tam hazırlayır. Reading, Writing, Listening və Speaking bölmələri üzrə detallı dərslər daxildir.</p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
            <span style={{ background: '#f0f4ff', padding: '8px 15px', borderRadius: '20px', color: '#1435c3', fontSize: '14px' }}>40 dərs</span>
            <span style={{ background: '#f0f4ff', padding: '8px 15px', borderRadius: '20px', color: '#1435c3', fontSize: '14px' }}>Bütün səviyyələr</span>
            <span style={{ background: '#f0f4ff', padding: '8px 15px', borderRadius: '20px', color: '#1435c3', fontSize: '14px' }}>Ömürlük giriş</span>
          </div>
        </div>

        {/* CURRICULUM */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          <h3 style={{ color: '#333', marginTop: 0 }}>Dərs proqramı</h3>
          {[
            'Giriş və IELTS haqqında',
            'Reading - Əsas strategiyalar',
            'Reading - Mətn növləri',
            'Writing Task 1 - Qrafik təsviri',
            'Writing Task 2 - Esse yazımı',
            'Listening - Dinləmə texnikaları',
            'Speaking - Part 1, 2, 3',
            'Mock Test - Tam imtahan simulyasiyası',
          ].map((lesson, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ background: '#1435c3', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '15px', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ color: '#555' }}>🔒 {lesson}</span>
            </div>
          ))}
        </div>

        {/* PAYMENT */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: '2px solid #1435c3' }}>
          <h3 style={{ color: '#1435c3', marginTop: 0 }}>Kursu almaq üçün</h3>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#1435c3', margin: '0 0 20px' }}>60 AZN</p>
          <p style={{ color: '#555', marginBottom: '20px' }}>Aşağıdakı karta ödəniş edin və skrinşot göndərin:</p>
          <div style={{ background: '#f0f4ff', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 8px', color: '#333' }}><strong>Kart nömrəsi:</strong> 4098584465826715</p>
            <p style={{ margin: '0 0 8px', color: '#333' }}><strong>Ad:</strong> Parvin Qafarzada</p>
            <p style={{ margin: 0, color: '#333' }}><strong>WhatsApp:</strong> +994 55 383 91 18</p>
          </div>
          <p style={{ color: '#888', fontSize: '14px' }}>Ödənişdən sonra 24 saat ərzində kursa giriş aktivləşdiriləcək.</p>
          {!user && (
            <button onClick={() => navigate('/register')} style={{ width: '100%', padding: '15px', background: '#1435c3', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', marginTop: '15px' }}>
              Qeydiyyatdan keç və al
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CoursePage