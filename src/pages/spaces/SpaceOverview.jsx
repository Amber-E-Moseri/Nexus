import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Badge from '../../components/ui/Badge'
import { getMonthEvents } from '../../lib/calendar'
import { canManageSpace, getSpaceSprints } from '../../lib/spaces'
import { supabase } from '../../lib/supabase'
import { getSpaceDetail, archiveSpace, getSpaceMembers, restoreSpace, SPACE_TYPE_LABELS, updateSpace } from '../../lib/spaces'
import MiniCalendar from '../../modules/calendar/MiniCalendar'
import MeetingsList from '../../modules/meetings/MeetingsList'
import { MeetingsProvider } from '../../modules/meetings/MeetingsContext'
import SpaceListPanel from '../../modules/spaces/SpaceListPanel'
import SpaceModal from '../../modules/spaces/SpaceModal'
import SprintCard from '../../modules/sprints/SprintCard'
import SprintModal from '../../modules/sprints/SprintModal'
import KanbanBoard from '../../modules/tasks/KanbanBoard'
import TaskFilters from '../../modules/tasks/TaskFilters'
import TaskListView from '../../modules/tasks/TaskListView'
import TaskModal from '../../modules/tasks/TaskModal'
import { TasksProvider, useTasks } from '../../modules/tasks/TasksContext'
import { useTaskFilters } from '../../modules/tasks/useTaskFilters'

const TABS = ['Overview', 'Tasks', 'Lists', 'Meetings', 'Sprints', 'Members', 'Settings']

function SpaceHeader({ space, canManage, onEdit, onArchive, onRestore }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ background: `#${space.color}` }} />
            <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{space.name}</h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="active">{SPACE_TYPE_LABELS[space.space_type] ?? space.space_type}</Badge>
            <Badge tone="planning">{space.visibility}</Badge>
            {space.status === 'archived' ? <Badge tone="archived">archived</Badge> : null}
          </div>
          {space.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{space.description}</p>
          ) : null}
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">
              Edit
            </button>
            {space.status === 'archived' ? (
              <button type="button" onClick={onRestore} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
                Restore
              </button>
            ) : (
              <button type="button" onClick={onArchive} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">
                Archive
              </button>
            )}
          </div>
        ) : null}
      </div>

      {space.status === 'archived' ? (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This space is archived and hidden from the sidebar by default.
        </div>
      ) : null}
    </div>
  )
}

