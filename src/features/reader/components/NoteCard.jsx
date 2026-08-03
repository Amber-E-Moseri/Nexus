import { IconHighlight, IconNote, IconTrash } from '../icons'

export default function NoteCard({ annotation, onRemove }) {
  const isHighlight = annotation.type === 'highlight'
  const time = new Date(annotation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`im-note-card ${isHighlight ? 'im-note-card--blue' : 'im-note-card--pink'}`}>
      <div style={{ fontSize: 12, color: 'var(--im-text)', lineHeight: 1.5, fontWeight: 500, marginBottom: 6 }}>
        {isHighlight ? annotation.text : annotation.content}
      </div>
      {!isHighlight && annotation.selectedText && (
        <div style={{ fontSize: 11, color: 'var(--im-text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
          "{annotation.selectedText}"
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`im-note-tag ${isHighlight ? 'im-note-tag--blue' : 'im-note-tag--pink'}`}>
          {isHighlight ? <IconHighlight size={10} /> : <IconNote size={10} />}
          {isHighlight ? 'Highlight' : 'Note'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--im-text-dim)' }}>{time}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(annotation.id) }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 2, display: 'flex', alignItems: 'center' }}
            title="Remove"
          >
            <IconTrash size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
