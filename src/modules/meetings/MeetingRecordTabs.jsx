import { useState, useEffect, useMemo } from 'react'
import { getMeetingTasks } from '../../lib/meetings'
import { getTaskStatusColor, isTaskCompleted } from '../../lib/taskStatuses'

const TABS = ['Summary', 'Agenda', 'Attendance', 'Actions', 'Minutes']

export default function MeetingRecordTabs({ meeting }) {
  const [activeTab, setActiveTab] = useState('Summary')
  const [tasks, setTasks] = useState(null)
  const [tasksError, setTasksError] = useState(null)

  const attendanceList = useMemo(() => {
    if (!meeting.attendance) return []
    const present = meeting.attendance.filter((a) => a.status === 'present')
    const absent = meeting.attendance.filter((a) => a.status !== 'present')
    return [...present, ...absent]
  }, [meeting.attendance])

  useEffect(() => {
    let active = true

    async function loadTasks() {
      try {
        const data = await getMeetingTasks(meeting.id)
        if (active) {
          setTasksError(null)
          setTasks(data)
        }
      } catch (error) {
        if (active) {
          setTasksError(error.message)
          setTasks([])
        }
      }
    }

    loadTasks()

    return () => {
      active = false
    }
  }, [meeting.id])

  const completedTasks = tasks?.filter((t) => isTaskCompleted(t)) ?? []
  const actionCount = tasks?.length ?? 0

  const tabLabels = {
    Summary: 'Summary',
    Agenda: 'Agenda',
    Attendance: 'Attendance',
    Actions: `Actions ${actionCount > 0 ? `(${actionCount})` : ''}`,
    Minutes: 'Minutes',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '12px 14px',
              background: activeTab === tab ? 'white' : 'var(--surface-secondary)',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #4C2A92' : '1px solid var(--border)',
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === tab ? '#4C2A92' : '#7E7D78',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {activeTab === 'Summary' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {meeting.summary ? (
              <>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: '#1C1C1C' }}>
                  {meeting.summary}
                </p>
                {actionCount > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#7E7D78',
                      }}
                    >
                      Action items — {completedTasks.length} of {actionCount} done
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: '#E5E5E4',
                        overflow: 'hidden',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(completedTasks.length / actionCount) * 100}%`,
                          background: '#16A34A',
                          transition: 'width 0.2s',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(tasks ?? []).slice(0, 2).map((task) => (
                        <div
                          key={task.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: '#FAFAF9',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#1C1C1C',
                              textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                            }}
                          >
                            {task.title}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 12,
                              color: '#7E7D78',
                            }}
                          >
                            <span>{task.assignee?.name ?? 'Unassigned'}</span>
                            {task.due_date && (
                              <>
                                <span>•</span>
                                <span>
                                  Due{' '}
                                  {new Date(task.due_date).toLocaleDateString('en-CA', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>No summary logged yet.</p>
            )}
          </div>
        )}

        {activeTab === 'Agenda' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {meeting.agenda ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: '#1C1C1C' }}>
                {meeting.agenda}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>No agenda logged yet.</p>
            )}
          </div>
        )}

        {activeTab === 'Attendance' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {attendanceList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {attendanceList.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#E5E5E4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#7E7D78',
                      }}
                    >
                      {entry.user_id?.charAt(0) ?? 'U'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1C' }}>
                        {entry.name ?? `User ${entry.user_id}`}
                      </div>
                    </div>
                    <div
                      style={{
                        paddingLeft: '8px',
                        paddingRight: '8px',
                        paddingTop: '4px',
                        paddingBottom: '4px',
                        borderRadius: 4,
                        background: entry.status === 'present' ? '#DBEAFE' : '#E5E5E4',
                        fontSize: 11,
                        fontWeight: 600,
                        color: entry.status === 'present' ? '#0369A1' : '#7E7D78',
                      }}
                    >
                      {entry.status === 'present' ? 'Here' : 'Away'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>No attendance logged yet.</p>
            )}
          </div>
        )}

        {activeTab === 'Actions' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {tasksError ? (
              <div style={{ fontSize: 13, color: '#DC2626' }}>Failed to load action items: {tasksError}</div>
            ) : tasks === null ? (
              <div style={{ fontSize: 13, color: '#9E9488' }}>Loading action items…</div>
            ) : tasks.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9E9488' }}>No action items linked to this meeting yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        marginTop: 4,
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
                          fontWeight: 600,
                          color: '#1C1C1C',
                          textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#7E7D78' }}>
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
        )}

        {activeTab === 'Minutes' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {meeting.minutes ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: '#1C1C1C' }}>
                {meeting.minutes}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>No minutes saved yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
