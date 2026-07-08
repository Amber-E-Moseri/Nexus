// Intentional: this component uses inline styles only, not Tailwind utility classes.
// It is rendered inside BroadcastCampaignEditor.tsx (which is otherwise Tailwind-styled),
// but inline styles are the project standard per CLAUDE.md. Do not "fix" this.

import { useState } from 'react'
import { COMMUNICATION_ROLES, addUniqueRecipientPills, getRecipientPillKey, titleize } from '../lib/communications'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'

const ADD_TYPES = [
  { value: 'all_roster', label: 'All Roster' },
  { value: 'role', label: 'Role' },
  { value: 'individual', label: 'Individual' },
]

function pillLabel(pill) {
  if (pill.type === 'department') return `Dept: ${pill.label ?? pill.deptId ?? 'Department'}`
  if (pill.type === 'role') return `Role: ${titleize(pill.role ?? '')}`
  if (pill.type === 'individual') return pill.name ?? pill.email ?? 'Individual'
  if (pill.type === 'all_roster') return pill.label ?? 'All roster'
  if (pill.type === 'subgroup') return `Subgroup: ${pill.subgroup ?? ''}`
  if (pill.type === 'category') return pill.label ?? pill.category ?? 'Category'
  return pill.label ?? pill.type
}

export default function AudiencePicker({
  pills = [],
  onPillsChange = () => {},
  segmentId = null,
  onSegmentChange = () => {},
  segments = [],
  disabled = false,
}) {
  const [mode, setMode] = useState(segmentId ? 'segment' : 'inline')
  const [addType, setAddType] = useState('')
  const [addRole, setAddRole] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')

  function switchMode(next) {
    setMode(next)
    if (next === 'inline') onSegmentChange(null)
    setAddType('')
  }

  function removePill(key) {
    onPillsChange(pills.filter((p) => getRecipientPillKey(p) !== key))
  }

  function commitAdd() {
    let newPill = null
    if (addType === 'all_roster') {
      newPill = { id: 'all_roster', type: 'all_roster', label: 'All roster' }
    } else if (addType === 'role' && addRole) {
      newPill = { id: `role:${addRole}`, type: 'role', role: addRole, label: `All ${titleize(addRole)}s` }
    } else if (addType === 'individual' && addEmail.trim()) {
      const email = addEmail.trim()
      const name = addName.trim() || email
      newPill = { id: `individual:${email}`, type: 'individual', email, name, label: name }
    }
    if (!newPill) return
    onPillsChange(addUniqueRecipientPills(pills, [newPill]))
    setAddType('')
    setAddRole('')
    setAddEmail('')
    setAddName('')
  }

  const modeButtonStyle = (active) => ({
    flex: 1,
    padding: '9px 0',
    border: `2px solid ${active ? PRIMARY : BORDER}`,
    borderRadius: 9,
    background: active ? '#EDE8F8' : SURFACE,
    color: active ? PRIMARY : MUTED,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={disabled} onClick={() => switchMode('segment')} style={modeButtonStyle(mode === 'segment')}>
          Use saved segment
        </button>
        <button type="button" disabled={disabled} onClick={() => switchMode('inline')} style={modeButtonStyle(mode === 'inline')}>
          Build inline filter
        </button>
      </div>

      {mode === 'segment' ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
          Select segment
          <select
            value={segmentId ?? ''}
            onChange={(e) => onSegmentChange(e.target.value || null)}
            disabled={disabled}
            style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', opacity: disabled ? 0.6 : 1 }}
          >
            <option value="">-- Choose segment --</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>{seg.name} ({seg.estimated_count ?? '?'} members)</option>
            ))}
          </select>
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Current pills */}
          {pills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pills.map((pill) => {
                const key = getRecipientPillKey(pill)
                return (
                  <span
                    key={key}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: '#EDE8F8', border: '1px solid #D5CCE9',
                      color: PRIMARY, borderRadius: 999,
                      padding: '4px 10px', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {pillLabel(pill)}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removePill(key)}
                        aria-label={`Remove ${pillLabel(pill)}`}
                        style={{ background: 'none', border: 'none', color: PRIMARY, cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: 14, fontWeight: 700 }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          {/* Add-pill UI */}
          {!disabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: BG, borderRadius: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>Add recipients</div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ADD_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAddType(addType === value ? '' : value)}
                    style={{
                      padding: '5px 12px',
                      border: `1px solid ${addType === value ? PRIMARY : BORDER}`,
                      borderRadius: 6,
                      background: addType === value ? '#EDE8F8' : SURFACE,
                      color: addType === value ? PRIMARY : TEXT,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {addType === 'all_roster' && (
                <button
                  type="button"
                  onClick={commitAdd}
                  style={{ alignSelf: 'flex-start', padding: '7px 14px', background: PRIMARY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Add all roster
                </button>
              )}

              {addType === 'role' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">-- Choose role --</option>
                    {COMMUNICATION_ROLES.map((r) => (
                      <option key={r} value={r}>{titleize(r)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={commitAdd}
                    disabled={!addRole}
                    style={{ padding: '7px 14px', background: PRIMARY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: addRole ? 'pointer' : 'not-allowed', opacity: addRole ? 1 : 0.5 }}
                  >
                    Add
                  </button>
                </div>
              )}

              {addType === 'individual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={commitAdd}
                    disabled={!addEmail.trim()}
                    style={{ alignSelf: 'flex-start', padding: '7px 14px', background: PRIMARY, border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: addEmail.trim() ? 'pointer' : 'not-allowed', opacity: addEmail.trim() ? 1 : 0.5 }}
                  >
                    Add
                  </button>
                </div>
              )}

              {pills.length === 0 && !addType && (
                <div style={{ fontSize: 12, color: MUTED }}>No recipients added yet.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
