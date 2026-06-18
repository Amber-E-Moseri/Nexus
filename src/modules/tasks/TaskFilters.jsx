import { useState } from 'react'
import { PRIORITIES } from '../../lib/constants'

const DUE_RANGES = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'this_week', label: 'This week' },
]

const TASK_TYPES = [
  { value: 'space', label: 'Space' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'personal', label: 'Personal' },
]

const SOURCE_LABELS = {
  manual: 'Manual',
  meeting: 'Meeting',
  automation: 'Automation',
  admin_processor: 'Admin',
  zoom: 'Zoom',
}

const PILL_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'white',
  color: 'var(--text-secondary)',
  transition: 'all 0.15s',
}

const PILL_ACTIVE = {
  background: 'var(--accent-light)',
  color: 'var(--accent)',
  borderColor: 'var(--accent)',
}

function FilterPill({ label, active, onRemove, onClick }) {
  return (
    <span
      style={{ ...PILL_BASE, ...(active ? PILL_ACTIVE : {}) }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {label}
      {active ? (
        <span
          style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          ×
        </span>
      ) : null}
    </span>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
      {children}
    </div>
  )
}

export default function TaskFilters({ filters, setFilters, clearFilters, hasActiveFilters, members = [], statuses = [], tasks = [] }) {
  const [showFilters, setShowFilters] = useState(false)
  const availableSources = Array.from(new Set(tasks.map((task) => task.source ?? 'manual')))
  const availableTypes = Array.from(new Set(tasks.map((task) => task.task_type).filter(Boolean)))
  const assigneeOptions = members.length > 0
    ? members
    : Array.from(
      new Map(
        tasks
          .filter((task) => task.assignee?.id)
          .map((task) => [task.assignee.id, { id: task.assignee.id, name: task.assignee.name }]),
      ).values(),
    )

  function toggleMulti(key, value) {
    setFilters((prev) => {
      const arr = prev[key]
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      }
    })
  }

  function toggleDueRange(value) {
    setFilters((prev) => ({ ...prev, dueDateRange: prev.dueDateRange === value ? null : value }))
  }

  function toggleBoolean(key) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 10,
          border: hasActiveFilters() ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: hasActiveFilters() ? 'var(--accent-light)' : 'white',
          color: hasActiveFilters() ? 'var(--accent)' : 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 16 }}>⚙️</span>
        {showFilters ? 'Hide filters' : 'Show filters'}
        {hasActiveFilters() && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--accent)',
              color: 'white',
              borderRadius: 999,
              padding: '2px 6px',
            }}
          >
            {Object.values(filters).flat().filter(Boolean).length}
          </span>
        )}
      </button>

      {showFilters && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <SectionTitle>Status</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {statuses.map((status) => (
                <FilterPill
                  key={status.id}
                  label={status.name}
                  active={filters.status.includes(status.id)}
                  onClick={() => toggleMulti('status', status.id)}
                  onRemove={() => toggleMulti('status', status.id)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <SectionTitle>Due Date</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DUE_RANGES.map((range) => (
                <FilterPill
                  key={range.value}
                  label={range.label}
                  active={filters.dueDateRange === range.value}
                  onClick={() => toggleDueRange(range.value)}
                  onRemove={() => toggleDueRange(range.value)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <SectionTitle>Priority</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRIORITIES.map((priority) => (
                <FilterPill
                  key={priority.value}
                  label={priority.label}
                  active={filters.priority.includes(priority.value)}
                  onClick={() => toggleMulti('priority', priority.value)}
                  onRemove={() => toggleMulti('priority', priority.value)}
                />
              ))}
            </div>
          </div>

          {assigneeOptions.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <SectionTitle>Assignee</SectionTitle>
              <select
                value={filters.assigneeId ?? ''}
                onChange={(event) => setFilters((prev) => ({ ...prev, assigneeId: event.target.value || null }))}
                style={{
                  width: '100%',
                  fontSize: 13,
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: filters.assigneeId ? 'var(--accent-light)' : 'white',
                  color: filters.assigneeId ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                <option value="">Any assignee</option>
                {assigneeOptions.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          {availableTypes.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <SectionTitle>Task Type</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TASK_TYPES.filter((option) => availableTypes.includes(option.value)).map((option) => (
                  <FilterPill
                    key={option.value}
                    label={option.label}
                    active={filters.taskType.includes(option.value)}
                    onClick={() => toggleMulti('taskType', option.value)}
                    onRemove={() => toggleMulti('taskType', option.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {availableSources.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <SectionTitle>Source</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableSources.map((source) => (
                  <FilterPill
                    key={source}
                    label={SOURCE_LABELS[source] ?? source}
                    active={filters.source.includes(source)}
                    onClick={() => toggleMulti('source', source)}
                    onRemove={() => toggleMulti('source', source)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 10 }}>
            <SectionTitle>More</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <FilterPill
                label="Include completed"
                active={filters.showDone}
                onClick={() => toggleBoolean('showDone')}
                onRemove={() => toggleBoolean('showDone')}
              />
              <FilterPill
                label="Has comments"
                active={filters.hasComments}
                onClick={() => toggleBoolean('hasComments')}
                onRemove={() => toggleBoolean('hasComments')}
              />
              <FilterPill
                label="Has dependencies"
                active={filters.hasDependencies}
                onClick={() => toggleBoolean('hasDependencies')}
                onRemove={() => toggleBoolean('hasDependencies')}
              />
            </div>
          </div>

          {hasActiveFilters() ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 6,
                }}
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
