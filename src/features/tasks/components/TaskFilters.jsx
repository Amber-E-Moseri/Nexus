import { useState } from 'react'
import { PRIORITIES } from '../../../lib/constants'

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

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getThisWeekDates() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  return { start: formatDate(startOfWeek), end: formatDate(endOfWeek) }
}

function getNextWeekDates() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek + 7)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  return { start: formatDate(startOfWeek), end: formatDate(endOfWeek) }
}

function getThisMonthDates() {
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start: formatDate(startOfMonth), end: formatDate(endOfMonth) }
}

function getNext30DaysDates() {
  const today = new Date()
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)
  return { start: formatDate(today), end: formatDate(in30Days) }
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
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
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
            <SectionTitle>Date Range</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>From</label>
                  <input
                    type="date"
                    value={filters.dateRange?.startDate ?? ''}
                    onChange={(e) => setFilters((prev) => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, startDate: e.target.value || null }
                    }))}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '6px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: filters.dateRange?.startDate ? 'var(--accent-light)' : 'white',
                      color: filters.dateRange?.startDate ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>To</label>
                  <input
                    type="date"
                    value={filters.dateRange?.endDate ?? ''}
                    onChange={(e) => setFilters((prev) => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, endDate: e.target.value || null }
                    }))}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '6px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: filters.dateRange?.endDate ? 'var(--accent-light)' : 'white',
                      color: filters.dateRange?.endDate ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: 'This Week', fn: () => getThisWeekDates() },
                  { label: 'Next Week', fn: () => getNextWeekDates() },
                  { label: 'This Month', fn: () => getThisMonthDates() },
                  { label: 'Next 30 Days', fn: () => getNext30DaysDates() },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const { start, end } = preset.fn()
                      setFilters((prev) => ({
                        ...prev,
                        dateRange: { startDate: start, endDate: end }
                      }))
                    }}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'white',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--accent-light)'
                      e.target.style.color = 'var(--accent)'
                      e.target.style.borderColor = 'var(--accent)'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'white'
                      e.target.style.color = 'var(--text-secondary)'
                      e.target.style.borderColor = 'var(--border)'
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
                {(filters.dateRange?.startDate || filters.dateRange?.endDate) && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({
                      ...prev,
                      dateRange: { startDate: null, endDate: null }
                    }))}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'white',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
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
            <SectionTitle>Milestone</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { value: 'no_milestone', label: 'No milestone' },
                { value: 'milestone_overdue', label: 'Milestone overdue' },
                { value: 'milestone_today', label: 'Milestone due today' },
                { value: 'milestone_upcoming', label: 'Milestone upcoming' },
              ].map((option) => (
                <FilterPill
                  key={option.value}
                  label={option.label}
                  active={filters.milestoneStatus?.includes(option.value)}
                  onClick={() => toggleMulti('milestoneStatus', option.value)}
                  onRemove={() => toggleMulti('milestoneStatus', option.value)}
                />
              ))}
            </div>
          </div>

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
