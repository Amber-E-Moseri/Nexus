import { isTaskCompleted } from '../../../lib/taskStatuses'

// Subtask completion indicator: thin progress bar + fraction count.
// Color: neutral track at 0%, amber while partial, green at 100%.
// "Completed" = subtask status category is `completed` (the done category).
export default function SubtaskProgress({ subtasks = [], compact = false, showFraction = true }) {
  const total = subtasks?.length ?? 0
  if (total === 0) return null

  const done = subtasks.filter((subtask) => isTaskCompleted(subtask)).length
  const pct = Math.round((done / total) * 100)
  const fillColor = pct >= 100 ? '#2D8653' : pct > 0 ? '#C47E0A' : 'transparent'

  return (
    <span
      title={`${done} of ${total} subtasks completed`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: compact ? 56 : 72,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          height: compact ? 3 : 4,
          minWidth: compact ? 36 : 44,
          borderRadius: 2,
          background: 'var(--border)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            background: fillColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </span>
      {showFraction ? (
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {done}/{total}
        </span>
      ) : null}
    </span>
  )
}
