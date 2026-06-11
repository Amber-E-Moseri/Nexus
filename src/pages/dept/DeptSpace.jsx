import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getMonthEvents } from '../../lib/calendar'
import { supabase } from '../../lib/supabase'
import { getDeptMembers } from '../../lib/tasks'
import MiniCalendar from '../../modules/calendar/MiniCalendar'
import MeetingModal from '../../modules/meetings/MeetingModal'
import MeetingsList from '../../modules/meetings/MeetingsList'
import { MeetingsProvider } from '../../modules/meetings/MeetingsContext'
import KanbanBoard from '../../modules/tasks/KanbanBoard'
import TaskFilters from '../../modules/tasks/TaskFilters'
import TaskListView from '../../modules/tasks/TaskListView'
import TaskModal from '../../modules/tasks/TaskModal'
import { TasksProvider, useTasks } from '../../modules/tasks/TasksContext'
import { useTaskFilters } from '../../modules/tasks/useTaskFilters'

function DeptTasksView({ dept, view, onTaskClick, onAddTask }) {
  const { tasks, loading, error, statuses, defaultStatusId } = useTasks()
  const [members, setMembers] = useState([])
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)

  useEffect(() => {
    if (dept?.id) {
      getDeptMembers(dept.id).then(setMembers).catch(() => {})
    }
  }, [dept?.id])

  if (loading) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, padding: '24px', color: '#A32D2D', fontSize: 13 }}>
        Failed to load tasks: {error}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
        <TaskFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          members={members}
          statuses={statuses}
        />
      </div>

      <div style={{ flex: 1, padding: '16px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
              No tasks yet
            </div>
            <div>Create your first task to get started</div>
          </div>
        ) : view === 'kanban' ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <KanbanBoard
              filteredTasks={filtered}
              onTaskClick={onTaskClick}
              onAddTask={(defaultStatusId) => onAddTask(defaultStatusId)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
            <TaskListView
              tasks={filtered}
              onTaskClick={onTaskClick}
              onAddTask={() => onAddTask(defaultStatusId)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function DeptMeetingsView({ canManage, onAddMeeting }) {
  const { reload } = useTasks()
  return <MeetingsList canManage={canManage} onAddMeeting={onAddMeeting} onTasksAdded={() => reload()} />
}

function DeptCalendarView({ deptId }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    const now = new Date()
    getMonthEvents(now.getFullYear(), now.getMonth())
      .then((items) => setEvents(items.filter((event) => !event.space_id || event.space_id === deptId)))
      .catch(() => setEvents([]))
  }, [deptId])

  const now = new Date()

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
      <MiniCalendar year={now.getFullYear()} month={now.getMonth()} events={events} title="Department Calendar" />
    </div>
  )
}

export default function DeptSpace() {
  const { deptSlug } = useParams()
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [dept, setDept] = useState(null)
  const [loadingDept, setLoadingDept] = useState(true)
  const [view, setView] = useState('kanban')
  const [section, setSection] = useState('tasks')
  const [modal, setModal] = useState(null)
  const [showMeetingModal, setShowMeetingModal] = useState(false)

  useEffect(() => {
    setLoadingDept(true)
    supabase
      .from('departments')
      .select('id, name, color, health_status')
      .ilike('name', deptSlug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setDept(null)
        } else {
          setDept(data)
        }
        setLoadingDept(false)
      })
  }, [deptSlug])

  useEffect(() => {
    if (!loadingDept && dept && role !== 'super_admin') {
      if (role !== 'pastor' && profile?.department_id !== dept.id) {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [loadingDept, dept, role, profile?.department_id, navigate])

  if (loadingDept) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Loading...
      </div>
    )
  }

  if (!dept) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        Department not found.
      </div>
    )
  }

  const canManageTasks = role !== 'member'
  const canManageMeetings = role !== 'member'

  return (
    <TasksProvider departmentId={dept.id}>
      <MeetingsProvider departmentId={dept.id}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 24px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                background: `#${dept.color}`,
              }}
            />
            <h1
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {dept.name}
            </h1>

            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'var(--surface-secondary)',
                color: 'var(--text-tertiary)',
                textTransform: 'capitalize',
              }}
            >
              {role === 'member' ? 'read-only' : 'manage'}
            </span>

            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'var(--surface-secondary)',
                borderRadius: 10,
                padding: 3,
                marginLeft: 'auto',
              }}
            >
              {[
                { key: 'tasks', label: 'Tasks' },
                { key: 'meetings', label: 'Meetings' },
                { key: 'calendar', label: 'Calendar' },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSection(option.key)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: 'none',
                    background: section === option.key ? 'white' : 'transparent',
                    color: section === option.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    boxShadow: section === option.key ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {section === 'tasks' ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: 2,
                    background: 'var(--surface-secondary)',
                    borderRadius: 8,
                    padding: 3,
                  }}
                >
                  {['kanban', 'list'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setView(option)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 6,
                        cursor: 'pointer',
                        border: 'none',
                        background: view === option ? 'white' : 'transparent',
                        color: view === option ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        boxShadow: view === option ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {option === 'kanban' ? 'Board' : 'List'}
                    </button>
                  ))}
                </div>

                {canManageTasks ? (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'create' })}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      fontWeight: 500,
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    + New task
                  </button>
                ) : null}
              </>
            ) : null}

            {section === 'meetings' ? (
              <>
                {import.meta.env.VITE_MEETING_OS_URL ? (
                  <a
                    href={import.meta.env.VITE_MEETING_OS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'white',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    Open Meeting OS ↗
                  </a>
                ) : null}
                {canManageMeetings ? (
                  <button
                    type="button"
                    onClick={() => setShowMeetingModal(true)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      fontWeight: 500,
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    + Log meeting
                  </button>
                ) : null}
              </>
            ) : null}

            {section === 'calendar' ? (
              <a
                href="/calendar"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Open full calendar →
              </a>
            ) : null}
          </div>

          {section === 'tasks' ? (
            <DeptTasksView
              dept={dept}
              view={view}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onAddTask={(defaultStatus) => setModal({ mode: 'create', defaultStatus })}
            />
          ) : null}

          {section === 'meetings' ? (
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <DeptMeetingsView canManage={canManageMeetings} onAddMeeting={() => setShowMeetingModal(true)} />
            </div>
          ) : null}

          {section === 'calendar' ? <DeptCalendarView deptId={dept.id} /> : null}

          {modal ? (
            <TaskModal
              mode={modal.mode}
              task={modal.task}
              defaultStatus={modal.defaultStatus ?? ''}
              departmentId={dept.id}
              onClose={() => setModal(null)}
            />
          ) : null}

          {showMeetingModal ? <MeetingModal departmentId={dept.id} onClose={() => setShowMeetingModal(false)} /> : null}
        </div>
      </MeetingsProvider>
    </TasksProvider>
  )
}
