import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#F4F1EA'

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTED, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function CheckRow({ label, count, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, cursor: 'pointer', padding: '4px 0' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span style={{ flex: 1 }}>{label}</span>
      {count != null ? <span style={{ fontSize: 11, color: MUTED }}>({count})</span> : null}
    </label>
  )
}

export default function SegmentBuilder({ onSave, onCancel, initialSegment = null, allData = {} }) {
  const { profile } = useAuth()
  const { depts = [], roster = [], users = [] } = allData

  const [name, setName]               = useState(initialSegment?.name ?? '')
  const [description, setDescription] = useState(initialSegment?.description ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  const initial = initialSegment?.filters ?? {}
  const [selectedDepts, setSelectedDepts]       = useState(initial.departments ?? [])
  const [selectedSubgroups, setSelectedSubgroups] = useState(initial.subgroups ?? [])
  const [selectedCategories, setSelectedCategories] = useState(initial.categories ?? [])
  const [selectedRoles, setSelectedRoles]       = useState(initial.roles ?? [])
  const [includeRoster, setIncludeRoster]       = useState(initial.include_roster ?? false)

  // Derived unique subgroups and categories from roster
  const allSubgroups   = useMemo(() => [...new Set(roster.map((r) => r.subgroup).filter(Boolean))].sort(), [roster])
  const allCategories  = useMemo(() => [...new Set(roster.map((r) => r.leadership_category).filter(Boolean))].sort(), [roster])
  const allRoles       = ['super_admin', 'dept_lead', 'pastor', 'member']

  // Live preview count
  const previewPeople = useMemo(() => {
    const emailSet = new Set()
    const people   = []

    function add(name, email) {
      if (!email) return
      const key = email.toLowerCase()
      if (emailSet.has(key)) return
      emailSet.add(key)
      people.push({ name, email })
    }

    if (includeRoster) {
      roster.forEach((r) => add(r.full_name ?? r.email, r.email))
    }

    if (selectedDepts.length > 0) {
      users
        .filter((u) => selectedDepts.includes(u.department_id))
        .forEach((u) => add(u.name ?? u.email, u.email))
    }

    if (selectedSubgroups.length > 0) {
      roster
        .filter((r) => selectedSubgroups.includes(r.subgroup))
        .forEach((r) => add(r.full_name ?? r.email, r.email))
    }

    if (selectedCategories.length > 0) {
      roster
        .filter((r) => selectedCategories.includes(r.leadership_category))
        .forEach((r) => add(r.full_name ?? r.email, r.email))
    }

    if (selectedRoles.length > 0) {
      users
        .filter((u) => selectedRoles.includes(u.role))
        .forEach((u) => add(u.name ?? u.email, u.email))
    }

    return people
  }, [includeRoster, roster, users, selectedDepts, selectedSubgroups, selectedCategories, selectedRoles])

  function toggle(setter, value) {
    setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value])
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const filters = {
      departments:     selectedDepts,
      subgroups:       selectedSubgroups,
      categories:      selectedCategories,
      roles:           selectedRoles,
      include_roster:  includeRoster,
    }

    const payload = {
      name:            name.trim(),
      description:     description.trim() || null,
      filters,
      estimated_count: previewPeople.length,
      created_by:      profile?.id ?? null,
    }

    let result
    if (initialSegment?.id) {
      const { data, error: err } = await supabase
        .from('communication_segments')
        .update(payload)
        .eq('id', initialSegment.id)
        .select()
        .single()
      result = { data, error: err }
    } else {
      const { data, error: err } = await supabase
        .from('communication_segments')
        .insert(payload)
        .select()
        .single()
      result = { data, error: err }
    }

    setSaving(false)
    if (result.error) {
      setError(result.error.message)
    } else {
      onSave(result.data)
    }
  }

  const deptCounts = useMemo(() => {
    const map = {}
    users.forEach((u) => {
      if (u.department_id) map[u.department_id] = (map[u.department_id] ?? 0) + 1
    })
    return map
  }, [users])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error ? (
        <div style={{ background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#C94830' }}>
          {error}
        </div>
      ) : null}

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
          Segment name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Central East Leaders"
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
          Description (optional)
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <div style={{ background: BG, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {depts.length > 0 ? (
          <Section title="Departments">
            {depts.map((dept) => (
              <CheckRow
                key={dept.id}
                label={`All ${dept.name} Members`}
                count={deptCounts[dept.id]}
                checked={selectedDepts.includes(dept.id)}
                onChange={() => toggle(setSelectedDepts, dept.id)}
              />
            ))}
          </Section>
        ) : null}

        {allSubgroups.length > 0 ? (
          <Section title="Subgroups">
            {allSubgroups.map((sg) => (
              <CheckRow
                key={sg}
                label={sg}
                count={roster.filter((r) => r.subgroup === sg).length}
                checked={selectedSubgroups.includes(sg)}
                onChange={() => toggle(setSelectedSubgroups, sg)}
              />
            ))}
          </Section>
        ) : null}

        {allCategories.length > 0 ? (
          <Section title="Leadership Categories">
            {allCategories.map((cat) => (
              <CheckRow
                key={cat}
                label={cat}
                count={roster.filter((r) => r.leadership_category === cat).length}
                checked={selectedCategories.includes(cat)}
                onChange={() => toggle(setSelectedCategories, cat)}
              />
            ))}
          </Section>
        ) : null}

        <Section title="OS Roles">
          {allRoles.map((role) => (
            <CheckRow
              key={role}
              label={role.replace('_', ' ')}
              count={users.filter((u) => u.role === role).length}
              checked={selectedRoles.includes(role)}
              onChange={() => toggle(setSelectedRoles, role)}
            />
          ))}
        </Section>

        <Section title="Full Roster">
          <CheckRow
            label="Everyone on roster with email"
            count={roster.filter((r) => r.email).length}
            checked={includeRoster}
            onChange={() => setIncludeRoster((v) => !v)}
          />
        </Section>
      </div>

      {/* Live preview */}
      <div style={{ background: '#EDE8F8', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY, marginBottom: 4 }}>
          This segment includes approximately {previewPeople.length} {previewPeople.length === 1 ? 'person' : 'people'}
        </div>
        {previewPeople.length > 0 ? (
          <div style={{ fontSize: 12, color: '#5B3DBF' }}>
            {previewPeople.slice(0, 5).map((p) => p.name).join(', ')}
            {previewPeople.length > 5 ? ` +${previewPeople.length - 5} more` : ''}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : initialSegment ? 'Update Segment' : 'Save Segment'}
        </button>
      </div>
    </div>
  )
}
