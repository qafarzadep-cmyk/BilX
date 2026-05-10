import { useNavigate } from 'react-router-dom'

function AdminDashboard() {
  const navigate = useNavigate()
  const users = [
    { name: 'Anar Məmmədov', email: 'anar@gmail.com', course: 'IELTS Hazırlıq', status: 'Gözləyir' },
    { name: 'Günel Əliyeva', email: 'gunel@gmail.com', course: 'Riyaziyyat 9', status: 'Təsdiqlənib' },
    { name: 'Tural Həsənov', email: 'tural@gmail.com', course: 'İngilis dili', status: 'Gözləyir' },
  ]

  return (
    <div style={{ fontFamily: 'Arial', minHeight: '100vh', background: '#f0f4ff' }}>
      <nav style={{ background: '#1435c3', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 onClick={() => navigate('/')} style={{ color: 'white', margin: 0, fontSize: '24px', cursor: 'pointer' }}>BilX Admin</h1>
        <button onClick={() => navigate('/')} style={{ background: 'white', color: '#1435c3', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Ana səhifə</button>
      </nav>

      <div style={{ padding: '40px' }}>
        <h2 style={{ color: '#333' }}>Admin Panel</h2>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
          {[
            { label: 'Ümumi İstifadəçi', value: '3' },
            { label: 'Aktiv Kurs', value: '3' },
            { label: 'Gözləyən', value: '2' },
          ].map((stat, i) => (
            <div key={i} style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flex: 1, textAlign: 'center' }}>
              <h3 style={{ color: '#1435c3', fontSize: '36px', margin: 0 }}>{stat.value}</h3>
              <p style={{ color: '#555', margin: '5px 0 0' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid #eee' }}>İstifadəçilər</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#555' }}>Ad</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#555' }}>Email</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#555' }}>Kurs</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#555' }}>Status</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#555' }}>Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '12px 20px' }}>{user.name}</td>
                  <td style={{ padding: '12px 20px', color: '#555' }}>{user.email}</td>
                  <td style={{ padding: '12px 20px' }}>{user.course}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{ background: user.status === 'Təsdiqlənib' ? '#d4edda' : '#fff3cd', color: user.status === 'Təsdiqlənib' ? '#155724' : '#856404', padding: '4px 10px', borderRadius: '20px', fontSize: '14px' }}>
                      {user.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    {user.status === 'Gözləyir' && (
                      <button style={{ background: '#1435c3', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '5px', cursor: 'pointer' }}>Təsdiqlə</button>
                    )}
                    {user.status === 'Təsdiqlənib' && (
                      <button style={{ background: '#dc3545', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '5px', cursor: 'pointer' }}>Ləğv et</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard