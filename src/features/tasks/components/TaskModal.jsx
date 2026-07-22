import * as Dialog from '@radix-ui/react-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useDeptMembers } from '../../../hooks/useDeptMembers'
import { hasSpaceRole } from '../../../lib/permissions'
import { PRIORITIES } from '../../../lib/constants'
import { getMySpaces, SPACE_TYPE_ICONS } from '../../spaces'
import { getSprintMembers, SprintPicker } from '../../sprints'
import { supabase } from '../../../lib/supabase'
import {
  formatActivityDateTime,
  formatActivityRelativeTime,
  getActivityActionLabel,
  getActivityInitials,
} from '../../../lib/activityLog'
import { normalizeTaskFieldSettings } from '../../../lib/taskFieldSettings'
import { FONT_BODY, FONT_HEADING } from '../../../lib/fonts'
import { createTask, deleteTask, getAllOrgMembers, getSubtasks, getTaskBlockers, updateTask } from '../lib/tasks'
import {
  getTaskStatusId,
  listTaskStatuses,
  selectDefaultStatus,
  selectActiveTaskStatuses,
} from '../../../lib/taskStatuses'
import { dedupeTaskStatuses } from '../../../lib/taskStatusSelectors'
import AssigneeSelector from './AssigneeSelector'
import TaskComments from './TaskComments'
import TaskDependencies from './TaskDependencies'
import TaskFiles from './TaskFiles'
import SubtaskList from './SubtaskList'
import TaskChecklists from './TaskChecklists'
import WatchersPopover from './WatchersPopover'
import { TasksContext } from '../TasksContext'

