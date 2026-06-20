import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getFlockMembers, getFlockTasks } from '../../features/tasks'
import { isTaskCompleted, isTaskInProgress } from '../../lib/taskStatuses'
import { PRIORITY_STYLES } from '../../lib/priorities'

function memberStatusBadge(member, memberTasks) {
  const tasks = memberTasks[member.id] ?? []
  const now = new Date()
  const hasOverdue = tasks.some(
    (t) => t.due_date && new Date(t.due_date) < now && !isTaskCompleted(t),
  )
  if (hasOverdue) return { label: 'Has overdue', bg: 'var(--status-review-bg)', text: 'var(--status-review-text)' }

  const isActive = tasks.some((task) => isTaskInProgress(task))
  if (isActive) return { label: 'Active', bg: 'var(--status-done-bg)', text: 'var(--status-done-text)' }

  return { label: 'Monitoring', bg: 'var(--status-backlog-bg)', text: 'var(--status-backlog-text)' }
}

function Initials({ name, size = 32 }) {
  const initials = (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--accent-light)', color: 'var(--accent)',
        fontSize: size * 0.35, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </div>
  )
}

function groupByDept(tasks) {
  const map = new Map()
  for (const task of tasks) {
    const deptId = task.department?.id ?? 'none'
    if (!map.has(deptId)) {
      map.set(deptId, { dept: task.department, tasks: [] })
    }
    map.get(deptId).tasks.push(task)
  }
  return Array.from(map.values())
}

export default function FlockView() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    Promise.all([
      getFlockMembers(profile.id),
      getFlockTasks(profile.id),
    ]).then(([m, t]) => {
      setMembers(m ?? [])
      setAllTasks(t ?? [])
      if (m?.length > 0) setSelectedId(m[0].id)
    }).catch((err) => {
      console.error('Failed to load flock data:', err)
      setError(err.message || 'Failed to load member information')
    }).finally(() => setLoading(false))
  }, [profile?.id])

  // Index tasks by assignee_id
  const memberTasks = {}
  for (const task of allTasks) {
    const aid = task.assignee_id
    if (!memberTasks[aid]) memberTasks[aid] = []
    memberTasks[aid].push(task)
  }

  const selectedMember = members.find((m) => m.id === selectedId) ?? null
  const selectedTasks = selectedId ? (memberTasks[selectedId] ?? []) : []
  const deptGroups = groupByDept(selectedTasks)

  if (error) {
    return (
      <div style={{ padding: '1rem', color: '#DC2626', fontSize: 13 }}>
        Error: {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Left panel — member list */}
      <div
        style={{
          width: 280, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '16px 12px',
        }}
      >
        <div
          style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            padding: '0 8px 10px',
          }}
        >
          My Flock · {members.length}
        </div>

        {members.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
              No members assigned
            </div>
            <div>Contact your administrator to assign members</div>
          </div>
        )}

        {members.map((member) => {
          const overdueCount = (memberTasks[member.id] ?? []).filter(
            (t) => t.due_date && new Date(t.due_date) < new Date() && !isTaskCompleted(t),
          ).length
          const statusBadge = memberStatusBadge(member, memberTasks)
          const isSelected = member.id === selectedId

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelectedId(member.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                border: 'none', textAlign: 'left', marginBottom: 2,
                background: isSelected ? 'var(--accent-light)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-secondary)' }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <Initials name={member.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13, fontWeight: 500,
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {member.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 20,
                      background: statusBadge.bg, color: statusBadge.text,
                    }}
                  >
                    {statusBadge.label}
                  </span>
                  {overdueCount > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--coral-dark)' }}>
                      {overdueCount} overdue
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Right panel — selected member's tasks */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {!selectedMember ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, paddingTop: 60 }}>
            Select a member to view their tasks.
          </div>
        ) : (
          <>
            {/* Member header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <Initials name={selectedMember.name} size={40} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedMember.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' }}>
                  {selectedMember.role?.replace('_', ' ')}
                </div>
              </div>
              <span
                style={{
                  marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)',
                  background: 'var(--surface-secondary)', padding: '4px 10px',
                  borderRadius: 8, border: '1px solid var(--border)',
                }}
              >
                {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {selectedTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  No tasks yet
                </div>
                <div>Create your first task to get started</div>
              </div>
            ) : (
              deptGroups.map(({ dept, tasks }) => (
                <div key={dept?.id ?? 'none'} style={{ marginBottom: 24 }}>
                  {/* Dept label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {dept && (
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: `#${dept.color}`, flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}
                    >
                      {dept?.name ?? 'No department'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      · {tasks.length}
                    </span>
                  </div>

                  {/* Task rows — read-only */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {tasks.map((task) => {
                      const isOverdue =
                        task.due_date && new Date(task.due_date) < new Date() && !isTaskCompleted(task)
                      const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium

                      return (
                        <div
                          key={task.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 12px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'white',
                          }}
                        >
                          <span
                            style={{
                              flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {task.title}
                          </span>
                          <span
                            style={{
                              fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
                              background: priority.bg, color: priority.text, flexShrink: 0,
                            }}
                          >
                            {task.priority}
                          </span>
                          {task.due_date && (
                            <span
                              style={{
                                fontSize: 11, flexShrink: 0,
                                color: isOverdue ? 'var(--coral-dark)' : 'var(--text-tertiary)',
                                fontWeight: isOverdue ? 500 : 400,
                              }}
                            >
                              {isOverdue ? '⚠ ' : ''}
                              {new Date(task.due_date).toLocaleDateString('en-CA', {
                                month: 'short', day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
