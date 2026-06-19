import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { getMonthEvents } from '../../lib/calendar'
import { supabase } from '../../lib/supabase'
import MiniCalendar from '../../modules/calendar/MiniCalendar'
import MeetingModal from '../../modules/meetings/MeetingModal'
import MeetingsList from '../../modules/meetings/MeetingsList'
import { MeetingsProvider } from '../../modules/meetings/MeetingsContext'
import KanbanBoard from '../../modules/tasks/KanbanBoard'
import TaskCalendarView from '../../modules/tasks/TaskCalendarView'
import TaskFilters from '../../modules/tasks/TaskFilters'
import TaskListView from '../../modules/tasks/TaskListView'
import TaskModal from '../../modules/tasks/TaskModal'
import { TasksProvider, useTasks } from '../../modules/tasks/TasksContext'
import { useTaskFilters } from '../../modules/tasks/useTaskFilters'

const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'overview', label: 'Overview' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'members', label: 'Members' },
]

function TabBar({ activeTab, onTab, canManageTasks, canManageMeetings, onNewTask, onNewMeeting }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #E9E4D8', marginBottom: 16, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {TABS.map((t) => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              style={{
                border: 'none',
                background: 'none',
                padding: '9px 13px',
                fontFamily: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: -1,
                fontWeight: active ? 700 : 500,
                color: active ? '#1C1610' : '#7A6F5E',
                borderBottom: `2px solid ${active ? '#4C2A92' : 'transparent'}`,
                transition: 'color .13s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#1C1610' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#7A6F5E' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {(activeTab === 'board' || activeTab === 'list') && canManageTasks && (
          <button
            type="button"
            onClick={onNewTask}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#E8A020',
              color: '#fff',
              border: '1px solid #E8A020',
              borderRadius: 6,
              padding: '7px 13px',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background .13s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#C47E0A' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E8A020' }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New Task
          </button>
        )}
        {activeTab === 'meetings' && canManageMeetings && (
          <button
            type="button"
            onClick={onNewMeeting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#4C2A92',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 13px',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Log Meeting
          </button>
        )}
        {activeTab === 'calendar' && (
          <a
            href="/calendar"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '7px 13px',
              borderRadius: 6,
              border: '1px solid #E9E4D8',
              background: '#fff',
              color: '#1C1610',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Full calendar →
          </a>
        )}
      </div>
    </div>
  )
}

function DeptBoardView({ dept, onTaskClick, onAddTask }) {
  const { tasks, loading, error, statuses, defaultStatusId } = useTasks()
  const members = useDeptMembers(dept?.id)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)
  const [boardStatuses, setBoardStatuses] = useState([])
  const [loadingStatuses, setLoadingStatuses] = useState(true)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    let active = true

    async function loadBoardStatuses() {
      if (!dept?.id) return

      setLoadingStatuses(true)
      setStatusError('')

      const colorForCategory = (category) => {
        switch (category) {
          case 'in_progress':
            return '#2563EB'
          case 'completed':
            return '#16A34A'
          case 'cancelled':
            return '#6B7280'
          default:
            return '#4C2A92'
        }
      }

      try {
        let { data, error: localError } = await supabase
          .from('task_status_definitions')
          .select('id, name, category, sort_order, legacy_key')
          .eq('department_id', dept.id)
          .order('sort_order')

        if (localError) throw localError

        if (!data?.length) {
          const fallbackRes = await supabase
            .from('task_status_definitions')
            .select('id, name, category, sort_order, legacy_key')
            .is('department_id', null)
            .order('sort_order')

          if (fallbackRes.error) throw fallbackRes.error
          data = fallbackRes.data
        }

        if (active) {
          setBoardStatuses((data ?? []).map((status) => ({
            ...status,
            color: colorForCategory(status.category),
          })))
        }
      } catch (nextError) {
        if (active) {
          setStatusError(nextError.message)
          setBoardStatuses([])
        }
      } finally {
        if (active) {
          setLoadingStatuses(false)
        }
      }
    }

    loadBoardStatuses()

    return () => {
      active = false
    }
  }, [dept?.id])

  if (loading) return <div style={{ padding: '1rem', color: '#7A6F5E', fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ padding: '24px', color: '#C94830', fontSize: 13 }}>Failed to load tasks: {error}</div>
  if (loadingStatuses) return <div style={{ padding: '1rem', color: '#7A6F5E', fontSize: 13 }}>Loading board…</div>
  if (statusError) return <div style={{ padding: '24px', color: '#C94830', fontSize: 13 }}>Failed to load statuses: {statusError}</div>

  const scopedStatuses = boardStatuses.length > 0 ? boardStatuses : statuses

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #F2EEE6', marginBottom: 12, flexShrink: 0 }}>
        <TaskFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          members={members}
          statuses={scopedStatuses}
          tasks={tasks}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KanbanBoard
          filteredTasks={filtered}
          onTaskClick={onTaskClick}
          onAddTask={(sid) => onAddTask(sid ?? defaultStatusId)}
          statusesOverride={scopedStatuses}
        />
      </div>
    </div>
  )
}