const EMPTY_STATUSES = []

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
  sprintTeams,
  listId,
  isPersonal = false,
  isReadOnly = false,
  onClose,
  onSaved,
  onDeleted,
}) {
  const { profile, role } = useAuth()
  const ctx = useContext(TasksContext)
  // Stable fallback identity — a fresh [] here re-triggers the status-loading
  // effect (which sets state) on every render, looping the fetch (BLW-13)
  const contextStatuses = ctx?.statuses ?? EMPTY_STATUSES
  const visibleFields = normalizeTaskFieldSettings(fieldSettings)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [statuses, setStatuses] = useState(contextStatuses)
  const [statusId, setStatusId] = useState(getTaskStatusId(task) ?? defaultStatus ?? '')
  const [priority, setPriority] = useState(task?.priority ?? 'medium')
  const [assigneeIds, setAssigneeIds] = useState(
    task?.assignees?.length
      ? task.assignees.map((a) => a.user_id ?? a.id ?? a)
      : task?.assignee_id ? [task.assignee_id] : profile?.id ? [profile.id] : []
  )
  const [dueDate, setDueDate] = useState(task?.due_date ?? defaultDueDate ?? '')
  const [dueTime, setDueTime] = useState(task?.due_time ?? '')
  const [personal, setPersonal] = useState(task?.is_personal ?? isPersonal)
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? [])
  const [spaces, setSpaces] = useState([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(departmentId ?? '')
  const [selectedSprintId, setSelectedSprintId] = useState(sprintId ?? task?.sprint_id ?? '')

  function resolveDeptFromTeams(userId) {
    if (!userId || !sprintTeams?.length) return null
    const match = sprintTeams.find(
      (t) => t.department_id && t.sprint_team_members?.some((m) => m.user_id === userId),
    )
    return match?.department_id ?? null
  }

  // Space-scoped members react to the in-modal space picker (selectedSpaceId),
  // not just the fixed departmentId prop — otherwise a modal opened without a
  // department (e.g. the header "New Task" button) never populates members
  // even after the user picks a space.
  const deptMembers = useDeptMembers(selectedSpaceId || departmentId)
  // Org-wide roles can assign to anyone, regardless of the selected space.
  const canAssignOrgWide = role === 'super_admin' || role === 'regional_secretary' ||
    hasSpaceRole(profile, null, 'ors') || hasSpaceRole(profile, null, 'programs')
  // UX-only guard (RLS is the real gate — 20270724000103_pastors_space_privacy.sql):
  // avoid a confusing silent-reject by not even offering other pastors as
  // assignees within the Pastors space. Deliberately NOT reusing
  // canAssignOrgWide — super_admin/ORS/programs don't get the Pastors
  // exception, only regional_secretary does. Only reliably known in
  // create mode (spaces is only populated then); edit mode falls through
  // to normal behavior and relies on RLS.
  const isPastorsSpace = spaces.find((s) => s.id === (selectedSpaceId || departmentId))?.name === 'Pastors'
  const [orgMembers, setOrgMembers] = useState([])
  const [members, setMembers] = useState(sprintId ? [] : deptMembers)
  const [pendingWatchers, setPendingWatchers] = useState([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)
  const [blockers, setBlockers] = useState([])

  const titleRef = useRef(null)

  useEffect(() => {
    if (canAssignOrgWide) {
      getAllOrgMembers()
        .then(setOrgMembers)
        .catch((error) => {
          console.error('Failed to load org members', error)
          setOrgMembers([])
        })
    }
  }, [canAssignOrgWide])

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
      if (isPastorsSpace && role !== 'regional_secretary') {
        setMembers(profile?.id ? deptMembers.filter((m) => m.id === profile.id) : [])
      } else {
        setMembers(canAssignOrgWide ? orgMembers : deptMembers)
      }
    }
  }, [deptMembers, orgMembers, canAssignOrgWide, sprintId, isPastorsSpace, role, profile?.id])

  useEffect(() => {
    if (contextStatuses.length > 0) {
      setStatuses(dedupeTaskStatuses(selectActiveTaskStatuses(contextStatuses)))
      setStatusId((current) => current || selectDefaultStatus(contextStatuses)?.id || '')
      return
    }

    const effectiveDepartmentId = selectedSpaceId || departmentId

    ;(async () => {
      try {
        const [deptStatuses, globalStatuses] = await Promise.all([
          listTaskStatuses({ departmentId: effectiveDepartmentId }),
          listTaskStatuses(),
        ])

        const statusMap = new Map()
        for (const status of globalStatuses) {
          const key = `${status.category}:${status.legacy_key || status.name}`
          statusMap.set(key, status)
        }
        for (const status of deptStatuses) {
          const key = `${status.category}:${status.legacy_key || status.name}`
          statusMap.set(key, status)
        }

        if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
          try {
            const allStatuses = await listTaskStatuses({ departmentId: effectiveDepartmentId, includeInactive: true })
            const openStatus = allStatuses.find(s => s.category === 'open' && s.active)
            if (openStatus) {
              statusMap.set(`open:${openStatus.legacy_key || openStatus.name}`, openStatus)
            }
          } catch { /* ignore */ }
          if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
            statusMap.set('open:to_do', {
              id: '__fallback_todo',
              name: 'To Do',
              color: '#378ADD',
              category: 'open',
              legacy_key: 'to_do',
              is_default: true,
              active: true,
              sort_order: 0,
            })
          }
        }

        const merged = dedupeTaskStatuses(selectActiveTaskStatuses(Array.from(statusMap.values())))
        setStatuses(merged)
        const defaultSt = selectDefaultStatus(merged)
        setStatusId((current) => current || defaultSt?.id || '')
      } catch (err) {
        console.error('[TaskModal] Failed to load statuses:', err)
        setStatuses([])
      }
    })()
  }, [contextStatuses, departmentId, selectedSpaceId])

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

  // List queries only carry subtask counts; fetch the actual subtasks when the
  // modal opens on an existing task (BLW-01 lazy load).
  useEffect(() => {
    if (mode !== 'edit' || !task?.id) return
    let active = true
    getSubtasks(task.id)
      .then((rows) => {
        if (active) setSubtasks(rows)
      })
      .catch((err) => {
        console.error('[TaskModal] Failed to load subtasks:', err)
      })
    return () => {
      active = false
    }
  }, [mode, task?.id])

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.')
      titleRef.current?.focus()
      return
    }

    if (!personal && !departmentId && !selectedSpaceId) {
      setError('Please select a space.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const previousAssigneeId = task?.assignee_id ?? null
      const previousStatusId = task ? getTaskStatusId(task) : null
      const selectedStatus = statuses.find((entry) => entry.id === statusId) ?? selectDefaultStatus(statuses)

      // Sprint linkage is now driven by the in-modal picker (falling back to a
      // sprint passed in via props / the existing task). A sprint-linked task is
      // task_type='sprint' with no department, matching the sprint boards + RLS.
      const effectiveSprintId = personal ? null : (selectedSprintId || null)

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        statusId: selectedStatus?.id ?? statusId,
        statusCategory: selectedStatus?.category,
        priority,
        assignee_id: assigneeIds[0] || null,
        assigneeIds,
        due_date: dueDate || null,
        due_time: (dueDate && dueTime) ? dueTime : null,
        is_personal: personal,
        source: 'manual',
        department_id: personal ? departmentId ?? null : (selectedSpaceId || departmentId || resolveDeptFromTeams(assigneeIds[0])) ?? null,
        sprint_id: effectiveSprintId,
        list_id: personal || effectiveSprintId ? null : listId ?? task?.list_id ?? null,
        task_type: personal ? 'personal' : effectiveSprintId ? 'sprint' : 'space',
      }

      if (mode === 'create') {
        payload.created_by = profile?.id
        const created = ctx ? await ctx.addTask(payload) : await createTask(payload)

        if (assigneeIds[0] && assigneeIds[0] !== profile?.id) {
          const { error: notifyError } = await supabase.rpc('create_task_notification', {
            p_user_id: assigneeIds[0],
            p_type: 'task_assigned',
            p_task_id: created.id,
          })
          if (notifyError) console.error(notifyError)
        }

        if (pendingWatchers.length > 0) {
          const { followTask } = await import('../lib/followers')
          await Promise.allSettled(pendingWatchers.map((u) => followTask(created.id, u.id)))
        }

        onSaved?.(created)
      } else {
        const updated = ctx ? await ctx.editTask(task.id, payload) : await updateTask(task.id, payload)

        if (assigneeIds[0] && assigneeIds[0] !== previousAssigneeId && assigneeIds[0] !== profile?.id) {
          const { error: notifyError } = await supabase.rpc('create_task_notification', {
            p_user_id: assigneeIds[0],
            p_type: 'task_assigned',
            p_task_id: updated.id,
          })
          if (notifyError) console.error(notifyError)
        }

        // Notify assignee on meaningful status transitions (completed only).
        const statusChanged = selectedStatus?.id && selectedStatus.id !== previousStatusId
        const isNotifyTransition = selectedStatus?.category === 'completed'
        const notifyTarget = assigneeIds[0] || updated.assignee_id
        if (statusChanged && isNotifyTransition && notifyTarget && notifyTarget !== profile?.id) {
          supabase.rpc('create_task_notification', {
            p_user_id: notifyTarget,
            p_type: 'task_status_changed',
            p_task_id: updated.id,
          }).then(({ error }) => {
            if (error) console.warn('Status change notification failed:', error.message)
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
      setError(null)
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
            border: '1px solid var(--border-1)',
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden',
            fontFamily: FONT_BODY,
          }}
          aria-describedby={undefined}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-1)',
            }}
          >
            <Dialog.Title style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {mode === 'create' ? 'New task' : 'Edit task'}
            </Dialog.Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isReadOnly && (
                <WatchersPopover
                  taskId={mode === 'edit' ? task?.id : null}
                  pending={pendingWatchers}
                  onPendingChange={setPendingWatchers}
                  canRemove={
                    role === 'super_admin' ||
                    role === 'regional_secretary' ||
                    role === 'dept_lead' ||
                    profile?.id === task?.created_by
                  }
                />
              )}
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
                View only
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

            {blockers.length > 0 && (
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

            {!personal && !departmentId && (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Space *</label>
                <select
                  disabled={isReadOnly}
                  value={selectedSpaceId}
                  onChange={(e) => { setSelectedSpaceId(e.target.value); setStatusId('') }}
                  style={inputStyle}
                >
                  <option value="">-- Choose space --</option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
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

            {!personal && (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Link to sprint</label>
                <SprintPicker
                  spaceId={selectedSpaceId || departmentId}
                  value={selectedSprintId}
                  onChange={(id) => setSelectedSprintId(id || '')}
                  disabled={isReadOnly}
                  placeholder="No sprint — space board only"
                  autoSelectIfSingle={!task}
                />
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Only sprints in this space that you can add tasks to are shown.
                </div>
              </div>
            )}

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

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Due date &amp; time</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); if (!e.target.value) setDueTime('') }}
                  style={{
                    ...inputStyle,
                    padding: '9px 12px',
                    flex: '1 1 0',
                    opacity: isReadOnly ? 0.6 : 1,
                    cursor: isReadOnly ? 'default' : 'pointer',
                    colorScheme: 'light',
                  }}
                  onFocus={(e) => { if (!isReadOnly) e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { if (!isReadOnly) e.target.style.borderColor = 'var(--border)' }}
                />
                <input
                  type="time"
                  disabled={isReadOnly || !dueDate}
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: '9px 12px',
                    width: 130,
                    flexShrink: 0,
                    opacity: (isReadOnly || !dueDate) ? 0.4 : 1,
                    cursor: (isReadOnly || !dueDate) ? 'default' : 'pointer',
                    colorScheme: 'light',
                  }}
                  onFocus={(e) => { if (!isReadOnly && dueDate) e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { if (!isReadOnly) e.target.style.borderColor = 'var(--border)' }}
                />
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

            {mode === 'create' ? (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Subtasks</label>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Save the task first, then add subtasks.
                </div>
              </div>
            ) : null}

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

            {mode === 'edit' && task?.id && !isReadOnly ? (
              <TaskChecklists taskId={task.id} />
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
                  statuses={statuses}
                  members={members}
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
                    fontWeight: 600,
                    padding: '7px 20px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'var(--purple-700)',
                    color: 'white',
                    border: 'none',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background .13s',
                  }}
                  onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = 'var(--purple-600)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--purple-700)' }}
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
