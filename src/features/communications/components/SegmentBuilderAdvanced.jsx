import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ChevronDown, Users, AlertCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { loadCommunicationSources } from '..'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const SUCCESS = '#2D6A4F'
const ERROR = '#C94830'
const WARNING = '#9A6000'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'
const BORDER = '#EDE8DC'

// Builds a flat, de-duplicated recipient list from the live communication
// sources (departments + roster + OS users). Replaces the previous MOCK_RECIPIENTS.
function buildRecipients(sources) {
  const deptNameById = new Map((sources.depts ?? []).map((dept) => [dept.id, dept.name]))
  const byEmail = new Map()

  function upsert(email, fields) {
    const key = email?.trim()?.toLowerCase()
    if (!key) return
    byEmail.set(key, { ...(byEmail.get(key) ?? { email }), ...fields })
  }

  for (const user of sources.users ?? []) {
    upsert(user.email, {
      email: user.email,
      name: user.name ?? user.email,
      role: user.role ?? 'none',
      department: deptNameById.get(user.department_id) ?? '',
      status: 'active',
    })
  }

  for (const person of sources.roster ?? []) {
    upsert(person.email, {
      email: person.email,
      name: person.full_name ?? person.email,
      subgroup: person.subgroup ?? '',
      leadership_category: person.leadership_category ?? '',
      status: person.active === false ? 'inactive' : 'active',
    })
  }

  return Array.from(byEmail.values())
}

// Filter fields are derived from real data so the option lists always reflect
// what's actually in the roster/org — no hardcoded department or subgroup names.
function buildFilterFields(recipients) {
  const distinct = (key) => [...new Set(recipients.map((recipient) => recipient[key]).filter(Boolean))].sort()
  return [
    { key: 'role', label: 'Role', type: 'select', options: distinct('role') },
    { key: 'department', label: 'Department', type: 'multiselect', options: distinct('department') },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'inactive'] },
    { key: 'subgroup', label: 'Subgroup', type: 'multiselect', options: distinct('subgroup') },
    { key: 'leadership_category', label: 'Leadership Category', type: 'multiselect', options: distinct('leadership_category') },
    { key: 'email', label: 'Email', type: 'text', operators: ['is', 'contains', 'starts_with', 'ends_with'] },
  ]
}

