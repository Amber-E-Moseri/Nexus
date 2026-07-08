import { supabase } from '../../../lib/supabase'

// Registry of queryable data sources for ChartWidget / CalculationWidget.
// Reads go through the normal Supabase client, so RLS scopes rows to the
// signed-in user's department the same way every other page does — no
// department_id filter is added here.
export const DATA_SOURCES = {
  tasks: {
    label: 'Tasks',
    table: 'tasks',
    select: 'status, priority, source',
    groupFields: [
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'source', label: 'Source' },
    ],
    numericFields: [],
    applyFilters: (query) => query.eq('is_personal', false).is('parent_task_id', null),
  },
  meeting_attendance: {
    label: 'Meeting Attendance',
    table: 'meeting_attendance',
    select: 'status',
    groupFields: [
      { key: 'status', label: 'Status' },
    ],
    numericFields: [],
  },
  members: {
    label: 'Members',
    table: 'users',
    select: 'role',
    groupFields: [
      { key: 'role', label: 'Role' },
    ],
    numericFields: [],
  },
  goals: {
    label: 'Goals',
    table: 'goals',
    select: 'status, target_value, current_value',
    groupFields: [
      { key: 'status', label: 'Status' },
    ],
    numericFields: [
      { key: 'target_value', label: 'Target Value' },
      { key: 'current_value', label: 'Current Value' },
    ],
  },
}

export const METRICS = [
  { key: 'count', label: 'Count' },
  { key: 'sum', label: 'Sum' },
  { key: 'avg', label: 'Average' },
  { key: 'min', label: 'Min' },
  { key: 'max', label: 'Max' },
]

function computeMetric(rows, metric, field) {
  if (metric === 'count' || !field) return rows.length

  const nums = rows.map((r) => Number(r[field])).filter((n) => !Number.isNaN(n))
  if (nums.length === 0) return 0

  switch (metric) {
    case 'sum': return nums.reduce((a, b) => a + b, 0)
    case 'avg': return +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
    case 'min': return Math.min(...nums)
    case 'max': return Math.max(...nums)
    default: return rows.length
  }
}

// Fetches rows for a source and aggregates them, optionally grouped by a field.
// Returns [{ label, value }] — a single-entry array with label "All" when no groupBy is set.
export async function fetchAggregatedData({ source, metric = 'count', field, groupBy }) {
  const def = DATA_SOURCES[source]
  if (!def) return []

  let query = supabase.from(def.table).select(def.select)
  if (def.applyFilters) query = def.applyFilters(query)

  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []

  if (!groupBy) {
    return [{ label: def.label, value: computeMetric(rows, metric, field) }]
  }

  const groups = new Map()
  for (const row of rows) {
    const key = row[groupBy] ?? '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  return Array.from(groups.entries()).map(([key, groupRows]) => ({
    label: String(key),
    value: computeMetric(groupRows, metric, field),
  }))
}

// Fetches a single aggregate number for a source/field/aggregation — used by CalculationWidget.
export async function fetchCalculation({ source, aggregation = 'count', field }) {
  const result = await fetchAggregatedData({ source, metric: aggregation, field })
  return result[0]?.value ?? 0
}
