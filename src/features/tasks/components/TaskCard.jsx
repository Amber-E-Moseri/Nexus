import { memo, useState, useRef, useEffect } from 'react'
import { Paperclip } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDueDate } from '../../../lib/dateUtils'
import { PRIORITY_STYLES } from '../../../lib/priorities'
import { isTaskCompleted, getTaskStatusLabel, STATUS_CATEGORIES, getCategoryStatusId } from '../../../lib/taskStatuses'
import { hasSpaceRole } from '../../../lib/permissions'
import { getAllOrgMembers, getDeptMembers } from '../lib/tasks'
import { useTasks } from '../TasksContext'
import { useAuth } from '../../../hooks/useAuth'
import {
  FlagIcon, Avatar, PRIORITY_COLORS,
  DueDatePickerPopover, PriorityPickerPopover, AssigneePickerPopover,
} from './TaskPickers'

function OverflowBadge({ count }) {
  return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EDE8F8', color: '#4C2A92', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      +{count}
    </div>
  )
}

function TaskCard({ task, onClick, isDragging = false, onTaskUpdate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: task.id })
  const { editTask, addTask } = useTasks()
  const { profile, role } = useAuth()

  const [subtasksExpanded, setSubtasksExpanded] = useState(false)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [localTask, setLocalTask] = useState(task)
  const [isHovering, setIsHovering] = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [members, setMembers] = useState([])
  const [otherMembers, setOtherMembers] = useState([])
  const subtaskInputRef = useRef(null)

  // Org-wide roles can assign to anyone; everyone else is scoped to their own
  // department for direct assignment (matches TaskModal.jsx's canAssignOrgWide) —
  // others still show up in a separate "Others" section for search/mention-style
  // visibility, not as directly assignable.
  const canAssignOrgWide = role === 'super_admin' || role === 'regional_secretary' ||
    hasSpaceRole(profile, null, 'ors') || hasSpaceRole(profile, null, 'programs')

  useEffect(() => { setLocalTask(task) }, [task])
  useEffect(() => { if (addingSubtask) subtaskInputRef.current?.focus() }, [addingSubtask])
  useEffect(() => {
    if (!assigneeOpen && !addingSubtask) return
    const departmentId = localTask.department_id ?? localTask.department?.id ?? profile?.department_id ?? null

    if (canAssignOrgWide) {
      getAllOrgMembers()
        .then((data) => setMembers(data.map((m) => ({ id: m.id, full_name: m.name }))))
        .catch((error) => { console.error(error); setMembers([]) })
      setOtherMembers([])
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
  }, [assigneeOpen, addingSubtask, canAssignOrgWide, localTask.department_id, profile?.department_id])

  async function handleMarkComplete(e) {
    e.stopPropagation()
    const alreadyDone = isTaskCompleted(localTask)
    const targetCategory = alreadyDone ? STATUS_CATEGORIES.OPEN : STATUS_CATEGORIES.COMPLETED
    const departmentId = localTask.department_id ?? localTask.department?.id ?? null
    const nextStatusId = await getCategoryStatusId({ departmentId, category: targetCategory })
    setLocalTask((t) => ({ ...t, status_id: nextStatusId, status_category: targetCategory }))
    await editTask(localTask.id, { statusId: nextStatusId, statusCategory: targetCategory })
  }

  async function handlePrioritySelect(value) {
    setLocalTask((t) => ({ ...t, priority: value }))
    await editTask(localTask.id, { priority: value })
  }

  async function handleAssigneeToggle(memberId) {
    const currentIds = (localTask.assignees ?? []).map((a) => a.id ?? a)
    const newIds = currentIds.includes(memberId)
      ? currentIds.filter((id) => id !== memberId)
      : [...currentIds, memberId]
    const newAssignees = members.filter((m) => newIds.includes(m.id)).map((m) => ({ id: m.id, name: m.full_name }))
    setLocalTask((t) => ({ ...t, assignees: newAssignees, assignee_id: newIds[0] ?? null }))
    await editTask(localTask.id, { assigneeIds: newIds })
  }

  async function handleAddSubtask(e) {
    if (e.key && e.key !== 'Enter') return
    const title = subtaskTitle.trim()
    if (!title) { setAddingSubtask(false); return }
    setSubtaskTitle('')
    const payload = { title, parentTaskId: localTask.id, listId: localTask.list_id, departmentId: localTask.department_id ?? localTask.department?.id ?? null }
    if (subtaskAssigneeId) payload.assignee_id = subtaskAssigneeId
    try {
      const created = await addTask(payload)
      if (created) {
        const assignee = members.find((m) => m.id === subtaskAssigneeId) ?? null
        setLocalTask((t) => ({ ...t, subtasks: [...(t.subtasks ?? []), { ...created, assignee }] }))
        setSubtasksExpanded(true)
      }
    } catch (_) {
      const { data } = await supabase
        .from('tasks')
        .insert({ title, parent_task_id: localTask.id, list_id: localTask.list_id, assignee_id: subtaskAssigneeId ?? undefined })
        .select('id, title, status, assignee_id')
        .single()
      if (data) {
        const assignee = members.find((m) => m.id === subtaskAssigneeId) ?? null
        setLocalTask((t) => ({ ...t, subtasks: [...(t.subtasks ?? []), { ...data, assignee }] }))
        setSubtasksExpanded(true)
      }
    }
    setSubtaskAssigneeId(null)
    setMemberSearch('')
    setAddingSubtask(false)
  }

  const due = formatDueDate(localTask.due_date)
  const priorityColor = PRIORITY_COLORS[localTask.priority] ?? '#B0A898'
  const subtasks = localTask.subtasks ?? []
  const parentTitle = localTask.parent?.title ?? localTask.parent_task?.title ?? null
  const assignees = Array.isArray(localTask.assignees)
    ? localTask.assignees.filter(Boolean)
    : localTask.assignee ? [localTask.assignee] : []
  const visibleAssignees = assignees.slice(0, 3)
  const overflowCount = Math.max(0, assignees.length - visibleAssignees.length)
  const dueColor = due.status === 'overdue' ? 'var(--coral-dark)'
    : due.status === 'today' ? 'var(--accent)'
    : due.status === 'soon' ? 'var(--amber)'
    : 'var(--text-tertiary)'
  const subtasksDone = subtasks.filter((s) => isTaskCompleted(s)).length
  const subtaskPct = subtasks.length > 0 ? Math.round((subtasksDone / subtasks.length) * 100) : 0
  const subtaskBarColor = subtaskPct >= 100 ? '#2D8653' : subtaskPct > 0 ? '#C47E0A' : '#D5CCBE'
  const assigneeIds = assignees.map((a) => a.id ?? a)

  const actionBtnStyle = {
    background: '#FFFFFF', border: '1px solid #E8E0D2', borderRadius: 7,
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)',
    flexShrink: 0, boxShadow: '0 1px 4px rgba(28,22,16,0.08)',
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortDragging ? 0.4 : 1,
        background: '#FFFFFF',
        border: `1px solid ${isHovering ? '#C8BFAF' : '#E8E0D2'}`,
        borderRadius: 14,
        overflow: 'visible',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        boxShadow: isDragging
          ? '0 8px 28px rgba(28,22,16,0.10)'
          : isHovering
            ? '0 4px 16px rgba(28,22,16,0.10)'
            : '0 2px 8px rgba(28,22,16,0.06)',
      }}
    >
      <div style={{ padding: '12px 14px', position: 'relative' }}>

        {/* Hover action bar */}
        {isHovering && (
          <div
            style={{ position: 'absolute', top: -18, right: 10, display: 'flex', gap: 2, background: '#FFFFFF', border: '1px solid #E0D8CC', borderRadius: 8, padding: '3px 4px', boxShadow: '0 2px 8px rgba(28,22,16,0.12)', zIndex: 10 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button title="Mark complete" onClick={handleMarkComplete} style={{ ...actionBtnStyle, color: isTaskCompleted(localTask) ? '#2D8653' : 'var(--text-secondary)' }}>✓</button>
            <button title="Add subtask" onClick={(e) => { e.stopPropagation(); setAddingSubtask(true) }} style={actionBtnStyle}>⊕</button>
            <button title="Edit" onClick={(e) => { e.stopPropagation(); onClick?.(e) }} style={actionBtnStyle}>✏️</button>
            <button title="More" style={actionBtnStyle}>···</button>
          </div>
        )}

        {/* Title */}
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textDecoration: isTaskCompleted(localTask) ? 'line-through' : 'none', opacity: isTaskCompleted(localTask) ? 0.5 : 1 }} title={localTask.title}>
          {localTask.title}
        </p>

        {parentTitle ? (
          <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '-6px 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {parentTitle}</p>
        ) : null}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Assignees */}
          <div
            style={{ position: 'relative', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); setAssigneeOpen((v) => !v); setPriorityOpen(false); setDueDateOpen(false) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {visibleAssignees.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                {visibleAssignees.map((a, i) => (
                  <div key={a.id ?? i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <Avatar name={a.name ?? a.full_name} />
                  </div>
                ))}
                {overflowCount > 0 && <div style={{ marginLeft: -6 }}><OverflowBadge count={overflowCount} /></div>}
              </div>
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed #C8BFAF', cursor: 'pointer' }} title="Assign" />
            )}
            {assigneeOpen && (
              <AssigneePickerPopover
                currentIds={assigneeIds}
                members={members}
                otherMembers={otherMembers}
                profile={profile}
                onToggle={handleAssigneeToggle}
                onClose={() => setAssigneeOpen(false)}
              />
            )}
          </div>

          {/* Due date */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              title={localTask.due_date ? 'Change due date' : 'Set due date'}
              onClick={(e) => { e.stopPropagation(); setDueDateOpen((v) => !v); setAssigneeOpen(false); setPriorityOpen(false) }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, color: localTask.due_date ? dueColor : '#C8BFAF', fontWeight: due.status === 'normal' ? 400 : 500, whiteSpace: 'nowrap' }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {localTask.due_date ? due.label : '—'}
            </button>
            {dueDateOpen && (
              <DueDatePickerPopover
                taskId={localTask.id}
                initialDate={localTask.due_date ?? ''}
                initialTime={localTask.due_time ?? ''}
                initialRecurrence={localTask.recurrence ?? null}
                onSave={(updates) => { const updated = { ...localTask, ...updates }; setLocalTask(updated); onTaskUpdate?.(updated) }}
                onClose={() => setDueDateOpen(false)}
              />
            )}
          </div>

          {/* Priority flag */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              title={`Priority: ${localTask.priority ?? 'medium'}`}
              onClick={(e) => { e.stopPropagation(); setPriorityOpen((v) => !v); setDueDateOpen(false); setAssigneeOpen(false) }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <FlagIcon color={priorityColor} />
            </button>
            {priorityOpen && (
              <PriorityPickerPopover
                current={localTask.priority}
                onSelect={handlePrioritySelect}
                onClose={() => setPriorityOpen(false)}
              />
            )}
          </div>

          {/* Paperclip */}
          <Paperclip size={12} style={{ color: '#C8BFAF', flexShrink: 0 }} />

          {/* Subtask toggle */}
          {subtasks.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); setSubtasksExpanded((v) => !v) }}
              onPointerDown={(e) => e.stopPropagation()}
              title={`${subtasksDone} of ${subtasks.length} subtasks`}
              style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-tertiary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
            >
              <span style={{ fontSize: 8, display: 'inline-block', transition: 'transform 0.15s', transform: subtasksExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              {subtasksDone}/{subtasks.length}
            </button>
          ) : null}
        </div>
      </div>

      {/* Bottom clipping wrapper */}
      <div style={{ borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {subtasks.length > 0 ? (
          <div title={`${subtasksDone} of ${subtasks.length} subtasks completed`} style={{ height: 4, background: '#EDE8DF' }}>
            <div style={{ height: '100%', width: `${subtaskPct}%`, background: subtaskBarColor, transition: 'width 0.3s ease' }} />
          </div>
        ) : null}

        {addingSubtask ? (
          <div style={{ borderTop: '1px solid #F0EBE3', padding: '8px 14px' }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <input
              ref={subtaskInputRef}
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              onKeyDown={handleAddSubtask}
              onBlur={() => { if (!subtaskTitle.trim() && !subtaskAssigneeId) setAddingSubtask(false) }}
              placeholder="Subtask title, press Enter"
              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
            />
            <div style={{ position: 'relative' }}>
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Assign to… (optional)"
                style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #D5CCBE', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
              />
              {memberSearch && (
                <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#FFF', border: '1px solid #E8E0D2', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 140, overflowY: 'auto' }}>
                  {members.filter((m) => (m.full_name ?? '').toLowerCase().includes(memberSearch.toLowerCase())).map((m) => (
                    <div
                      key={m.id}
                      onMouseDown={(e) => { e.preventDefault(); setSubtaskAssigneeId(m.id); setMemberSearch(m.full_name) }}
                      style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', background: subtaskAssigneeId === m.id ? '#F0EAFB' : 'transparent', color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = subtaskAssigneeId === m.id ? '#F0EAFB' : 'transparent' }}
                    >
                      {m.full_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {subtasksExpanded && subtasks.length > 0 ? (
          <div style={{ borderTop: '1px solid #F0EBE3', padding: '6px 14px 8px' }}>
            {subtasks.map((sub) => {
              const done = isTaskCompleted(sub)
              return (
                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid #F5F0E8', fontSize: 12 }}>
                  <span style={{ fontSize: 11, color: done ? '#2D8653' : '#B0A898', flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.65 : 1 }}>
                    {sub.title}
                  </span>
                  {sub.due_date ? (
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatDueDate(sub.due_date).label}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default memo(TaskCard)
