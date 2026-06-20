/**
 * Task type definitions and utilities
 * Defines the different types of tasks and their properties
 */

export type TaskType = 'fixed' | 'flexible' | 'personal'

export interface TaskTypeInfo {
  type: TaskType
  label: string
  icon: string
  description: string
  isDraggable: boolean
  isEditable: boolean
  isLocked: boolean
}

export const TASK_TYPE_INFO: Record<TaskType, TaskTypeInfo> = {
  fixed: {
    type: 'fixed',
    label: 'Fixed Deadline',
    icon: '🔒',
    description: 'Sprint, meeting, or campaign tasks with locked deadlines',
    isDraggable: false,
    isEditable: false,
    isLocked: true,
  },
  flexible: {
    type: 'flexible',
    label: 'Flexible',
    icon: '📌',
    description: 'Organizational or self-assigned tasks that can be rescheduled',
    isDraggable: true,
    isEditable: true,
    isLocked: false,
  },
  personal: {
    type: 'personal',
    label: 'Personal',
    icon: '👤',
    description: 'Private tasks visible only to you',
    isDraggable: true,
    isEditable: true,
    isLocked: false,
  },
}

/**
 * Determine task type based on task properties
 */
export function determineTaskType(task: {
  sprint_id?: string | null
  is_personal?: boolean
}): TaskType {
  if (task.sprint_id) {
    return 'fixed'
  }
  if (task.is_personal) {
    return 'personal'
  }
  return 'flexible'
}

/**
 * Get task type information
 */
export function getTaskTypeInfo(taskType: TaskType): TaskTypeInfo {
  return TASK_TYPE_INFO[taskType]
}

/**
 * Check if task can be dragged/rescheduled
 */
export function canDragTask(taskType: TaskType): boolean {
  return TASK_TYPE_INFO[taskType].isDraggable
}

/**
 * Check if task is locked
 */
export function isTaskLocked(taskType: TaskType): boolean {
  return TASK_TYPE_INFO[taskType].isLocked
}

/**
 * Get CSS class for task type styling
 */
export function getTaskTypeClassName(taskType: TaskType): string {
  switch (taskType) {
    case 'fixed':
      return 'task-fixed opacity-60 cursor-not-allowed'
    case 'personal':
      return 'task-personal'
    case 'flexible':
    default:
      return 'task-flexible'
  }
}

/**
 * Get tooltip text for task type
 */
export function getTaskTypeTooltip(taskType: TaskType): string {
  const info = TASK_TYPE_INFO[taskType]
  if (taskType === 'fixed') {
    return 'This task has a fixed deadline and cannot be rescheduled'
  }
  return info.description
}
