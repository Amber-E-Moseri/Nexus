import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

export default function KanbanColumn({ status, tasks, onTaskClick, onAddTask, readOnly = false }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div
      style={{
        minWidth: 256, maxWidth: 280, flex: '0 0 256px',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '0 2px 10px',
        }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status.color, flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
          {status.name}
        </span>
        <span
          style={{
            marginLeft: 'auto', minWidth: 20, height: 18, borderRadius: 20,
            background: 'var(--surface-secondary)',
            fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 6px',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 120, padding: 4,
          borderRadius: 10,
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

      {/* Add task */}
      {!readOnly && onAddTask ? (
        <button
          type="button"
          onClick={() => onAddTask(status.id)}
          style={{
            width: '100%', marginTop: 6,
            padding: '7px 0', fontSize: 12,
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 8,
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
      ) : null}
    </div>
  )
}
