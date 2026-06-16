import { useMemo, useState } from 'react'
import ExpectedForm from './ExpectedForm'

const TH = { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6E6885', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', background: '#F7F5FB', borderBottom: '1px solid #E9E4F5' }
const TD = { padding: '10px 12px', fontSize: 13, color: '#171327', verticalAlign: 'middle', borderBottom: '1px solid #F2EEF8' }

function ActiveToggle({ active, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10,
        border: 'none', background: active ? '#4C2A92' : '#D1CBC0',
        cursor: 'pointer', position: 'relative', padding: 0,
        transition: 'background .15s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 14, height: 14, borderRadius: '50%',
        background: 'white', position: 'absolute', top: 3,
        left: active ? 19 : 3, transition: 'left .15s',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  )
}

function DeleteConfirm({ row, onConfirm, onCancel }) {
  return (
    <tr style={{ background: '#FFF0F0' }}>
      <td colSpan={7} style={{ padding: '10px 14px', borderBottom: '1px solid #FECACA' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
            Delete <strong>{row.full_name}</strong>? This cannot be undone.
          </span>
          <button type="button" onClick={onConfirm}
            style={{ border: 'none', background: '#DC2626', color: 'white', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Delete
          </button>
          <button type="button" onClick={onCancel}
            style={{ border: '1px solid #E9E4F5', background: 'white', color: '#6E6885', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

function InlineEditRow({ row, subgroupOptions, onSave, onCancel, saving }) {
  return (
    <tr style={{ background: '#EEE8FF' }}>
      <td colSpan={7} style={{ padding: '12px 14px', borderBottom: '1px solid #C4BDE0' }}>
        <ExpectedForm
          initial={row}
          subgroupOptions={subgroupOptions}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
        />
      </td>
    </tr>
  )
}

export default function ExpectedTable({ rows, subgroupOptions, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const allIds = useMemo(() => rows.map((r) => r.id), [rows])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  async function handleSave(row, fields) {
    setSavingId(row.id)
    try {
      await onUpdate(row.id, fields)
      setEditingId(null)
    } catch {
      // error surfaced by parent
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleActive(row) {
    setSavingId(row.id)
    try {
      await onUpdate(row.id, { active: !row.active })
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(row) {
    setSavingId(row.id)
    try {
      await onDelete(row.id)
      setDeletingId(null)
    } finally {
      setSavingId(null)
    }
  }

  async function handleBulkActive(active) {
    setBulkSaving(true)
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => onUpdate(id, { active })))
      setSelected(new Set())
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selected.size} people? This cannot be undone.`)) return
    setBulkSaving(true)
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => onDelete(id)))
      setSelected(new Set())
    } finally {
      setBulkSaving(false)
    }
  }

  if (!rows.length) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6E6885', fontSize: 13, border: '1px dashed #C4BDE0', borderRadius: 12, background: '#F7F5FB' }}>
        No records found.
      </div>
    )
  }

  return (
    <div>
      {someSelected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#EEE8FF', borderRadius: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4C2A92' }}>{selected.size} selected</span>
          <button type="button" onClick={() => handleBulkActive(true)} disabled={bulkSaving}
            style={{ border: '1px solid #4C2A92', background: 'white', color: '#4C2A92', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Set Active
          </button>
          <button type="button" onClick={() => handleBulkActive(false)} disabled={bulkSaving}
            style={{ border: '1px solid #6E6885', background: 'white', color: '#6E6885', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Set Inactive
          </button>
          <button type="button" onClick={handleBulkDelete} disabled={bulkSaving}
            style={{ border: '1px solid #DC2626', background: 'white', color: '#DC2626', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#6E6885', fontSize: 12, cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #E9E4F5', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
              </th>
              <th style={TH}>Subgroup</th>
              <th style={TH}>Full Name</th>
              <th style={TH}>Match Key</th>
              <th style={TH}>Category</th>
              <th style={{ ...TH, textAlign: 'center' }}>Active</th>
              <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (editingId === row.id) {
                return (
                  <InlineEditRow
                    key={row.id}
                    row={row}
                    subgroupOptions={subgroupOptions}
                    onSave={(fields) => handleSave(row, fields)}
                    onCancel={() => setEditingId(null)}
                    saving={savingId === row.id}
                  />
                )
              }
              if (deletingId === row.id) {
                return (
                  <DeleteConfirm
                    key={row.id}
                    row={row}
                    onConfirm={() => handleDelete(row)}
                    onCancel={() => setDeletingId(null)}
                  />
                )
              }
              return (
                <tr
                  key={row.id}
                  style={{ background: selected.has(row.id) ? '#F2EEFF' : 'white' }}
                  onMouseEnter={(e) => { if (!selected.has(row.id)) e.currentTarget.style.background = '#FAFAFE' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = selected.has(row.id) ? '#F2EEFF' : 'white' }}
                >
                  <td style={{ ...TD, width: 36 }}>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ ...TD, color: '#6E6885', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.subgroup || <span style={{ color: '#C4BDE0' }}>—</span>}
                  </td>
                  <td style={{ ...TD, fontWeight: 600 }}>{row.full_name}</td>
                  <td style={{ ...TD, color: '#6E6885', fontFamily: 'monospace', fontSize: 11.5 }}>{row.match_key}</td>
                  <td style={{ ...TD, color: '#6E6885' }}>
                    {row.leadership_category || <span style={{ color: '#C4BDE0' }}>—</span>}
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <ActiveToggle
                      active={row.active}
                      onChange={() => handleToggleActive(row)}
                    />
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => { setEditingId(row.id); setDeletingId(null) }}
                        style={{ border: '1px solid #E9E4F5', background: 'white', color: '#4C2A92', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => { setDeletingId(row.id); setEditingId(null) }}
                        style={{ border: '1px solid #E9E4F5', background: 'white', color: '#DC2626', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
