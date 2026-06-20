import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'

export function SortableAgendaRow({
  item,
  index,
  timing,
  onUpdate,
  onDelete,
  errors,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })
  const [isHovered, setIsHovered] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`agenda-item-${item.id}`}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 2fr 2fr 1fr 1fr 50px',
          gap: 0,
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #E5DDD0',
          background: isDragging ? 'rgba(76, 42, 146, 0.06)' : 'white',
          transition: 'background .2s',
        }}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            color: isHovered ? '#4C2A92' : '#CCC3B0',
            fontSize: 16,
            userSelect: 'none',
            touchAction: 'none',
          }}
          title="Drag to reorder"
        >
          ⋮⋮
        </div>

        {/* S/N (Auto-calculated) */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#9E9488',
            paddingLeft: 8,
          }}
        >
          {index + 1}.
        </div>

        {/* Segment */}
        <div>
          <input
            type="text"
            value={item.segment}
            onChange={(e) => onUpdate(item.id, { segment: e.target.value })}
            placeholder="e.g., Opening Prayer"
            style={{
              width: '100%',
              fontSize: 13,
              padding: '6px 8px',
              border: errors[`segment-${index}`] ? '1px solid #DC3545' : '1px solid #E5DDD0',
              borderRadius: 6,
              outline: 'none',
              background: errors[`segment-${index}`] ? 'rgba(220, 53, 69, 0.04)' : 'white',
              color: '#0C0E18',
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <input
            type="text"
            value={item.notes}
            onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
            placeholder="Optional notes"
            style={{
              width: '100%',
              fontSize: 13,
              padding: '6px 8px',
              border: '1px solid #E5DDD0',
              borderRadius: 6,
              outline: 'none',
              background: 'white',
              color: '#0C0E18',
            }}
          />
        </div>

        {/* Duration */}
        <div>
          <input
            type="number"
            value={item.duration}
            onChange={(e) => onUpdate(item.id, { duration: parseInt(e.target.value, 10) || 0 })}
            min="1"
            placeholder="15"
            style={{
              width: '100%',
              fontSize: 13,
              padding: '6px 8px',
              border: errors[`duration-${index}`] ? '1px solid #DC3545' : '1px solid #E5DDD0',
              borderRadius: 6,
              outline: 'none',
              background: errors[`duration-${index}`] ? 'rgba(220, 53, 69, 0.04)' : 'white',
              color: '#0C0E18',
            }}
          />
        </div>

        {/* Timing (Read-only) */}
        <div
          style={{
            fontSize: 11,
            color: '#9E9488',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {timing}
        </div>

        {/* Delete Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#CCC3B0',
              fontSize: 18,
              cursor: 'pointer',
              padding: '4px 8px',
              transition: 'color .2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#DC3545')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#CCC3B0')}
            title="Delete item"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