function SpaceOverviewTab({ spaceId, space, lists, members, tasks, sprints, meetings }) {
  const openTasks = tasks.filter((task) => task.status_category !== 'completed').length

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Open tasks', value: openTasks },
          { label: 'Active sprints', value: sprints.filter((sprint) => sprint.status === 'active').length },
          { label: 'Lists', value: lists.length },
          { label: 'Members', value: members.length },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Recent Activity</div>
          <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] p-6 text-sm text-[var(--text-tertiary)]">
            {tasks.length} tasks currently tracked in this space. Activity feed integration stays placeholder in Phase 9.
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Upcoming Meetings</div>
          <div className="space-y-3">
            {meetings.slice(0, 3).map((meeting) => (
              <div key={meeting.id} className="rounded-2xl bg-[var(--surface-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">{meeting.title}</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {new Date(meeting.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            ))}
            {meetings.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-tertiary)] px-4 py-6 text-sm text-[var(--text-tertiary)]">
                No meetings scheduled for this space.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function SpaceTasksInner({ spaceId, lists, selectedListId, onListSelect, canManage }) {
  const { tasks, loading, error, statuses, defaultStatusId } = useTasks()
  const [view, setView] = useState('kanban')
  const [modal, setModal] = useState(null)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)

  const visibleTasks = useMemo(() => {
    const base = filtered
    if (!selectedListId || selectedListId === 'all') return base
    return base.filter((task) => task.list_id === selectedListId)
  }, [filtered, selectedListId])

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner label="Loading tasks" /></div>
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load tasks: {error}</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onListSelect('all')}
            className={['rounded-full border px-3 py-1.5 text-sm', selectedListId === 'all' ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'].join(' ')}
          >
            All
          </button>
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => onListSelect(list.id)}
              className={['rounded-full border px-3 py-1.5 text-sm', selectedListId === list.id ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]' : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'].join(' ')}
            >
              {list.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
            {['kanban', 'list'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: view === option ? 'white' : 'transparent',
                  color: view === option ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: view === option ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                {option === 'kanban' ? 'Board' : 'List'}
              </button>
            ))}
          </div>

          {canManage ? (
            <button type="button" onClick={() => setModal({ mode: 'create', defaultStatus: defaultStatusId })} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
              + New task
            </button>
          ) : null}
        </div>
      </div>

      <TaskFilters
        filters={filters}
        setFilters={setFilters}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        members={[]}
        statuses={statuses}
      />

      <div className="min-h-[480px]">
        {view === 'kanban' ? (
          <KanbanBoard
            filteredTasks={visibleTasks}
            onTaskClick={(task) => setModal({ mode: 'edit', task })}
            onAddTask={canManage ? (defaultStatus) => setModal({ mode: 'create', defaultStatus }) : undefined}
            readOnly={!canManage}
          />
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
            <TaskListView
              tasks={visibleTasks}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onAddTask={canManage ? () => setModal({ mode: 'create', defaultStatus: defaultStatusId }) : undefined}
            />
          </div>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          defaultStatus={modal.defaultStatus ?? ''}
          departmentId={spaceId}
          listId={selectedListId && selectedListId !== 'all' ? selectedListId : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}

function SpaceMembersTab({ members }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
      <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Members</div>
      <div className="space-y-3">
        {members.map((member) => (
          <div key={member.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">{member.name}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">{member.email}</div>
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              {member.space_role ? `${member.role} · ${member.space_role}` : member.role}
            </div>
          </div>
        ))}
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
            No members in this space yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SpaceSettingsTab({ space, onSaved, onArchive }) {
  const [form, setForm] = useState({
    name: space.name ?? '',
    description: space.description ?? '',
    color: space.color ?? '534AB7',
    visibility: space.visibility ?? 'org',
    start_date: space.start_date ?? '',
    end_date: space.end_date ?? '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      name: space.name ?? '',
      description: space.description ?? '',
      color: space.color ?? '534AB7',
      visibility: space.visibility ?? 'org',
      start_date: space.start_date ?? '',
      end_date: space.end_date ?? '',
    })
  }, [space])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateSpace(space.id, form)
      onSaved?.(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Name</span>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Colour</span>
            <input value={form.color} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-[var(--text-primary)]">Description</span>
            <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Visibility</span>
            <select value={form.visibility} onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <option value="private">Private</option>
              <option value="department">Department only</option>
              <option value="org">Everyone</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Start date</span>
            <input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--text-primary)]">End date</span>
            <input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-red-100 bg-red-50 p-5">
        <div className="text-sm font-semibold text-red-700">Danger zone</div>
        <div className="mt-2 text-sm text-red-600">Spaces cannot be deleted. Archive instead.</div>
        <button type="button" onClick={onArchive} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700">
          Archive space
        </button>
      </div>
    </div>
  )
}

