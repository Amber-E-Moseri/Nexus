import { useDraggable } from '@dnd-kit/core'
import { CalendarEventChip } from './CalendarEventCard'

export default function CalendarDraggableEvent({ event, onClick, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isLocalDragging } = useDraggable({
    id: `event-${event.id}`,
    data: { type: 'calendar-event', event },
  })

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isLocalDragging ? 0.5 : 1,
    transition: isLocalDragging ? 'none' : 'opacity 150ms ease',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="w-full"
      onClick={(e) => {
        if (!isLocalDragging) onClick?.(event)
        e.stopPropagation()
      }}
    >
      <CalendarEventChip event={event} />
    </div>
  )
}
