import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import {
  addDependency,
  getLinkableTasks,
  getTaskDependencies,
  removeDependency,
} from '../lib/tasks'
import { getTaskStatusColor } from '../../../lib/taskStatuses'

export default function TaskDependencies({ taskId, departmentId, sprintId }) {
  const { profile } = useAuth()
  const [deps, setDeps] = useState([])
  const [linkable, setLinkable] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selectedType, setSelectedType] = useState('blocking')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true

    Promise.all([
      getTaskDependencies(taskId),
      getLinkableTasks({ departmentId, sprintId, excludeTaskId: taskId }),
    ])
      .then(([dependencies, tasks]) => {
        if (!active) return
        setDeps(dependencies)
        setLinkable(tasks)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [taskId, departmentId, sprintId])

  // The picker shows the 50 most recent tasks; searching filters server-side
  // so older tasks stay reachable (BLW-16).
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      getLinkableTasks({ departmentId, sprintId, excludeTaskId: taskId, search })
        .then((tasks) => {
          if (active) setLinkable(tasks)
        })
        .catch(() => {})
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search, taskId, departmentId, sprintId])

  async function handleAdd() {
    if (!selectedId) return
    setSaving(true)
    try {
      await addDependency(taskId, selectedId, selectedType, profile.id)
      const updated = await getTaskDependencies(taskId)
      setDeps(updated)
      setAdding(false)
      setSelectedId('')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(depId) {
    await removeDependency(depId)
    setDeps((prev) => prev.filter((dep) => dep.id !== depId))
  }

  if (loading) return null

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
        }}
      >
        Dependencies {deps.length > 0 && `(${deps.length})`}
      </div>

      {deps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {deps.map((dep) => (
            <div
              key={dep.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 8,
                background: 'var(--surface-secondary)',
                border: '0.5px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                  background: dep.type === 'blocking' ? '#FCEBEB' : '#E6F1FB',
                  color: dep.type === 'blocking' ? 'var(--coral-dark)' : 'var(--status-progress-text)',
                }}
              >
                {dep.type === 'blocking' ? 'blocked by' : 'waiting on'}
              </span>
                <span
                  style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: getTaskStatusColor(dep.depends_on) || '#888780',
                  }}
                />
              <span
                style={{
                  flex: 1, fontSize: 12, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {dep.depends_on?.title}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(dep.id)}
                style={{
                  fontSize: 11, color: 'var(--text-tertiary)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div
          style={{
            padding: '10px', borderRadius: 8,
            background: 'var(--surface-secondary)',
            border: '0.5px solid var(--border)',
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks by title…"
            style={{
              width: '100%', fontSize: 11, padding: '5px 6px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'white', outline: 'none',
              marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              style={{
                fontSize: 11, padding: '5px 6px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'white', outline: 'none',
              }}
            >
              <option value="blocking">Blocked by</option>
              <option value="waiting_on">Waiting on</option>
            </select>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              style={{
                flex: 1, fontSize: 11, padding: '5px 6px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'white', outline: 'none',
              }}
            >
              <option value="">Select task…</option>
              {linkable
                .filter((task) => !deps.some((dep) => dep.depends_on?.id === task.id))
                .map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => { setAdding(false); setSelectedId('') }}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                border: '0.5px solid var(--border)', background: 'white',
                cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !selectedId}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: 'pointer', fontWeight: 500,
                opacity: saving || !selectedId ? 0.5 : 1,
              }}
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            fontSize: 11, color: 'var(--accent)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          + Add dependency
        </button>
      )}
    </div>
  )
}
