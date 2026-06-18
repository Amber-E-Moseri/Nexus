const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

export default function AbsenceBatchConfirmModal({ absentees, onConfirm, onCancel, meetingName, loading }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', background: 'rgba(14,14,30,0.5)', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 480, width: '90%', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>Send absence emails?</h2>
        </div>

        <div style={{ padding: '16px 24px', maxHeight: 240, overflowY: 'auto' }}>
          {absentees.map((person) => (
            <div
              key={person.email}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: `1px solid ${BG}`,
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: TEXT }}>{person.name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{person.email}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px', background: BG, borderRadius: '0 0 16px 16px', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12, fontWeight: 600 }}>
            {absentees.length} email{absentees.length !== 1 ? 's' : ''} will be sent
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                border: `1px solid ${BORDER}`,
                background: '#FFFFFF',
                color: TEXT,
                borderRadius: 6,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              style={{
                border: 'none',
                background: PRIMARY,
                color: '#FFFFFF',
                borderRadius: 6,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Sending...' : 'Send Emails'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
