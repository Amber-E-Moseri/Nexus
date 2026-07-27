import { useMemo, useState } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useToast } from '../../context/ToastContext'
import { useArchivedTasks } from '../../features/tasks/hooks/useArchivedTasks'
import { formatRelativeDate } from '../../lib/dateUtils'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

function ArchiveRow({ task, onUnarchive }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-1)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.title}
      </span>
      {task.department?.name ? (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            flexShrink: 0,
            color: '#FFFFFF',
            background: `#${task.department.color ?? '4C2A92'}`,
          }}
        >
          {task.department.name}
        </span>
      ) : null}
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0 }}>
        Archived {formatRelativeDate(task.archived_at) ?? ''}
      </span>
      <button
        type="button"
        onClick={() => onUnarchive(task)}
        title="Unarchive this task"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--border-1)',
          background: 'var(--surface-card)',
          color: 'var(--ink-1)',
          borderRadius: 8,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <RotateCcw size={13} />
        Unarchive
      </button>
    </div>
  )
}

export default function ArchivePage() {
  const { showToast } = useToast()
  const { tasks, isLoading, unarchive } = useArchivedTasks()
  const [spaceFilter, setSpaceFilter] = useState('all')

  const spaceOptions = useMemo(() => {
    const seen = new Map()
    for (const task of tasks) {
      if (task.department?.id) seen.set(task.department.id, task.department.name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])

  const filteredTasks = spaceFilter === 'all'
    ? tasks
    : tasks.filter((task) => task.department_id === spaceFilter)

  async function handleUnarchive(task) {
    try {
      await unarchive(task.id)
      showToast(`Unarchived "${task.title}"`)
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      <div>
        <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Archive
          <Archive size={16} style={{ color: 'var(--ink-3)' }} />
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
          Completed tasks are archived automatically each week to keep spaces tidy. Nothing here is gone — unarchive any task to bring it back.
        </p>
      </div>

      {!isLoading && tasks.length > 0 && spaceOptions.length > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="archive-space-filter" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            Space
          </label>
          <select
            id="archive-space-filter"
            value={spaceFilter}
            onChange={(e) => setSpaceFilter(e.target.value)}
            style={{
              fontSize: 13,
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--border-1)',
              background: 'white',
              color: 'var(--ink-1)',
            }}
          >
            <option value="all">All spaces</option>
            {spaceOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading Archive" />
        </div>
      ) : tasks.length === 0 ? (
        <div
          className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]"
          style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}
        >
          Nothing archived yet.
        </div>
      ) : filteredTasks.length === 0 ? (
        <div
          className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]"
          style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}
        >
          No archived tasks in this space.
        </div>
      ) : (
        <div className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]" style={{ overflow: 'hidden' }}>
          {filteredTasks.map((task) => (
            <ArchiveRow key={task.id} task={task} onUnarchive={handleUnarchive} />
          ))}
        </div>
      )}
    </div>
  )
}
