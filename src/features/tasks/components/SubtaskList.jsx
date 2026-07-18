import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { useDndSensors } from '../../../dnd'
import { PRIORITIES } from '../../../lib/constants'
import { PRIORITY_STYLES } from '../../../lib/priorities'
import {
  STATUS_CATEGORIES,
  getCategoryStatusId,
  getTaskStatusId,
  getTaskStatusLabel,
  getTaskStatusColor,
  isTaskCompleted,
} from '../../../lib/taskStatuses'
import { supabase } from '../../../lib/supabase'
import { createSubtask, deleteTask, reorderSubtasks, updateSubtask } from '../lib/tasks'
import AssigneeSelector from './AssigneeSelector'
import SubtaskProgress from './SubtaskProgress'

function compareSubtasks(a, b) {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) return aOrder - bOrder
  return new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
}

function fieldLabelStyle() {
  return {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  }
}

const editInputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
}

function SubtaskRow({
  subtask,
  statuses,
  members,
  departmentId,
  sprintId,
  createdBy,
  expanded,
  onToggleExpand,
  onToggleDone,
  onChange,
  onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  })

  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(null)

  const completed = isTaskCompleted(subtask)
  const priority = PRIORITY_STYLES[subtask.priority] ?? PRIORITY_STYLES.medium
  const assignee = subtask.assignee ?? members.find((m) => m.id === subtask.assignee_id) ?? null

  function beginEdit() {
    setDraft({
      title: subtask.title ?? '',
      description: subtask.description ?? '',
      statusId: getTaskStatusId(subtask) ?? '',
      priority: subtask.priority ?? 'medium',
      assigneeId: subtask.assignee_id ?? null,
      dueDate: subtask.due_date ?? '',
    })
    onToggleExpand(subtask.id)
  }

  async function saveEdit() {
    if (!draft) return
    const title = draft.title.trim()
    if (!title) return
    setSaving(true)
    try {
      const selectedStatus = statuses.find((s) => s.id === draft.statusId)
      const updated = await updateSubtask(
        subtask.id,
        {
          title,
          description: draft.description.trim() || null,
          statusId: draft.statusId || undefined,
          statusCategory: selectedStatus?.category,
          priority: draft.priority,
          assignee_id: draft.assigneeId ?? null,
          due_date: draft.dueDate || null,
        },
        createdBy,
      )
      onChange(updated)
      onToggleExpand(null)

      // Notify the new assignee if the assignee changed (self-notify guard is in the RPC)
      if (draft.assigneeId && draft.assigneeId !== subtask.assignee_id) {
        supabase.rpc('create_task_notification', {
          p_user_id: draft.assigneeId,
          p_type: 'task_assigned',
          p_task_id: subtask.id,
        }).then(({ error }) => {
          if (error) console.warn('Subtask assignment notification failed:', error.message)
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : completed ? 0.55 : 1,
        background: 'var(--surface-secondary)',
        borderRadius: 8,
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'grab',
            touchAction: 'none',
            padding: 0,
            flexShrink: 0,
          }}
          aria-label="Drag to reorder subtask"
        >
          <GripVertical size={14} />
        </button>

        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggleDone(subtask)}
          style={{ flexShrink: 0, accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
          aria-label="Toggle subtask complete"
        />

        <button
          type="button"
          onClick={() => (expanded ? onToggleExpand(null) : beginEdit())}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 13,
            color: 'var(--text-primary)',
            textDecoration: completed ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subtask.title}
        </button>

        {/* Compact meta */}
        {subtask.due_date ? (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {new Date(subtask.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </span>
        ) : null}
        <span
          title={`Priority: ${subtask.priority ?? 'medium'}`}
          style={{ width: 8, height: 8, borderRadius: '50%', background: priority.text, flexShrink: 0 }}
        />
        <span
          title={getTaskStatusLabel(subtask)}
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 999,
            background: `${getTaskStatusColor(subtask)}22`,
            color: getTaskStatusColor(subtask),
            whiteSpace: 'nowrap',
            maxWidth: 90,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {getTaskStatusLabel(subtask)}
        </span>
        {assignee ? (
          <span
            title={assignee.name}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {(assignee.name ?? '?').split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => (expanded ? onToggleExpand(null) : beginEdit())}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'inline-flex' }}
          aria-label={expanded ? 'Collapse subtask' : 'Edit subtask'}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>

        <button
          type="button"
          onClick={() => onDelete(subtask.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0 2px', fontSize: 15, lineHeight: 1 }}
          aria-label="Delete subtask"
        >
          ×
        </button>
      </div>

      {expanded && draft ? (
        <div style={{ padding: '4px 10px 12px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={fieldLabelStyle()}>Title</label>
            <input
              autoFocus
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              style={editInputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 130px', minWidth: 120 }}>
              <label style={fieldLabelStyle()}>Status</label>
              <select
                value={draft.statusId}
                onChange={(e) => setDraft((d) => ({ ...d, statusId: e.target.value }))}
                style={{ ...editInputStyle, cursor: 'pointer' }}
              >
                {!draft.statusId ? <option value="">Select status…</option> : null}
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 110px', minWidth: 100 }}>
              <label style={fieldLabelStyle()}>Priority</label>
              <select
                value={draft.priority}
                onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                style={{ ...editInputStyle, cursor: 'pointer' }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 130px', minWidth: 120 }}>
              <label style={fieldLabelStyle()}>Due date</label>
              <input
                type="date"
                value={draft.dueDate ? String(draft.dueDate).slice(0, 10) : ''}
                onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                style={editInputStyle}
              />
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle()}>Assignee</label>
            <AssigneeSelector
              members={members}
              selectedIds={draft.assigneeId ? [draft.assigneeId] : []}
              onSelectionChange={(ids) => setDraft((d) => ({ ...d, assigneeId: ids[0] ?? null }))}
              isMultiSelect={false}
            />
          </div>

          <div>
            <label style={fieldLabelStyle()}>Description</label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Add details…"
              style={{ ...editInputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving || !draft.title.trim()}
              style={{
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 500,
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: saving || !draft.title.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => onToggleExpand(null)}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function SubtaskList({
  parentTaskId,
  subtasks = [],
  departmentId,
  sprintId,
  taskType = 'space',
  createdBy,
  statuses = [],
  members = [],
  onSubtasksChange,
}) {
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const sensors = useDndSensors()

  const ordered = useMemo(() => [...subtasks].sort(compareSubtasks), [subtasks])
  const doneCount = subtasks.filter((s) => isTaskCompleted(s)).length

  async function handleAdd(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    try {
      const created = await createSubtask(parentTaskId, {
        title,
        departmentId: departmentId ?? null,
        sprintId: sprintId ?? null,
        taskType,
        createdBy: createdBy ?? null,
        sortOrder: ordered.length,
      })
      onSubtasksChange([...subtasks, created])
      setNewTitle('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleDone(subtask) {
    const targetCategory = isTaskCompleted(subtask)
      ? STATUS_CATEGORIES.OPEN
      : STATUS_CATEGORIES.COMPLETED
    const nextStatusId = await getCategoryStatusId({
      departmentId: sprintId ? null : departmentId,
      category: targetCategory,
    })
    const updated = await updateSubtask(subtask.id, {
      statusId: nextStatusId,
      statusCategory: targetCategory,
    })
    onSubtasksChange(subtasks.map((s) => (s.id === subtask.id ? updated : s)))
  }

  function handleChange(updated) {
    onSubtasksChange(subtasks.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function handleDelete(subtaskId) {
    await deleteTask(subtaskId)
    onSubtasksChange(subtasks.filter((s) => s.id !== subtaskId))
  }

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = ordered.findIndex((s) => s.id === active.id)
    const newIndex = ordered.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...ordered]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Optimistically apply new sort_order, then persist.
    const withOrder = reordered.map((s, index) => ({ ...s, sort_order: index }))
    onSubtasksChange(withOrder)
    try {
      await reorderSubtasks(withOrder.map((s) => s.id))
    } catch {
      onSubtasksChange(subtasks)
    }
  }

  const activeSubtask = activeId ? ordered.find((s) => s.id === activeId) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          Subtasks
          {subtasks.length > 0 ? (
            <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-tertiary)' }}>
              {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''} ({doneCount} done)
            </span>
          ) : null}
        </button>
        {subtasks.length > 0 ? <SubtaskProgress subtasks={subtasks} /> : null}
      </div>

      {!collapsed ? (
        <>
          {ordered.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setActiveId(active.id)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ marginBottom: 8 }}>
                  {ordered.map((subtask) => (
                    <SubtaskRow
                      key={subtask.id}
                      subtask={subtask}
                      statuses={statuses}
                      members={members}
                      departmentId={departmentId}
                      sprintId={sprintId}
                      createdBy={createdBy}
                      expanded={expandedId === subtask.id}
                      onToggleExpand={setExpandedId}
                      onToggleDone={handleToggleDone}
                      onChange={handleChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeSubtask ? (
                  <div
                    style={{
                      background: 'white',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      boxShadow: '0 8px 24px rgba(28,22,16,0.16)',
                    }}
                  >
                    {activeSubtask.title}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : null}

          {adding ? (
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Subtask title…"
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: '6px 8px',
                  border: '1px solid var(--accent)',
                  borderRadius: 6,
                  outline: 'none',
                  background: 'white',
                  color: 'var(--text-primary)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setNewTitle('')
                  }
                }}
              />
              <button
                type="submit"
                disabled={saving || !newTitle.trim()}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  opacity: saving || !newTitle.trim() ? 0.6 : 1,
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setNewTitle('')
                }}
                style={{
                  padding: '6px 8px',
                  fontSize: 12,
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                padding: '6px 10px',
                width: '100%',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              + Add subtask
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}
