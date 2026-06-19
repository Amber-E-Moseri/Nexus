import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import SprintProgressBar from './SprintProgressBar'
import { shouldAutoStartSprint } from '../../lib/sprints'

const STATUS_LABELS = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  review: 'In Review',
  archived: 'Archived',
}

const STATUS_COLORS = {
  planning: '#EDE8F8',
  active: '#E0F2FE',
  completed: '#DCFCE7',
  review: '#FEF3C7',
  archived: '#F3F0EB',
}

export default function SprintCard({ sprint, onClick, onDuplicate, onRestore, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isArchived = sprint.status === 'archived'
  const taskCount = sprint.task_count || 0
  const completedCount = sprint.completed_count || 0
  const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0

  const dateRange = sprint.start_date && sprint.end_date
    ? `${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} — ${new Date(sprint.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : sprint.start_date
      ? `Started ${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
      : 'No dates set'

  return (
    <div
      onClick={onClick}
      style={{
        background: isArchived ? '#F9F7F3' : '#FFFFFF',
        border: `2px solid ${STATUS_COLORS[sprint.status] || '#E9E4D8'}`,
        borderRadius: 16,
        padding: '20px',
        cursor: 'pointer',
        opacity: isArchived ? 0.72 : 1,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isArchived ? 'none' : '0 2px 8px rgba(28,22,16,0.08)',
      }}
      onMouseEnter={(e) => {
        if (!isArchived) {
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(28,22,16,0.15)'
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.borderColor = 'var(--accent)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(28,22,16,0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = STATUS_COLORS[sprint.status] || '#E9E4D8'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {isArchived ? '📦 ' : shouldAutoStartSprint(sprint) ? '⚡ ' : ''}{sprint.name}
          </div>
          {sprint.goal && (
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {sprint.goal}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Badge tone={sprint.status}>{STATUS_LABELS[sprint.status] ?? sprint.status}</Badge>
          {shouldAutoStartSprint(sprint) && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Ready to start</div>}
        </div>
      </div>

      {taskCount > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SprintProgressBar tasksCount={{ done: completedCount, total: taskCount }} compact={true} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #E9E4D8' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>📅 {dateRange}</span>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          {onDuplicate || onRestore || onDelete ? (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
                style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
                  <div style={{ position: 'absolute', top: 28, right: 0, zIndex: 20, minWidth: 150, background: 'white', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                    {onDuplicate ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDuplicate(sprint.id); setMenuOpen(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      >
                        Duplicate
                      </button>
                    ) : null}
                    {!isArchived && onRestore ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRestore(sprint.id); setMenuOpen(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      >
                        Restore
                      </button>
                    ) : null}
                    {isArchived && onRestore ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRestore(sprint.id); setMenuOpen(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      >
                        Restore
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(sprint.id, sprint.name); setMenuOpen(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#C94830' }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
