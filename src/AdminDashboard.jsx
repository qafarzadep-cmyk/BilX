import { useNavigate } from 'react-router-dom'

function AdminDashboard() {
  const navigate = useNavigate()

  const users = [
    { name: 'Anar Məmmədov', email: 'anar@gmail.com', course: 'IELTS Hazırlıq', status: 'Gözləyir' },
    { name: 'Günel Əliyeva', email: 'gunel@gmail.com', course: 'Riyaziyyat 9', status: 'Təsdiqlənib' },
    { name: 'Tural Həsənov', email: 'tural@gmail.com', course: 'İngilis dili', status: 'Gözləyir' },
  ]

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', minHeight: '100vh', color: '#1c1d1f' }}>

      {/* NAVBAR */}
      <nav
        style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '56px',
          borderBottom: '1px solid #d1d7dc',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <h1
          onClick={() => navigate('/')}
          style={{
            color: '#1435c3',
            margin: 0,
            fontSize: '22px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          Bil-X Admin
        </h1>

        <button
          onClick={() => navigate('/')}
          style={{
            background: '#1435c3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '700'
          }}
        >
          Ana səhifə
        </button>
      </nav>

      {/* HEADER */}
      <div
        style={{
          background: '#f0f4ff',
          padding: '40px 60px',
          borderBottom: '1px solid #d1d7dc'
        }}
      >
        <h2
          style={{
            fontSize: '34px',
            margin: '0 0 10px',
            fontWeight: '700'
          }}
        >
          Admin Panel
        </h2>

        <p style={{ margin: 0, color: '#555', fontSize: '15px' }}>
          Platform istifadəçilərini və kursları idarə et.
        </p>
      </div>

      {/* STATS */}
      <div style={{ padding: '32px 60px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '40px' }}>
          {[
            { label: 'Ümumi İstifadəçi', value: '3' },
            { label: 'Aktiv Kurs', value: '3' },
            { label: 'Gözləyən Sorğu', value: '2' },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #d1d7dc',
                padding: '24px',
                borderRadius: '8px',
                flex: '1',
                minWidth: '220px'
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color: '#1435c3',
                  fontSize: '32px',
                  fontWeight: '700'
                }}
              >
                {stat.value}
              </h3>

              <p
                style={{
                  margin: '8px 0 0',
                  color: '#6a6f73',
                  fontSize: '14px'
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* USERS TABLE */}
        <div
          style={{
            border: '1px solid #d1d7dc',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#fff'
          }}
        >
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #d1d7dc',
              fontWeight: '700',
              fontSize: '18px'
            }}
          >
            İstifadəçilər
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7f9fa' }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '14px' }}>Ad</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '14px' }}>Email</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '14px' }}>Kurs</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '14px' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '14px' }}>Əməliyyat</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user, i) => (
                <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '16px 20px' }}>{user.name}</td>

                  <td style={{ padding: '16px 20px', color: '#6a6f73' }}>
                    {user.email}
                  </td>

                  <td style={{ padding: '16px 20px' }}>
                    {user.course}
                  </td>

                  <td style={{ padding: '16px 20px' }}>
                    <span
                      style={{
                        background:
                          user.status === 'Təsdiqlənib'
                            ? '#d1fadf'
                            : '#fff4cc',
                        color:
                          user.status === 'Təsdiqlənib'
                            ? '#137333'
                            : '#946200',
                        padding: '6px 12px',
                        borderRadius: '100px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td style={{ padding: '16px 20px' }}>
                    {user.status === 'Gözləyir' ? (
                      <button
                        style={{
                          background: '#1435c3',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Təsdiqlə
                      </button>
                    ) : (
                      <button
                        style={{
                          background: '#b32d0f',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Ləğv et
                      </button>
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