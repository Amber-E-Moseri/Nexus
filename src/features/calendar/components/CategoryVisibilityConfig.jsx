// Category Visibility Config
// Matrix of event categories x roles. Each cell toggles whether that role can
// see the category in their calendar feed / iCal subscription. Saves on toggle.

import { useState } from 'react'
import { Check, CalendarCog } from 'lucide-react'
import { useCategoryVisibility } from '../hooks/useCategoryVisibility'
import Toggle from './Toggle'

const ROLE_COLUMNS = [
  { key: 'member', label: 'Member' },
  { key: 'pastor', label: 'Pastor' },
  { key: 'dept_lead', label: 'Dept Lead' },
  { key: 'regional_secretary', label: 'Regional Sec.' },
  { key: 'super_admin', label: 'Super Admin' },
]

export default function CategoryVisibilityConfig() {
  const { matrix, categories, loading, error, toggleVisibility } = useCategoryVisibility()
  const [savedCategory, setSavedCategory] = useState(null)
  const [savingCell, setSavingCell] = useState(null)

  async function handleToggle(category, role, currentValue) {
    const cellKey = `${category}:${role}`
    setSavingCell(cellKey)
    try {
      await toggleVisibility(category, role, currentValue)
      setSavedCategory(category)
      setTimeout(() => {
        setSavedCategory((c) => (c === category ? null : c))
      }, 2000)
    } catch {
      // error surfaced via the hook's error state below
    } finally {
      setSavingCell((k) => (k === cellKey ? null : k))
    }
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'white',
        overflow: 'hidden',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-tertiary)',
        }}
      >
        <CalendarCog size={18} style={{ color: 'var(--accent)' }} />
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Event Category Visibility
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Control which roles can see each event category in their calendar feed and iCal subscriptions.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF0ED', color: '#C94830', fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Loading categories…
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🗂️</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            No event categories yet
          </div>
          <div>Create event types in the Ministry Calendar before configuring visibility.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Category
                </th>
                {ROLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: 'center',
                      padding: '10px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const row = matrix[cat.name] ?? {}
                return (
                  <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: cat.color || '#5B34C7',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cat.name}</span>
                        {savedCategory === cat.name && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#2D8653',
                            }}
                          >
                            <Check size={12} /> Saved
                          </span>
                        )}
                      </div>
                    </td>
                    {ROLE_COLUMNS.map((col) => {
                      const isSuperAdmin = col.key === 'super_admin'
                      const checked = isSuperAdmin ? true : row[col.key] ?? true
                      const cellKey = `${cat.name}:${col.key}`
                      return (
                        <td key={col.key} style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Toggle
                              checked={checked}
                              disabled={isSuperAdmin || savingCell === cellKey}
                              onChange={() => handleToggle(cat.name, col.key, checked)}
                              label={`${cat.name} visible to ${col.label}`}
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {categories.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 11.5,
            color: 'var(--text-tertiary)',
            background: 'var(--surface-tertiary)',
          }}
        >
          Categories with no rule are visible to everyone (fail open). Super Admin always sees every category.
        </div>
      )}
    </div>
  )
}
