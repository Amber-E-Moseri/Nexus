import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableTaskCard from '@/dnd/SortableTaskCard.jsx'

function DroppableStatusColumnComponent({
  columnId,
  label,
  color = '#7A7D86',
  tasks = [],
  people = {},
  priorities,
  statuses = [],
  columnWidth = 286,
  isMobile = false,
  isOver = false,
  onTaskClick,
  onAddClick,
  adding = false,
  newTitle = '',
  onNewTitle,
  onAddKey,
  onAddBlur,
}) {
  const { setNodeRef } = useDroppable({ id: columnId })
  const isEmpty = tasks.length === 0
  const emptyPulse = isOver && isEmpty ? 'pulse-border 1.2s ease-in-out infinite' : 'none'

  return (
    <>
      <style>
        {'@keyframes pulse-border { 0%, 100% { border-color: #C9C0B0; } 50% { border-color: #6B4BBE; } }'}
      </style>
      <div
        style={{
          flex: `0 0 ${columnWidth}px`,
          width: columnWidth,
          display: 'flex',
          flexDirection: 'column',
          border: isOver ? '2px solid #6B4BBE' : '1px solid #EDE8DC',
          borderRadius: 12,
          background: isOver ? '#F3EFFA' : '#F9F7F3',
          boxShadow: isOver ? 'inset 0 0 0 2px rgba(107,75,190,.15)' : 'none',
          padding: 10,
          transition: 'background 100ms ease-in, border-color 100ms ease-in, box-shadow 100ms ease-in',
          boxSizing: 'border-box',
          scrollSnapAlign: 'start',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px 10px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1C1610', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            marginLeft: 2,
            borderRadius: 999,
            padding: '0 7px',
            background: tasks.length > 0 ? '#F2EEE6' : 'transparent',
            color: tasks.length > 0 ? '#7A6F5E' : '#C9C0B0',
          }}
        >
          {tasks.length}
        </span>
        {onAddClick ? (
          <button
            type="button"
            onClick={() => onAddClick(columnId)}
            style={{
              marginLeft: 'auto',
              width: 22,
              height: 22,
              border: 'none',
              background: 'transparent',
              borderRadius: 6,
              color: '#B0A696',
              cursor: 'pointer',
              fontSize: 17,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onFocus={(event) => {
              event.currentTarget.style.outline = '2px solid #4C2A92'
              event.currentTarget.style.outlineOffset = '2px'
            }}
            onBlur={(event) => {
              event.currentTarget.style.outline = 'none'
            }}
          >
            +
          </button>
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          minHeight: 80,
          padding: 2,
          borderRadius: 8,
          background: isOver ? '#F3EFFA' : 'transparent',
          border: isOver ? '1.5px dashed rgba(107,75,190,.45)' : '1.5px dashed transparent',
          transition: 'background 100ms ease-in, border 100ms ease-in',
          flex: 1,
          animation: emptyPulse,
        }}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              people={people}
              statuses={statuses}
              priorities={priorities}
              isMobile={isMobile}
              onClick={onTaskClick}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !adding ? (
          <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 12, color: '#B0A696' }}>
            No tasks match your filter
          </div>
        ) : null}
      </div>

      {adding ? (
        <input
          autoFocus
          value={newTitle}
          onChange={(event) => onNewTitle?.(event.target.value)}
          onKeyDown={(event) => onAddKey?.(event, columnId)}
          onBlur={() => onAddBlur?.(columnId)}
          placeholder="Task name, then Enter..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 6,
            background: '#FFFFFF',
            border: '1px solid #EDE8DC',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: 'inherit',
            color: '#1C1610',
            outline: 'none',
          }}
        />
      ) : onAddClick ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onAddClick(columnId)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onAddClick(columnId)
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 6,
            padding: '8px 12px',
            fontSize: 13,
            color: '#9E9488',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            textAlign: 'left',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 15, lineHeight: 1, fontWeight: 400 }}>+</span> Add task
        </div>
      ) : null}
      </div>
    </>
  )
}

const DroppableStatusColumn = memo(DroppableStatusColumnComponent)

export default DroppableStatusColumn
