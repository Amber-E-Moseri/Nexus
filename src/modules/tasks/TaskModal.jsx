import * as Dialog from '@radix-ui/react-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { PRIORITIES } from '../../lib/constants'
import { createNotification } from '../../lib/notifications'
import { getMySpaces, SPACE_TYPE_ICONS } from '../../lib/spaces'
import { getSprintMembers } from '../../lib/sprints'
import { supabase } from '../../lib/supabase'
import {
  formatActivityDateTime,
  formatActivityRelativeTime,
  getActivityActionLabel,
  getActivityInitials,
} from '../../lib/activityLog'
import { normalizeTaskFieldSettings } from '../../lib/taskFieldSettings'
import { createTask, deleteTask, getTaskBlockers, updateTask } from '../../lib/tasks'
import {
  getTaskStatusId,
  getTaskStatusLabel,
  listTaskStatuses,
  selectDefaultStatus,
} from '../../lib/taskStatuses'
import AssigneeSelector from './AssigneeSelector'
import TaskComments from './TaskComments'
import TaskDependencies from './TaskDependencies'
import TaskFiles from './TaskFiles'
import SubtaskList from './SubtaskList'
import { TasksContext } from './TasksContext'

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
  transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

function TaskActivityLog({ taskId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivities()
  }, [taskId])

  async function loadActivities() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, user_id, action, entity_type, entity_id, timestamp, user:users!user_id(id, name)')
        .eq('entity_id', taskId)
        .eq('entity_type', 'task')
        .order('timestamp', { ascending: false })
        .limit(20)

      if (error) throw error
      setActivities(data || [])
    } catch (err) {
      console.error('Error loading activity:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading...</div>
  }

  if (activities.length === 0) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No activity recorded for this task.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {activities.map((log) => (
        <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#4C2A92',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {getActivityInitials(log.user?.name ?? '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>{log.user?.name || 'Unknown'}</span>{' '}
              <span>{getActivityActionLabel(log.action)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {formatActivityRelativeTime(log.timestamp)} · {formatActivityDateTime(log.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskModalTabs({ taskId, departmentId, sprintId }) {
  const [activeTab, setActiveTab] = useState('comments')

  const tabs = [
    { id: 'comments', label: 'Comments' },
    { id: 'files', label: 'Files' },
    { id: 'dependencies', label: 'Dependencies' },
    { id: 'activity', label: 'Activity' },
  ]

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 10,
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div role="tablist" style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 500 : 400,
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'comments' ? (
        <div role="tabpanel" id="tabpanel-comments" aria-labelledby="tab-comments" tabIndex={0}>
          <TaskComments taskId={taskId} />
        </div>
      ) : null}
      {activeTab === 'files' ? (
        <div role="tabpanel" id="tabpanel-files" aria-labelledby="tab-files" tabIndex={0}>
          <TaskFiles taskId={taskId} />
        </div>
      ) : null}
      {activeTab === 'dependencies' ? (
        <div role="tabpanel" id="tabpanel-dependencies" aria-labelledby="tab-dependencies" tabIndex={0}>
          <TaskDependencies taskId={taskId} departmentId={departmentId} sprintId={sprintId} />
        </div>
      ) : null}
      {activeTab === 'activity' ? (
        <div role="tabpanel" id="tabpanel-activity" aria-labelledby="tab-activity" tabIndex={0}>
          <TaskActivityLog taskId={taskId} />
        </div>
      ) : null}
    </div>
  )
}

export default function TaskModal({
  mode = 'create',
  task = null,
  defaultStatus = '',
  defaultDueDate = '',
  fieldSettings = null,
  departmentId,
  sprintId,
  listId,
  isPersonal = false,
  isReadOnly = false,
  onClose,
  onSaved,
  onDeleted,
}) {
  const { profile, role } = useAuth()
  const ctx = useContext(TasksContext)
  const contextStatuses = ctx?.statuses ?? []
  const visibleFields = normalizeTaskFieldSettings(fieldSettings)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [statuses, setStatuses] = useState(contextStatuses)
  const [statusId, setStatusId] = useState(getTaskStatusId(task) ?? defaultStatus ?? '')
  const [priority, setPriority] = useState(task?.priority ?? 'medium')
  const [assigneeIds, setAssigneeIds] = useState(task?.assignee_id ? [task.assignee_id] : [])
  const [dueDate, setDueDate] = useState(task?.due_date ?? defaultDueDate ?? '')
  const [personal, setPersonal] = useState(task?.is_personal ?? isPersonal)
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? [])
  const [spaces, setSpaces] = useState([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(departmentId ?? '')
  const deptMembers = useDeptMembers(departmentId)
  const [members, setMembers] = useState(sprintId ? [] : deptMembers)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)
  const [blockers, setBlockers] = useState([])

  const titleRef = useRef(null)

  useEffect(() => {
    if (sprintId) {
      getSprintMembers(sprintId)
        .then(setMembers)
        .catch((error) => {
          console.error('Failed to load sprint members', error)
          setMembers([])
        })
    }
  }, [sprintId])

  useEffect(() => {
    if (!sprintId) {
      setMembers(deptMembers)
    }
  }, [deptMembers, sprintId])

  useEffect(() => {
    if (contextStatuses.length > 0) {
      setStatuses(contextStatuses)
      setStatusId((current) => current || selectDefaultStatus(contextStatuses)?.id || '')
      return
    }

    listTaskStatuses({ departmentId: sprintId ? null : departmentId })
      .then((nextStatuses) => {
        setStatuses(nextStatuses)
        setStatusId((current) => current || selectDefaultStatus(nextStatuses)?.id || '')
      })
      .catch(() => setStatuses([]))
  }, [contextStatuses, departmentId, sprintId])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (mode === 'create' && !task) {
      setDueDate(defaultDueDate ?? '')
    }
  }, [defaultDueDate, mode, task])

  useEffect(() => {
    if (mode === 'create' && profile?.id && role) {
      getMySpaces(profile.id, role, profile.department_id)
        .then((data) => {
          setSpaces(data.filter((space) => space.status === 'active'))
        })
        .catch(() => setSpaces([]))
    }
  }, [mode, profile?.id, role, profile?.department_id])

  useEffect(() => {
    if (mode === 'edit' && task?.id) {
      getTaskBlockers(task.id)
        .then((blockingTasks) => {
          const activeBlockers = blockingTasks.filter((b) => b.task?.status_definition?.category !== 'completed')
          setBlockers(activeBlockers)
        })
        .catch(() => setBlockers([]))
    } else {
      setBlockers([])
    }
  }, [mode, task?.id])

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.')
      titleRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)

    try {
      const previousAssigneeId = task?.assignee_id ?? null
      const selectedStatus = statuses.find((entry) => entry.id === statusId) ?? selectDefaultStatus(statuses)

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        statusId: selectedStatus?.id ?? statusId,
        statusCategory: selectedStatus?.category,
        priority,
        assignee_id: assigneeIds[0] || null,
        due_date: dueDate || null,
        is_personal: personal,
        source: 'manual',
        department_id: personal ? departmentId ?? null : sprintId ? null : (selectedSpaceId || departmentId) ?? null,
        sprint_id: personal ? null : sprintId ?? task?.sprint_id ?? null,
        list_id: personal ? null : listId ?? task?.list_id ?? null,
        task_type: personal ? 'personal' : sprintId || task?.sprint_id ? 'sprint' : 'space',
      }

      if (mode === 'create') {
        payload.created_by = profile?.id
        const created = ctx ? await ctx.addTask(payload) : await createTask(payload)

        if (assigneeIds[0] && assigneeIds[0] !== profile?.id) {
          await createNotification(assigneeIds[0], 'task_assigned', {
            task_id: created.id,
            task_title: created.title,
            assigner_name: profile?.name,
          })
        }

        onSaved?.(created)
      } else {
        const updated = ctx ? await ctx.editTask(task.id, payload) : await updateTask(task.id, payload)

        if (assigneeIds[0] && assigneeIds[0] !== previousAssigneeId && assigneeIds[0] !== profile?.id) {
          await createNotification(assigneeIds[0], 'task_assigned', {
            task_id: updated.id,
            task_title: updated.title,
            assigner_name: profile?.name,
          })
        }

        onSaved?.(updated)
      }

      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setSaving(true)
    try {
      if (ctx) {
        await ctx.removeTask(task.id)
      } else {
        await deleteTask(task.id)
      }
      onDeleted?.(task.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,14,30,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(680px, 95vw)',
            maxHeight: '90vh',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden',
          }}
          aria-describedby={undefined}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {mode === 'create' ? 'New task' : 'Edit task'}
            </Dialog.Title>
            <Dialog.Close
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                fontSize: 20,
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 6,
              }}
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {isReadOnly && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#F4F1EA',
                  color: '#9E9488',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                📦 Archived sprint — view only
              </div>
            )}
            {error ? (
              <div
                style={{
                  marginBottom: 14,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--coral-light)',
                  color: 'var(--coral-dark)',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}

            {blockers.length > 0 && getTaskStatusLabel(task) === 'Blocked' && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#C94830',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                🚫 Blocked by: {blockers.map((b) => b.task?.title || b.depends_on?.title || 'Unknown').join(', ')}
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Task title</label>
              <input
                ref={titleRef}
                type="text"
                disabled={isReadOnly}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to get done?"
                style={{ ...inputStyle, fontSize: 15, padding: '10px 12px', opacity: isReadOnly ? 0.6 : 1 }}
                onFocus={(e) => { if (!isReadOnly) e.target.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { if (!isReadOnly) e.target.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Space</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, pointerEvents: isReadOnly ? 'none' : 'auto', opacity: isReadOnly ? 0.6 : 1 }}>
                {spaces.map((space) => {
                  const isSelected = selectedSpaceId === space.id
                  const spaceIcon = SPACE_TYPE_ICONS[space.space_type] ?? space.name[0]?.toUpperCase()
                  const spaceColor = `#${space.color}`
                  return (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => setSelectedSpaceId(space.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 20,
                        background: isSelected ? spaceColor : 'white',
                        color: isSelected ? 'white' : '#6B7280',
                        border: isSelected ? `1px solid ${spaceColor}` : '1px solid var(--border)',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: isReadOnly ? 'default' : 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{spaceIcon}</span> {space.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Link to sprint</label>
              <div style={{ color: '#9CA3AF', fontSize: 13 }}>Not linked</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Status</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, pointerEvents: isReadOnly ? 'none' : 'auto', opacity: isReadOnly ? 0.6 : 1 }}>
                {statuses.map((status) => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => setStatusId(status.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: isReadOnly ? 'default' : 'pointer',
                      background: statusId === status.id ? 'var(--accent)' : '#E5E7EB',
                      color: statusId === status.id ? 'white' : '#6B7280',
                      border: 'none',
                    }}
                  >
                    {status.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: 'flex', gap: 8, pointerEvents: isReadOnly ? 'none' : 'auto', opacity: isReadOnly ? 0.6 : 1 }}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: isReadOnly ? 'default' : 'pointer',
                      background: priority === p.value ? 'var(--accent)' : '#E5E7EB',
                      color: priority === p.value ? 'white' : '#6B7280',
                      border: 'none',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18, pointerEvents: isReadOnly ? 'none' : 'auto', opacity: isReadOnly ? 0.6 : 1 }}>
              <label style={labelStyle}>Assignees</label>
              <AssigneeSelector
                members={members}
                selectedIds={assigneeIds}
                onSelectionChange={setAssigneeIds}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Subtasks</label>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>0</div>
            </div>

            {isPersonal ? (
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: isReadOnly ? 'none' : 'auto', opacity: isReadOnly ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  id="is-personal"
                  disabled={isReadOnly}
                  checked={personal}
                  onChange={(e) => setPersonal(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: isReadOnly ? 'default' : 'pointer' }}
                />
                <label htmlFor="is-personal" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: isReadOnly ? 'default' : 'pointer' }}>
                  Private task (visible only to me)
                </label>
              </div>
            ) : null}

            {mode === 'edit' && task?.id ? (
              <div
                style={{
                  marginTop: 4,
                  padding: '16px',
                  borderRadius: 10,
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <SubtaskList
                  parentTaskId={task.id}
                  subtasks={subtasks}
                  departmentId={departmentId}
                  sprintId={sprintId ?? task?.sprint_id}
                  taskType={task?.task_type ?? (sprintId ? 'sprint' : 'space')}
                  createdBy={profile?.id}
                  onSubtasksChange={setSubtasks}
                />
              </div>
            ) : null}

            {mode === 'edit' && task?.id ? (
              <TaskModalTabs taskId={task.id} departmentId={departmentId} sprintId={sprintId ?? task?.sprint_id} />
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-secondary)',
            }}
          >
            <div>
              {mode === 'edit' && !isReadOnly ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    fontSize: 13,
                    padding: '7px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: confirmDelete ? '#FDECEC' : 'transparent',
                    color: confirmDelete ? '#A32D2D' : 'var(--text-tertiary)',
                    border: confirmDelete ? '1px solid #F5AEAE' : '1px solid var(--border)',
                    fontWeight: confirmDelete ? 500 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Dialog.Close
                style={{
                  fontSize: 13,
                  padding: '7px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Close
              </Dialog.Close>
              {!isReadOnly ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '7px 20px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {saving ? 'Saving…' : mode === 'create' ? 'Create task' : 'Save changes'}
                </button>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
