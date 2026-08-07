import { useState } from 'react'
import { CheckCircle2, X, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const TOOL_LABELS = {
  nova_assign_task: 'Assign Task',
  nova_create_task: 'Create Task',
  nova_add_agenda_item: 'Add Agenda Item',
}

async function callNovaAction(proposalId, confirmationToken) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated.')

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nova-action`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ proposalId, confirmationToken }),
    },
  )

  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error ?? `Action failed (${resp.status})`)
  return data
}

export default function ConfirmAction({ proposal, onComplete }) {
  const [state, setState] = useState('idle') // 'idle' | 'confirming' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !proposal) return null

  const toolLabel = TOOL_LABELS[proposal.toolName] ?? proposal.toolName
  const expired = proposal.expiresAt && new Date(proposal.expiresAt) <= new Date()

  async function handleConfirm() {
    setState('confirming')
    setErrorMsg(null)
    try {
      const result = await callNovaAction(proposal.proposalId, proposal.confirmationToken)
      setState('success')
      onComplete?.({ success: true, result })
    } catch (err) {
      setState('error')
      setErrorMsg(err?.message || 'Action failed. Please try again.')
    }
  }

  function handleCancel() {
    setDismissed(true)
    onComplete?.({ success: false, cancelled: true })
  }

  return (
    <div style={{
      marginTop: 10,
      border: '1px solid var(--border-light)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 8,
      overflow: 'hidden',
      fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 12px',
        background: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <ShieldCheck size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>
          Nova wants to {toolLabel}
        </span>
        <button
          type="button"
          onClick={handleCancel}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {proposal.displayTitle}
        </div>
        {proposal.displayDescription && (
          <div style={{ color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: 10 }}>
            {proposal.displayDescription}
          </div>
        )}

        {state === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontWeight: 600 }}>
            <CheckCircle2 size={14} />
            Done — action completed successfully.
          </div>
        )}

        {state === 'error' && (
          <div style={{ color: '#DC2626', marginBottom: 8 }}>{errorMsg}</div>
        )}

        {expired && state === 'idle' && (
          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            This proposal has expired. Ask Nova again to generate a new one.
          </div>
        )}

        {!expired && state !== 'success' && (
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={state === 'confirming'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 11,
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: state === 'confirming' ? 'not-allowed' : 'pointer',
                opacity: state === 'confirming' ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {state === 'confirming' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
              {state === 'confirming' ? 'Working…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={state === 'confirming'}
              style={{
                padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: 11,
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
                cursor: state === 'confirming' ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
