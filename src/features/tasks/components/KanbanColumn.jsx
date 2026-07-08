import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { FONT_HEADING } from '../../../lib/fonts'

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
        border: '1px solid var(--border-1)',
        borderRadius: 16,
        background: 'var(--surface-sub)',
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
        <span style={{ fontFamily: FONT_HEADING, fontSize: 12, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {status.name}
        </span>
        <span
          style={{
            fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', marginLeft: 4,
            background: 'white', border: '1px solid var(--border-1)',
            borderRadius: 999, padding: '1px 7px', lineHeight: '16px',
          }}
        >
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
          background: isOver ? 'var(--purple-tint)' : 'transparent',
          border: isOver ? '1.5px dashed var(--purple-500)' : '1.5px dashed transparent',
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
              e.currentTarget.style.color = 'var(--purple-700)'
              e.currentTarget.style.borderColor = 'var(--purple-500)'
              e.currentTarget.style.background = 'var(--purple-tint)'
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
