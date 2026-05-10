import { useNavigate } from 'react-router-dom'

function StudentProfile({ user }) {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: 'Arial', minHeight: '100vh', background: '#f0f4ff' }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 onClick={() => navigate('/')} style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }}>BilX</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: 'white', marginRight: '15px' }}>Salam, {user?.user_metadata?.full_name}!</span>
          <button onClick={() => navigate('/')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Ana səhifə</button>
        </div>
      </nav>

      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        
        <div style={{ background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          <h2 style={{ color: '#1435c3', marginTop: 0 }}>Mənim profilim</h2>
          <p><strong>Ad Soyad:</strong> {user?.user_metadata?.full_name}</p>
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Qeydiyyat tarixi:</strong> {new Date(user?.created_at).toLocaleDateString('az-AZ')}</p>
        </div>

        <div style={{ background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#1435c3', marginTop: 0 }}>Mənim kurslarım</h2>
          <p style={{ color: '#888' }}>Hələ heç bir kurs almamısınız. <span onClick={() => navigate('/')} style={{ color: '#1435c3', cursor: 'pointer' }}>Kurslara baxın →</span></p>
        </div>

      </div>
    </div>
  )
}

export default StudentProfile