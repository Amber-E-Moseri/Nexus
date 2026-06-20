const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

export default function SendConfirmationModal({ campaign, recipientCount, suppressedCount, onConfirm, onCancel, loading }) {
  const estimatedSeconds = Math.max(recipientCount * 0.05, 5)
  const estimatedTime = estimatedSeconds < 60
    ? `~${Math.round(estimatedSeconds)}s`
    : `~${Math.round(estimatedSeconds / 60)}m`

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: 16,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 24,
        maxWidth: 500,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: '0 0 16px 0' }}>
          Confirm send?
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{ padding: 12, background: '#F9F7F3', borderRadius: 10, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              From
            </div>
            <div style={{ fontSize: 13, color: TEXT }}>
              {campaign?.from_name || 'Admin'} &lt;{campaign?.from_email || 'noreply@blwcannexus.ca'}&gt;
            </div>
          </div>

          <div style={{ padding: 12, background: '#F9F7F3', borderRadius: 10, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Subject
            </div>
            <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>
              {campaign?.subject || '(No subject)'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 12, background: '#F9F7F3', borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recipients
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: PRIMARY }}>
                {recipientCount.toLocaleString()}
              </div>
            </div>

            <div style={{ padding: 12, background: '#FEF0ED', borderRadius: 10, border: `1px solid #F5C4B8` }}>
              <div style={{ fontSize: 12, color: '#9E7070', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suppressed
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#C94830' }}>
                {suppressedCount}
              </div>
            </div>
          </div>

          <div style={{ padding: 12, background: '#F9F7F3', borderRadius: 10, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Estimated send time
            </div>
            <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>
              {estimatedTime} for {recipientCount.toLocaleString()} emails
            </div>
          </div>
        </div>

        {suppressedCount > 0 && (
          <div style={{ padding: 12, background: '#FEF0ED', borderRadius: 10, border: `1px solid #F5C4B8`, marginBottom: 20, fontSize: 12, color: '#C94830', fontWeight: 500 }}>
            ⚠ {suppressedCount} {suppressedCount === 1 ? 'email' : 'emails'} will be skipped due to bounce suppression.
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 18px',
              background: 'white',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              color: MUTED,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '10px 18px',
              background: PRIMARY,
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Sending...' : 'Send Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
