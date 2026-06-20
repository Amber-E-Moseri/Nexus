import { memo } from 'react'
import TaskCard from './TaskCard'

function PlainKanbanColumn({
  status,
  tasks,
  onTaskClick,
  readOnly = false,
}) {
  return (
    <div
      style={{
        minWidth: 270, maxWidth: 270, flex: '0 0 270px',
        display: 'flex', flexDirection: 'column', gap: 0,
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: '#FCFAF6',
        padding: 10,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '2px 4px 10px',
        }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status.color, flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {status.name}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginLeft: 4 }}>
          {tasks.length}
        </span>
      </div>

      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 10,
          minHeight: 420, padding: 2,
          borderRadius: 12,
          background: 'transparent',
          border: '1.5px dashed transparent',
        }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  )
}

export default memo(function PlainKanbanBoard({
  onTaskClick,
  filteredTasks,
  statusesOverride = null,
  statuses = [],
}) {
  const tasks = filteredTasks ?? []
  const boardStatuses = statusesOverride?.length ? statusesOverride : statuses

  function taskMatchesStatus(task, status) {
    return task.status_id === status.id || (!task.status_id && task.status === status.legacy_key)
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        overflowY: 'visible',
        height: '100%',
        paddingBottom: 8,
        alignItems: 'flex-start',
      }}
    >
      {boardStatuses.map((status) => (
        <PlainKanbanColumn
          key={status.id}
          status={status}
          tasks={tasks.filter((task) => taskMatchesStatus(task, status))}
          onTaskClick={onTaskClick}
          readOnly
        />
      ))}
    </div>
  )
})
