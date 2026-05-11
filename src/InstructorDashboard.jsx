import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

function InstructorDashboard() {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleUpload = async () => {
    if (!title || !description || !price || !videoFile) {
      setError('Bütün sahələri doldurun!')
      return
    }

    try {
      setUploading(true)
      setError('')
      setSuccess('')

      // CHECK LOGIN
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Zəhmət olmasa yenidən giriş edin')
      }

      // FILE NAME
      const fileExt = videoFile.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`

      // UPLOAD VIDEO
      const { data: uploadData, error: uploadError } =
        await supabase.storage
          .from('videos')
          .upload(fileName, videoFile, {
            cacheControl: '3600',
            upsert: false,
          })

      console.log('UPLOAD:', uploadData)

      if (uploadError) {
        throw uploadError
      }

      // GET PUBLIC URL
      const {
        data: { publicUrl },
      } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName)

      console.log('VIDEO URL:', publicUrl)

      // INSERT COURSE
      const { data, error: insertError } = await supabase
        .from('courses')
        .insert([
          {
            title: title,
            description: description,
            price: Number(price),
            instructor_id: user.id,
            video_url: publicUrl,
            is_published: true,
          },
        ])
        .select()

      console.log('INSERTED COURSE:', data)

      if (insertError) {
        throw insertError
      }

      setSuccess('Kurs uğurla yükləndi!')

      setTitle('')
      setDescription('')
      setPrice('')
      setVideoFile(null)

    } catch (err) {
      console.log(err)
      setError('Xəta baş verdi: ' + err.message)
    }

    setUploading(false)
  }

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        minHeight: '100vh',
        background: '#fff',
        color: '#1c1d1f',
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
          zIndex: 100,
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

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate('/profile')}
            style={{
              background: 'transparent',
              color: '#1c1d1f',
              border: '1px solid #1c1d1f',
              padding: '8px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
            }}
          >
            Tələbə kimi keç
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              background: '#1435c3',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '13px',
            }}
          >
            Ana səhifə
          </button>
        </div>
      </nav>

      {/* HERO */}
      <div
        style={{
          background: '#f0f4ff',
          padding: '40px 60px',
          borderBottom: '1px solid #d1d7dc',
        }}
      >
        <h2
          style={{
            fontSize: '34px',
            margin: '0 0 10px',
            fontWeight: '700',
          }}
        >
          Müəllim Paneli
        </h2>

        <p
          style={{
            margin: 0,
            color: '#6a6f73',
            fontSize: '15px',
          }}
        >
          Yeni kurslar yarat və tələbələrinə dərs paylaş.
        </p>
      </div>

      {/* CONTENT */}
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        {error && (
          <p
            style={{
              color: '#b32d0f',
              background: '#ffe7e3',
              padding: '14px',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {error}
          </p>
        )}

        {success && (
          <p
            style={{
              color: '#137333',
              background: '#d1fadf',
              padding: '14px',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {success}
          </p>
        )}

        {/* FORM */}
        <div
          style={{
            border: '1px solid #d1d7dc',
            borderRadius: '8px',
            padding: '32px',
            background: '#fff',
          }}
        >
          <h3
            style={{
              margin: '0 0 28px',
              fontSize: '22px',
              fontWeight: '700',
            }}
          >
            Yeni Kurs Əlavə Et
          </h3>

          <div style={{ marginBottom: '22px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Kurs adı
            </label>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1px solid #d1d7dc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Kurs təsviri
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1px solid #d1d7dc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Qiymət (AZN)
            </label>

            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{
                width: '220px',
                padding: '12px 14px',
                border: '1px solid #d1d7dc',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Video yüklə
            </label>

            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files[0])}
            />

            {videoFile && (
              <p
                style={{
                  color: '#6a6f73',
                  fontSize: '13px',
                  marginTop: '8px',
                }}
              >
                Seçildi: {videoFile.name}
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading}
            style={{
              background: '#1435c3',
              color: 'white',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '4px',
              fontSize: '15px',
              cursor: 'pointer',
              fontWeight: '700',
            }}
          >
            {uploading ? 'Yüklənir...' : 'Kursu yüklə'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default InstructorDashboard