import React, { useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'

const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
const WORKING_LIST_VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'registered', label: 'Registered' },
  { value: 'not_registered', label: 'Not Registered' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'needs_attention', label: 'Needs Attention' },
]
const PASSPORT_OPTIONS = ['unknown', 'ready', 'renewal_needed', 'renewal_in_progress', 'no_passport', 'unsure', 'issue']
const READINESS_OPTIONS = ['unknown', 'in_progress', 'action_required', 'blocked', 'ready']
const VISA_REQ_OPTIONS = ['review', 'required', 'not_required']

export default function ParticipantFilters() {
  const { filters, setFilters } = useICPLC()
  // Secondary groups are always shown on desktop; on phones they collapse behind a toggle (see icplc.css).
  const [moreOpen, setMoreOpen] = useState(false)

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
      working_list_view: 'all',
      participation_status: [],
      passport_readiness: [],
      visa_requirement: [],
      readiness: [],
    }))
  }

  const hasFilters = [
    filters.participation_status,
    filters.passport_readiness, filters.visa_requirement, filters.readiness,
  ].some((a) => a?.length > 0) || (filters.working_list_view || 'all') !== 'all'

  return (
    <div className="icplc-toolbar" role="group" aria-label="Working List filters">
      <SegmentedFilter
        label="Working List"
        options={WORKING_LIST_VIEW_OPTIONS}
        active={filters.working_list_view || 'all'}
        onChange={(value) => setFilters((prev) => ({ ...prev, working_list_view: value }))}
      />
      <button
        type="button"
        className="icplc-btn icplc-more-toggle"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((o) => !o)}
      >
        {moreOpen ? 'Hide filters' : 'More filters'}
      </button>
      <div className="icplc-more" data-open={moreOpen}>
      <FilterGroup
        label="Participation"
        options={PARTICIPATION_OPTIONS}
        active={filters.participation_status}
        onToggle={(v) => toggle('participation_status', v)}
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
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="icplc-btn"
          style={{ alignSelf: 'flex-end', border: 'none', color: 'var(--text-secondary)', fontSize: 12 }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function SegmentedFilter({ label, options, active, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((opt) => {
          const isActive = active === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              className="icplc-chip"
              aria-pressed={isActive}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilterGroup({ label, options, active, onToggle }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((opt) => {
          const isActive = !!active?.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className="icplc-chip"
              aria-pressed={isActive}
              onClick={() => onToggle(opt)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
