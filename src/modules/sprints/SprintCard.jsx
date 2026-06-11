import Badge from '../../components/ui/Badge'

const STATUS_LABELS = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  review: 'In Review',
  archived: 'Archived',
}

export default function SprintCard({ sprint, onClick, onDuplicate, onRestore }) {
  const isArchived = sprint.status === 'archived'

  const dateRange = sprint.start_date && sprint.end_date
    ? `${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} — ${new Date(sprint.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : sprint.start_date
      ? `Started ${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
      : 'No dates set'

  return (
    <div
      onClick={onClick}
      style={{
        background: isArchived ? 'var(--surface-secondary)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 20px',
        cursor: 'pointer',
        opacity: isArchived ? 0.72 : 1,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--card-shadow)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {sprint.name}
          </div>
          {sprint.goal && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {sprint.goal}
            </div>
          )}
        </div>
        <Badge tone={sprint.status}>{STATUS_LABELS[sprint.status] ?? sprint.status}</Badge>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>📅 {dateRange}</span>
        {isArchived && onRestore ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRestore(sprint.id) }}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Restore
          </button>
        ) : null}
        {onDuplicate ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate(sprint.id) }}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Duplicate
          </button>
        ) : null}
      </div>
    </div>
  )
}
