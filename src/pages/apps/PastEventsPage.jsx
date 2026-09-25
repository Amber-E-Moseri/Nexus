import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ExternalLink, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'

export default function PastEventsPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPastEvents()
  }, [])

  async function loadPastEvents() {
    try {
      const { data, error } = await supabase
        .from('event_configs')
        .select('id, event_name, created_at, updated_at, is_active')
        .eq('is_active', false)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // Transform to display format
      const transformed = (data || []).map(event => {
        const year = new Date(event.updated_at || event.created_at).getFullYear()
        return {
          id: event.id,
          name: event.event_name,
          year,
          description: 'Registration & event data',
          link: `/registration-public?event=${event.id}`,
        }
      })

      setEvents(transformed)
    } catch (err) {
      console.error('Failed to load past events:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${BORDER}`,
        padding: '20px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Archive size={24} color={PRIMARY} />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: TEXT }}>Past Events</h1>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          Historical registration data and public views from completed events
        </p>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
        {loading ? (
          <div style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: MUTED }}>Loading past events...</p>
          </div>
        ) : events.length === 0 ? (
          <div style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
          }}>
            <Archive size={40} color={MUTED} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: 14, color: MUTED }}>No past events yet</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {events.map(event => (
              <div
                key={event.id}
                style={{
                  background: '#fff',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: 24,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: TEXT }}>
                      {event.name}
                    </h3>
                    <span style={{
                      display: 'inline-block',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 8px',
                      background: '#f5f1e8',
                      color: '#8B7355',
                      borderRadius: 4,
                    }}>
                      {event.year}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px' }}>
                    {event.description}
                  </p>
                </div>
                <button
                  onClick={() => window.open(event.link, '_blank')}
                  style={{
                    padding: '10px 16px',
                    background: PRIMARY,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <ExternalLink size={14} />
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
