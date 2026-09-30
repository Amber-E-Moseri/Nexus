import React, { useMemo } from 'react'

// Picks ONE participant by id. People can share a full name, so every option carries the email and subgroup
// that tell them apart, and the value is always the participant id, never the displayed name.

const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function personOptionLabel(p) {
  const subgroup = p.subgroup ? String(p.subgroup).replace(/^BLW /, '') : 'no subgroup'
  return `${p.full_name || 'Unnamed'} — ${p.email || 'no email'} · ${subgroup}`
}

export default function ParticipantPicker({ people, value, onChange, ariaLabel, sameNameAs, style }) {
  const { sameName, everyone } = useMemo(() => {
    const sorted = [...people].sort((a, b) =>
      String(a.full_name || '').localeCompare(String(b.full_name || '')) || String(a.email || '').localeCompare(String(b.email || '')))
    const key = sameNameAs ? normalizeName(sameNameAs) : ''
    const same = key ? sorted.filter((p) => normalizeName(p.full_name) === key) : []
    return { sameName: same, everyone: sorted }
  }, [people, sameNameAs])

  return (
    <select
      className="icplc-input"
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{ width: '100%', ...style }}
    >
      <option value="">Choose a participant…</option>
      {sameName.length > 1 && (
        <optgroup label="Same name">
          {sameName.map((p) => <option key={`same-${p.id}`} value={p.id}>{personOptionLabel(p)}</option>)}
        </optgroup>
      )}
      <optgroup label="Everyone">
        {everyone.map((p) => <option key={p.id} value={p.id}>{personOptionLabel(p)}</option>)}
      </optgroup>
    </select>
  )
}
