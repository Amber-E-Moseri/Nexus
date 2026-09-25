import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'

const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
const REGISTRATION_OPTIONS = ['unknown', 'not_registered', 'registered', 'issue']
const PASSPORT_OPTIONS = ['unknown', 'ready', 'renewal_needed', 'renewal_in_progress', 'no_passport', 'unsure', 'issue']
const READINESS_OPTIONS = ['unknown', 'in_progress', 'action_required', 'blocked', 'ready']
const VISA_REQ_OPTIONS = ['review', 'required', 'not_required']

export default function ParticipantFilters() {
  const { filters, setFilters } = useICPLC()

  function toggle(field, value) {
    setFilters((prev) => {
      const current = prev[field] || []
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      }
    })
  }

  function clearAll() {
    setFilters((prev) => ({
      ...prev,
      participation_status: [],
      registration_status: [],
      passport_readiness: [],
      visa_requirement: [],
      readiness: [],
    }))
  }

  const hasFilters = [
    filters.participation_status, filters.registration_status,
    filters.passport_readiness, filters.visa_requirement, filters.readiness,
  ].some((a) => a?.length > 0)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 0', alignItems: 'flex-start' }}>
      <FilterGroup
        label="Participation"
        options={PARTICIPATION_OPTIONS}
        active={filters.participation_status}
        onToggle={(v) => toggle('participation_status', v)}
      />
      <FilterGroup
        label="Registration"
        options={REGISTRATION_OPTIONS}
        active={filters.registration_status}
        onToggle={(v) => toggle('registration_status', v)}
      />
      <FilterGroup
        label="Readiness"
        options={READINESS_OPTIONS}
        active={filters.readiness}
        onToggle={(v) => toggle('readiness', v)}
      />
      <FilterGroup
        label="Passport"
        options={PASSPORT_OPTIONS}
        active={filters.passport_readiness}
        onToggle={(v) => toggle('passport_readiness', v)}
      />
      <FilterGroup
        label="Visa"
        options={VISA_REQ_OPTIONS}
        active={filters.visa_requirement}
        onToggle={(v) => toggle('visa_requirement', v)}
      />
      {hasFilters && (
        <button
          onClick={clearAll}
          style={{
            alignSelf: 'flex-end', background: 'none', border: 'none',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', padding: '4px 0',
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function FilterGroup({ label, options, active, onToggle }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((opt) => {
          const isActive = active?.includes(opt)
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              style={{
                padding: '3px 10px',
                fontSize: 12,
                borderRadius: 12,
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
