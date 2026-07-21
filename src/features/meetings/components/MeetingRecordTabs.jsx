import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { hasSpaceRole } from '../../../lib/permissions.js'
import { getMeetingTasks } from '../lib/meetings'
import { getTaskStatusColor, isTaskCompleted } from '../../../lib/taskStatuses'
import AudioTranscriptionPanel from './AudioTranscriptionPanel'

const TABS = ['Summary', 'Agenda', 'Actions', 'Minutes', 'Audio']

export default function MeetingRecordTabs({ meeting }) {
  const { profile, role } = useAuth()
  const [activeTab, setActiveTab] = useState('Summary')
  const [tasks, setTasks] = useState(null)
  const [tasksError, setTasksError] = useState(null)
  const [audioItemsAdded, setAudioItemsAdded] = useState(0)

  // ORS identity is a space_roles grant (Phase 3) — role === 'ors' no longer exists.
  // regional_secretary is treated as pastor-equivalent (near-super_admin) — see FLOCK_CRM_CONFIG.
  const canRecord = ['super_admin', 'regional_secretary', 'dept_lead'].includes((role ?? '').toLowerCase()) ||
                    hasSpaceRole(profile, null, 'ors') ||
                    hasSpaceRole(profile, null, 'dept_lead')

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
    Actions: `Actions ${actionCount > 0 ? `(${actionCount})` : ''}`,
    Minutes: 'Minutes',
    Audio: `Audio ${audioItemsAdded > 0 ? `(+${audioItemsAdded})` : ''}`,
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
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: '#1C1C1C', whiteSpace: 'pre-wrap' }}>
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
                        <Link
                          key={task.id}
                          to={`/tasks/${task.id}`}
                          style={{
                            display: 'block',
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: '#FAFAF9',
                            border: '1px solid var(--border)',
                            textDecoration: 'none',
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
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>
                No summary logged yet.{canRecord ? ' Open this meeting in Live mode to add one.' : ''}
              </p>
            )}
          </div>
        )}

        {activeTab === 'Agenda' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            {meeting.agendas && meeting.agendas[0]?.agenda_items && meeting.agendas[0].agenda_items.length > 0 ? (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E5E4' }}>
                      <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: '#7E7D78' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#7E7D78' }}>Agenda Item</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#7E7D78' }}>Time</th>
                      <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: '#7E7D78' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.agendas[0].agenda_items.map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #E5E5E4' }}>
                        <td style={{ padding: '12px 0', color: '#7E7D78', fontWeight: 500 }}>{idx + 1}</td>
                        <td style={{ padding: '12px', color: '#1C1C1C' }}>
                          <div style={{ fontWeight: 500 }}>{item.segment}</div>
                          {item.notes && <div style={{ fontSize: 12, color: '#7E7D78', marginTop: 2 }}>{item.notes}</div>}
                        </td>
                        <td style={{ padding: '12px', color: '#7E7D78', fontSize: 12 }}>—</td>
                        <td style={{ padding: '12px 0', color: '#7E7D78', fontSize: 12 }}>{item.duration_minutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : meeting.agenda ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: '#1C1C1C' }}>
                {meeting.agenda}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>No agenda logged yet.</p>
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
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid var(--border)',
                      textDecoration: 'none',
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
                    <span style={{ fontSize: 11, color: '#9E9488', flexShrink: 0, marginTop: 2 }}>→</span>
                  </Link>
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
              <p style={{ margin: 0, fontSize: 13, color: '#9E9488' }}>
                No minutes saved yet.{canRecord ? ' Use Live mode during a meeting to capture them.' : ''}
              </p>
            )}
          </div>
        )}

        {activeTab === 'Audio' && (
          <div style={{ paddingLeft: 16, paddingRight: 16 }}>
            <AudioTranscriptionPanel
              meetingId={meeting.id}
              departmentId={meeting.department_id}
              canRecord={canRecord}
              onActionItemsExtracted={(items) => {
                setAudioItemsAdded((prev) => prev + items.length)
                setActiveTab('Actions')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
