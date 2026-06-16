import * as Dialog from '@radix-ui/react-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { PRIORITIES } from '../../lib/constants'
import { createNotification } from '../../lib/notifications'
import { getSprintMembers } from '../../lib/sprints'
import { normalizeTaskFieldSettings } from '../../lib/taskFieldSettings'
import { createTask, deleteTask, updateTask } from '../../lib/tasks'
import {
  getTaskStatusId,
  listTaskStatuses,
  selectDefaultStatus,
} from '../../lib/taskStatuses'
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

function TaskModalTabs({ taskId, departmentId, sprintId }) {
  const [activeTab, setActiveTab] = useState('comments')

  const tabs = [
    { id: 'comments', label: 'Comments' },
    { id: 'files', label: 'Files' },
    { id: 'dependencies', label: 'Dependencies' },
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
  onClose,
  onSaved,
  onDeleted,
}) {
  const { profile } = useAuth()
  const ctx = useContext(TasksContext)
  const contextStatuses = ctx?.statuses ?? []
  const visibleFields = normalizeTaskFieldSettings(fieldSettings)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [statuses, setStatuses] = useState(contextStatuses)
  const [statusId, setStatusId] = useState(getTaskStatusId(task) ?? defaultStatus ?? '')
  const [priority, setPriority] = useState(task?.priority ?? 'medium')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [dueDate, setDueDate] = useState(task?.due_date ?? defaultDueDate ?? '')
  const [personal, setPersonal] = useState(task?.is_personal ?? isPersonal)
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? [])
  const deptMembers = useDeptMembers(departmentId)
  const [members, setMembers] = useState(sprintId ? [] : deptMembers)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)

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
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        is_personal: personal,
        source: 'manual',
        department_id: personal ? departmentId ?? null : sprintId ? null : departmentId ?? null,
        sprint_id: personal ? null : sprintId ?? task?.sprint_id ?? null,
        list_id: personal ? null : listId ?? task?.list_id ?? null,
        task_type: personal ? 'personal' : sprintId || task?.sprint_id ? 'sprint' : 'space',
      }

      if (mode === 'create') {
        payload.created_by = profile?.id
        const created = ctx ? await ctx.addTask(payload) : await createTask(payload)

        if (assigneeId && assigneeId !== profile?.id) {
          await createNotification(assigneeId, 'task_assigned', {
            task_id: created.id,
            task_title: created.title,
            assigner_name: profile?.name,
          })
        }

        onSaved?.(created)
      } else {
        const updated = ctx ? await ctx.editTask(task.id, payload) : await updateTask(task.id, payload)

        if (assigneeId && assigneeId !== previousAssigneeId && assigneeId !== profile?.id) {
          await createNotification(assigneeId, 'task_assigned', {
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

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Title *</label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                style={{ ...inputStyle, fontSize: 15, padding: '10px 12px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                >
                  {statuses.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                >
                  {PRIORITIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {members.length > 0 ? (
                <div>
                  <label style={labelStyle}>Assignee</label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label style={labelStyle}>Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details, context, or acceptance criteria…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>

            {isPersonal ? (
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="is-personal"
                  checked={personal}
                  onChange={(e) => setPersonal(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                <label htmlFor="is-personal" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
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
              {mode === 'edit' ? (
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
                Cancel
              </Dialog.Close>
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
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
