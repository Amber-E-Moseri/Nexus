import { useState, useEffect } from 'react'
import { useToast } from '../../context/ToastContext'
import { submitCampusEdit } from '../../lib/campus/api'

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '10px 12px',
  border: '1px solid #e0d5c8',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: '#2c2c2a',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
}

const formGroupStyle = {
  marginBottom: 16,
}

const buttonContainerStyle = {
  display: 'flex',
  gap: 8,
  marginTop: 20,
}

const buttonStyle = {
  flex: 1,
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const saveButtonStyle = {
  ...buttonStyle,
  background: '#667eea',
  color: 'white',
}

const cancelButtonStyle = {
  ...buttonStyle,
  background: '#f0f0f0',
  color: '#2c2c2a',
  border: '1px solid #e0e0e0',
}

export default function CampusEditForm({ campus, onSave, onCancel, isLoading }) {
  const { showToast } = useToast()
  const [formData, setFormData] = useState({
    name: campus.name || '',
    institution: campus.institution || '',
    campus_name_alt: campus.campus_name_alt || '',
    latitude: String(campus.latitude || ''),
    longitude: String(campus.longitude || ''),
    spotify_playlist_id: campus.spotify_playlist_id || '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      // Submit the edit
      await submitCampusEdit(campus.id, formData)
      showToast('Edit submitted for review', { tone: 'success' })

      // Callback to parent to close form
      if (onSave) {
        onSave()
      }
    } catch (err) {
      const message = err.message || 'Failed to submit edit'
      setError(message)
      showToast(message, { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const isFormSubmitting = submitting || isLoading

  return (
    <form onSubmit={handleSubmit} style={{ padding: '0 8px' }}>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: '#fce8e6',
            border: '1px solid #f3d0c8',
            borderRadius: 8,
            color: '#c94830',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Campus Name */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Campus Name</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., McGill University"
          style={inputStyle}
        />
      </div>

      {/* Institution */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Institution</label>
        <input
          type="text"
          name="institution"
          value={formData.institution}
          onChange={handleChange}
          placeholder="e.g., McGill University"
          style={inputStyle}
        />
      </div>

      {/* Alternative Campus Name */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Alternative Campus Name</label>
        <input
          type="text"
          name="campus_name_alt"
          value={formData.campus_name_alt}
          onChange={handleChange}
          placeholder="e.g., McGill"
          style={inputStyle}
        />
      </div>

      {/* Latitude */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Latitude</label>
        <input
          type="number"
          step="0.000001"
          name="latitude"
          value={formData.latitude}
          onChange={handleChange}
          placeholder="e.g., 45.5017"
          style={inputStyle}
        />
      </div>

      {/* Longitude */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Longitude</label>
        <input
          type="number"
          step="0.000001"
          name="longitude"
          value={formData.longitude}
          onChange={handleChange}
          placeholder="e.g., -73.5673"
          style={inputStyle}
        />
      </div>

      {/* Spotify Playlist ID */}
      <div style={formGroupStyle}>
        <label style={labelStyle}>Spotify Playlist ID</label>
        <input
          type="text"
          name="spotify_playlist_id"
          value={formData.spotify_playlist_id}
          onChange={handleChange}
          placeholder="e.g., spotify:playlist:..."
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: '#999', margin: '6px 0 0 0' }}>
          Optional. Leave empty if not applicable.
        </p>
      </div>

      {/* Buttons */}
      <div style={buttonContainerStyle}>
        <button
          type="submit"
          disabled={isFormSubmitting}
          style={{
            ...saveButtonStyle,
            opacity: isFormSubmitting ? 0.6 : 1,
            cursor: isFormSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isFormSubmitting ? 'Submitting...' : 'Submit for Review'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isFormSubmitting}
          style={{
            ...cancelButtonStyle,
            opacity: isFormSubmitting ? 0.6 : 1,
            cursor: isFormSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
