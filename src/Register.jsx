```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

function Register() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: role,
        },
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Qeydiyyat uğurlu oldu!')

      setTimeout(() => {
        navigate('/login')
      }, 1500)
    }

    setLoading(false)
  }

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        minHeight: '100vh',
        background: '#fff',
      }}
    >
      {/* NAVBAR */}
      <nav
        style={{
          background: '#fff',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          height: '56px',
          borderBottom: '1px solid #d1d7dc',
        }}
      >
        <h1
          onClick={() => navigate('/')}
          style={{
            color: '#1435c3',
            margin: 0,
            fontSize: '22px',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Bil-X
        </h1>
      </nav>

      {/* FORM */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            border: '1px solid #d1d7dc',
            borderRadius: '4px',
            padding: '40px',
          }}
        >
          <h2
            style={{
              color: '#1c1d1f',
              textAlign: 'center',
              marginBottom: '24px',
              fontSize: '24px',
              fontWeight: '700',
            }}
          >
            Qeydiyyat
          </h2>

          {error && (
            <p
              style={{
                color: '#dc3545',
                textAlign: 'center',
                marginBottom: '15px',
                background: '#ffe6e6',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              {error}
            </p>
          )}

          {success && (
            <p
              style={{
                color: '#28a745',
                textAlign: 'center',
                marginBottom: '15px',
                background: '#e6ffe6',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              {success}
            </p>
          )}

          <input
            type="text"
            placeholder="Ad Soyad"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              border: '1px solid #d1d7dc',
              borderRadius: '4px',
              fontSize: '15px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              border: '1px solid #d1d7dc',
              borderRadius: '4px',
              fontSize: '15px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          <input
            type="password"
            placeholder="Şifrə"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '16px',
              border: '1px solid #d1d7dc',
              borderRadius: '4px',
              fontSize: '15px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          {/* ROLE */}
          <div style={{ marginBottom: '18px' }}>
            <p
              style={{
                marginBottom: '10px',
                fontWeight: '600',
                color: '#1c1d1f',
              }}
            >
              Hesab növü
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setRole('student')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border:
                    role === 'student'
                      ? '2px solid #1435c3'
                      : '1px solid #d1d7dc',
                  background:
                    role === 'student' ? '#eef2ff' : 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                🎓 Tələbə
              </button>

              <button
                type="button"
                onClick={() => setRole('instructor')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border:
                    role === 'instructor'
                      ? '2px solid #1435c3'
                      : '1px solid #d1d7dc',
                  background:
                    role === 'instructor'
                      ? '#eef2ff'
                      : 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                👨‍🏫 Müəllim
              </button>
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#1435c3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '15px',
              cursor: 'pointer',
              fontWeight: '700',
            }}
          >
            {loading ? 'Yüklənir...' : 'Qeydiyyatdan keç'}
          </button>

          <div
            style={{
              textAlign: 'center',
              marginTop: '16px',
              fontSize: '14px',
              color: '#6a6f73',
            }}
          >
            Hesabın var?{' '}
            <span
              onClick={() => navigate('/login')}
              style={{
                color: '#1435c3',
                cursor: 'pointer',
                fontWeight: '700',
              }}
            >
              Giriş et
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
```
