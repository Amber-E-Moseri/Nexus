const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
]

const DUE_RANGES = [
  { value: 'overdue',   label: 'Overdue' },
  { value: 'today',     label: 'Due today' },
  { value: 'this_week', label: 'This week' },
]

const PILL_BASE = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'white', color: 'var(--text-secondary)',
  transition: 'all 0.15s',
}

const PILL_ACTIVE = {
  background: 'var(--accent-light)', color: 'var(--accent)',
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
      {active && (
        <span
          style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          ×
        </span>
      )}
    </span>
  )
}

export default function TaskFilters({ filters, setFilters, clearFilters, hasActiveFilters, members = [], statuses = [] }) {
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

  function toggleShowDone() {
    setFilters((prev) => ({ ...prev, showDone: !prev.showDone }))
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 6, padding: '8px 0',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginRight: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Filter
      </span>

      {statuses.map((status) => (
        <FilterPill
          key={status.id}
          label={status.name}
          active={filters.status.includes(status.id)}
          onClick={() => toggleMulti('status', status.id)}
          onRemove={() => toggleMulti('status', status.id)}
        />
      ))}

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

      {PRIORITIES.map((p) => (
        <FilterPill
          key={p.value}
          label={p.label}
          active={filters.priority.includes(p.value)}
          onClick={() => toggleMulti('priority', p.value)}
          onRemove={() => toggleMulti('priority', p.value)}
        />
      ))}

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

      {DUE_RANGES.map((d) => (
        <FilterPill
          key={d.value}
          label={d.label}
          active={filters.dueDateRange === d.value}
          onClick={() => toggleDueRange(d.value)}
          onRemove={() => toggleDueRange(d.value)}
        />
      ))}

      <FilterPill
        label="Show done"
        active={filters.showDone}
        onClick={toggleShowDone}
        onRemove={toggleShowDone}
      />

      {members.length > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
          <select
            value={filters.assigneeId ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, assigneeId: e.target.value || null }))
            }
            style={{
              ...PILL_BASE,
              ...(filters.assigneeId ? PILL_ACTIVE : {}),
              appearance: 'none', paddingRight: 10,
            }}
          >
            <option value="">Assignee</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </>
      )}

      {hasActiveFilters() && (
        <button
          type="button"
          onClick={clearFilters}
          style={{
            marginLeft: 4, fontSize: 12, color: 'var(--text-tertiary)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '3px 6px', borderRadius: 6,
          }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
