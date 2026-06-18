import { useParams } from 'react-router-dom'
import { useInvitationData } from '../hooks/useInvitationData'
import ClassicEnvelope from '../components/invitations/ClassicEnvelope'

function Spinner() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a14',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4C2A92',
                animation: `pulse 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}

export default function InvitationViewerPage() {
  const { token } = useParams()
  const { data: invitation, loading, error } = useInvitationData(token || '')

  if (loading) {
    return <Spinner />
  }

  if (error) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a14',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      </div>
    )
  }

  if (!invitation) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a14',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', marginBottom: 12 }}>
            Invitation Not Found
          </div>
          <div style={{ fontSize: 16, color: '#9E9488', lineHeight: 1.6 }}>
            This invitation could not be found. It may have expired or the link may be incorrect.
          </div>
        </div>
      </div>
    )
  }

  // Check if already responded
  if (invitation.recipient.rsvp_at || ['rsvp_yes', 'rsvp_no'].includes(invitation.recipient.status)) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a14',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', marginBottom: 12 }}>
            Response Received
          </div>
          <div style={{ fontSize: 16, color: '#9E9488', lineHeight: 1.6 }}>
            Thank you! Your response has already been recorded.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a14',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <ClassicEnvelope invitation={invitation} />
    </div>
  )
}
