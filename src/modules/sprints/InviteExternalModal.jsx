import { useState } from 'react'
import { inviteExternalToSprint } from '../../lib/sprints'

const TOKENS = {
  primary: '#4C2A92',
  accent: '#E8A020',
  border: '#EDE8DC',
  background: '#F4F1EA',
  textPrimary: '#2D2A22',
  textSecondary: '#7A6F5E',
  textTertiary: '#9E9488',
  error: '#C94830',
  errorBg: '#FFE5E5',
}

export default function InviteExternalModal({ sprintId, sprintEndDate, sprintName, onClose, onSuccess }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('contributor')
  const [endDate, setEndDate] = useState(sprintEndDate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleInvite = async () => {
    try {
      setLoading(true)
      setError(null)

      await inviteExternalToSprint({
        email: email.trim(),
        name: name.trim(),
        sprintId,
        role,
        membershipEndDate: endDate,
      })

      alert(`Invitation sent! They'll receive a set-password email shortly.`)
      setEmail('')
      setName('')
      setRole('contributor')
      setEndDate(sprintEndDate)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600, color: TOKENS.textPrimary }}>
          Invite External Person
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: 13, color: TOKENS.textSecondary }}>
          Add a temporary member to <strong>{sprintName}</strong>
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: TOKENS.textPrimary }}>
            Email (required)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sophia@design.studio"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: TOKENS.textPrimary }}>
            Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sophia Chen"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: TOKENS.textPrimary }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              boxSizing: 'border-box',
            }}
          >
            <option value="contributor">Contributor</option>
            <option value="viewer">Viewer</option>
            <option value="manager">Manager</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: TOKENS.textPrimary }}>
            Access expires
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: '12px', color: TOKENS.textTertiary, marginTop: '4px' }}>
            Their access will automatically deactivate after this date or when the sprint is archived — whichever comes first.
          </div>
        </div>

        {error && (
          <div
            style={{
              background: TOKENS.errorBg,
              color: TOKENS.error,
              padding: '10px 12px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ fontSize: '12px', color: TOKENS.textSecondary, marginBottom: '16px', lineHeight: '1.5' }}>
          They'll receive a "Set your password" email to access the sprint. Their access is automatically revoked when the sprint is archived.
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              background: 'white',
              color: TOKENS.textPrimary,
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              transition: 'all 0.12s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={loading || !email || !endDate}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              background: loading || !email || !endDate ? `${TOKENS.primary}99` : TOKENS.primary,
              color: 'white',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading || !email || !endDate ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              transition: 'all 0.12s',
              opacity: loading || !email || !endDate ? 0.6 : 1,
            }}
          >
            {loading ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
