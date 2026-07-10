// Category visibility by department/space.
// Each row = an event category. Each column = a department.
// Checked = that dept can see the category. If ALL are checked → org-wide (no restriction rows).
// If NONE are checked the category still exists; admins should always leave at least one checked.

import { useState } from 'react'
import { Globe, Lock, Plus, Trash2 } from 'lucide-react'
import { useCategoryVisibility } from '../hooks/useCategoryVisibility'
import { createEventType, deleteEventType } from '../lib/calendar'

export default function CategoryVisibilityConfig() {
  const { matrix, categories, departments, loading, error, toggleVisibility, makeOrgWide, reload } = useCategoryVisibility()
  const [busyCell, setBusyCell] = useState(null)
  const [savedRow, setSavedRow] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#6366F1')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  function isOrgWide(catName) {
    const row = matrix[catName] ?? {}
    return Object.values(row).every(Boolean)
  }

  async function handleToggle(catName, deptId, current) {
    const key = `${catName}:${deptId}`
    setBusyCell(key)
    try {
      await toggleVisibility(catName, deptId, current)
      setSavedRow(catName)
      setTimeout(() => setSavedRow((r) => (r === catName ? null : r)), 1800)
    } catch {
      // error in hook state
    } finally {
      setBusyCell((k) => (k === key ? null : k))
    }
  }

  async function handleMakeOrgWide(catName) {
    setBusyCell(`orgwide:${catName}`)
    try {
      await makeOrgWide(catName)
      setSavedRow(catName)
      setTimeout(() => setSavedRow((r) => (r === catName ? null : r)), 1800)
    } catch {
      // error in hook state
    } finally {
      setBusyCell((k) => (k === `orgwide:${catName}` ? null : k))
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setSaving(true)
    try {
      await createEventType({ name: newCatName, color: newCatColor })
      setNewCatName('')
      setNewCatColor('#6366F1')
      setShowAddForm(false)
      await reload()
    } catch (err) {
      console.error('Failed to create category:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCategory(catId, catName) {
    if (!window.confirm(`Delete "${catName}" and all its visibility rules?`)) return
    setDeleting(catId)
    try {
      await deleteEventType(catId)
      await reload()
    } catch (err) {
      console.error('Failed to delete category:', err)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'white', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderBottom: '1px solid var(--border)', background: 'var(--surface-tertiary)' }}>
        <Lock size={18} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Event Category Visibility
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0' }}>
            Control which departments/spaces can see each event category. A category with all spaces checked is org-wide (visible to everyone). Uncheck a space to hide that category from its members.
          </p>
        </div>
      </div>

      {!loading && categories.length > 0 && !error && Object.keys(matrix).every(cat => Object.values(matrix[cat] || {}).every(Boolean)) && (
        <div style={{ padding: '12px 16px', background: '#F5F3FF', color: '#6B5B95', fontSize: 12.5, fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
          ℹ️ All categories are currently visible org-wide. Restrictions can be configured once your organization is fully set up.
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 16px', background: '#FEF0ED', color: '#C94830', fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Loading…
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🗂️</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No event categories yet</div>
          <div>Create event types before configuring visibility.</div>
        </div>
      ) : (
        <>
          {!showAddForm ? (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Add Category
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g., Birthday"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                  Color
                </label>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                />
              </div>
              <button
                onClick={handleAddCategory}
                disabled={saving || !newCatName.trim()}
                style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                disabled={saving}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'white', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    Category
                  </th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    Scope
                  </th>
                {departments.map((dept) => (
                  <th
                    key={dept.id}
                    style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dept.color ? `#${dept.color.replace('#', '')}` : 'var(--accent)',
                          display: 'inline-block',
                        }}
                      />
                      {dept.name}
                    </div>
                  </th>
                ))}
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)' }}>
                  Delete
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const row = matrix[cat.name] ?? {}
                const orgWide = isOrgWide(cat.name)
                return (
                  <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)', background: orgWide ? 'transparent' : '#FDFAF7' }}>
                    {/* Category label */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color || '#5B34C7', flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cat.name}</span>
                        {savedRow === cat.name && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#2D8653' }}>✓ Saved</span>
                        )}
                      </div>
                    </td>

                    {/* Org-wide badge / make org-wide button */}
                    <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                      {orgWide ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--surface-secondary)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                          <Globe size={11} /> Org-wide
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMakeOrgWide(cat.name)}
                          disabled={!!busyCell}
                          title="Remove restrictions — make visible to everyone"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--accent)',
                            background: 'var(--accent-light)',
                            border: 'none',
                            borderRadius: 6,
                            padding: '3px 8px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            opacity: busyCell ? 0.5 : 1,
                          }}
                        >
                          <Globe size={11} /> Make org-wide
                        </button>
                      )}
                    </td>

                    {/* Per-dept checkboxes */}
                    {departments.map((dept) => {
                      const checked = row[dept.id] ?? true
                      const cellKey = `${cat.name}:${dept.id}`
                      const busy = busyCell === cellKey
                      return (
                        <td key={dept.id} style={{ padding: '11px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || !!busyCell}
                            onChange={() => handleToggle(cat.name, dept.id, checked)}
                            style={{
                              width: 15,
                              height: 15,
                              cursor: busy || busyCell ? 'not-allowed' : 'pointer',
                              accentColor: 'var(--accent)',
                              opacity: busy ? 0.4 : 1,
                            }}
                            title={checked ? `Hide from ${dept.name}` : `Show to ${dept.name}`}
                          />
                        </td>
                      )
                    })}

                    {/* Delete button */}
                    <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        disabled={deleting === cat.id || !!busyCell}
                        title={`Delete ${cat.name}`}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid #FECACA',
                          background: '#FEE2E2',
                          color: '#DC2626',
                          cursor: deleting === cat.id ? 'not-allowed' : 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: deleting === cat.id ? 0.6 : 1,
                        }}
                      >
                        {deleting === cat.id ? 'Deleting...' : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        </>
      )}

      {categories.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-tertiary)', background: 'var(--surface-tertiary)' }}>
          Checked = visible to that space. Unchecked = hidden. "Org-wide" means no restrictions — all spaces see it. Super admins always see every category.
        </div>
      )}
    </div>
  )
}
