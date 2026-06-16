export const TASK_FIELD_OPTIONS = [
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due_date', label: 'Due Date' },
]

export const DEFAULT_TASK_FIELD_SETTINGS = {
  description: true,
  status: true,
  priority: true,
  assignee: true,
  due_date: true,
}

export function normalizeTaskFieldSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TASK_FIELD_SETTINGS }
  }

  return TASK_FIELD_OPTIONS.reduce((acc, option) => {
    acc[option.key] = value[option.key] !== false
    return acc
  }, {})
}

export function mergeTaskFieldSettings(...values) {
  return values.reduce(
    (acc, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return acc
      for (const option of TASK_FIELD_OPTIONS) {
        if (option.key in value) {
          acc[option.key] = value[option.key] !== false
        }
      }
      return acc
    },
    { ...DEFAULT_TASK_FIELD_SETTINGS },
  )
}
