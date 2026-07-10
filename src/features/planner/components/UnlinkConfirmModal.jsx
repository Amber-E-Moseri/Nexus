import { PRIMARY, BORDER, TEXT, MUTED } from '../lib/plannerTheme'

// Shown when a linked subtask block is dragged away from its parent's block.
export default function UnlinkConfirmModal({ subtaskTitle, parentTitle, onUnlink, onKeepLinked, onCancel }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlink subtask?"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,22,16,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw', border: `1px solid ${BORDER}`, boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Unlink subtask?</div>
        <div style={{ fontSize: 13, color: TEXT, marginBottom: 4 }}>
          &lsquo;{subtaskTitle}&rsquo; is part of the &lsquo;{parentTitle}&rsquo; workflow.
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>
          Normally, this moves with the parent task. Do you want to schedule it separately?
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={btnStyle('ghost')}>Cancel</button>
          <button type="button" onClick={onKeepLinked} style={btnStyle('secondary')}>Keep Linked</button>
          <button type="button" onClick={onUnlink} style={btnStyle('primary')}>Unlink &amp; Schedule</button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(kind) {
  const base = { borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
  if (kind === 'primary') return { ...base, background: PRIMARY, color: '#fff', border: `1px solid ${PRIMARY}` }
  if (kind === 'secondary') return { ...base, background: 'white', color: PRIMARY, border: `1px solid ${PRIMARY}` }
  return { ...base, background: 'transparent', color: MUTED, border: '1px solid transparent' }
}
