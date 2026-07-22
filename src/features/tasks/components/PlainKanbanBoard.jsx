import { memo } from 'react'
import TaskCard from './TaskCard'

function PlainKanbanColumn({
  status,
  tasks,
  onTaskClick,
  readOnly = false,
  showSubtasks = true,
  checklistCounts = {},
  teamLabelByAssigneeId = null,
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
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            showSubtasks={showSubtasks}
            checklistCount={checklistCounts[task.id] ?? null}
            teamLabel={teamLabelByAssigneeId?.[task.assignee_id] ?? null}
          />
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
  showSubtasks = true,
  checklistCounts = {},
  teamLabelByAssigneeId = null,
}) {
  const tasks = filteredTasks ?? []
  const boardStatuses = statusesOverride?.length ? statusesOverride : statuses

  function taskMatchesStatus(task, status) {
    const ids = status._mergedIds ?? [status.id]
    if (ids.includes(task.status_id)) return true
    if (!task.status_id && task.status === status.legacy_key) return true
    if (!task.status_id && task.status && status.category) {
      const taskCat = task.status_category ?? task.status_definition?.category
      return taskCat === status.category
    }
    return false
  }

  const matchedIds = new Set()
  const groups = boardStatuses
    .map((status) => {
      const statusTasks = tasks.filter((task) => taskMatchesStatus(task, status))
      statusTasks.forEach((t) => matchedIds.add(t.id))
      return { status, statusTasks }
    })
  const ungrouped = tasks.filter((t) => !matchedIds.has(t.id))
  if (ungrouped.length > 0) {
    groups.push({ status: { id: '__other', name: 'Other', color: '#7A7D86', category: 'open', _mergedIds: ['__other'] }, statusTasks: ungrouped })
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
      {groups
        .filter(({ statusTasks }) => statusTasks.length > 0)
        .map(({ status, statusTasks }) => (
          <PlainKanbanColumn
            key={status.id}
            status={status}
            tasks={statusTasks}
            onTaskClick={onTaskClick}
            readOnly
            showSubtasks={showSubtasks}
            checklistCounts={checklistCounts}
            teamLabelByAssigneeId={teamLabelByAssigneeId}
          />
        ))}
    </div>
  )
})