export default function SpaceOverview() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [selectedListId, setSelectedListId] = useState('all')
  const [calendarEvents, setCalendarEvents] = useState([])
  const [spaceMembers, setSpaceMembers] = useState([])
  const [spaceSprints, setSpaceSprints] = useState([])
  const [spaceMeetings, setSpaceMeetings] = useState([])
  const [spaceTasks, setSpaceTasks] = useState([])
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)

  async function loadDetail() {
    setLoading(true)
    try {
      const data = await getSpaceDetail(spaceId)
      setDetail(data)
      if (data.lists.length > 0) {
        setSelectedListId((current) => current === 'all' ? 'all' : current || data.lists[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail().catch(() => setDetail(null))
  }, [spaceId])

  useEffect(() => {
    const now = new Date()
    getMonthEvents(now.getFullYear(), now.getMonth())
      .then((items) => setCalendarEvents(items.filter((event) => !event.space_id || event.space_id === spaceId)))
      .catch(() => setCalendarEvents([]))
  }, [spaceId])

  useEffect(() => {
    if (!detail?.space) return

    getSpaceMembers(detail.space).then(setSpaceMembers).catch(() => setSpaceMembers([]))
    getSpaceSprints(spaceId).then(setSpaceSprints).catch(() => setSpaceSprints([]))
    supabase.from('meetings').select('*').eq('department_id', spaceId).order('date', { ascending: false }).then(({ data }) => setSpaceMeetings(data ?? []))
    supabase.from('tasks').select('*').eq('department_id', spaceId).is('parent_task_id', null).then(({ data }) => setSpaceTasks(data ?? []))
  }, [detail?.space, spaceId])

  useEffect(() => {
    canManageSpace(spaceId).then(setCanManage).catch(() => setCanManage(false))
  }, [spaceId])

  const space = detail?.space
  const lists = detail?.lists ?? []

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner label="Loading space" /></div>
  if (!space) return <div className="rounded-[20px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">Space not found.</div>

  return (
    <MeetingsProvider departmentId={spaceId}>
      <div className="flex flex-col gap-5">
        <SpaceHeader
          space={space}
          canManage={canManage}
          onEdit={() => setShowSpaceModal(true)}
          onArchive={async () => {
            await archiveSpace(spaceId)
            await loadDetail()
          }}
          onRestore={async () => {
            await restoreSpace(spaceId)
            await loadDetail()
          }}
        />

        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{
                borderColor: activeTab === tab ? 'var(--accent)' : 'var(--border)',
                background: activeTab === tab ? 'var(--accent-light)' : 'white',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' ? (
          <SpaceOverviewTab
            spaceId={spaceId}
            space={space}
            lists={lists}
            members={spaceMembers}
            tasks={spaceTasks}
            sprints={spaceSprints}
            meetings={spaceMeetings}
          />
        ) : null}

        {activeTab === 'Tasks' ? (
          <TasksProvider departmentId={spaceId}>
            <SpaceTasksInner
              spaceId={spaceId}
              lists={lists}
              selectedListId={selectedListId}
              onListSelect={setSelectedListId}
              canManage={canManage}
            />
          </TasksProvider>
        ) : null}

        {activeTab === 'Lists' ? (
          <SpaceListPanel
            spaceId={spaceId}
            lists={lists}
            selectedListId={selectedListId}
            onListSelected={setSelectedListId}
            onListCreated={(list) => setDetail((current) => ({ ...current, lists: [...current.lists, list] }))}
            onListUpdated={(updated) =>
              setDetail((current) => ({
                ...current,
                lists:
                  updated.status === 'archived'
                    ? current.lists.filter((list) => list.id !== updated.id)
                    : current.lists.map((list) => (list.id === updated.id ? updated : list)),
              }))
            }
          />
        ) : null}

        {activeTab === 'Meetings' ? (
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <MeetingsList canManage={canManage} />
          </div>
        ) : null}

        {activeTab === 'Sprints' ? (
          <div className="space-y-4">
            {canManage ? (
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowSprintModal(true)} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
                  + New sprint
                </button>
              </div>
            ) : null}
            {spaceSprints.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {spaceSprints.map((sprint) => (
                  <SprintCard key={sprint.id} sprint={sprint} onClick={() => navigate(`/sprints/${sprint.id}`)} />
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
                No sprints in this space yet.
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'Members' ? <SpaceMembersTab members={spaceMembers} /> : null}

        {activeTab === 'Settings' && canManage ? (
          <SpaceSettingsTab
            space={space}
            onSaved={(updated) => setDetail((current) => ({ ...current, space: updated }))}
            onArchive={async () => {
              await archiveSpace(spaceId)
              await loadDetail()
            }}
          />
        ) : null}

        {space.status === 'archived' ? (
          <div className="text-sm text-[var(--text-secondary)]">
            Space archived. <Link to="/spaces" className="text-[var(--accent)]">Back to all spaces</Link>
          </div>
        ) : null}

        {showSpaceModal ? (
          <SpaceModal
            mode="edit"
            space={space}
            onSaved={(updated) => setDetail((current) => ({ ...current, space: updated }))}
            onClose={() => setShowSpaceModal(false)}
          />
        ) : null}

        {showSprintModal ? (
          <SprintModal
            initialDepartmentId={spaceId}
            onSaved={async () => {
              setShowSprintModal(false)
              setSpaceSprints(await getSpaceSprints(spaceId))
            }}
            onClose={() => setShowSprintModal(false)}
          />
        ) : null}
      </div>
    </MeetingsProvider>
  )
}
