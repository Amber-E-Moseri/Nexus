import { arrayMove } from '@dnd-kit/sortable'

const STEP = 1000

/**
 * Moves activeId to the position of overId within an array of tasks,
 * then reassigns sort_order as 1000, 2000, 3000, …
 */
export function reorderInColumn(tasks, activeId, overId) {
  const oldIndex = tasks.findIndex((t) => t.id === activeId)
  const newIndex = tasks.findIndex((t) => t.id === overId)
  if (oldIndex === -1 || newIndex === -1) return tasks

  const reordered = arrayMove(tasks, oldIndex, newIndex)
  return recalcSortOrders(reordered)
}

/**
 * Assigns sort_order = (index + 1) * 1000 to every task in display order.
 */
export function recalcSortOrders(tasks) {
  return tasks.map((task, i) => ({ ...task, sort_order: (i + 1) * STEP }))
}

/**
 * Returns a sort_order value suitable for inserting at targetIndex
 * without moving surrounding items. Uses midpoint of neighbours.
 * Falls back to recalc if neighbours are adjacent integers.
 */
export function placeholderSortOrder(tasks, targetIndex) {
  if (!tasks.length) return STEP
  if (targetIndex <= 0) return (tasks[0]?.sort_order ?? STEP) - STEP
  if (targetIndex >= tasks.length) return (tasks[tasks.length - 1]?.sort_order ?? tasks.length * STEP) + STEP

  const before = tasks[targetIndex - 1]?.sort_order ?? (targetIndex * STEP)
  const after  = tasks[targetIndex]?.sort_order ?? ((targetIndex + 1) * STEP)

  const mid = Math.floor((before + after) / 2)
  // If there's no room for a midpoint, just place at targetIndex * STEP
  return mid !== before && mid !== after ? mid : targetIndex * STEP
}
