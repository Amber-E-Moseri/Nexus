import { useState } from 'react'
import { getMeetingTasks } from '../../lib/meetings'
import { getTaskStatusColor, isTaskCompleted } from '../../lib/taskStatuses'
import { safeHref } from '../../lib/urlUtils'
import ActionItemBridge from './ActionItemBridge'

const TYPE_LABELS = {
  general: 'General',
  team: 'Team',
  media: 'Media',
  department: 'Department',
}

export default function MeetingCard({ meeting, canManage = false, onTasksAdded }) {
  const [expanded, setExpanded] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [tasksError, setTasksError] = useState(null)
  const [showBridge, setShowBridge] = useState(false)

  const attendanceCount = meeting.attendance?.filter((entry) => entry.status === 'present').length ?? 0
  const formattedDate = new Date(meeting.date).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  async function loadTasks() {
    if (tasks !== null) return

    try {
      setTasksError(null)
      const data = await getMeetingTasks(meeting.id)
      setTasks(data)
    } catch (error) {
      setTasksError(error.message)
      setTasks([])
    }
  }

  function toggleExpanded() {
    setExpanded((value) => !value)
    if (!expanded) {
      loadTasks()
    }
  }

  return (
    <article
      style={{
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: 'white',
        boxShadow: '0 10px 30px rgba(20,20,43,0.04)',
      }}
    >
      <button
        type="button"
        onClick={toggleExpanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            height: 42,
            width: 42,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            background: 'var(--surface-secondary)',
            fontSize: 18,
          }}
        >
          🎙
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{meeting.title}</div>
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>{formattedDate}</span>
            <span>•</span>
            <span>{TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}</span>
            {attendanceCount > 0 ? (
              <>
                <span>•</span>
                <span>{attendanceCount} attendees</span>
              </>
            ) : null}
          </div>
        </div>
        {meeting.drive_url ? (
          <a
            href={safeHref(meeting.drive_url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{
              flexShrink: 0,
              borderRadius: 999,
              padding: '6px 10px',
              background: 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Minutes
          </a>
        ) : null}
        <span style={{ flexShrink: 0, fontSize: 14, color: 'var(--text-tertiary)' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded ? (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px 18px' }}>
          {meeting.summary ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{meeting.summary}</p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>No summary logged yet.</p>
          )}

          {(meeting.zoom_join_url || meeting.creator?.name) ? (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {meeting.creator?.name ? <span>Logged by {meeting.creator.name}</span> : null}
              {meeting.zoom_join_url ? (
                <a
                  href={safeHref(meeting.zoom_join_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
                >
                  Zoom link ↗
                </a>
              ) : null}
            </div>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <div
              style={{
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                Action items
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setShowBridge((value) => !value)}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--accent)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {showBridge ? 'Close' : '+ Add action items'}
                </button>
              ) : null}
            </div>

            {tasksError ? (
              <div style={{ fontSize: 12, color: 'var(--coral-dark)' }}>Failed to load action items: {tasksError}</div>
            ) : tasks === null ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading action items…</div>
            ) : tasks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No action items linked to this meeting yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderRadius: 10,
                      background: 'var(--surface-secondary)',
                      padding: '10px 12px',
                    }}
                  >
                    <span
                      style={{
                        height: 8,
                        width: 8,
                        flexShrink: 0,
                        borderRadius: '50%',
                        background: getTaskStatusColor(task) ?? '#7a7d86',
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                      </div>
                      <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <span>{task.assignee?.name ?? 'Unassigned'}</span>
                        {task.due_date ? (
                          <>
                            <span>•</span>
                            <span>Due {new Date(task.due_date).toLocaleDateString('en-CA')}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showBridge ? (
            <ActionItemBridge
              meetingId={meeting.id}
              departmentId={meeting.department_id}
              onSaved={(newTasks) => {
                setTasks((previous) => [...(previous ?? []), ...newTasks])
                setShowBridge(false)
                onTasksAdded?.(newTasks)
              }}
              onCancel={() => setShowBridge(false)}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
