import { useNavigate } from 'react-router-dom'

function StudentProfile({ user }) {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", minHeight: '100vh', background: '#fff' }}>
      
      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', borderBottom: '1px solid #d1d7dc' }}>
        <h1 onClick={() => navigate('/')} style={{ color: '#1435c3', margin: 0, fontSize: '22px', fontWeight: '700', cursor: 'pointer' }}>Bil-X</h1>
        <button onClick={() => navigate('/instructor')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Müəllim kimi keç →</button>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>
        
        {/* PROFILE INFO */}
        <div style={{ border: '1px solid #d1d7dc', borderRadius: '4px', padding: '32px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#1435c3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: '700' }}>
              {user?.user_metadata?.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1c1d1f' }}>{user?.user_metadata?.full_name}</h2>
              <p style={{ margin: '4px 0 0', color: '#6a6f73', fontSize: '14px' }}>{user?.email}</p>
            </div>
          </div>
          <p style={{ margin: 0, color: '#6a6f73', fontSize: '13px' }}>Qeydiyyat tarixi: {new Date(user?.created_at).toLocaleDateString('az-AZ')}</p>
        </div>

        {/* MY COURSES */}
        <div style={{ border: '1px solid #d1d7dc', borderRadius: '4px', padding: '32px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: '#1c1d1f' }}>Mənim kurslarım</h3>
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6a6f73' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
            <p style={{ margin: '0 0 16px', fontSize: '15px' }}>Hələ heç bir kurs almamısınız.</p>
            <button onClick={() => navigate('/')} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Kurslara bax</button>
          </div>
        </div>

      </div>
    </div>
  )
}

export default StudentProfile