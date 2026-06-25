import { useState } from 'react'
import { Phone } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import FlockCRMDashboardWidget from './FlockCRMDashboardWidget'
import FlockNotificationsSection from './FlockNotificationsSection'

export default function FlockDashboardSection() {
  const navigate = useNavigate()
  const [showQuickLogModal, setShowQuickLogModal] = useState(false)

  return (
    <div
      style={{
        marginTop: '32px',
        paddingTop: '24px',
        borderTop: '2px solid #EDE8DC',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <Phone size={18} color="#4C2A92" />
          <h2 style={{
            fontSize: '16px',
            fontWeight: '700',
            color: '#1C1610',
            margin: '0',
          }}>
            Flock CRM — Pastoral Outreach
          </h2>
        </div>
        <button
          onClick={() => setShowQuickLogModal(true)}
          style={{
            background: '#4C2A92',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#3d1f6f' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#4C2A92' }}
        >
          + Log Call
        </button>
      </div>

      <div style={{
        background: 'rgba(76, 42, 146, 0.02)',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #EDE8DC',
      }}>
        <FlockCRMDashboardWidget />
        <FlockNotificationsSection />
      </div>

      {/* Quick Log Modal placeholder - will be implemented in Enhancement 2 */}
      {showQuickLogModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(14, 14, 30, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '700', color: '#1C1610' }}>
              Quick Log Call
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#7A6F5E' }}>
              Feature coming soon — will allow quick call logging without opening the full Flock CRM dashboard.
            </p>
            <button
              onClick={() => setShowQuickLogModal(false)}
              style={{
                width: '100%',
                background: '#4C2A92',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
