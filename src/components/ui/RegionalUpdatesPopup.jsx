import { useEffect, useState } from 'react'
import { useRegionalUpdate } from '../../features/regional-updates/hooks/useRegionalUpdate'

function getStorageKey(updateId) {
  return `regional_update_dismissed_${updateId}`
}

export default function RegionalUpdatesPopup() {
  const { update, loading } = useRegionalUpdate()
  const [visible, setVisible] = useState(false)
  const [cardGone, setCardGone] = useState(false)

  useEffect(() => {
    if (loading || !update) return

    const storageKey = getStorageKey(update.id)
    const alreadyDismissed = localStorage.getItem(storageKey)

    if (alreadyDismissed) {
      setCardGone(true)
    }

    setVisible(true)
  }, [update, loading])

  const handleDismiss = () => {
    setCardGone(true)
    if (update) {
      localStorage.setItem(getStorageKey(update.id), 'true')
    }
  }

  if (!visible || !update) return null

  const expiresIn = new Date(update.expires_at) - new Date()
  const daysLeft = Math.ceil(expiresIn / (1000 * 60 * 60 * 24))

  return (
    <>
      {/* Backdrop */}
      {!cardGone && (
        <div
          onClick={() => setCardGone(true)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,22,16,0.52)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 9998,
            animation: 'fadeIn 0.4s ease both',
          }}
        />
      )}

      {/* Card — Clean minimal design */}
      {!cardGone && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(420px, 88vw)',
            background: '#FFFFFF',
            border: '0.5px solid #E9E4D8',
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 9999,
            boxShadow: '0 12px 32px rgba(28,22,16,0.12)',
            animation: 'cardIn 0.5s cubic-bezier(.22,1,.36,1) both',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            padding: '28px 28px 20px',
            borderBottom: '0.5px solid #E9E4D8',
          }}>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary, #1C1610)',
              margin: 0,
            }}>
              Regional Update
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '28px 28px 24px', background: 'var(--surface, #FFFFFF)' }}>
            <p style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-primary, #1C1610)',
            }}>
              {update.content}
            </p>

            <div style={{
              marginTop: 16,
              fontSize: 12,
              color: 'var(--text-secondary, #7A6F5E)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>Posted by {update.creator_name}</span>
              <span>Expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</span>
            </div>

            {/* Button */}
            <button
              onClick={handleDismiss}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 20,
                padding: '11px 0',
                background: 'var(--color-primary, #4C2A92)',
                border: 'none',
                borderRadius: 'var(--radius, 8px)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-hover, #3D1F6D)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-primary, #4C2A92)' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cardIn {
          0%   { transform: translate(-50%,-50%) scale(0.88);  opacity: 0; }
          60%  { transform: translate(-50%,-50%) scale(1.015); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);     opacity: 1; }
        }
      `}</style>
    </>
  )
}
