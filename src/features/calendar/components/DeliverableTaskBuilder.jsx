import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Plus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { createTask } from '../../tasks/lib/tasks'
import { followTask } from '../../tasks/lib/followers'

const fieldStyle = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'white',
  color: 'var(--text-primary)',
  width: '100%',
  boxSizing: 'border-box',
}

let _rowId = 0
function newRow() {
  return {
    id: ++_rowId,
    title: '',
    assignee: null,      // { id, name, department_id }
    dueDate: '',
    listId: '',
    lists: [],
    listsLoading: false,
    status: 'idle',      // 'idle' | 'saving' | 'done' | 'error'
    error: '',
  }
}

export default function DeliverableTaskBuilder({ event, onSaved }) {
  const [rows, setRows] = useState([newRow()])
  const [programsDeptId, setProgramsDeptId] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const isSprintMode = Boolean(event?.sprint_id)

  useEffect(() => {
    supabase
      .from('departments')
      .select('id')
      .ilike('name', 'programs')
      .single()
      .then(({ data }) => setProgramsDeptId(data?.id ?? null))
      .catch(() => {})

    supabase
      .from('users')
      .select('id, name, department_id')
      .order('name')
      .then(({ data }) => setAllUsers(data ?? []))
      .catch(() => {})
  }, [])

  const loadListsForRow = useCallback(async (rowId, departmentId) => {
    if (!departmentId || isSprintMode) return
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, listId: '', lists: [], listsLoading: true } : r
    ))
    let lists = []
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name')
        .eq('department_id', departmentId)
        .order('sort_order')
      if (!error) lists = data ?? []
    } catch { /* leave lists empty */ }
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, lists, listsLoading: false } : r
    ))
  }, [isSprintMode])

  function updateRow(rowId, changes) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...changes } : r))
  }

  function onAssigneeChange(rowId, userId) {
    const user = allUsers.find(u => u.id === userId) ?? null
    updateRow(rowId, { assignee: user, listId: '', lists: [] })
    if (user?.department_id) loadListsForRow(rowId, user.department_id)
  }

  const idleRows = rows.filter(r => r.status === 'idle')
  const canSave = !submitting && idleRows.length > 0 && idleRows.every(r =>
    r.title.trim() && r.assignee && (isSprintMode || r.listId)
  )

  async function fanOutWatchers(taskId, assigneeDeptId) {
    if (!programsDeptId) return
    try {
      const [{ data: programsUsers }, { data: deptLeads }] = await Promise.all([
        supabase.from('users').select('id').eq('department_id', programsDeptId),
        supabase.from('space_roles').select('user_id')
          .eq('space_id', assigneeDeptId).eq('role', 'dept_lead'),
      ])
      const ids = [...new Set([
        ...(programsUsers ?? []).map(u => u.id),
        ...(deptLeads ?? []).map(r => r.user_id),
      ])]
      for (const userId of ids) {
        try { await followTask(taskId, userId) } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }
  }

  async function handleSave() {
    setSubmitting(true)
    for (const row of rows.filter(r => r.status === 'idle')) {
      updateRow(row.id, { status: 'saving', error: '' })
      try {
        const payload = isSprintMode
          ? {
              title: row.title.trim(),
              due_date: row.dueDate || null,
              assigneeIds: [row.assignee.id],
              sprint_id: event.sprint_id,
              task_type: 'sprint',
              list_id: null,
              department_id: row.assignee.department_id,
              calendar_event_id: event.id,
              source: 'manual',
              is_personal: false,
            }
          : {
              title: row.title.trim(),
              due_date: row.dueDate || null,
              assigneeIds: [row.assignee.id],
              task_type: 'space',
              department_id: row.assignee.department_id,
              list_id: row.listId,
              calendar_event_id: event.id,
              source: 'manual',
              is_personal: false,
            }

        const created = await createTask(payload)
        await fanOutWatchers(created.id, row.assignee.department_id)
        updateRow(row.id, { status: 'done' })
      } catch (err) {
        updateRow(row.id, { status: 'error', error: err.message ?? 'Failed to create task' })
      }
    }
    setSubmitting(false)
    onSaved?.()
  }

  const gridCols = isSprintMode
    ? 'minmax(0,2fr) minmax(0,1.5fr) 130px 36px'
    : 'minmax(0,2fr) minmax(0,1.5fr) minmax(0,1.5fr) 130px 36px'

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{
        padding: '7px 12px',
        borderRadius: '8px',
        background: 'var(--surface-secondary)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        marginBottom: '12px',
      }}>
        {isSprintMode ? 'Tasks will join the linked sprint' : "Tasks will go into each assignee's space"}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        {rows.map(row => (
          <div key={row.id}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: '6px',
              alignItems: 'center',
              padding: '8px 10px',
              border: `1px solid ${row.status === 'error' ? 'var(--coral-dark, #c0392b)' : row.status === 'done' ? '#2D8653' : 'var(--border)'}`,
              borderRadius: '10px',
              background: row.status === 'done' ? '#f0faf4' : 'var(--surface-tertiary)',
              opacity: row.status !== 'idle' ? 0.8 : 1,
            }}>
              <input
                type="text"
                value={row.title}
                onChange={e => updateRow(row.id, { title: e.target.value })}
                placeholder="Task title"
                disabled={row.status !== 'idle'}
                style={fieldStyle}
              />

              <select
                value={row.assignee?.id ?? ''}
                onChange={e => onAssigneeChange(row.id, e.target.value)}
                disabled={row.status !== 'idle' || allUsers.length === 0}
                style={fieldStyle}
              >
                <option value="">{allUsers.length === 0 ? 'Loading…' : 'Assignee…'}</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              {!isSprintMode && (
                <select
                  value={row.listId}
                  onChange={e => updateRow(row.id, { listId: e.target.value })}
                  disabled={row.status !== 'idle' || !row.assignee || row.listsLoading || row.lists.length === 0}
                  style={fieldStyle}
                >
                  <option value="">
                    {!row.assignee
                      ? 'Pick assignee first'
                      : row.listsLoading
                        ? 'Loading…'
                        : row.lists.length === 0
                          ? 'No lists'
                          : 'List…'}
                  </option>
                  {row.lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}

              <input
                type="date"
                value={row.dueDate}
                onChange={e => updateRow(row.id, { dueDate: e.target.value })}
                disabled={row.status !== 'idle'}
                style={fieldStyle}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {row.status === 'saving' && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>…</span>
                )}
                {row.status === 'done' && <CheckCircle size={16} color="#2D8653" />}
                {row.status === 'error' && (
                  <span title={row.error}>
                    <AlertCircle size={16} color="var(--coral-dark, #c0392b)" />
                  </span>
                )}
                {row.status === 'idle' && (
                  <button
                    type="button"
                    onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                    disabled={idleRows.length <= 1}
                    style={{
                      background: 'none', border: 'none', cursor: idleRows.length <= 1 ? 'default' : 'pointer',
                      padding: '2px', color: 'var(--text-secondary)',
                      opacity: idleRows.length <= 1 ? 0.3 : 1,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {row.status === 'error' && row.error && (
              <div style={{
                marginTop: '4px', marginLeft: '10px',
                fontSize: '12px', color: 'var(--coral-dark, #c0392b)',
              }}>
                {row.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setRows(prev => [...prev, newRow()])}
          disabled={submitting}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', border: '1px dashed var(--border)',
            borderRadius: '8px', background: 'none', cursor: submitting ? 'default' : 'pointer',
            fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500,
          }}
        >
          <Plus size={13} /> Add row
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: '7px 16px', border: 'none', borderRadius: '8px',
            background: 'var(--accent)', color: '#fff',
            fontSize: '13px', fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          {submitting ? 'Creating…' : 'Create Tasks'}
        </button>
      </div>
    </div>
  )
}
