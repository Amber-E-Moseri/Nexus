import { useState } from 'react'
import { shouldAutoStartSprint } from '../lib/sprints'

// Renders emoji as Twemoji SVG — consistent, non-platform-specific look
function TwEmoji({ emoji, size = 22 }) {
  const pts = [...emoji]
    .map((c) => c.codePointAt(0).toString(16))
    .filter((h) => h !== 'fe0f') // strip variation selector
  const src = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${pts.join('-')}.svg`
  return <img src={src} alt={emoji} width={size} height={size} style={{ display: 'block', pointerEvents: 'none' }} />
}

const STATUS_LABELS = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  review: 'In Review',
  archived: 'Archived',
}

const STATUS_DOT = {
  planning: '#9CA3AF',
  active: '#22C55E',
  completed: '#3B82F6',
  review: '#F59E0B',
  archived: '#9CA3AF',
}

const CATEGORY_EMOJI = { regional: '✈️', group: '👥' }
const CATEGORY_BG = { regional: '#7C3AED', group: '#0891B2' }

function SprintIcon({ sprint, hasAccess }) {
  const isArchived = sprint.status === 'archived'
  const customIcon = sprint.icon || null
  const emoji = !hasAccess
    ? '🔒'
    : customIcon
    ? customIcon
    : isArchived
    ? '📦'
    : shouldAutoStartSprint(sprint)
    ? '⚡'
    : (CATEGORY_EMOJI[sprint.category] ?? '⚡')
  const bg = !hasAccess
    ? '#F3F4F6'
    : isArchived && !customIcon
    ? '#E8DDD0'
    : (CATEGORY_BG[sprint.category] ?? '#7C3AED')

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <TwEmoji emoji={emoji} size={22} />
    </div>
  )
}

const ACCESS_REQUEST_LABELS = {
  pending: 'Request pending',
  rejected: 'Request denied — try again',
}

export default function SprintCard({
  sprint,
  onClick,
  onDuplicate,
  onRestore,
  onDelete,
  hasAccess = true,
  accessRequestStatus = null,
  onRequestAccess,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isArchived = sprint.status === 'archived'
  const taskCount = sprint.task_count || 0
  const completedCount = sprint.completed_count || 0
  const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0

  const dateRange =
    sprint.start_date && sprint.end_date
      ? `${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} — ${new Date(sprint.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : sprint.start_date
      ? `From ${new Date(sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
      : 'No dates set'

  const dot = STATUS_DOT[sprint.status] ?? '#9CA3AF'
  const label = STATUS_LABELS[sprint.status] ?? sprint.status

  return (
    <div
      onClick={onClick}
      style={{
        background: isArchived ? '#FAFAF9' : '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '16px',
        cursor: hasAccess ? 'pointer' : 'default',
        opacity: isArchived ? 0.85 : 1,
        transition: 'box-shadow 0.15s, transform 0.15s',
        boxShadow: '0 1px 4px rgba(28,22,16,0.06)',
      }}
      onMouseEnter={(e) => {
        if (hasAccess) {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(28,22,16,0.12)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(28,22,16,0.06)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <SprintIcon sprint={sprint} hasAccess={hasAccess} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sprint.name}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: dot,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          </div>
          {(sprint.department_name || sprint.category) && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {[
                sprint.department_name,
                sprint.category === 'group'
                  ? 'Group'
                  : sprint.category === 'regional'
                  ? 'Regional'
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: '#EDE8DC',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: isArchived ? '#9CA3AF' : 'var(--accent-green, #22C55E)',
                borderRadius: 999,
                transition: 'width 0.4s',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              minWidth: 30,
              textAlign: 'right',
            }}
          >
            {progress}%
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {completedCount} of {taskCount} tasks
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
          borderTop: '1px solid #EDE8DC',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flex: 1,
            minWidth: 0,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {dateRange}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {taskCount} tasks
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!hasAccess ? (
            accessRequestStatus === 'pending' || accessRequestStatus === 'rejected' ? (
              <button
                type="button"
                disabled={accessRequestStatus === 'pending'}
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestAccess?.()
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-1)',
                  background:
                    accessRequestStatus === 'pending' ? 'var(--surface-sub)' : 'white',
                  color:
                    accessRequestStatus === 'pending'
                      ? 'var(--text-tertiary)'
                      : 'var(--coral)',
                  cursor: accessRequestStatus === 'pending' ? 'default' : 'pointer',
                }}
              >
                {ACCESS_REQUEST_LABELS[accessRequestStatus]}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestAccess?.()
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--purple-700)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Request access
              </button>
            )
          ) : (
            <div style={{ position: 'relative' }}>
              {(onDuplicate || onRestore || onDelete) && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(!menuOpen)
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 28,
                          right: 0,
                          zIndex: 20,
                          minWidth: 150,
                          background: 'white',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          boxShadow: 'var(--shadow-lg)',
                          overflow: 'hidden',
                        }}
                      >
                        {onDuplicate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDuplicate(sprint.id)
                              setMenuOpen(false)
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 12px',
                              fontSize: 12.5,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            Duplicate
                          </button>
                        )}
                        {onRestore && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRestore(sprint.id)
                              setMenuOpen(false)
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 12px',
                              fontSize: 12.5,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              borderBottom: onDelete ? '1px solid var(--border)' : 'none',
                            }}
                          >
                            Restore
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDelete(sprint.id, sprint.name)
                              setMenuOpen(false)
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 12px',
                              fontSize: 12.5,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#C94830',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
