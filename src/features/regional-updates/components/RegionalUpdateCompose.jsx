import { useState } from 'react'
import { postRegionalUpdate, deleteRegionalUpdate } from '../lib/regionalUpdates'
import { useRegionalUpdatesList } from '../hooks/useRegionalUpdatesList'

export function RegionalUpdateCompose() {
  const [content, setContent] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  const { updates } = useRegionalUpdatesList()

  const handlePost = async () => {
    if (!content.trim() || !expiresAt) {
      setError('Content and expiry date required')
      return
    }

    setPosting(true)
    setError('')

    try {
      await postRegionalUpdate(content, new Date(expiresAt).toISOString())
      setContent('')
      setExpiresAt('')
    } catch (err) {
      setError(err.message || 'Failed to post update')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (updateId) => {
    setDeleting(updateId)
    try {
      await deleteRegionalUpdate(updateId)
    } catch (err) {
      console.error('Failed to delete update:', err)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#3A3530', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Post Regional Update
        </h3>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write directive or update..."
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #E9E4D8',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            marginBottom: 10,
            minHeight: 80,
            resize: 'none',
          }}
        />

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#3A3530' }}>
            Expires at:
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              border: '1px solid #E9E4D8',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#C94830', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <button
          onClick={handlePost}
          disabled={posting}
          style={{
            width: '100%',
            padding: 10,
            backgroundColor: posting ? '#D8D0C4' : '#4C2A92',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: posting ? 'not-allowed' : 'pointer',
          }}
        >
          {posting ? 'Posting...' : 'Post Update'}
        </button>
      </div>

      {updates.length > 0 && (
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#3A3530', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Recent Updates
          </h3>
          {updates.slice(0, 5).map((u) => (
            <div
              key={u.id}
              style={{
                padding: 10,
                border: '1px solid #E9E4D8',
                borderRadius: 6,
                marginBottom: 8,
                fontSize: 12,
                backgroundColor: u.is_expired ? '#F5F3F1' : '#FFFBF8',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: u.is_expired ? '#9E9488' : '#3A3530' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDelete(u.id)}
                  disabled={deleting === u.id}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#C94830',
                    fontSize: 12,
                    cursor: deleting === u.id ? 'not-allowed' : 'pointer',
                    padding: 0,
                    opacity: deleting === u.id ? 0.5 : 1,
                  }}
                >
                  {deleting === u.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#6B5F52', margin: '6px 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {u.content}
              </p>
              {u.is_expired && (
                <span style={{ fontSize: 11, color: '#9E9488' }}>Expired</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
