import { useEffect, useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

export default function SuppressionList() {
  const [bounces, setBounces] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadBounces()
  }, [])

  async function loadBounces() {
    try {
      const { data, error } = await supabase
        .from('email_bounces')
        .select('email, bounce_type, bounced_at, suppressed')
        .order('bounced_at', { ascending: false })

      if (error) throw error
      setBounces(data ?? [])
    } catch (err) {
      console.error('Failed to load bounces:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleUnsuppress(email) {
    try {
      await supabase
        .from('email_bounces')
        .update({ suppressed: false })
        .eq('email', email)
      loadBounces()
    } catch (err) {
      console.error('Failed to unsuppress:', err)
    }
  }

  async function handleUnuppressAll() {
    if (!confirm('Unsuppress all emails? This may result in bounces.')) return
    try {
      await supabase
        .from('email_bounces')
        .update({ suppressed: false })
      loadBounces()
    } catch (err) {
      console.error('Failed to unsuppress all:', err)
    }
  }

  const filtered = bounces.filter(b => b.email.toLowerCase().includes(search.toLowerCase()))

  if (loading) {
    return <div style={{ color: MUTED }}>Loading suppression list...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          placeholder="Search emails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {bounces.length > 0 && (
          <button
            onClick={handleUnuppressAll}
            style={{
              padding: '10px 14px',
              background: '#FEF0ED',
              color: '#C94830',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RotateCcw size={14} /> Clear all
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
          <p style={{ fontSize: 14 }}>
            {search ? 'No results' : 'Suppression list is empty'}
          </p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            {!search && 'Hard bounces will appear here automatically'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(bounce => (
            <div
              key={bounce.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'white',
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ color: TEXT, fontWeight: 500, marginBottom: 4 }}>
                  {bounce.email}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {bounce.bounce_type} bounce • {new Date(bounce.bounced_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => handleUnsuppress(bounce.email)}
                style={{
                  padding: '6px 12px',
                  background: 'white',
                  color: '#2D8653',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RotateCcw size={12} /> Unsuppress
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
