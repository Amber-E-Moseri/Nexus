import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useDeleteParticipant } from '../hooks/useICPLCProfile.js'

/** Permanent delete, behind an explicit confirmation. Only rendered for super admin / regional secretary. */
export default function DeleteParticipantDialog({ participant, onClose, onDeleted }) {
  const del = useDeleteParticipant()

  async function confirm() {
    await del.mutateAsync(participant.id)
    onDeleted?.()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !del.isPending) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)' }} />
        <Dialog.Content className="icplc-dialog" aria-describedby="icplc-delete-desc">
          <Dialog.Title style={{ margin: '0 0 8px', fontSize: 16 }}>Delete {participant.full_name}?</Dialog.Title>
          <p id="icplc-delete-desc" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            This permanently removes <strong>{participant.full_name}</strong>
            {participant.email ? ` (${participant.email})` : ''} from ICPLC, along with their tags, registration links and claimed emails.
            Past import rows are kept but will no longer point to anyone. This can't be undone.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            If this person is a duplicate, use <strong>Merge</strong> instead so their details are kept.
          </p>
          {del.isError && (
            <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#991B1B', background: '#FEF2F2', borderRadius: 6, padding: '6px 10px' }}>
              Could not delete: {del.error?.message}
            </div>
          )}
          <div className="icplc-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="icplc-btn" onClick={onClose} disabled={del.isPending}>Cancel</button>
            <button type="button" className="icplc-btn icplc-btn-primary" onClick={confirm} disabled={del.isPending}
              style={{ background: '#B42318' }}>
              {del.isPending ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
