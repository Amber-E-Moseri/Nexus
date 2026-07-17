import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { hasSpaceRole } from '../../../lib/permissions'
import { getAllOrgMembers, getDeptMembers } from '../lib/tasks'
import {
  PRIORITY_OPTIONS, PRIORITY_COLORS, FlagIcon,
  DueDatePickerPopover, PriorityPickerPopover, AssigneePickerPopover,
} from './TaskPickers'
import { formatDueDate } from '../../../lib/dateUtils'

const LABEL_STYLE = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A', marginBottom: 6, display: 'block' }

export default function InlineTaskComposer({
  departments = [],
  defaultDepartmentId = '',
  listId = null,
  onSubmit,
  onCancel,
  compact = false,
  teamMembers = [],
  statuses = [],
}) {
  const { profile, role } = useAuth()
  const [title, setTitle] = useState('')
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? departments[0]?.id ?? '')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [assigneeIds, setAssigneeIds] = useState([])
  const [statusId, setStatusId] = useState(() => {
    const notStarted = statuses.find((s) => s.name === 'Not Started')
    if (notStarted) return notStarted.id
    return statuses.find((s) => s.category === 'open')?.id ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')

  // picker open states
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)

  // members for assignee picker
  const [members, setMembers] = useState(
    teamMembers.map((m) => ({ id: m.id, full_name: m.name ?? m.full_name ?? m.email ?? '' }))
  )
  const [otherMembers, setOtherMembers] = useState([])

  // Org-wide roles can assign to anyone; everyone else is scoped to their own
  // department for direct assignment (matches TaskModal.jsx's canAssignOrgWide) —
  // others still show up in a separate "Others" section for search/mention-style
  // visibility, not as directly assignable.
  const canAssignOrgWide = role === 'super_admin' || role === 'regional_secretary' ||
    hasSpaceRole(profile, null, 'ors') || hasSpaceRole(profile, null, 'programs')

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
      // Already have a pre-scoped department list from the parent — just fetch org
      // members to populate "Others" for search/mention visibility.
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
    if (departments.length > 0 && !departmentId) { setError('Select a department.'); return }
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

  const fieldStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--text-primary)', background: '#FAFAF8', width: '100%', boxSizing: 'border-box', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: 8, padding: compact ? 12 : 14, border: '1px solid rgba(91,52,199,0.18)', borderRadius: 14, background: '#FFFFFF', boxShadow: '0 8px 24px rgba(28,22,16,0.06)' }}
    >
      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
        placeholder="Task title"
        style={{ width: '100%', border: '1.5px solid var(--accent)', borderRadius: 10, padding: compact ? '9px 11px' : '10px 12px', fontSize: 13, color: 'var(--text-primary)', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
      />

      {/* Department (if multiple) */}
      {departments.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={LABEL_STYLE}>Department</span>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
            style={{ ...fieldStyle, display: 'block' }}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {/* Due date + Priority row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {/* Due date */}
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={LABEL_STYLE}>Due date</span>
          <button type="button" onClick={() => { setDueDateOpen((v) => !v); setAssigneeOpen(false); setPriorityOpen(false) }}
            style={{ ...fieldStyle, color: dueDate ? dueColor : 'var(--text-tertiary)' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ flex: 1 }}>{dueDate ? due.label : 'Set date'}</span>
            {dueDate && (
              <span onClick={(e) => { e.stopPropagation(); setDueDate(''); setDueTime('') }}
                style={{ color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1, marginLeft: 'auto' }}>×</span>
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
          <span style={LABEL_STYLE}>Priority</span>
          <button type="button" onClick={() => { setPriorityOpen((v) => !v); setDueDateOpen(false); setAssigneeOpen(false) }}
            style={{ ...fieldStyle, gap: 6, paddingLeft: 10, paddingRight: 10, whiteSpace: 'nowrap' }}>
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
      </div>

      {/* Assign to */}
      <div style={{ marginTop: 10, position: 'relative' }}>
        <span style={LABEL_STYLE}>Assign to</span>
        <button type="button" onClick={() => { setAssigneeOpen((v) => !v); setDueDateOpen(false); setPriorityOpen(false) }}
          style={{ ...fieldStyle, color: assigneeIds.length ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {assigneeIds.length ? assigneeNames : 'Unassigned'}
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

      {/* Status (if not compact and statuses available) */}
      {!compact && statuses.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={LABEL_STYLE}>Status</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {statuses.map((s) => {
              const active = statusId === s.id
              return (
                <button key={s.id} type="button" onClick={() => setStatusId(s.id)}
                  style={{ border: active ? '1px solid transparent' : '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? `#${s.color || '4C2A92'}` : '#FFFFFF', color: active ? '#FFFFFF' : 'var(--text-secondary)' }}>
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, marginBottom: 6, background: '#F5F3F0', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{sub}</span>
                  <button type="button" onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newSubtask.trim()) { e.preventDefault(); setSubtasks([...subtasks, newSubtask.trim()]); setNewSubtask('') } }}
              placeholder="Add a subtask"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', background: '#FFFFFF', outline: 'none' }}
            />
            <button type="button" onClick={() => { if (newSubtask.trim()) { setSubtasks([...subtasks, newSubtask.trim()]); setNewSubtask('') } }}
              style={{ border: '1px solid var(--border)', background: '#FFFFFF', color: 'var(--accent)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Add
            </button>
          </div>
        </div>
      )}

      {error ? <div style={{ marginTop: 10, fontSize: 12, color: 'var(--coral-dark)' }}>{error}</div> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onCancel} disabled={saving}
          style={{ border: '1px solid var(--border)', background: '#FFFFFF', color: 'var(--text-secondary)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={saving}
          style={{ border: 'none', background: 'var(--accent)', color: '#FFFFFF', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save task'}
        </button>
      </div>
    </form>
  )
}