function evaluateCondition(recipient, condition) {
  const { field, value } = condition
  if (!field) return true // incomplete condition — ignore

  const recipientValue = recipient[field]

  if (Array.isArray(value)) {
    if (value.length === 0) return true
    return value.includes(recipientValue)
  }

  if (value == null || value === '') return true

  const operator = condition.condition || 'is'
  const recipientStr = String(recipientValue ?? '').toLowerCase()
  const valueStr = String(value).toLowerCase()

  switch (operator) {
    case 'is':
      return recipientValue === value
    case 'is_not':
      return recipientValue !== value
    case 'contains':
      return recipientStr.includes(valueStr)
    case 'starts_with':
      return recipientStr.startsWith(valueStr)
    case 'ends_with':
      return recipientStr.endsWith(valueStr)
    default:
      return true
  }
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function ConditionRow({ condition, onUpdate, onDelete, index, showOperator, fields }) {
  const field = fields.find((f) => f.key === condition.field)
  const operators = field?.operators || ['is', 'is_not', 'contains']

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: showOperator ? '60px 1fr 100px 1fr 40px' : '1fr 100px 1fr 40px',
      gap: 8,
      alignItems: 'center',
      padding: 12,
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      marginBottom: 8,
    }}>
      {/* Operator (AND/OR) */}
      {showOperator && (
        <select
          value={condition.operator || 'AND'}
          onChange={(e) => onUpdate({ ...condition, operator: e.target.value })}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '6px',
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            background: BG,
            color: TEXT,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      )}

      {/* Field */}
      <select
        value={condition.field}
        onChange={(e) => {
          const newField = fields.find((f) => f.key === e.target.value)
          onUpdate({
            ...condition,
            field: e.target.value,
            condition: newField?.type === 'select' ? 'is' : (newField?.type === 'multiselect' ? 'in' : 'contains'),
            value: newField?.type === 'multiselect' ? [] : '',
          })
        }}
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: '8px 10px',
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          background: SURFACE,
          color: TEXT,
          cursor: 'pointer',
        }}
      >
        <option value="">— Select field —</option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>

      {/* Condition/Operator */}
      {field?.type !== 'multiselect' && (
        <select
          value={condition.condition || operators[0]}
          onChange={(e) => onUpdate({ ...condition, condition: e.target.value })}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 8px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            background: SURFACE,
            color: TEXT,
            cursor: 'pointer',
          }}
        >
          {operators.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      )}

      {/* Value */}
      {field?.type === 'select' && (
        <select
          value={condition.value || ''}
          onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 10px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            background: SURFACE,
            color: TEXT,
            cursor: 'pointer',
          }}
        >
          <option value="">— Select —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      {field?.type === 'multiselect' && (
        <select
          multiple
          value={Array.isArray(condition.value) ? condition.value : []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (option) => option.value)
            onUpdate({ ...condition, value: selected })
          }}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 10px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            background: SURFACE,
            color: TEXT,
            cursor: 'pointer',
            minHeight: 60,
          }}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      {field?.type === 'text' && (
        <input
          type="text"
          value={condition.value || ''}
          onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
          placeholder="Enter value..."
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 10px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontFamily: 'inherit',
            color: TEXT,
          }}
        />
      )}

      {/* Delete button */}
      <button
        onClick={() => onDelete(index)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          border: `1px solid ${BORDER}`,
          background: 'transparent',
          color: MUTED,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF0ED'; e.currentTarget.style.borderColor = ERROR; e.currentTarget.style.color = ERROR }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function SegmentBuilderAdvanced({
  segment = {},
  onChange = () => {},
  onEstimate = () => {},
  allData = null,
}) {
  const [conditions, setConditions] = useState(segment.filters || [])
  const [expandPreview, setExpandPreview] = useState(false)
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)

  // Load live recipients from Supabase (matches loadCommunicationSources used
  // elsewhere). An optional `allData` prop lets a parent that already fetched
  // the sources pass them in to avoid a duplicate round-trip.
  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      try {
        const sources = allData ?? (await loadCommunicationSources(supabase))
        if (active) setRecipients(buildRecipients(sources))
      } catch (error) {
        console.error('Failed to load segment recipients', error)
        if (active) setRecipients([])
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [allData])

  const filterFields = useMemo(() => buildFilterFields(recipients), [recipients])

  // Real estimate: recipients matching ALL conditions (AND logic, first pass).
  const matched = useMemo(
    () => recipients.filter((recipient) => conditions.every((condition) => evaluateCondition(recipient, condition))),
    [recipients, conditions],
  )
  const estimatedRecipients = matched.slice(0, 5)
  const estimatedCount = matched.length

  useEffect(() => {
    onEstimate(estimatedCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimatedCount])

  const handleAddCondition = () => {
    const newCondition = {
      field: '',
      condition: 'is',
      value: '',
      operator: conditions.length > 0 ? 'AND' : undefined,
    }
    const updated = [...conditions, newCondition]
    setConditions(updated)
    onChange(updated)
  }

  const handleUpdateCondition = (index, updated) => {
    const newConditions = conditions.map((c, i) => (i === index ? updated : c))
    setConditions(newConditions)
    onChange(newConditions)
  }

  const handleDeleteCondition = (index) => {
    const newConditions = conditions.filter((_, i) => i !== index)
    setConditions(newConditions)
    onChange(newConditions)
  }

  return (
    <div>
      {/* Conditions builder */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
          Build your segment
        </div>

        {conditions.length === 0 ? (
          <div style={{
            background: BG,
            borderRadius: 10,
            padding: 20,
            textAlign: 'center',
            color: MUTED,
            marginBottom: 12,
          }}>
            <Users size={24} style={{ opacity: 0.5, margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>No conditions yet</div>
            <p style={{ fontSize: 12, margin: 0 }}>Click "Add condition" to start filtering</p>
          </div>
        ) : (
          conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              condition={condition}
              onUpdate={(updated) => handleUpdateCondition(index, updated)}
              onDelete={handleDeleteCondition}
              index={index}
              showOperator={index > 0}
              fields={filterFields}
            />
          ))
        )}

        <button
          onClick={handleAddCondition}
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            background: BG,
            border: `2px dashed ${BORDER}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: PRIMARY,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.background = '#F4F0FC' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG }}
        >
          <Plus size={16} /> Add condition
        </button>
      </div>

      {/* Preview & Estimate */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <button
          onClick={() => setExpandPreview(!expandPreview)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginBottom: expandPreview ? 12 : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Users size={16} color={PRIMARY} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                Estimated reach: <span style={{ color: PRIMARY, fontSize: 14 }}>{loading ? '—' : estimatedCount}</span> recipients
              </div>
              <div style={{ fontSize: 11, color: MUTED }}>
                {loading ? 'Loading recipients…' : conditions.length === 0 ? 'All active members' : 'Matching your filters'}
              </div>
            </div>
          </div>
          <ChevronDown
            size={16}
            color={MUTED}
            style={{ transform: expandPreview ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
          />
        </button>

        {expandPreview && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
              Sample recipients ({estimatedRecipients.length})
            </div>
            {estimatedRecipients.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>
                {loading ? 'Loading…' : 'No recipients to preview.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {estimatedRecipients.map((recipient) => (
                  <div
                    key={recipient.email}
                    style={{
                      padding: 10,
                      background: BG,
                      borderRadius: 8,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: PRIMARY,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {getInitials(recipient.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: TEXT }}>{recipient.name}</div>
                      <div style={{ fontSize: 10, color: MUTED }}>{recipient.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Warnings */}
      {!loading && estimatedCount === 0 && conditions.length > 0 && (
        <div style={{
          background: '#FEF0ED',
          border: `1px solid #F5C4B8`,
          borderRadius: 8,
          padding: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          marginTop: 12,
        }}>
          <AlertCircle size={14} color={ERROR} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: ERROR, fontWeight: 600 }}>
            No recipients match your filters. Try removing or adjusting conditions.
          </div>
        </div>
      )}
      {estimatedCount > 10000 && (
        <div style={{
          background: '#FEF5E4',
          border: `1px solid #F5D76E`,
          borderRadius: 8,
          padding: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          marginTop: 12,
        }}>
          <AlertCircle size={14} color={WARNING} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: WARNING, fontWeight: 600 }}>
            This segment targets over 10,000 recipients. Make sure this is intentional.
          </div>
        </div>
      )}
    </div>
  )
}
