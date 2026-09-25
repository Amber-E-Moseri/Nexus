import { useNavigate } from 'react-router-dom'
import { Archive, ExternalLink, Calendar } from 'lucide-react'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'

// Past events — these are no longer active but have historical data
const PAST_EVENTS = [
  {
    id: 'tii-2024',
    name: 'This Is It 2.0',
    year: 2024,
    description: 'Regional youth conference',
    registrations: 450,
    link: '/registration-public?event=tii-2024',
  },
]

export default function PastEventsPage() {
  const navigate = useNavigate()

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
        {PAST_EVENTS.length === 0 ? (
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
            {PAST_EVENTS.map(event => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: MUTED }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={14} />
                      <span>{event.registrations} registrations</span>
                    </div>
                  </div>
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
