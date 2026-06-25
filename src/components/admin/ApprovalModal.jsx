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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
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
              color: '#2c2c2a',
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
              color: '#999',
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
            backgroundColor: '#f9f7f3',
            borderRadius: '8px',
            border: '1px solid #e0d5c8',
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase' }}>
              Campus
            </label>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, fontWeight: 600, color: '#2c2c2a' }}>
              {edit.campuses?.name || 'Unknown'}
            </p>
            {edit.campuses?.institution && (
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#666' }}>
                {edit.campuses.institution}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase' }}>
              Field
            </label>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, fontFamily: 'Monaco, monospace', color: '#2c2c2a' }}>
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
              <label style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase' }}>
                Old Value
              </label>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: 12,
                  fontFamily: 'Monaco, monospace',
                  color: '#666',
                  backgroundColor: 'white',
                  padding: '8px',
                  borderRadius: 4,
                  border: '1px solid #e0d5c8',
                  wordBreak: 'break-word',
                }}
              >
                {edit.old_value || '(empty)'}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#667eea', textTransform: 'uppercase' }}>
                New Value
              </label>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: 12,
                  fontFamily: 'Monaco, monospace',
                  fontWeight: 600,
                  color: '#2c2c2a',
                  backgroundColor: '#e8f4ff',
                  padding: '8px',
                  borderRadius: 4,
                  border: '1px solid #667eea',
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
              color: '#999',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            {isApprove ? 'Optional Notes' : 'Rejection Reason'} {!isApprove && <span style={{ color: '#ef4444' }}>*</span>}
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
              color: '#2c2c2a',
              border: '1px solid #e0d5c8',
              borderRadius: '8px',
              outline: 'none',
              resize: 'vertical',
              backgroundColor: isLoading ? '#f5f5f5' : 'white',
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
              background: '#f0f0f0',
              color: '#2c2c2a',
              border: '1px solid #d0d0d0',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#e0e0e0'
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#f0f0f0'
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
              background: isApprove ? '#10b981' : '#ef4444',
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
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
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
