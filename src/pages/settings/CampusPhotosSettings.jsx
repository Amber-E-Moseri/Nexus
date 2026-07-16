import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CampusPhotosSettings() {
  const [campuses, setCampuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingUrl, setEditingUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    const fetchCampuses = async () => {
      const { data } = await supabase
        .from('campuses')
        .select('id, name, institution, photo_url, group_name')
        .order('name')
      setCampuses(data || [])
      setLoading(false)
    }
    fetchCampuses()
  }, [])

  const showMessage = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 2500)
  }

  const handleSaveUrl = async (campusId, url) => {
    const { error } = await supabase
      .from('campuses')
      .update({ photo_url: url || null })
      .eq('id', campusId)

    if (!error) {
      setCampuses((prev) =>
        prev.map((c) => (c.id === campusId ? { ...c, photo_url: url || null } : c))
      )
      setEditingId(null)
      showMessage(url ? '✅ Photo saved' : '✅ Photo removed')
    }
  }

  const handleFileUpload = async (campusId, file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showMessage('❌ Only image files allowed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showMessage('❌ File too large (max 5MB)')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `campuses/${campusId}/photo-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('campus-photos')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('campus-photos').getPublicUrl(path)
      setEditingUrl(urlData.publicUrl)
    } catch (err) {
      showMessage('❌ Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const displayName = (c) => {
    if (c.institution && c.institution !== c.name) {
      return `${c.institution} — ${c.name}`
    }
    return c.name
  }

  const filteredCampuses = campuses.filter((c) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.institution?.toLowerCase().includes(q) || c.group_name?.toLowerCase().includes(q)
  })

  const withPhotos = campuses.filter((c) => c.photo_url).length

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '4px', fontSize: '22px', fontWeight: '700' }}>Campus Photos</h1>
      <p style={{ color: '#666', marginBottom: '8px', fontSize: '14px' }}>
        Manage campus photos. Paste a URL or upload a file. Photos appear in the map modal.
        ORS and regional coordinators see all groups; other roles see only their assigned group.
      </p>
      <p style={{ color: '#4C2A92', fontSize: '13px', fontWeight: '500', marginBottom: '20px' }}>
        {withPhotos} of {campuses.length} campuses have photos
      </p>

      {message && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: message.startsWith('❌') ? '#ffebee' : '#e8f5e9',
          color: message.startsWith('❌') ? '#c62828' : '#2e7d32',
          borderRadius: '6px',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          {message}
        </div>
      )}

      <input
        type="text"
        placeholder="Search campus or region..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          padding: '8px 12px',
          border: '1px solid #ccc',
          borderRadius: '6px',
          fontSize: '14px',
          width: '280px',
          marginBottom: '20px',
          display: 'block',
        }}
      />

      {loading ? (
        <p style={{ color: '#999' }}>Loading campuses...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredCampuses.map((campus) => (
            <div
              key={campus.id}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#fafafa',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Photo preview */}
              <div style={{
                width: '100%',
                height: '160px',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
              }}>
                {campus.photo_url ? (
                  <img
                    src={campus.photo_url}
                    alt={displayName(campus)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.replaceWith(Object.assign(document.createElement('div'), {
                        textContent: '⚠️ Broken link',
                        style: 'color:#999;font-size:12px;text-align:center;padding:8px',
                      }))
                    }}
                  />
                ) : (
                  <span style={{ color: '#bbb', fontSize: '12px' }}>No photo</span>
                )}
              </div>

              {/* Info + actions */}
              <div style={{ padding: '12px', flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '2px' }}>{displayName(campus)}</div>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>
                  {campus.group_name || 'Unknown region'}
                </div>

                {editingId === campus.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: '#555' }}>
                        Photo URL
                      </label>
                      <input
                        type="url"
                        value={editingUrl}
                        onChange={(e) => setEditingUrl(e.target.value)}
                        placeholder="https://..."
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: '#555' }}>
                        Or upload image
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handleFileUpload(campus.id, e.target.files[0])}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{
                          padding: '5px 10px',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          fontSize: '12px',
                          cursor: uploading ? 'not-allowed' : 'pointer',
                          color: '#444',
                        }}
                      >
                        {uploading ? 'Uploading...' : '📁 Choose file'}
                      </button>
                    </div>

                    {editingUrl && (
                      <div style={{ fontSize: '11px', color: '#4C2A92' }}>
                        Preview: <a href={editingUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>link</a>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleSaveUrl(campus.id, editingUrl)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          backgroundColor: '#4C2A92',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          backgroundColor: '#f0f0f0',
                          color: '#333',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Cancel
                      </button>
                      {campus.photo_url && (
                        <button
                          onClick={() => handleSaveUrl(campus.id, '')}
                          title="Remove photo"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            border: '1px solid #ef9a9a',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(campus.id)
                      setEditingUrl(campus.photo_url || '')
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      backgroundColor: campus.photo_url ? '#f3f0fa' : '#f5f5f5',
                      color: campus.photo_url ? '#4C2A92' : '#555',
                      border: `1px solid ${campus.photo_url ? '#c5b8e8' : '#ddd'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}
                  >
                    {campus.photo_url ? '✏️ Edit Photo' : '+ Add Photo'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