function DeptListView({ dept, onTaskClick, onAddTask }) {
  const { tasks, loading, error, statuses, defaultStatusId, moveTask } = useTasks()
  const members = useDeptMembers(dept?.id)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)

  function handleTaskStatusChange({ taskId, newStatus }) {
    moveTask(taskId, newStatus)
  }

  if (loading) return <div style={{ padding: '1rem', color: '#7A6F5E', fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ padding: '24px', color: '#C94830', fontSize: 13 }}>Failed to load tasks: {error}</div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #F2EEE6', marginBottom: 12, flexShrink: 0 }}>
        <TaskFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          members={members}
          statuses={statuses}
          tasks={tasks}
        />
      </div>

      <div style={{ flex: 1, padding: '16px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 && view !== 'calendar' ? (
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
              departmentId={dept?.id}
              departments={[dept].filter(Boolean)}
              defaultDepartmentId={dept?.id}
              members={members}
              onCreateTask={onAddTask}
            />
          </div>
        ) : view === 'list' ? (
          <div style={{ flex: 1, overflow: 'hidden', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
            <TaskListView
              tasks={filtered}
              statuses={statuses}
              onTaskClick={onTaskClick}
              onTaskStatusChange={handleTaskStatusChange}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TaskCalendarView
              filteredTasks={filtered}
              onTaskClick={onTaskClick}
              onAddTask={() => onAddTask(defaultStatusId)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyTasks({ onAdd }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 32px', color: '#7A6F5E' }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1610', marginBottom: 4 }}>No tasks yet</div>
      <div style={{ fontSize: 12.5, marginBottom: 14 }}>Create your first task to get started</div>
      <button
        type="button"
        onClick={onAdd}
        style={{
          background: '#4C2A92',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + New Task
      </button>
    </div>
  )
}

function DeptOverviewView() {
  const { tasks, loading } = useTasks()

  if (loading) return <div style={{ padding: '1rem', color: '#7A6F5E', fontSize: 13 }}>Loading…</div>

  const open = tasks.filter((t) => t.status_category !== 'completed' && t.status_category !== 'cancelled').length
  const completed = tasks.filter((t) => t.status_category === 'completed').length
  const overdue = tasks.filter((t) => t.due_date && new Date(`${t.due_date}T00:00:00`) < new Date() && t.status_category !== 'completed').length
  const total = tasks.length

  const stats = [
    { label: 'Total Tasks', value: total, bg: '#4C2A92', bd: '#4C2A92', fg: '#fff', l2: 'rgba(255,255,255,.72)', circle: 'rgba(255,255,255,.08)' },
    { label: 'Open', value: open, bg: '#18122E', bd: '#18122E', fg: '#fff', l2: 'rgba(255,255,255,.72)', circle: 'rgba(255,255,255,.07)' },
    { label: 'Completed', value: completed, bg: '#E8A020', bd: '#E8A020', fg: '#fff', l2: 'rgba(255,255,255,.82)', circle: 'rgba(255,255,255,.12)' },
    { label: 'Overdue', value: overdue, bg: '#FEF0ED', bd: '#F9C4B8', fg: '#C94830', l2: '#C94830', circle: 'rgba(201,72,48,.08)' },
  ]

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))', gap: 13, marginBottom: 18 }}>
        {stats.map((k) => (
          <div key={k.label} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '16px 18px', background: k.bg, border: `1px solid ${k.bd}` }}>
            <div style={{ position: 'absolute', right: -20, bottom: -24, width: 80, height: 80, borderRadius: '50%', background: k.circle }} />
            <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: k.l2 }}>{k.label}</div>
            <div style={{ position: 'relative', fontSize: 27, fontWeight: 800, color: k.fg, marginTop: 8, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
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
      .then((items) => setEvents(items.filter((ev) => !ev.space_id || ev.space_id === deptId)))
      .catch(() => setEvents([]))
  }, [deptId])

  const now = new Date()
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <MiniCalendar year={now.getFullYear()} month={now.getMonth()} events={events} title="Department Calendar" />
    </div>
  )
}

function DeptMembersView({ dept }) {
  const members = useDeptMembers(dept?.id)

  if (!members.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#7A6F5E', fontSize: 13 }}>
        No members in this department yet.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, background: '#fff', border: '1px solid #E9E4D8', borderRadius: 14, boxShadow: '0 1px 3px rgba(28,22,16,.05)', overflow: 'hidden' }}>
      {members.map((m, i) => {
        const initials = (m.name ?? m.email ?? '?').slice(0, 2).toUpperCase()
        return (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '12px 16px',
              borderBottom: i < members.length - 1 ? '1px solid #F2EEE6' : 'none',
            }}
          >
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#4C2A92', color: '#E8A020', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1610' }}>{m.name ?? '—'}</div>
              <div style={{ fontSize: 11.5, color: '#7A6F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#EDE8F8', color: '#4C2A92', textTransform: 'capitalize' }}>
              {m.role ?? 'member'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function DeptSpace() {
  const { deptSlug } = useParams()
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [dept, setDept] = useState(null)
  const [loadingDept, setLoadingDept] = useState(true)
  const [tab, setTab] = useState('board')
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
        setDept(error || !data ? null : data)
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

  if (loadingDept) return <div style={{ padding: '1rem', color: '#7A6F5E', fontSize: 13 }}>Loading…</div>
  if (!dept) return <div style={{ padding: '40px', textAlign: 'center', color: '#7A6F5E', fontSize: 14 }}>Department not found.</div>

  const canManageTasks = role !== 'member'
  const canManageMeetings = role !== 'member'
  const deptColor = dept.color ? (dept.color.startsWith('#') ? dept.color : `#${dept.color}`) : '#4C2A92'
  const glyph = dept.name.charAt(0).toUpperCase()

  return (
    <TasksProvider departmentId={dept.id}>
      <MeetingsProvider departmentId={dept.id}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: deptColor, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {glyph}
                </span>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1610', whiteSpace: 'nowrap' }}>
                  {dept.name}
                </h1>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#EDE8F8', color: '#4C2A92', flexShrink: 0 }}>
                  {role === 'member' ? 'Read-only' : 'Space'}
                </span>
              </div>
            </div>

            <TabBar
              activeTab={tab}
              onTab={setTab}
              canManageTasks={canManageTasks}
              canManageMeetings={canManageMeetings}
              onNewTask={() => setModal({ mode: 'create' })}
              onNewMeeting={() => setShowMeetingModal(true)}
            />
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 24px 16px' }}>
            {tab === 'board' && (
              <DeptBoardView
                dept={dept}
                onTaskClick={(task) => setModal({ mode: 'edit', task })}
                onAddTask={(defaultStatus) => setModal({ mode: 'create', defaultStatus })}
              />
            )}
            {tab === 'list' && (
              <DeptListView
                dept={dept}
                onTaskClick={(task) => setModal({ mode: 'edit', task })}
                onAddTask={(defaultStatus) => setModal({ mode: 'create', defaultStatus })}
              />
            )}
            {tab === 'overview' && <DeptOverviewView />}
            {tab === 'meetings' && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <DeptMeetingsView canManage={canManageMeetings} onAddMeeting={() => setShowMeetingModal(true)} />
              </div>
            )}
            {tab === 'calendar' && <DeptCalendarView deptId={dept.id} />}
            {tab === 'members' && <DeptMembersView dept={dept} />}
          </div>

          {modal ? (
            <TaskModal
              mode={modal.mode}
              task={modal.task}
              defaultStatus={modal.defaultStatus ?? ''}
              departmentId={dept.id}
              onClose={() => setModal(null)}
            />
          ) : null}
          {showMeetingModal ? (
            <MeetingModal departmentId={dept.id} onClose={() => setShowMeetingModal(false)} />
          ) : null}
        </div>
      </MeetingsProvider>
    </TasksProvider>
  )
}
