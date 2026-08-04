import { Search, X } from 'lucide-react'

export function filterTasksBySearch(tasks, query) {
  const term = query.trim().toLowerCase()
  if (!term) return tasks
  return tasks.filter((task) => [task.title, task.description, task.notes]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term)))
}

export default function TaskSearchInput({ value, onChange }) {
  return (
    <div style={{ position: 'relative', width: 190, maxWidth: '100%' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tasks"
        aria-label="Search tasks"
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 29px 7px 30px', border: '1px solid transparent', borderRadius: 8, background: 'var(--surface-secondary)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12 }}
      />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear task search" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', padding: 2, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={13} /></button>}
    </div>
  )
}
