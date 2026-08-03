import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { canAssignOrgWide as checkCanAssignOrgWide } from '../../../lib/permissions'
import { getAllOrgMembers, getDeptMembers } from '../lib/tasks'
import {
  PRIORITY_OPTIONS, PRIORITY_COLORS, FlagIcon,
  DueDatePickerPopover, PriorityPickerPopover, AssigneePickerPopover,
} from './TaskPickers'
import { formatDueDate } from '../../../lib/dateUtils'

const LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  marginBottom: 5,
  display: 'block',
}

const CHIP_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  background: 'var(--surface-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'border-color 0.15s, background 0.15s',
}

export default function InlineTaskComposer({
  departments = [],
  defaultDepartmentId = '',
  listId = null,
  onSubmit,
  onCancel,
  compact = false,
  teamMembers = [],
  statuses = [],
  sprintTeams = [],
  currentUserId = null,
}) {
  const { profile, role } = useAuth()
  const [title, setTitle] = useState('')
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? departments[0]?.id ?? '')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [assigneeIds, setAssigneeIds] = useState([])
  const [statusId, setStatusId] = useState(() => {
    const toDo = statuses.find((s) => s.name === 'To Do')
    if (toDo) return toDo.id
    return statuses.find((s) => s.category === 'open')?.id ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')

  // sprintTeams is already scoped to the viewer's own teams by the caller
  // (org-wide roles like super_admin/programs/regional_secretary see all).
  // Auto-select when there's exactly one option.
  const [sprintTeamId, setSprintTeamId] = useState(() =>
    sprintTeams.length === 1 ? sprintTeams[0].id : null
  )

  // picker open states
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)

  // members for assignee picker
  const [members, setMembers] = useState(
    teamMembers.map((m) => ({ id: m.id, full_name: m.name ?? m.full_name ?? m.email ?? '' }))
  )
  const [otherMembers, setOtherMembers] = useState([])

  const canAssignOrgWide = checkCanAssignOrgWide(profile, role)

  useEffect(() => {
    if (!assigneeOpen) return

    if (canAssignOrgWide) {
      getAllOrgMembers()
        .then((data) => setMembers(data.map((m) => ({ id: m.id, full_name: m.name }))))
        .catch((error) => { console.error(error); setMembers([]) })
      setOtherMembers([])
      return
    }

    if (teamMembers.length > 0) {
      getAllOrgMembers()
        .then((data) => {
          const deptIds = new Set(teamMembers.map((m) => m.id))
          setOtherMembers(data.filter((m) => !deptIds.has(m.id)).map((m) => ({ id: m.id, full_name: m.name })))
        })
        .catch((error) => { console.error(error); setOtherMembers([]) })
      return
    }

    Promise.all([
      departmentId ? getDeptMembers(departmentId) : Promise.resolve([]),
      getAllOrgMembers(),
    ])
      .then(([deptData, orgData]) => {
        const deptIds = new Set(deptData.map((m) => m.id))
        setMembers(deptData.map((m) => ({ id: m.id, full_name: m.name })))
        setOtherMembers(orgData.filter((m) => !deptIds.has(m.id)).map((m) => ({ id: m.id, full_name: m.name })))
      })
      .catch((error) => { console.error(error); setMembers([]); setOtherMembers([]) })
  }, [assigneeOpen, teamMembers.length, canAssignOrgWide, departmentId])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) { setError('Task title is required.'); return }
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        title: title.trim(),
        departmentId,
        priority,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        listId,
        assigneeId: assigneeIds[0] ?? undefined,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        statusId: statusId || undefined,
        subtasks: subtasks.filter((s) => s.trim()),
        sprintTeamId: sprintTeamId || null,
      })
    } catch (err) {
      setError(err.message ?? 'Failed to create task.')
      setSaving(false)
    }
  }

  const due = dueDate ? formatDueDate(dueDate) : null
  const dueColor = due?.status === 'overdue' ? 'var(--coral-dark)'
    : due?.status === 'today' ? 'var(--accent)'
    : due?.status === 'soon' ? 'var(--amber)'
    : 'var(--text-secondary)'
  const priorityColor = PRIORITY_COLORS[priority] ?? '#B0A898'
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? 'Normal'
  const assigneeNames = members.filter((m) => assigneeIds.includes(m.id)).map((m) => m.full_name).join(', ')
  const selectedTeamName = sprintTeams.find((t) => t.id === sprintTeamId)?.name ?? null

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 8,
        padding: 14,
        border: '1px solid var(--accent)',
        borderRadius: 14,
        background: 'white',
        boxShadow: '0 4px 20px rgba(76,42,146,0.10)',
      }}
    >
      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) }
        }}
        placeholder="What needs to get done?"
        style={{
          width: '100%',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          borderRadius: 0,
          padding: '4px 0 10px',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          background: 'transparent',
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 12,
        }}
      />

      {/* Department (if multiple) */}
      {departments.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={LABEL_STYLE}>Department</span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            style={{ ...CHIP_BASE, display: 'block', width: '100%' }}
          >
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {/* Chip row: Due date · Priority · Assignee */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative' }}>

        {/* Due date */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => { setDueDateOpen((v) => !v); setAssigneeOpen(false); setPriorityOpen(false) }}
            style={{ ...CHIP_BASE, color: dueDate ? dueColor : 'var(--text-tertiary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {dueDate ? due.label : 'Due date'}
            {dueDate && (
              <span
                onClick={(e) => { e.stopPropagation(); setDueDate(''); setDueTime('') }}
                style={{ color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1 }}
              >×</span>
            )}
          </button>
          {dueDateOpen && (
            <DueDatePickerPopover
              initialDate={dueDate}
              initialTime={dueTime}
              onSave={(payload) => { setDueDate(payload.due_date ?? ''); setDueTime(payload.due_time ?? '') }}
              onClose={() => setDueDateOpen(false)}
            />
          )}
        </div>

        {/* Priority */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => { setPriorityOpen((v) => !v); setDueDateOpen(false); setAssigneeOpen(false) }}
            style={{ ...CHIP_BASE, color: priorityColor }}
          >
            <FlagIcon color={priorityColor} size={12} />
            {priorityLabel}
          </button>
          {priorityOpen && (
            <PriorityPickerPopover
              current={priority}
              onSelect={(v) => setPriority(v ?? 'medium')}
              onClose={() => setPriorityOpen(false)}
            />
          )}
        </div>

        {/* Assignee */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => { setAssigneeOpen((v) => !v); setDueDateOpen(false); setPriorityOpen(false) }}
            style={{ ...CHIP_BASE, color: assigneeIds.length ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {assigneeIds.length ? assigneeNames : 'Assign'}
          </button>
          {assigneeOpen && (
            <AssigneePickerPopover
              currentIds={assigneeIds}
              members={members}
              otherMembers={otherMembers}
              profile={profile}
              onToggle={(id) => {
                setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
              }}
              onClose={() => setAssigneeOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Team picker — only shown in sprint context with teams */}
      {sprintTeams.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={LABEL_STYLE}>Team</span>
          <select
            value={sprintTeamId ?? ''}
            onChange={(e) => setSprintTeamId(e.target.value || null)}
            style={{
              ...CHIP_BASE,
              display: 'block',
              width: '100%',
              color: sprintTeamId ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            <option value="">No team (sprint-wide)</option>
            {sprintTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {sprintTeams.length >= 2 && !sprintTeamId && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--coral-dark)' }}>
              You're in multiple teams — pick one so this task is grouped correctly.
            </p>
          )}
        </div>
      )}

      {/* Status (if not compact and statuses available) */}
      {!compact && statuses.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={LABEL_STYLE}>Status</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {statuses.map((s) => {
              const active = statusId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusId(s.id)}
                  style={{
                    border: active ? '1px solid transparent' : '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: active ? (s.color ?? 'var(--accent)') : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Subtasks */}
      {!compact && (
        <div style={{ marginTop: 10 }}>
          <span style={LABEL_STYLE}>Subtasks</span>
          {subtasks.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {subtasks.map((sub, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4, background: 'var(--surface-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{sub}</span>
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSubtask.trim()) {
                  e.preventDefault()
                  setSubtasks([...subtasks, newSubtask.trim()])
                  setNewSubtask('')
                }
              }}
              placeholder="Add a subtask"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => { if (newSubtask.trim()) { setSubtasks([...subtasks, newSubtask.trim()]); setNewSubtask('') } }}
              style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {error ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--coral-dark)' }}>{error}</div> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{ border: 'none', background: 'var(--accent)', color: '#FFFFFF', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save task'}
        </button>
      </div>
    </form>
  )
}
