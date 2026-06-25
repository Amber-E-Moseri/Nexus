import { useState } from 'react'
import { X } from 'lucide-react'
import { useToast } from '../../context/ToastContext'

export default function ApprovalModal({ edit, action, isOpen, onClose, onSubmit, isLoading }) {
  const [notes, setNotes] = useState('')
  const { showToast } = useToast()

  const handleSubmit = async () => {
    if (action === 'reject' && !notes.trim()) {
      showToast('Rejection reason is required', { tone: 'error' })
      return
    }
    await onSubmit(notes)
  }

  if (!isOpen || !edit) return null

  const isApprove = action === 'approve'
  const title = isApprove ? 'Approve Campus Edit' : 'Reject Campus Edit'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(28, 22, 16, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          padding: '24px',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              transition: 'color 0.2s',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Edit Details Box */}
        <div
          style={{
            margin: '16px 0',
            padding: '16px',
            backgroundColor: 'var(--surface-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Campus
            </label>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {edit.campuses?.name || 'Unknown'}
            </p>
            {edit.campuses?.institution && (
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                {edit.campuses.institution}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Field
            </label>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, fontFamily: 'Monaco, monospace', color: 'var(--text-primary)' }}>
              {edit.field_name}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Old Value
              </label>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: 12,
                  fontFamily: 'Monaco, monospace',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--surface)',
                  padding: '8px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  wordBreak: 'break-word',
                }}
              >
                {edit.old_value || '(empty)'}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
                New Value
              </label>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: 12,
                  fontFamily: 'Monaco, monospace',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--info-bg)',
                  padding: '8px',
                  borderRadius: 4,
                  border: '1px solid var(--accent)',
                  wordBreak: 'break-word',
                }}
              >
                {edit.new_value}
              </p>
            </div>
          </div>
        </div>

        {/* Notes Textarea */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            {isApprove ? 'Optional Notes' : 'Rejection Reason'} {!isApprove && <span style={{ color: 'var(--coral)' }}>*</span>}
          </label>
          <textarea
            placeholder={
              isApprove
                ? 'Add notes for the editor (e.g., "Verified with campus lead")'
                : 'Explain why this edit is being rejected'
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px 12px',
              minHeight: '100px',
              fontFamily: 'inherit',
              fontSize: 13,
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              outline: 'none',
              resize: 'vertical',
              backgroundColor: isLoading ? 'var(--surface-secondary)' : 'var(--surface)',
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? 'not-allowed' : 'auto',
              transition: 'all 0.2s',
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = 'var(--border-light)'
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = 'var(--surface-secondary)'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || (action === 'reject' && !notes.trim())}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: isApprove ? 'var(--sage)' : 'var(--coral)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor:
                isLoading || (action === 'reject' && !notes.trim()) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isLoading || (action === 'reject' && !notes.trim()) ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoading && !(action === 'reject' && !notes.trim())) {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = 'var(--shadow)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && !(action === 'reject' && !notes.trim())) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
          >
            {isLoading ? 'Processing...' : isApprove ? '✓ Approve' : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}
