import { useEffect, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

export default function SegmentsList() {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', include_roster: false })

  useEffect(() => {
    loadSegments()
  }, [])

  async function loadSegments() {
    try {
      const { data, error } = await supabase
        .from('communication_segments')
        .select('id, name, filters, estimated_count')
        .order('name')

      if (error) throw error
      setSegments(data ?? [])
    } catch (err) {
      console.error('Failed to load segments:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) return

    try {
      const filters = { include_roster: formData.include_roster }
      if (formData.id) {
        await supabase
          .from('communication_segments')
          .update({ name: formData.name, filters })
          .eq('id', formData.id)
      } else {
        await supabase
          .from('communication_segments')
          .insert({ name: formData.name, filters })
      }
      setShowForm(false)
      setFormData({ name: '', include_roster: false })
      loadSegments()
    } catch (err) {
      console.error('Failed to save segment:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this segment?')) return
    try {
      await supabase.from('communication_segments').delete().eq('id', id)
      loadSegments()
    } catch (err) {
      console.error('Failed to delete segment:', err)
    }
  }

  if (loading) {
    return <div style={{ color: MUTED }}>Loading segments...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button
        onClick={() => setShowForm(true)}
        style={{
          alignSelf: 'flex-start',
          padding: '10px 16px',
          background: PRIMARY,
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Plus size={16} /> New segment
      </button>

      {showForm && (
        <div style={{ padding: 16, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder="Segment name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ padding: '8px 12px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={formData.include_roster}
              onChange={(e) => setFormData({ ...formData, include_roster: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            Include roster (all active members)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              style={{ flex: 1, padding: '8px 12px', background: PRIMARY, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ flex: 1, padding: '8px 12px', background: 'white', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {segments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>No segments yet</p>
            <p style={{ fontSize: 12 }}>Create segments to target specific recipient groups</p>
          </div>
        ) : (
          segments.map(segment => (
            <div
              key={segment.id}
              style={{
                padding: 16,
                background: 'white',
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                  {segment.name}
                </div>
                <div style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} /> {segment.estimated_count ?? '?'} members
                </div>
              </div>
              <button
                onClick={() => handleDelete(segment.id)}
                style={{
                  padding: '8px 12px',
                  background: 'white',
                  color: '#C94830',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
