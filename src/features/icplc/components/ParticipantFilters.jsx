import React, { useState, useRef, useEffect } from 'react'
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
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!popoverOpen) return
    function onKey(e) { if (e.key === 'Escape') setPopoverOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popoverOpen])

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

  function clearAdvanced() {
    setFilters((prev) => ({
      ...prev,
      participation_status: [],
      passport_readiness: [],
      visa_requirement: [],
      readiness: [],
    }))
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

  const advancedActive = [
    filters.participation_status,
    filters.passport_readiness,
    filters.visa_requirement,
    filters.readiness,
  ].some((a) => a?.length > 0)

  const hasFilters = advancedActive || (filters.working_list_view || 'all') !== 'all'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0' }}>
      {/* Primary chips: Working List View */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {WORKING_LIST_VIEW_OPTIONS.map((opt) => {
          const isActive = (filters.working_list_view || 'all') === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              className="icplc-chip"
              aria-pressed={isActive}
              onClick={() => setFilters((prev) => ({ ...prev, working_list_view: opt.value }))}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Filter popover trigger */}
      <div style={{ position: 'relative' }}>
        <button
          ref={btnRef}
          type="button"
          className="icplc-btn"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen((o) => !o)}
          style={{
            gap: 5,
            borderColor: advancedActive ? 'var(--accent)' : undefined,
            color: advancedActive ? 'var(--accent)' : undefined,
            fontWeight: advancedActive ? 600 : undefined,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M1 3h14M4 8h8M7 13h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Filters{advancedActive ? ` (${[filters.participation_status, filters.passport_readiness, filters.visa_requirement, filters.readiness].reduce((s, a) => s + (a?.length || 0), 0)})` : ''}
        </button>

        {popoverOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 10 }}
              onClick={() => setPopoverOpen(false)}
            />
            {/* Popover */}
            <div
              ref={popoverRef}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 11,
                background: 'var(--surface-1, #fff)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                width: 320, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Advanced Filters</span>
                {advancedActive && (
                  <button
                    type="button"
                    onClick={clearAdvanced}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <PopoverFilterGroup
                label="Participation"
                options={PARTICIPATION_OPTIONS}
                active={filters.participation_status}
                onToggle={(v) => toggle('participation_status', v)}
              />
              <PopoverFilterGroup
                label="Readiness"
                options={READINESS_OPTIONS}
                active={filters.readiness}
                onToggle={(v) => toggle('readiness', v)}
              />
              <PopoverFilterGroup
                label="Passport"
                options={PASSPORT_OPTIONS}
                active={filters.passport_readiness}
                onToggle={(v) => toggle('passport_readiness', v)}
              />
              <PopoverFilterGroup
                label="Visa"
                options={VISA_REQ_OPTIONS}
                active={filters.visa_requirement}
                onToggle={(v) => toggle('visa_requirement', v)}
              />
              <button
                type="button"
                onClick={() => setPopoverOpen(false)}
                className="icplc-btn icplc-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}

function PopoverFilterGroup({ label, options, active, onToggle }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
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
