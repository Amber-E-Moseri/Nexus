import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useMemo } from 'react'

export function AgendaItemDndProvider({ children, items, onItemsReorder }) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items])

  function handleDragEnd(event) {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const reordered = arrayMove(items, oldIndex, newIndex)
    onItemsReorder(reordered)
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay />
    </DndContext>
  )
}
