import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

function InstructorDashboard({ user }) {
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

    setUploading(true)
    setError('')

    try {
      // Upload video to Supabase storage
      const fileExt = videoFile.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, videoFile)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName)

      // Save course to database
      const { error: dbError } = await supabase
        .from('courses')
        .insert({
          title,
          description,
          price: parseInt(price),
          instructor_id: user.id,
          video_url: publicUrl,
          is_published: true
        })

      if (dbError) throw dbError

      setSuccess('Kurs uğurla yükləndi!')
      setTitle('')
      setDescription('')
      setPrice('')
      setVideoFile(null)

    } catch (err) {
      setError('Xəta baş verdi: ' + err.message)
    }

    setUploading(false)
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", minHeight: '100vh', background: '#fff' }}>
      
      {/* NAVBAR */}
      <nav style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', borderBottom: '1px solid #d1d7dc' }}>
        <h1 onClick={() => navigate('/')} style={{ color: '#1435c3', margin: 0, fontSize: '22px', fontWeight: '700', cursor: 'pointer' }}>Bil-X</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/profile')} style={{ background: 'transparent', color: '#1c1d1f', border: '1px solid #d1d7dc', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Tələbə görünüşü</button>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', color: '#1c1d1f', border: '1px solid #1c1d1f', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Ana səhifə</button>
        </div>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1c1d1f', marginBottom: '8px' }}>Müəllim Paneli</h2>
        <p style={{ color: '#6a6f73', marginBottom: '32px', fontSize: '14px' }}>Yeni kurs əlavə edin</p>

        {error && <p style={{ color: '#dc3545', background: '#ffe6e6', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        {success && <p style={{ color: '#28a745', background: '#e6ffe6', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>{success}</p>}

        {/* COURSE FORM */}
        <div style={{ border: '1px solid #d1d7dc', borderRadius: '4px', padding: '32px' }}>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#1c1d1f' }}>Kurs adı</label>
            <input type="text" placeholder="Məs: IELTS Hazırlıq kursu" value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d7dc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#1c1d1f' }}>Kurs təsviri</label>
            <textarea placeholder="Bu kurs haqqında məlumat..." value={description} onChange={e => setDescription(e.target.value)} rows={4} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d7dc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#1c1d1f' }}>Qiymət (AZN)</label>
            <input type="number" placeholder="50" value={price} onChange={e => setPrice(e.target.value)} style={{ width: '200px', padding: '10px 12px', border: '1px solid #d1d7dc', borderRadius: '4px', fontSize: '14px', outline: 'none' }} />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#1c1d1f' }}>Video yüklə</label>
            <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files[0])} style={{ fontSize: '14px' }} />
            {videoFile && <p style={{ color: '#6a6f73', fontSize: '13px', marginTop: '6px' }}>Seçildi: {videoFile.name}</p>}
          </div>

          <button onClick={handleUpload} disabled={uploading} style={{ background: '#1435c3', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '4px', fontSize: '15px', cursor: 'pointer', fontWeight: '700' }}>
            {uploading ? 'Yüklənir...' : 'Kursu yüklə'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default InstructorDashboard