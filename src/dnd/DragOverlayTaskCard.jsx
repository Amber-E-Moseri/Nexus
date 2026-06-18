function Avatar({ name = '', size = 20 }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'

  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#4C2A92',
        color: '#fff',
        fontSize: size * 0.42,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1.5px solid #fff',
        marginLeft: -4,
      }}
    >
      {initials}
    </div>
  )
}

function PriorityPill({ priority }) {
  if (!priority) return null
  const map = {
    urgent: { bg: '#FEF0ED', color: '#C94830' },
    high:   { bg: '#FFF3E0', color: '#E65100' },
    medium: { bg: '#FEF9E7', color: '#9A6000' },
    low:    { bg: '#F4F1EA', color: '#9E9488' },
  }
  const s = map[priority?.toLowerCase()] ?? map.low
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      borderRadius: 999,
      padding: '2px 7px',
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'capitalize',
      flexShrink: 0,
    }}>
      {priority}
    </span>
  )
}

export function DragOverlayTaskCard({ task }) {
  if (!task) return null

  const assignees    = task.assignees ?? (task.assignee ? [task.assignee] : [])
  const subtaskCount = task.subtask_count ?? task.subtasks?.length ?? 0
  const commentCount = task.comment_count ?? task.comments?.length ?? 0
  const dueDate      = task.due_date ? new Date(task.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : null
  const listLabel    = task.list_name ?? task.list?.name ?? task.status ?? ''

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      padding: '10px 12px',
      boxShadow: '0 20px 48px rgba(28,22,16,.22), 0 4px 12px rgba(76,42,146,.12)',
      transform: 'rotate(1.5deg)',
      opacity: 0.97,
      pointerEvents: 'none',
      minWidth: 220,
      maxWidth: 320,
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Row 1: list label + priority */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#7A6F5E', textTransform: 'uppercase', letterSpacing: '.07em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {listLabel}
        </span>
        <PriorityPill priority={task.priority} />
      </div>

      {/* Row 2: title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1610', lineHeight: 1.35, wordBreak: 'break-word' }}>
        {task.title ?? task.name ?? '(untitled)'}
      </div>

      {/* Row 3: avatars + counts + due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Assignee avatars */}
        {assignees.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
            {assignees.slice(0, 3).map((a, i) => (
              <Avatar key={i} name={a?.name ?? a?.full_name ?? a ?? ''} size={20} />
            ))}
          </div>
        )}

        {/* Subtasks */}
        {subtaskCount > 0 && (
          <span style={{ fontSize: 11, color: '#9E9488', display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
              <rect x={1} y={1} width={10} height={10} rx={2} stroke="#9E9488" strokeWidth={1.5} />
              <path d="M4 6l1.5 1.5L8 4" stroke="#9E9488" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {subtaskCount}
          </span>
        )}

        {/* Comments */}
        {commentCount > 0 && (
          <span style={{ fontSize: 11, color: '#9E9488', display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
              <path d="M10 1H2a1 1 0 00-1 1v6a1 1 0 001 1h1v2l2.5-2H10a1 1 0 001-1V2a1 1 0 00-1-1z" stroke="#9E9488" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
            {commentCount}
          </span>
        )}

        {/* Due date */}
        {dueDate && (
          <span style={{ fontSize: 11, color: '#9E9488', marginLeft: 'auto' }}>{dueDate}</span>
        )}
      </div>
    </div>
  )
}
