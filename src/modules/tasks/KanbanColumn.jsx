import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onStartAddTask,
  composer = null,
  readOnly = false,
  isOver: isOverProp,
}) {
  const { setNodeRef, isOver: isOverDroppable } = useDroppable({ id: status.id })
  const isOver = isOverProp ?? isOverDroppable

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
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onStartAddTask(status)}
            style={{
              marginLeft: 'auto',
              width: 22,
              height: 22,
              border: 'none',
              background: 'transparent',
              borderRadius: 6,
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            +
          </button>
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 10,
          minHeight: 420, padding: 2,
          borderRadius: 12,
          background: isOver ? 'rgba(123,104,238,0.06)' : 'transparent',
          border: isOver ? '1.5px dashed rgba(123,104,238,0.3)' : '1.5px dashed transparent',
          transition: 'background 0.15s, border 0.15s',
        }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
      </div>

      {!readOnly ? (
        composer ?? (
          <button
            type="button"
            onClick={() => onStartAddTask(status)}
            style={{
              width: '100%', marginTop: 8,
              padding: '8px 0', fontSize: 12,
              color: 'var(--text-tertiary)',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)'
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.background = 'var(--accent-light)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            + Add task
          </button>
        )
      ) : null}
    </div>
  )
}

export default memo(KanbanColumn)
