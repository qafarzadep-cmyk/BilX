import { useNavigate } from 'react-router-dom'

function StudentProfile({ user }) {
  const navigate = useNavigate()

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        minHeight: '100vh',
        background: '#fff',
        color: '#1c1d1f'
      }}
    >

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
          Bil-X
        </h1>

        <button
          onClick={() => navigate('/instructor')}
          style={{
            background: '#1435c3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '700',
            fontSize: '13px'
          }}
        >
          Müəllim kimi keç
        </button>
      </nav>

      {/* HERO */}
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
          Tələbə Paneli
        </h2>

        <p
          style={{
            margin: 0,
            color: '#6a6f73',
            fontSize: '15px'
          }}
        >
          Öyrəndiyin kursları və profil məlumatlarını gör.
        </p>
      </div>

      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '32px 24px'
        }}
      >

        {/* PROFILE CARD */}
        <div
          style={{
            border: '1px solid #d1d7dc',
            borderRadius: '8px',
            padding: '32px',
            marginBottom: '24px',
            background: '#fff'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '24px'
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: '#1435c3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '28px',
                fontWeight: '700'
              }}
            >
              {user?.user_metadata?.full_name?.charAt(0) || '?'}
            </div>

            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: '700'
                }}
              >
                {user?.user_metadata?.full_name}
              </h2>

              <p
                style={{
                  margin: '6px 0 0',
                  color: '#6a6f73',
                  fontSize: '14px'
                }}
              >
                {user?.email}
              </p>
            </div>
          </div>

          <p
            style={{
              margin: 0,
              color: '#6a6f73',
              fontSize: '13px'
            }}
          >
            Qeydiyyat tarixi:{' '}
            {new Date(user?.created_at).toLocaleDateString('az-AZ')}
          </p>
        </div>

        {/* COURSES */}
        <div
          style={{
            border: '1px solid #d1d7dc',
            borderRadius: '8px',
            padding: '32px',
            background: '#fff'
          }}
        >
          <h3
            style={{
              margin: '0 0 20px',
              fontSize: '20px',
              fontWeight: '700'
            }}
          >
            Mənim kurslarım
          </h3>

          <div
            style={{
              textAlign: 'center',
              padding: '50px 0',
              color: '#6a6f73'
            }}
          >
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>
              📚
            </div>

            <p
              style={{
                margin: '0 0 20px',
                fontSize: '15px'
              }}
            >
              Hələ heç bir kurs almamısınız.
            </p>

            <button
              onClick={() => navigate('/')}
              style={{
                background: '#1435c3',
                color: 'white',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '14px'
              }}
            >
              Kurslara bax
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentProfile